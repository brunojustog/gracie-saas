/* v1.2-D — service worker mínimo do PWA (base pra instalação + push futuro). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Passthrough: deixa o browser lidar com a rede (marca o app como instalável).
self.addEventListener("fetch", () => {});

// Notificações push (usado nas próximas etapas — falta/aniversário/graduação).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Gracie Barra";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/api/pwa-icon?s=192",
      badge: "/api/pwa-icon?s=192",
      data: { url: data.url || "/aluno" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow((event.notification.data && event.notification.data.url) || "/aluno"),
  );
});
