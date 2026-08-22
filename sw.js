'use strict';

// 셸 캐시는 버전 올릴 때마다 교체, 타일 캐시(tiles-v1)는 유지
const VERSION = 'v8';
const SHELL_CACHE = 'shell-' + VERSION;
const TILE_CACHE = 'tiles-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './leaflet/leaflet.js',
  './leaflet/leaflet.css',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 지도 타일: 캐시 우선, 없으면 네트워크에서 받아 캐시에 저장
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const hit = await cache.match(e.request.url);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res && (res.ok || res.type === 'opaque')) cache.put(e.request.url, res.clone());
        return res;
      }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // 개발 중 캐시 무력화: ?v= 가 붙은 요청과 데이터(JSON)는 항상 네트워크 우선, 실패 시에만 캐시
  if (url.origin === location.origin && (url.searchParams.has('v') || url.pathname.includes('/data/'))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit =>
          hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 503 }))
        )
      )
    );
    return;
  }

  // 앱 셸(같은 오리진): 캐시 우선, 페이지 이동은 index.html로 폴백
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit || fetch(e.request).catch(() =>
          e.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 503 })
        )
      )
    );
  }
});
