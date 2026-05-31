(function () {
  if (window.__phoneInjectorLoaded) return;
  window.__phoneInjectorLoaded = true;

  const PHONE_NUMBER = window.__injectedPhoneNumber || "";

  function log(msg) {
    console.log("[Phone Injector]", msg);
  }

  log("Phone injector loaded. Number: " + PHONE_NUMBER);
  log("Page URL: " + window.location.href);

  // ============================================
  // 1. Try switching verification flow via URL
  // ============================================
  function tryFlowSwitch() {
    const url = new URL(window.location.href);
    const currentFlow = url.searchParams.get("pnv_flow");
    log("Current pnv_flow: " + currentFlow);

    if (currentFlow === "2") {
      // Flow 2 = device-based (auto SIM detect) - try switching to flow 1 or 3
      const altFlows = ["1", "3", "0"];
      log("Device flow detected. Will try alternative flows: " + altFlows.join(", "));

      chrome.runtime.sendMessage({
        type: "FLOW_OPTIONS",
        currentFlow: currentFlow,
        altFlows: altFlows,
        baseUrl: window.location.href,
      });
    }
  }

  // ============================================
  // 2. Intercept SMS URL schemes
  // ============================================
  const origOpen = window.open;
  window.open = function (url, ...args) {
    if (url && typeof url === "string") {
      log("window.open: " + url);
      if (url.startsWith("sms:") || url.startsWith("intent:")) {
        log("SMS CAPTURED: " + url);
        showSmsOverlay(url);
        return null;
      }
    }
    return origOpen.call(this, url, ...args);
  };

  document.addEventListener("click", function (e) {
    const link = e.target.closest("a");
    if (link) {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("sms:") || href.startsWith("intent:")) {
        e.preventDefault();
        e.stopPropagation();
        log("SMS link captured: " + href);
        showSmsOverlay(href);
      }
    }
  }, true);

  // ============================================
  // 3. Monitor ALL network requests
  // ============================================
  const origFetch = window.fetch;
  window.fetch = async function (url, options) {
    const urlStr = typeof url === "string" ? url : (url && url.url) || "";
    log("FETCH: " + urlStr.substring(0, 200));

    if (options && options.body) {
      const bodyStr = typeof options.body === "string" ? options.body : "";
      if (bodyStr) log("FETCH body: " + bodyStr.substring(0, 500));
    }

    const response = await origFetch.call(this, url, options);
    const clone = response.clone();
    clone.text().then((text) => {
      if (text.length < 5000) {
        log("FETCH response: " + text.substring(0, 1000));
      } else {
        log("FETCH response (large, " + text.length + " chars): " + text.substring(0, 500));
      }
    }).catch(() => {});

    return response;
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__url = url;
    this.__method = method;
    log("XHR " + method + ": " + url);
    return origXhrOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (body) log("XHR body to " + this.__url + ": " + String(body).substring(0, 500));
    this.addEventListener("load", () => {
      log("XHR response from " + this.__url + ": " + this.responseText.substring(0, 1000));
    });
    return origXhrSend.call(this, body);
  };

  // ============================================
  // 4. Find phone inputs and inject number
  // ============================================
  function findAndFillPhoneInputs() {
    if (!PHONE_NUMBER) return;

    const selectors = [
      'input[type="tel"]',
      'input[name*="phone"]',
      'input[id*="phone"]',
      'input[autocomplete*="tel"]',
      'input[aria-label*="phone"]',
      'input[placeholder*="phone"]',
      'input[placeholder*="number"]',
    ];

    let found = 0;
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((inp) => {
        log("Filling phone input: " + (inp.name || inp.id || inp.type));
        inp.value = PHONE_NUMBER;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        found++;
      });
    });

    return found;
  }

  // ============================================
  // 5. Scan page for any useful info
  // ============================================
  function scanPage() {
    const text = document.body ? document.body.innerText : "";
    log("Page text: " + text.substring(0, 500));

    // Look for any forms
    const forms = document.querySelectorAll("form");
    forms.forEach((form, i) => {
      log("Form " + i + " action: " + (form.action || "none") + " method: " + (form.method || "none"));
      form.querySelectorAll("input").forEach((inp) => {
        log("  Input: name=" + inp.name + " type=" + inp.type + " value=" + inp.value);
      });
    });

    // Look for hidden inputs
    document.querySelectorAll('input[type="hidden"]').forEach((inp) => {
      log("Hidden input: name=" + inp.name + " value=" + inp.value.substring(0, 100));
    });

    // Look for data in script tags
    document.querySelectorAll("script").forEach((script) => {
      const content = script.textContent || "";
      if (content.includes("phone") || content.includes("sms") || content.includes("verify") || content.includes("token")) {
        const relevant = content.substring(0, 2000);
        log("Script with verification data: " + relevant.substring(0, 500));
      }
    });

    // Count phone inputs found
    const filled = findAndFillPhoneInputs();
    if (filled > 0) {
      log("Filled " + filled + " phone inputs with " + PHONE_NUMBER);
    }
  }

  function showSmsOverlay(smsUrl) {
    let to = "";
    let body = "";

    if (smsUrl.startsWith("sms:")) {
      const parts = smsUrl.substring(4).split("?");
      to = parts[0];
      if (parts[1]) {
        const params = new URLSearchParams(parts[1]);
        body = params.get("body") || "";
      }
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 999999; background: #1a1a2e; color: #e0e0e0;
      border-radius: 12px; padding: 24px; max-width: 420px; width: 90%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5); font-family: Arial, sans-serif;
      border: 2px solid #66bb6a;
    `;
    overlay.innerHTML = `
      <h2 style="color: #66bb6a; margin: 0 0 12px; font-size: 16px;">SMS Verification Info</h2>
      <p style="font-size: 12px; color: #aaa; margin-bottom: 14px;">Send this SMS from your rent phone:</p>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 10px; color: #888;">SEND TO:</div>
        <div style="font-size: 20px; font-weight: bold; color: #fff; margin-top: 4px;">${to || smsUrl}</div>
      </div>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 10px; color: #888;">MESSAGE:</div>
        <div style="font-size: 18px; font-weight: bold; color: #66bb6a; margin-top: 4px;">${body || "(empty - just send to the number)"}</div>
      </div>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 8px; margin-bottom: 14px;">
        <div style="font-size: 10px; color: #888;">RAW:</div>
        <div style="font-size: 9px; color: #78909c; word-break: break-all;">${smsUrl}</div>
      </div>
      <button onclick="this.parentElement.remove();document.getElementById('sms-backdrop')?.remove()" style="
        background: #333; color: #ccc; border: none; padding: 8px 24px;
        border-radius: 6px; cursor: pointer; font-size: 12px;
      ">Close</button>
    `;

    const backdrop = document.createElement("div");
    backdrop.id = "sms-backdrop";
    backdrop.style.cssText = `position: fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.7); z-index:999998;`;

    document.body.appendChild(backdrop);
    document.body.appendChild(overlay);

    chrome.runtime.sendMessage({ type: "SMS_CAPTURED", to, body, rawUrl: smsUrl });
  }

  // Run everything
  setTimeout(() => {
    scanPage();
    tryFlowSwitch();
  }, 500);

  // Monitor DOM changes
  const observer = new MutationObserver(() => {
    findAndFillPhoneInputs();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Banner
  const banner = document.createElement("div");
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    padding: 8px 16px; background: rgb(26, 115, 232); color: white;
    font-family: Arial, sans-serif; font-size: 12px; text-align: center;
  `;
  banner.textContent = PHONE_NUMBER
    ? "Phone injector active - number: " + PHONE_NUMBER + " - monitoring for SMS intent..."
    : "Diagnostics mode - all network requests logged to console (F12)";
  document.body.appendChild(banner);
})();
