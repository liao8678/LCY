"""威力彩分析 PWA 瀏覽器檢查：可安裝、離線重開、資料快取、與工地巡查 PWA 範圍分離。"""
import functools
import http.server
import os
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/LCY/'):
            path = path[4:]
        return super().translate_path(path)

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://localhost:{server.server_port}'

with sync_playwright() as p:
    for prefix in ['/', '/LCY/']:
        profile = tempfile.TemporaryDirectory(prefix='lottery-pwa-')
        context = p.chromium.launch_persistent_context(
            profile.name, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
            headless=True, args=['--no-sandbox'], viewport={'width': 390, 'height': 844})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        base = origin + prefix + 'lottery/'

        # 先開工地巡查頁註冊根目錄 Service Worker，確認兩個 PWA 範圍各自獨立。
        page.goto(origin + prefix)
        page.wait_for_function('navigator.serviceWorker.controller', timeout=60000)
        page.goto(base)
        page.wait_for_function("navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('/lottery/sw.js')", timeout=60000)
        page.wait_for_selector('#content:not([hidden])')
        scopes = page.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.map(x => x.scope).sort())')
        assert scopes == sorted([origin + prefix, base]), scopes

        manifest = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
        assert manifest['display'] == 'standalone' and manifest['short_name'] == '威力彩分析'
        cdp = context.new_cdp_session(page)
        cdp.send('Page.enable')
        assert not cdp.send('Page.getAppManifest')['errors']
        installability = cdp.send('Page.getInstallabilityErrors')
        assert not installability['installabilityErrors'], installability

        cached = page.evaluate("caches.keys().then(async n=>(await Promise.all(n.map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat())")
        assert base + 'data.json' in cached and base + 'lottery.js' in cached

        def offline(value):
            context.set_offline(value)
            cdp.send('Network.overrideNetworkState', {'offline': value, 'latency': 0, 'downloadThroughput': -1,
                                                       'uploadThroughput': -1, 'connectionType': 'none' if value else 'wifi'})

        offline(True)
        page.reload()
        page.wait_for_selector('#content:not([hidden])')
        assert page.locator('#chart-first svg .bar').count() == 38
        assert page.locator('#tile-count').inner_text().endswith('期')
        assert '目前離線' in page.locator('#offline-note').inner_text()
        if prefix == '/LCY/':
            page.screenshot(path=str(ROOT / 'docs/lottery-offline-mobile.png'))
        offline(False)
        page.wait_for_function("document.querySelector('#offline-note').hidden")
        page.reload()
        page.wait_for_selector('#content:not([hidden])')
        assert not errors, errors
        print(prefix, 'PASS: installable, separate scope, data cached, offline reload, back online')
        context.close()
        profile.cleanup()
server.shutdown()
