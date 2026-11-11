"""Browser integration checks; virtual repair data, no production API writes."""
import functools
import http.server
from pathlib import Path
import threading
import tempfile
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
        profile = tempfile.TemporaryDirectory(prefix='repair-pwa-')
        context = p.chromium.launch_persistent_context(profile.name, executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'], viewport={'width': 390, 'height': 844})
        page = context.new_page()
        records = []
        posts = []
        def api(route):
            if route.request.method == 'POST':
                body = route.request.post_data_json
                posts.append(body)
                records.insert(0, dict(body, id='00000000-0000-0000-0000-000000000001', created_at='2026-11-11T01:00:00Z', status='待處理'))
                route.fulfill(status=201, body='', headers={'access-control-allow-origin':'*'})
            else:
                route.fulfill(json=records, headers={'access-control-allow-origin':'*'})
        context.route('**/rest/v1/repair_requests*', api)
        page.on('pageerror', lambda error: print('page error:', error, flush=True))
        page.on('console', lambda msg: print('browser:', msg.type, msg.text[:150], flush=True) if msg.type == 'error' else None)
        page.on('requestfailed', lambda req: print('request failed:', req.url.split('?')[0], req.failure, flush=True))
        print('Opening', prefix, flush=True)
        page.goto(origin+prefix+'index.html')
        print('Loaded', prefix, flush=True)
        page.wait_for_function('window.supabase && navigator.serviceWorker.controller', timeout=60000)
        page.wait_for_function("document.querySelector('#submit-button').disabled === false")
        manifest = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
        assert manifest['display'] == 'standalone'
        assert {x['sizes'] for x in manifest['icons']} == {'192x192','512x512'}
        cdp = context.new_cdp_session(page)
        cdp.send('Page.enable')
        def offline(value):
            context.set_offline(value)
            cdp.send('Network.overrideNetworkState', {'offline': value, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1, 'connectionType': 'none' if value else 'wifi'})
        details = cdp.send('Page.getAppManifest')
        assert not details['errors'], details
        installability = cdp.send('Page.getInstallabilityErrors')
        assert not installability['installabilityErrors'], installability
        page.locator('#reporter-name').fill('林小禾（虛構）')
        page.locator('#location').fill('示範辦公室（虛構）')
        page.locator('#category').select_option(label='設備')
        page.locator('#description').fill('示範投影機無法開機。')
        offline(True)
        page.wait_for_function("document.querySelector('#submit-button').disabled")
        assert '目前離線' in page.locator('#connection-message').inner_text()
        offline(False)
        page.wait_for_function("!document.querySelector('#submit-button').disabled")
        assert page.locator('#reporter-name').input_value() == '林小禾（虛構）'
        assert not posts, 'Must not auto-submit on reconnect'
        page.locator('#submit-button').click()
        page.wait_for_function("document.querySelectorAll('.request-card').length === 1")
        assert len(posts)==1 and set(posts[0])=={'reporter_name','location','category','description','urgency'}
        assert '台北' in page.locator('.request-card').inner_text()
        offline(True)
        page.reload()
        assert page.locator('h1').inner_text() == '報修登記'
        page.wait_for_function("document.querySelector('#submit-button').disabled")
        assert page.locator('.request-card').count()==0, 'API records must not persist across reloads'
        assert page.locator('#request-list').get_attribute('aria-busy') == 'false'
        assert page.locator('#reporter-name').input_value()==''
        urls=page.evaluate("caches.keys().then(async names=>(await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>r.url)))).flat())")
        assert not any('repair_requests' in u for u in urls)
        assert any(prefix+'app.js' in u for u in urls)
        assert not page.evaluate('Object.keys(localStorage).length')
        if prefix=='/LCY/':
            page.screenshot(path=str(ROOT/'docs/pwa-offline-mobile.png'), full_page=True)
        offline(False)
        page.wait_for_function("!document.querySelector('#submit-button').disabled")
        page.wait_for_function("document.querySelectorAll('.request-card').length === 1")
        if prefix=='/LCY/':
            page.screenshot(path=str(ROOT/'docs/pwa-online-mobile.png'), full_page=True)
        print(prefix, 'PASS: manifest, worker, offline reload, no API cache, reconnect, manual submit')
        context.close()
        profile.cleanup()
server.shutdown()
