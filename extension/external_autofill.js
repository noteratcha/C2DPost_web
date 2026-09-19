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

  // Display unobtrusive, high-visibility confirmation badge for login autofill
  function showAutofillBadge(serviceName, username) {
    if (document.getElementById("c2dpost-autofill-badge")) return;

    injectBadgeStyles();

    const badge = document.createElement("div");
    badge.id = "c2dpost-autofill-badge";
    badge.className = "c2dpost-toast-badge";
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
    }, 6000);
  }

  // Display confirmation badge for e-AR barcode auto-search
  function showEarSearchBadge(barcode) {
    if (document.getElementById("c2dpost-ear-search-badge")) return;

    injectBadgeStyles();

    const badge = document.createElement("div");
    badge.id = "c2dpost-ear-search-badge";
    badge.className = "c2dpost-toast-badge";
    badge.innerHTML = `
      <div class="c2d-icon">🔍</div>
      <div>
        <div class="c2d-title">C2DPost Helper • ค้นหาพัสดุสำเร็จ</div>
        <div class="c2d-desc">เปลี่ยนเงื่อนไขเป็น "หมายเลขบาร์โค้ด" และค้นหา <strong>${barcode}</strong> ใน e-AR เรียบร้อยแล้ว</div>
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

  function injectBadgeStyles() {
    if (document.getElementById("c2dpost-toast-styles")) return;
    const style = document.createElement("style");
    style.id = "c2dpost-toast-styles";
    style.textContent = `
      @keyframes c2dpostSlideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .c2dpost-toast-badge {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #065f46 0%, #047857 100%);
        color: #ffffff;
        border-radius: 12px;
        padding: 12px 18px;
        box-shadow: 0 12px 28px -4px rgba(6, 95, 70, 0.4), 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Sarabun", sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: c2dpostSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.4s ease, transform 0.4s ease;
      }
      .c2dpost-toast-badge .c2d-icon {
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }
      .c2dpost-toast-badge .c2d-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.2px;
        color: #ecfdf5;
      }
      .c2dpost-toast-badge .c2d-desc {
        font-size: 11px;
        opacity: 0.92;
        margin-top: 2px;
        color: #d1fae5;
      }
      .c2dpost-toast-badge .c2d-desc strong {
        color: #fef08a;
        font-family: monospace;
        font-size: 12px;
      }
      .c2dpost-toast-badge .c2d-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 16px;
        padding: 0 0 0 8px;
        line-height: 1;
      }
      .c2dpost-toast-badge .c2d-close:hover {
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Core Autofill Execution Engine (Login Forms) ---
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

    // 2. Target: e-AR Sign In (e-ar.thailandpost.com/sign-in)
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

        // Only fill if this is an actual login form (has password input)
        if (userInput && passInput) {
          setNativeValue(userInput, creds.username);
          setNativeValue(passInput, creds.password || '');
          filled = true;
          showAutofillBadge("e-AR", creds.username);
          return true;
        }
        return false;
      };

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

  // --- Core e-AR Barcode Auto-Search Engine ---
  // Switches search condition to "หมายเลขบาร์โค้ด", inputs target barcode, and clicks Search
  let isExecutingEarSearch = false;
  let lastSearchedBarcode = "";

  function executeEarSearch(barcode) {
    if (!barcode || typeof barcode !== "string") return;
    const targetBarcode = barcode.trim().toUpperCase();
    if (!targetBarcode) return;

    // Avoid duplicate execution for the same barcode within a session
    if (isExecutingEarSearch && lastSearchedBarcode === targetBarcode) return;
    isExecutingEarSearch = true;
    lastSearchedBarcode = targetBarcode;

    console.log("[C2DPost Helper] Preparing to auto-search barcode in e-AR:", targetBarcode);

    let attempts = 0;
    const maxAttempts = 60; // Wait up to 18 seconds for Next.js / React MUI to mount

    const checkAndRunSearch = () => {
      attempts++;

      // 1. Check if barcode input is ALREADY visible in DOM
      const existingBarcodeInput = document.querySelector('input[name="barcode"]');
      if (existingBarcodeInput) {
        console.log("[C2DPost Helper] Barcode input found directly in DOM");
        setNativeValue(existingBarcodeInput, targetBarcode);
        triggerSearchSubmit(targetBarcode);
        return;
      }

      // 2. Look for the "เงื่อนไขการค้นหา" select button in Joy UI
      // React code structure: <FormLabel id="select-field-demo-label" htmlFor="select-field-demo-button">เงื่อนไขการค้นหา</FormLabel>
      const selectBtn = 
        document.getElementById("select-field-demo-button") ||
        document.querySelector('button[aria-labelledby*="select-field-demo-label"]') ||
        document.querySelector('button[aria-labelledby*="select-field"]') ||
        Array.from(document.querySelectorAll('button[role="combobox"]')).find(b => {
          const text = b.closest('div')?.textContent || "";
          return text.includes("เงื่อนไขการค้นหา") || b.getAttribute("aria-labelledby")?.includes("select-field");
        }) ||
        Array.from(document.querySelectorAll('button')).find(b => {
          const parent = b.parentElement;
          return parent && parent.textContent.includes("เงื่อนไขการค้นหา") && b.getAttribute("role") === "combobox";
        });

      if (selectBtn) {
        // Check if button text already indicates barcode mode
        const btnText = selectBtn.textContent || "";
        if (btnText.includes("บาร์โค้ด") || btnText.includes("บาร์โค๊ด") || btnText.includes("Barcode")) {
          // Dropdown is already set to barcode; wait for input to render
          const bcInput = document.querySelector('input[name="barcode"]');
          if (bcInput) {
            setNativeValue(bcInput, targetBarcode);
            triggerSearchSubmit(targetBarcode);
            return;
          }
        }

        console.log("[C2DPost Helper] Clicking search condition dropdown button...");
        // Click select button to open listbox
        selectBtn.click();

        // Wait a short tick for Joy UI to mount the popup <ul role="listbox">
        let optionWait = 0;
        const findAndClickOption = () => {
          optionWait++;
          const option = 
            document.querySelector('li[role="option"][data-value="barcode"]') ||
            Array.from(document.querySelectorAll('li[role="option"]')).find(li => {
              const t = li.textContent || "";
              return t.includes("บาร์โค้ด") || t.includes("บาร์โค๊ด") || t.includes("Barcode") || li.getAttribute("data-value") === "barcode";
            });

          if (option) {
            console.log("[C2DPost Helper] Selecting option 'หมายเลขบาร์โค้ด'...");
            option.click();

            // After selecting option, wait for <input name="barcode"> to mount
            let inputWait = 0;
            const waitForInput = () => {
              inputWait++;
              const bcInput = document.querySelector('input[name="barcode"]');
              if (bcInput) {
                console.log("[C2DPost Helper] Setting barcode value to:", targetBarcode);
                setNativeValue(bcInput, targetBarcode);
                setTimeout(() => {
                  triggerSearchSubmit(targetBarcode);
                }, 150);
                return;
              }
              if (inputWait < 25) {
                setTimeout(waitForInput, 100);
              }
            };
            setTimeout(waitForInput, 80);
            return;
          }

          if (optionWait < 15) {
            setTimeout(findAndClickOption, 80);
          }
        };

        setTimeout(findAndClickOption, 80);
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(checkAndRunSearch, 300);
      } else {
        console.warn("[C2DPost Helper] Search form elements not found on this page (might still be on login or loading screen).");
        isExecutingEarSearch = false;
      }
    };

    let submitted = false;
    function triggerSearchSubmit(bc) {
      if (submitted) return;
      submitted = true;

      setTimeout(() => {
        // Find submit button in the form
        const submitBtn = 
          document.querySelector('button[type="submit"]') ||
          Array.from(document.querySelectorAll('button')).find(b => {
            const t = b.textContent || "";
            return t.includes("ค้นหา") && !t.includes("เงื่อนไข");
          });

        if (submitBtn) {
          console.log("[C2DPost Helper] Clicking search submit button!");
          submitBtn.click();
          showEarSearchBadge(bc);
          clearEarSearchState();
        } else {
          const form = document.querySelector('form');
          if (form) {
            console.log("[C2DPost Helper] Dispatching submit event to form");
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            showEarSearchBadge(bc);
            clearEarSearchState();
          }
        }
        isExecutingEarSearch = false;
      }, 200);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", checkAndRunSearch);
    } else {
      setTimeout(checkAndRunSearch, 250);
    }
  }

  function clearEarSearchState() {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove("c2dpost_ear_search");
    }
    try {
      if (window.location.hash && window.location.hash.includes("barcode=")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (e) {}
  }

  // Check if there is an active search request for e-AR
  function inspectAndTriggerEarSearch() {
    const host = window.location.hostname.toLowerCase();
    if (!host.includes("e-ar.thailandpost.com")) return;

    // Do not attempt search on the sign-in page
    if (window.location.pathname.includes("/sign-in")) return;

    // 1. Check URL Hash: #barcode=BC414111081TH
    if (window.location.hash) {
      const match = window.location.hash.match(/barcode=([A-Za-z0-9]+)/i);
      if (match && match[1]) {
        executeEarSearch(match[1]);
        return;
      }
    }

    // 2. Check URL Search Query: ?barcode=BC414111081TH
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("barcode") || params.get("search");
      if (q) {
        executeEarSearch(q);
        return;
      }
    }

    // 3. Check Chrome Storage
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["c2dpost_ear_search"], (res) => {
        const item = res && res.c2dpost_ear_search;
        if (item && item.barcode) {
          // Check freshness (valid for 10 minutes)
          const age = Date.now() - (item.timestamp || 0);
          if (age < 10 * 60 * 1000) {
            executeEarSearch(item.barcode);
          } else {
            chrome.storage.local.remove("c2dpost_ear_search");
          }
        }
      });
    }
  }

  // --- Initial Lookup and Watchers ---
  if (chrome && chrome.storage && chrome.storage.local) {
    // 1. Credentials auto-fill
    chrome.storage.local.get(["c2dpost_credentials"], (res) => {
      const creds = res && res.c2dpost_credentials;
      if (creds && creds.username) {
        executeAutofill(creds);
      }
    });

    // 2. e-AR Barcode Search
    inspectAndTriggerEarSearch();

    // 3. Proactively listen for storage changes (handles dynamic updates between tabs)
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
          // A. Credentials updated
          if (changes.c2dpost_credentials) {
            const newCreds = changes.c2dpost_credentials.newValue;
            if (newCreds && newCreds.username) {
              executeAutofill(newCreds);
            }
          }
          // B. e-AR search requested
          if (changes.c2dpost_ear_search) {
            const newSearch = changes.c2dpost_ear_search.newValue;
            if (newSearch && newSearch.barcode) {
              inspectAndTriggerEarSearch();
            }
          }
        }
      });
    }
  }

  // Support SPA navigation (e.g. Next.js router transitions from /sign-in to /ear)
  let lastUrl = window.location.href;
  const urlCheckInterval = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      inspectAndTriggerEarSearch();
    }
  }, 500);
  window.addEventListener('pagehide', () => clearInterval(urlCheckInterval));

  window.addEventListener("popstate", inspectAndTriggerEarSearch);
  window.addEventListener("hashchange", inspectAndTriggerEarSearch);
})();
