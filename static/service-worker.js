// Bump this version to invalidate every client cache after a deploy that
// changes the app shell or this file.
const CACHE_VERSION = 'mermaid-live-editor-v1';
const SHELL_URL = './';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_VERSION)
			.then((cache) => cache.add(SHELL_URL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Never touch cross-origin traffic or the REST API: diagram data must
	// always come from the server so edits are not served stale.
	if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate' || url.pathname === '/config.js') {
		// /config.js is generated at runtime by the backend (API base URL), so it
		// follows the same network-first policy as page navigations.
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
					}
					return response;
				})
				.catch(async () => (await caches.match(request)) || (await caches.match(SHELL_URL)))
		);
		return;
	}

	// Hashed build assets are immutable once seen: stale-while-revalidate keeps
	// loads instant while still refreshing the cache in the background.
	event.respondWith(
		caches.match(request).then((cached) => {
			const network = fetch(request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
					}
					return response;
				})
				.catch(() => cached);
			return cached || network;
		})
	);
});
