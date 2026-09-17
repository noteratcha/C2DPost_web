// C2DPost Helper - External Auto-fill Script
// Injected into https://dpost.thailandpost.com/* and https://e-ar.thailandpost.com/*

(function () {
  console.log("[C2DPost Helper] External Auto-fill Engine Initialized on:", window.location.hostname);

  // Set input value compatibly with React 16+ controlled components and standard DOM
  function setNativeValue(element, value) {
    if (!element) return;
    try {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch (e) {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Display unobtrusive, high-visibility confirmation badge on page
  function showAutofillBadge(serviceName, username) {
    if (document.getElementById("c2dpost-autofill-badge")) return;

    // Inject styles
    const style = document.createElement("style");
    style.textContent = `
      @keyframes c2dpostSlideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      #c2dpost-autofill-badge {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #065f46 0%, #047857 100%);
        color: #ffffff;
        border-radius: 12px;
        padding: 12px 18px;
        box-shadow: 0 12px 28px -4px rgba(6, 95, 70, 0.4), 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: c2dpostSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.4s ease, transform 0.4s ease;
      }
      #c2dpost-autofill-badge .c2d-icon {
        width: 28px;
        height: 28px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
      }
      #c2dpost-autofill-badge .c2d-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.2px;
        color: #ecfdf5;
      }
      #c2dpost-autofill-badge .c2d-desc {
        font-size: 11px;
        opacity: 0.9;
        margin-top: 1px;
        color: #d1fae5;
      }
      #c2dpost-autofill-badge .c2d-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 16px;
        padding: 0 0 0 8px;
        line-height: 1;
      }
      #c2dpost-autofill-badge .c2d-close:hover {
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);

    const badge = document.createElement("div");
    badge.id = "c2dpost-autofill-badge";
    badge.innerHTML = `
      <div class="c2d-icon">⚡</div>
      <div>
        <div class="c2d-title">C2DPost Helper • กรอกข้อมูลสำเร็จ</div>
        <div class="c2d-desc">กรอก Username (${username}) และ Password เข้าสู่ ${serviceName} เรียบร้อยแล้ว</div>
      </div>
      <button type="button" class="c2d-close" title="ปิด">✕</button>
    `;

    badge.querySelector(".c2d-close").onclick = () => {
      badge.style.opacity = "0";
      badge.style.transform = "translateY(10px)";
      setTimeout(() => badge.remove(), 400);
    };

    document.body.appendChild(badge);

    setTimeout(() => {
      if (document.body.contains(badge)) {
        badge.style.opacity = "0";
        badge.style.transform = "translateY(10px)";
        setTimeout(() => badge.remove(), 400);
      }
    }, 7000);
  }

  // Core Autofill Execution Engine
  function executeAutofill(creds) {
    if (!creds || !creds.username) return;

    const host = window.location.hostname.toLowerCase();

    // 1. Target: DPost (dpost.thailandpost.com)
    if (host.includes("dpost.thailandpost.com")) {
      let attempts = 0;
      const maxAttempts = 35; // Try for ~7 seconds

      const checkAndFillDPost = () => {
        attempts++;
        const userInput = 
          document.getElementById("txtUsername") || 
          document.querySelector('input[name="txtUsername"]') ||
          document.querySelector('input[placeholder*="user" i]');

        const passInput = 
          document.getElementById("txtPassword") || 
          document.querySelector('input[name="txtPassword"]') ||
          document.querySelector('input[type="password"]');

        if (userInput && passInput) {
          setNativeValue(userInput, creds.username);
          setNativeValue(passInput, creds.password || '');
          showAutofillBadge("DPost", creds.username);
          return true;
        }

        if (attempts < maxAttempts) {
          setTimeout(checkAndFillDPost, 200);
        }
        return false;
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", checkAndFillDPost);
      } else {
        checkAndFillDPost();
      }
    }

    // 2. Target: e-AR (e-ar.thailandpost.com)
    if (host.includes("e-ar.thailandpost.com")) {
      let filled = false;

      const tryFillEar = () => {
        if (filled) return true;

        const userInput = 
          document.querySelector('input[name="username"]') || 
          document.querySelector('input[placeholder*="user" i]') ||
          document.querySelector('input[type="text"]');

        const passInput = 
          document.querySelector('input[name="password"]') || 
          document.querySelector('input[placeholder*="pass" i]') ||
          document.querySelector('input[type="password"]');

        if (userInput && passInput) {
          setNativeValue(userInput, creds.username);
          setNativeValue(passInput, creds.password || '');
          filled = true;
          showAutofillBadge("e-AR", creds.username);
          return true;
        }
        return false;
      };

      // Try immediate
      if (!tryFillEar()) {
        const observer = new MutationObserver(() => {
          if (tryFillEar()) {
            observer.disconnect();
          }
        });

        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            observer.observe(document.body, { childList: true, subtree: true });
          });
        }

        setTimeout(() => observer.disconnect(), 15000);
      }
    }
  }

  // Initial lookup on tab load
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["c2dpost_credentials"], (res) => {
      const creds = res && res.c2dpost_credentials;
      if (creds && creds.username) {
        executeAutofill(creds);
      } else {
        console.log("[C2DPost Helper] Waiting for credentials from C2DPost Web...");
      }
    });

    // Proactively listen for storage changes (handles cases where C2DPost web syncs credentials while this tab is opening)
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.c2dpost_credentials) {
          const newCreds = changes.c2dpost_credentials.newValue;
          if (newCreds && newCreds.username) {
            console.log("[C2DPost Helper] Credentials synced to extension, executing autofill...");
            executeAutofill(newCreds);
          }
        }
      });
    }
  }
})();
