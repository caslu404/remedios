const CACHE_NAME = "tratamento-adaptativo-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); } return response; })));
});
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Tratamento", body: "Você tem um novo lembrete.", url: "/" };
  const actions = data.recordId ? [{ action: "taken", title: "Tomei" }, { action: "snooze", title: "Adiar 10 min" }, { action: "open", title: "Abrir app" }] : [{ action: "open", title: "Abrir app" }];
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: data.tag || data.url || "tratamento", renotify: true, data: { url: data.url || "/", recordId: data.recordId || null }, actions }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const recordId = event.notification.data?.recordId;
  if (event.action === "taken" && recordId) {
    const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const value = (type) => parts.find((part) => part.type === type)?.value || "00";
    event.waitUntil(fetch(`/api/doses/${recordId}/taken`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takenTime: `${value("hour")}:${value("minute")}` }) }).then(() => self.registration.showNotification("Dose registrada", { body: "O horário real foi salvo. Abra o app para revisar o restante do dia.", icon: "/icons/icon-192.png" })));
    return;
  }
  if (event.action === "snooze") {
    if (recordId) event.waitUntil(fetch(`/api/doses/${recordId}/snooze`, { method: "POST" }).then(() => self.registration.showNotification("Lembrete adiado", { body: "Avisaremos novamente em 10 minutos.", icon: "/icons/icon-192.png" })));
    return;
  }
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => { const existing = windows.find((client) => "focus" in client); return existing ? existing.navigate(url).then((client) => client?.focus()) : clients.openWindow(url); }));
});
