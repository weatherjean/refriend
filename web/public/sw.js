// Service Worker for Riff — Web Push notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, icon } = data;

  event.waitUntil(
    self.registration.showNotification(title || "Riff", {
      body: body || "",
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if one is open
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(url);
    })
  );
});
