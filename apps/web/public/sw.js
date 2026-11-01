// Shows "your food is ready" notifications sent by the restaurant, even when the site is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'アダルサ', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'アダルサ', {
      body: data.body || 'ご注文の準備ができました。',
      icon: '/adarsha-log.webp',
      badge: '/adarsha-log.webp',
      tag: data.tag || 'adarsha-order',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 300],
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const open = windows.find(w => w.url === url);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
