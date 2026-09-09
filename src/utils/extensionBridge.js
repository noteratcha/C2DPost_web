/**
 * Bridge between C2DPost Web Application and C2DPost Helper Chrome Extension
 */

let isInstalledCache = false;

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
      return resolve(true);
    }

    let resolved = false;

    // 2. Handshake message listener
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'C2DPOST_PONG') {
        if (!resolved) {
          resolved = true;
          isInstalledCache = true;
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
    callback(e.detail);
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
