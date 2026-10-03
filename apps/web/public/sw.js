function notificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/staff", self.location.origin);
    return url.origin === self.location.origin ? url.href : `${self.location.origin}/staff`;
  } catch {
    return `${self.location.origin}/staff`;
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || typeof payload.text !== "string") return;
  event.waitUntil(self.registration.showNotification("PJ-8 Staff", { body: payload.text, data: { url: notificationUrl(payload.url) } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(notificationUrl(event.notification.data?.url)));
});
