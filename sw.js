// TraydR Service Worker v1
const CACHE = 'traydr-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/browse.html',
  '/traydr-auth.html',
  '/logo.png',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  /* Network first for API calls, cache first for assets */
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('flutterwave')) {
    return; /* Never cache API calls */
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ── Push Notifications ── */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}

  const title  = data.title  || 'TraydR';
  const body   = data.body   || 'You have a new notification.';
  const url    = data.url    || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     '/logo.png',
      badge:    '/logo.png',
      tag:      data.tag || 'traydr-push',
      renotify: true,
      data:     { url },
      actions:  [
        { action: 'open',    title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const match = cls.find(c => c.url.includes('traydr'));
      if (match) { match.focus(); match.navigate(url); }
      else clients.openWindow(url);
    })
  );
});