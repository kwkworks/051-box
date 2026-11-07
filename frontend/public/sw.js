// 051 BOX 서비스 워커: 푸시 알림만 다룬다 (페이지 캐시는 하지 않음 → 항상 최신 화면)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '051 BOX', body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' ? data.title.slice(0, 80) : '051 BOX';
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : '';
  // 이 사이트 안의 경로만 연다 (/\다른사이트 같은 우회도 막기 위해 주소를 풀어서 출처를 비교)
  let url = '/';
  if (typeof data.url === 'string' && data.url.startsWith('/')) {
    try {
      const u = new URL(data.url, self.location.origin);
      if (u.origin === self.location.origin) url = u.pathname + u.search + u.hash;
    } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      tag: url,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL('/', self.location.origin).href;
  try {
    const u = new URL(event.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u.href;
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
