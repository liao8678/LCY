'use strict';

// Bump the version whenever a cached file changes. Scope isolates GitHub Pages apps.
const PREFIX = `repair-desk:${self.registration.scope}:`;
const CACHE = `${PREFIX}v1`;
const CORE = [
  './', './index.html', './style.css', './app.js', './pwa.js', './config.js',
  './vendor/supabase-2.119.0.js', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })));
  })());
  // Let open forms finish before a new worker takes over; no forced reload.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Never store database responses, submissions, or arbitrary same-origin content.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const entry = new URL('./index.html', self.registration.scope).href;
  const home = self.registration.scope;
  if (request.mode === 'navigate' && (url.origin + url.pathname === entry || url.origin + url.pathname === home)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(entry)) || fetch(request))());
  } else if (CORE.includes(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      return cached || fetch(request);
    })());
  }
});
