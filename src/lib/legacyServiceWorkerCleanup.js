function isLegacyNovaWorker(registration) {
  const scriptUrl = registration?.active?.scriptURL || registration?.waiting?.scriptURL || registration?.installing?.scriptURL || ''
  return /\/(sw|service-worker)\.js(?:$|\?)/i.test(scriptUrl)
}

export async function cleanupLegacyServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const legacy = registrations.filter(isLegacyNovaWorker)
    if (!legacy.length) {
      sessionStorage.removeItem('nova-sw-cleanup-reloaded')
      return false
    }

    const results = await Promise.all(legacy.map((registration) => registration.unregister()))
    const removed = results.some(Boolean)

    if (removed && 'caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }

    // Se una vecchia SW controllava già questa scheda, serve un solo reload per
    // liberare definitivamente fetch/Response intercettate dalla versione precedente.
    if (removed && navigator.serviceWorker.controller && sessionStorage.getItem('nova-sw-cleanup-reloaded') !== '1') {
      sessionStorage.setItem('nova-sw-cleanup-reloaded', '1')
      window.location.reload()
    }

    return removed
  } catch (error) {
    console.warn('Pulizia service worker legacy non riuscita:', error)
    return false
  }
}
