// Retire le cache de l'ancienne interface. Les données restent gérées par l'API PHP.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('biblio-')).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// Network-only: ne pas conserver une ancienne version ou des données de lecture obsolètes.
