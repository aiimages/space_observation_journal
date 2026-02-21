/**
 * Space Observation Journal — Service Worker
 * 
 * Strategy: Cache-First
 * All app resources are cached on install so the app works
 * completely offline after the first visit. Requests try
 * the cache first; if the resource isn't there yet it
 * fetches from the network and caches the response.
 */

'use strict';

// ─── Cache Configuration ────────────────────────────────────────────────────
const CACHE_NAME = 'space-observation-journal-v1';

/**
 * Core assets to pre-cache during the install phase.
 * These files make the app work offline immediately.
 */
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    // Google Fonts — cached on first visit (network-first below)
];

// ─── Install Event ───────────────────────────────────────────────────────────
/**
 * The install event fires when the SW is being installed.
 * We pre-cache the core app shell so it's available offline
 * without needing any network connection.
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Space Observation Journal SW…');

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching app shell assets');
            // addAll fetches & caches all URLs atomically —
            // if any fail the install fails (intentional for critical assets)
            return cache.addAll(PRECACHE_ASSETS);
        }).then(() => {
            console.log('[SW] Pre-cache complete — skipping waiting');
            // Activate immediately, don't wait for old SW to be removed
            return self.skipWaiting();
        }).catch((err) => {
            console.warn('[SW] Pre-cache failed:', err);
        })
    );
});

// ─── Activate Event ──────────────────────────────────────────────────────────
/**
 * The activate event fires when the SW takes control.
 * We clean up any old cache versions here so stale data
 * doesn't accumulate on the user's disk.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new Service Worker…');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Activation complete — claiming all clients');
            // Take control of all open tabs immediately
            return self.clients.claim();
        })
    );
});

// ─── Fetch Event (Cache-First Strategy) ─────────────────────────────────────
/**
 * Intercept all network requests.
 * 
 * Cache-First strategy:
 *  1. Check the cache for the requested resource
 *  2. If found → return cached response (fast, works offline)
 *  3. If not found → fetch from network, cache it, return it
 *  4. If network fails too → return a generic offline response
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests (POST, etc. bypass the cache)
    if (request.method !== 'GET') return;

    // Skip chrome-extension and non-http(s) requests
    if (!url.protocol.startsWith('http')) return;

    // Google Fonts: network-first so fonts stay fresh,
    // but fall back to cache if offline
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // Everything else: cache-first
    event.respondWith(cacheFirstStrategy(request));
});

// ─── Strategy Helpers ────────────────────────────────────────────────────────

/**
 * Cache-First: serve from cache, fall back to network.
 * Network responses are stored in cache for future offline use.
 */
async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse; // ✓ Served from cache
        }

        // Not in cache — fetch from network
        const networkResponse = await fetch(request);

        // Cache successful responses (status 200)
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            // Clone because a response can only be consumed once
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.warn('[SW] Cache-first fetch failed:', error);
        // Return a simple offline fallback
        return offlineFallback(request);
    }
}

/**
 * Network-First: try network, fall back to cache.
 * Used for frequently updated resources like fonts.
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);

        // Update cache with fresh response
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed — try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return offlineFallback(request);
    }
}

/**
 * Offline fallback response when both cache and network fail.
 * Returns a helpful offline page for HTML requests.
 */
function offlineFallback(request) {
    const url = new URL(request.url);

    // For navigation requests, return a minimal offline page
    if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
        return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Space Journal — Offline</title>
  <style>
    body { background: #03040a; color: #e2e8f0; font-family: sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; text-align: center; padding: 20px; }
    h1 { background: linear-gradient(135deg,#a855f7,#3b82f6);
         -webkit-background-clip: text; -webkit-text-fill-color: transparent;
         font-size: 2rem; margin-bottom: 12px; }
    p { color: #94a3b8; margin-bottom: 24px; }
    button { background: linear-gradient(135deg,#7c3aed,#3b82f6);
             color: white; border: none; padding: 12px 28px;
             border-radius: 50px; cursor: pointer; font-size: 1rem; }
  </style>
</head>
<body>
  <div>
    <div style="font-size:4rem;margin-bottom:16px">🌌</div>
    <h1>You're Offline</h1>
    <p>The Space Observation Journal requires an internet connection for the first load.<br>
       Once loaded, it works completely offline.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`,
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    // For other resources, return an empty 503
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

// ─── Message Handling ────────────────────────────────────────────────────────
/**
 * Listen for messages from the main app (e.g., skip waiting signal).
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
