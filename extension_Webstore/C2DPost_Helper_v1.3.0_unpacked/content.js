// C2DPost Helper - Content Script
// Injected into web pages (Vercel & Localhost)

(function () {
  const VERSION = "1.3.0";

  // Mark HTML element so the web page can detect immediately via DOM
  function markExtensionInstalled() {
    if (document.documentElement) {
      document.documentElement.setAttribute("data-c2dpost-extension-installed", "true");
      document.documentElement.setAttribute("data-c2dpost-version", VERSION);
    }
  }

  markExtensionInstalled();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markExtensionInstalled);
  }

  // Notify the page via CustomEvent
  window.dispatchEvent(
    new CustomEvent("C2DPOST_EXTENSION_READY", {
      detail: { version: VERSION, status: "ready" }
    })
  );

  // Listen to window postMessage from web application
  window.addEventListener("message", (event) => {
    // Only accept messages intended for this extension
    if (!event.data || typeof event.data !== "object") return;

    // 1. Handshake Ping
    if (event.data.type === "C2DPOST_PING") {
      markExtensionInstalled();
      window.postMessage(
        {
          type: "C2DPOST_PONG",
          version: VERSION,
          status: "connected"
        },
        "*"
      );
      return;
    }

    // 2. Fetch Barcodes request
    if (event.data.type === "C2DPOST_FETCH_BARCODES") {
      const { requestId, count, typ } = event.data;

      chrome.runtime.sendMessage(
        {
          action: "FETCH_BARCODES",
          count: count,
          typ: typ || 2
        },
        (response) => {
          // Send response back to the web page
          window.postMessage(
            {
              type: "C2DPOST_BARCODES_RESULT",
              requestId: requestId,
              ...(response || { success: false, error: "No response from extension background worker" })
            },
            "*"
          );
        }
      );
      return;
    }

    // 3. Set Credentials request (for DPost and e-AR auto-fill)
    if (event.data.type === "C2DPOST_SET_CREDENTIALS") {
      const { username, password, organization } = event.data;

      chrome.runtime.sendMessage(
        {
          action: "SET_CREDENTIALS",
          credentials: {
            username: username || "",
            password: password || "",
            organization: organization || "",
            updatedAt: Date.now()
          }
        },
        (response) => {
          window.postMessage(
            {
              type: "C2DPOST_CREDENTIALS_SET_RESULT",
              ...(response || { success: true })
            },
            "*"
          );
        }
      );
      return;
    }

    // 4. Set e-AR Search Barcode
    if (event.data.type === "C2DPOST_SET_EAR_SEARCH") {
      const { barcode } = event.data;
      if (!barcode) return;

      chrome.runtime.sendMessage(
        {
          action: "SET_EAR_SEARCH",
          barcode: barcode
        },
        (response) => {
          window.postMessage(
            {
              type: "C2DPOST_EAR_SEARCH_SET_RESULT",
              ...(response || { success: true })
            },
            "*"
          );
        }
      );
      return;
    }

    // 5. Fetch e-AR PDF request
    if (event.data.type === "C2DPOST_FETCH_EAR_PDF") {
      const { requestId, barcode } = event.data;

      chrome.runtime.sendMessage(
        {
          action: "FETCH_EAR_PDF",
          barcode: barcode
        },
        (response) => {
          window.postMessage(
            {
              type: "C2DPOST_EAR_PDF_RESULT",
              requestId: requestId,
              ...(response || { success: false, error: "No response from extension background worker" })
            },
            "*"
          );
        }
      );
      return;
    }
  });

  console.log(`[C2DPost Helper Extension v${VERSION}] Initialized on this page.`);
})();
