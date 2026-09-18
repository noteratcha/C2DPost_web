/**
 * Bridge between C2DPost Web Application and C2DPost Helper Chrome Extension
 */

let isInstalledCache = false;
let installedVersionCache = '';

/**
 * Get the currently installed extension version
 * @returns {string} e.g. "1.1.0", "1.0.0", or ""
 */
export function getExtensionVersion() {
  if (typeof document !== 'undefined' && document.documentElement) {
    const domVer = document.documentElement.getAttribute('data-c2dpost-version');
    if (domVer) {
      installedVersionCache = domVer;
      return domVer;
    }
    if (document.documentElement.getAttribute('data-c2dpost-extension-installed') === 'true') {
      installedVersionCache = installedVersionCache || '1.0.0';
      return installedVersionCache;
    }
  }
  return installedVersionCache || '';
}

/**
 * Check if the C2DPost Helper Extension is installed
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export function checkExtensionInstalled(timeoutMs = 1000) {
  return new Promise((resolve) => {
    // 1. Quick check via DOM attribute injected by content.js
    if (document.documentElement.getAttribute('data-c2dpost-extension-installed') === 'true') {
      isInstalledCache = true;
      installedVersionCache = document.documentElement.getAttribute('data-c2dpost-version') || '1.0.0';
      return resolve(true);
    }

    let resolved = false;

    // 2. Handshake message listener
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'C2DPOST_PONG') {
        if (!resolved) {
          resolved = true;
          isInstalledCache = true;
          installedVersionCache = event.data.version || document.documentElement.getAttribute('data-c2dpost-version') || '1.0.0';
          window.removeEventListener('message', handleMessage);
          resolve(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Send Ping
    window.postMessage({ type: 'C2DPOST_PING' }, '*');

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handleMessage);
        // Final DOM check in case attribute was set slightly after
        const isSet = document.documentElement.getAttribute('data-c2dpost-extension-installed') === 'true';
        isInstalledCache = isSet;
        if (isSet) {
          installedVersionCache = document.documentElement.getAttribute('data-c2dpost-version') || '1.0.0';
        }
        resolve(isSet);
      }
    }, timeoutMs);
  });
}

/**
 * Listen for extension ready event (fires when extension is enabled/installed while on page)
 */
export function subscribeExtensionReady(callback) {
  const handler = (e) => {
    isInstalledCache = true;
    if (e.detail && e.detail.version) {
      installedVersionCache = e.detail.version;
    } else if (typeof document !== 'undefined' && document.documentElement) {
      installedVersionCache = document.documentElement.getAttribute('data-c2dpost-version') || '1.0.0';
    }
    callback(e.detail || { version: installedVersionCache });
  };
  window.addEventListener('C2DPOST_EXTENSION_READY', handler);
  return () => window.removeEventListener('C2DPOST_EXTENSION_READY', handler);
}

/**
 * Request barcodes from Thailand Post API via the Chrome Extension
 * @param {number} count Number of barcodes needed
 * @param {number} typ 2 = Registered Post (R), 1 = EMS
 * @returns {Promise<{success: boolean, barcodes: string[], error?: string}>}
 */
export function fetchBarcodesFromExtension(count, typ = 2) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handleResult);
      reject(new Error('การดึงบาร์โค้ดหมดเวลา (Timeout) กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'));
    }, 20000);

    const handleResult = (event) => {
      if (event.data && event.data.type === 'C2DPOST_BARCODES_RESULT' && event.data.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', handleResult);

        if (event.data.success) {
          resolve({
            success: true,
            barcodes: event.data.barcodes,
            count: event.data.count
          });
        } else {
          reject(new Error(event.data.error || 'ไม่สามารถดึงบาร์โค้ดจากไปรษณีย์ไทยได้'));
        }
      }
    };

    window.addEventListener('message', handleResult);

    // Dispatch message to Content Script
    window.postMessage(
      {
        type: 'C2DPOST_FETCH_BARCODES',
        requestId: requestId,
        count: count,
        typ: typ
      },
      '*'
    );
  });
}

/**
 * Synchronize user credentials to C2DPost Helper Extension for automatic auto-fill on external sites (DPost, e-AR)
 * @param {string} username
 * @param {string} password
 * @param {string} organization
 */
