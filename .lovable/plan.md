

# Fix: Stale Content on edvana.dev After Deployment

## Problem Diagnosis

The root cause is that the PWA service worker **precaches** `index.html`. When a user opens edvana.dev, the service worker instantly serves the **cached** `index.html` (with old asset hashes) before it even checks for updates. The current `skipWaiting` + `clientsClaim` + `controllerchange` reload only kicks in *after* the browser has already rendered the stale page. On a fresh visit, the sequence is:

1. User opens edvana.dev
2. Service worker serves cached (old) index.html immediately
3. Old JS loads, old app renders
4. SW checks for update in background, finds new SW, installs it
5. `controllerchange` fires, page reloads with new content

The user sees stale content for a few seconds (or longer) before the reload happens -- and if the SW update check hasn't completed, they see stale content indefinitely until manual refresh.

## Solution: Network-First Navigation Strategy

Force the service worker to **always fetch `index.html` from the network first** (falling back to cache only if offline). This way, every page load gets the latest HTML immediately.

### Changes

**1. Update `vite.config.ts` -- Workbox configuration**

Add a `navigateFallbackDenylist` and a `runtimeCaching` rule that applies `NetworkFirst` to all navigation (HTML) requests:

```typescript
workbox: {
  skipWaiting: true,
  clientsClaim: true,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Don't precache index.html -- we'll handle it via NetworkFirst
  navigateFallback: null,
  runtimeCaching: [
    // Navigation requests (HTML pages) -- always fetch fresh
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-navigation',
        expiration: { maxEntries: 10, maxAgeSeconds: 86400 },
        networkTimeoutSeconds: 3,
      },
    },
    // ... existing Supabase API and image caching rules unchanged
  ],
}
```

This single change ensures:
- Online users always get the latest `index.html` from the server
- Offline users still get a cached fallback
- Hashed JS/CSS assets (`/assets/index-abc123.js`) remain cache-first (immutable, so this is correct)

**2. Simplify `useVersionCheck.ts`**

With NetworkFirst navigation, the version polling becomes a safety net rather than the primary mechanism. Keep it but reduce complexity -- the toast notification approach is fine as a backup for long-lived tabs.

No structural changes needed here, but we can optionally reduce the initial check delay from 10s to 5s for faster detection in long-lived sessions.

**3. Verify `vercel.json` headers (no change needed)**

The existing `Cache-Control: public, max-age=0, must-revalidate` for `index.html` is correct. This ensures Vercel's CDN and the browser don't cache the HTML. The issue was purely the service worker layer, not Vercel.

## Alternative Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **NetworkFirst for navigation (chosen)** | Fresh content on every visit; offline fallback preserved | Slight network dependency on load |
| **Disable PWA entirely** | Simplest fix; no caching issues | Lose offline support, install prompt, app-like experience |
| **Navigation preload** | Browser fetches HTML in parallel with SW boot | Not supported in all browsers; more complex |
| **Prompt-based update only** | User controls when to update | Users may ignore the prompt; stale content persists |

## Summary

One config change in `vite.config.ts` (set navigation requests to `NetworkFirst` and stop precaching `index.html`) will fix the stale content issue while preserving all PWA benefits for offline use and asset caching.

