// C2DPost Helper - Content Script
// Injected into web pages (Vercel & Localhost)

(function () {
  const VERSION = "1.0.0";

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
    }
  });

  console.log(`[C2DPost Helper Extension v${VERSION}] Initialized on this page.`);
})();
