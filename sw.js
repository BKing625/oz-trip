'use strict';

// 셸 캐시 버전은 배포 시 Actions가 커밋 sha로 치환한다 → 배포마다 셸 캐시가 새로 생기고 옛것은 삭제됨.
// (로컬에서는 치환되지 않은 고정 문자열이 그대로 쓰인다.) 타일 캐시(tiles-v1)는 절대 건드리지 않는다.
const VERSION = 'b__BUILD_SHA__';
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

  // 페이지 이동과 데이터(JSON)는 HTTP 캐시까지 우회해 항상 최신을 받는다. 오프라인일 때만 캐시로 폴백.
  if (url.origin === location.origin && (e.request.mode === 'navigate' || url.pathname.includes('/data/'))) {
    e.respondWith(
      fetch(url.href, { cache: 'no-store' }).catch(() =>
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
