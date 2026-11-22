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

// 알림을 누르면 그 알림의 화면으로 바로 간다.
//  1) 앱이 열려 있으면: 앱에 "이 주소로 가" 메시지를 보내고(PushNavigator가 받음), 되면 창 자체도 그 주소로 옮긴 뒤 앞으로 가져온다
//  2) 앱이 꺼져 있으면: 그 주소로 새 창을 연다
//  아이폰처럼 새 창을 첫 화면으로 여는 기기를 위해 가야 할 주소를 잠깐(2분) 저장해 두고, 앱이 켜지면 PushNavigator가 이어서 이동한다
const NAV_CACHE = 'box-nav';
const NAV_KEY = '/__pending-nav';

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let path = '/';
  try {
    const u = new URL(event.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) path = u.pathname + u.search + u.hash;
  } catch {}
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(NAV_CACHE);
        await cache.put(NAV_KEY, new Response(JSON.stringify({ path, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
      } catch {}
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((w) => 'focus' in w);
      if (win) {
        win.postMessage({ type: 'box-navigate', path });
        try {
          await win.focus();
        } catch {}
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
