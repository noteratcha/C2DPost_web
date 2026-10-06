/**
 * Browser / device detection for the Chrome-only policy.
 *
 * - Desktop: only Google Chrome is allowed (the C2DPost Helper extension is published
 *   on the Chrome Web Store). Other Chromium browsers (Edge, Brave, Opera, Vivaldi...)
 *   and Firefox / Safari get the BrowserGate page.
 * - Mobile: extensions cannot be installed, so the extension gate is skipped and the
 *   PDF workspace page is hidden (report / dashboard pages still work).
 */

const OTHER_CHROMIUM = /Edg\/|EdgA\/|EdgiOS\/|OPR\/|Opera|Vivaldi|YaBrowser|SamsungBrowser|UCBrowser|Brave|DuckDuckGo|CocCoc/i;

/**
 * True for phones / tablets (including iPadOS that reports a desktop Mac UA).
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean' && navigator.userAgentData.mobile) {
    return true;
  }
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return true;
  // iPadOS 13+ pretends to be a Mac
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * True only for Google Chrome (desktop). Headless Chrome counts as Chrome (automated tests).
 */
export function isGoogleChrome() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.brave) return false;

  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length > 0) {
    const names = brands.map((b) => b.brand);
    if (names.some((n) => OTHER_CHROMIUM.test(n) || /Microsoft Edge|Opera/i.test(n))) return false;
    if (names.some((n) => n === 'Google Chrome' || n === 'HeadlessChrome')) return true;
  }

  const ua = navigator.userAgent || '';
  if (OTHER_CHROMIUM.test(ua)) return false;
  return /Chrome\/\d+/.test(ua) && (navigator.vendor || '') === 'Google Inc.';
}

/**
 * Human-readable name of the current browser for the gate message.
 */
export function detectBrowserName() {
  if (typeof navigator === 'undefined') return 'ไม่ทราบ';
  const ua = navigator.userAgent || '';
  if (navigator.brave) return 'Brave';
  if (/Edg\/|EdgA\/|EdgiOS\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Vivaldi/.test(ua)) return 'Vivaldi';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/YaBrowser/.test(ua)) return 'Yandex';
  if (/CocCoc/.test(ua)) return 'Cốc Cốc';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Google Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'เบราว์เซอร์อื่น';
}
