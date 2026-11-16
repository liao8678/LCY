'use strict';

// 威力彩分析 PWA；範圍只限 lottery/，與根目錄的工地巡查 PWA 互不影響。
// 更新網頁檔案時請遞增版本；data.json 採「網路優先、離線用快取」，不需改版本。
const PREFIX = `power-lottery:${self.registration.scope}:`;
const CACHE = `${PREFIX}v3`;
const DATA_CACHE = `${PREFIX}data`;
const scoped = (path) => new URL(path, self.registration.scope).href;
const CORE = ['./', './index.html', './lottery.css', './lottery.js', './pwa.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'].map(scoped);
const DATA = scoped('./data.json');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })));
    const data = await fetch(new Request(DATA, { cache: 'reload' }));
    if (data.ok) await (await caches.open(DATA_CACHE)).put(DATA, data);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE && name !== DATA_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = url.origin + url.pathname;
  if (path === DATA) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(DATA, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(DATA);
        if (cached) return cached;
        throw error;
      }
    })());
  } else if (request.mode === 'navigate' && (path === scoped('./') || path === scoped('./index.html'))) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(scoped('./index.html'))) || fetch(request))());
  } else if (CORE.includes(path)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(path)) || fetch(request))());
  }
});
