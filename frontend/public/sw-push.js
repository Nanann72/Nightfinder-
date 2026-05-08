/* me&you — Web Push Service Worker
   Receives push events from the backend (pywebpush) and displays them as
   native browser notifications. Clicking a notification opens the URL carried
   in its payload. */
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    if (!event.data) return;
    let payload = {};
    try { payload = event.data.json(); } catch { payload = { title: "me&you", body: event.data.text() }; }
    const title = payload.title || "me&you";
    const options = {
        body: payload.body || "",
        icon: "/logo.png",
        badge: "/logo.png",
        data: { url: payload.url || "/" },
        vibrate: [80, 40, 80],
        tag: payload.tag || undefined,
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((windows) => {
                const existing = windows.find((w) => w.url.includes(self.location.origin));
                if (existing) { existing.focus(); existing.navigate(url); return; }
                return self.clients.openWindow(url);
            })
    );
});