export function syncCredentialsToExtension(username, password, organization = '') {
  if (!username) return;
  try {
    window.postMessage(
      {
        type: 'C2DPOST_SET_CREDENTIALS',
        username: username,
        password: password || '',
        organization: organization || '',
        timestamp: Date.now()
      },
      '*'
    );
  } catch (err) {
    console.error('[C2DPost Bridge] Failed to sync credentials to extension:', err);
  }
}

/**
 * Open e-AR with target barcode, sync to extension, copy to clipboard, and navigate
 * @param {string} barcode Barcode string e.g. "BC414111081TH"
 */
export function openEarWithBarcode(barcode) {
  if (!barcode) return;
  const cleanBarcode = String(barcode).trim().toUpperCase();

  // 1. Copy barcode to clipboard for user convenience
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanBarcode);
    }
  } catch (e) {
    console.warn('[C2DPost Bridge] Clipboard copy error:', e);
  }

  // 2. Dispatch message to C2DPost Helper Chrome Extension
  try {
    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          type: 'C2DPOST_SET_EAR_SEARCH',
          barcode: cleanBarcode,
          timestamp: Date.now()
        },
        '*'
      );
    }
  } catch (err) {
    console.warn('[C2DPost Bridge] Failed to send ear search message:', err);
  }

  // 3. Open e-AR page with barcode in URL hash
  const earUrl = `https://e-ar.thailandpost.com/ear#barcode=${encodeURIComponent(cleanBarcode)}`;
  if (typeof window !== 'undefined') {
    window.open(earUrl, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Compare two semver strings like "1.3.0" vs "1.2.0"
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Check if the installed extension supports FETCH_EAR_PDF (requires v1.3.0+)
 * @param {number} timeoutMs
 * @returns {Promise<{supported: boolean, installed: boolean, version: string}>}
 */
export async function checkEarCapability(timeoutMs = 600) {
  // 1. Check synchronous DOM attributes
  if (typeof document !== 'undefined' && document.documentElement) {
    const domVer = document.documentElement.getAttribute('data-c2dpost-version');
    const isInst = document.documentElement.getAttribute('data-c2dpost-extension-installed') === 'true';
    if (domVer) {
      installedVersionCache = domVer;
      isInstalledCache = true;
      const isSupp = compareVersions(domVer, '1.3.0') >= 0;
      return { supported: isSupp, installed: true, version: domVer };
    }
  }

  // 2. Ping via postMessage
  return new Promise((resolve) => {
    let resolved = false;
    const handlePong = (event) => {
      if (event.data && (event.data.type === 'C2DPOST_PONG' || event.data.type === 'C2DPOST_EXTENSION_READY')) {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', handlePong);
          const ver = event.data.version || document.documentElement.getAttribute('data-c2dpost-version') || '1.0.0';
          installedVersionCache = ver;
          isInstalledCache = true;
          const isSupp = compareVersions(ver, '1.3.0') >= 0;
          resolve({ supported: isSupp, installed: true, version: ver });
        }
      }
    };

    window.addEventListener('message', handlePong);
    window.postMessage({ type: 'C2DPOST_PING' }, '*');

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handlePong);
        const ver = getExtensionVersion();
        const isInst = isInstalledCache || !!ver;
        const isSupp = isInst && compareVersions(ver, '1.3.0') >= 0;
        resolve({ supported: isSupp, installed: isInst, version: ver || '' });
      }
    }, timeoutMs);
  });
}

/**
 * Request e-AR PDF via Chrome Extension Bridge (bypasses CORS and Geoblocking)
 * @param {string} barcode Barcode string e.g. "BC414111081TH"
 * @returns {Promise<{success: boolean, barcode: string, pdfBase64?: string, error?: string}>}
 */
export function fetchEarPdfFromExtension(barcode) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve({ success: false, error: 'Window not available' });
    }

    const cleanBarcode = String(barcode || '').trim().toUpperCase();
    if (!cleanBarcode) {
      return resolve({ success: false, error: 'Empty barcode' });
    }

    const requestId = `ear_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handleResult);
      resolve({ success: false, error: 'Extension e-AR request timeout' });
    }, 15000);

    const handleResult = (event) => {
      if (event.data && event.data.type === 'C2DPOST_EAR_PDF_RESULT' && event.data.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', handleResult);
        resolve(event.data);
      }
    };

    window.addEventListener('message', handleResult);

    window.postMessage(
      {
        type: 'C2DPOST_FETCH_EAR_PDF',
        requestId: requestId,
        barcode: cleanBarcode
      },
      '*'
    );
  });
}


