(function () {
  if (window.__phoneInjectorLoaded) return;
  window.__phoneInjectorLoaded = true;

  const PHONE_NUMBER = window.__injectedPhoneNumber || "";

  function log(msg) {
    console.log("[Phone Injector]", msg);
  }

  log("Phone injector loaded. Number: " + PHONE_NUMBER);
  log("Page URL: " + window.location.href);
  log("Current page text: " + (document.body ? document.body.innerText.substring(0, 300) : "no body"));

  // Intercept SMS URL schemes (sms:, intent:)
  const origOpen = window.open;
  window.open = function (url, ...args) {
    if (url && typeof url === "string") {
      log("window.open intercepted: " + url);
      if (url.startsWith("sms:") || url.startsWith("intent:")) {
        log("SMS INTENT CAPTURED: " + url);
        showSmsInfo(url);
        return null;
      }
    }
    return origOpen.call(this, url, ...args);
  };

  // Intercept location changes for sms: scheme
  const origAssign = Object.getOwnPropertyDescriptor(Location.prototype, "href");
  if (origAssign && origAssign.set) {
    Object.defineProperty(window.location, "href", {
      set: function (val) {
        if (val && typeof val === "string" && (val.startsWith("sms:") || val.startsWith("intent:"))) {
          log("location.href SMS intercepted: " + val);
          showSmsInfo(val);
          return;
        }
        origAssign.set.call(this, val);
      },
      get: origAssign.get ? origAssign.get.bind(window.location) : undefined,
    });
  }

  // Intercept link clicks for sms: scheme
  document.addEventListener(
    "click",
    function (e) {
      const link = e.target.closest("a");
      if (link) {
        const href = link.getAttribute("href") || "";
        if (href.startsWith("sms:") || href.startsWith("intent:")) {
          e.preventDefault();
          e.stopPropagation();
          log("Link click SMS intercepted: " + href);
          showSmsInfo(href);
        }
      }
    },
    true
  );

  // Override navigator.credentials to provide phone number hint
  if (navigator.credentials) {
    const origGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = async function (options) {
      log("navigator.credentials.get called with: " + JSON.stringify(options));

      if (options && options.otp) {
        log("OTP credential requested - monitoring for auto-fill");
      }

      try {
        return await origGet(options);
      } catch (e) {
        log("credentials.get error (expected): " + e.message);
        return null;
      }
    };
  }

  // Monitor all fetch/XHR for verification-related calls
  const origFetch = window.fetch;
  window.fetch = async function (url, options) {
    const urlStr = typeof url === "string" ? url : url.url || "";

    if (
      urlStr.includes("verify") ||
      urlStr.includes("phone") ||
      urlStr.includes("sms") ||
      urlStr.includes("challenge") ||
      urlStr.includes("mophoneverification")
    ) {
      log("FETCH intercepted: " + urlStr);
      if (options && options.body) {
        log("Body: " + (typeof options.body === "string" ? options.body.substring(0, 500) : "non-string body"));
      }
    }

    const response = await origFetch.call(this, url, options);

    if (
      urlStr.includes("verify") ||
      urlStr.includes("phone") ||
      urlStr.includes("sms") ||
      urlStr.includes("challenge")
    ) {
      const clone = response.clone();
      clone.text().then((text) => {
        log("FETCH response from " + urlStr + ": " + text.substring(0, 500));
      }).catch(() => {});
    }

    return response;
  };

  // Monitor XHR
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__url = url;
    if (
      url.includes("verify") ||
      url.includes("phone") ||
      url.includes("sms") ||
      url.includes("challenge")
    ) {
      log("XHR intercepted: " + method + " " + url);
    }
    return origXhrOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this.__url && (
      this.__url.includes("verify") ||
      this.__url.includes("phone") ||
      this.__url.includes("sms")
    )) {
      log("XHR send to " + this.__url + ": " + (body ? String(body).substring(0, 300) : "no body"));

      this.addEventListener("load", () => {
        log("XHR response from " + this.__url + ": " + this.responseText.substring(0, 500));
      });
    }
    return origXhrSend.call(this, body);
  };

  // Look for and inject into phone number fields
  function injectPhoneNumber() {
    if (!PHONE_NUMBER) return;

    // Look for phone-related inputs
    const inputs = document.querySelectorAll(
      'input[type="tel"], input[name*="phone"], input[id*="phone"], input[autocomplete*="tel"]'
    );

    inputs.forEach((inp) => {
      log("Found phone input: " + inp.name + " / " + inp.id);
      inp.value = PHONE_NUMBER;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Look for hidden phone fields in JavaScript variables
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => {
      const text = script.textContent || "";
      if (text.includes("phoneNumber") || text.includes("phone_number") || text.includes("msisdn")) {
        log("Found phone-related script content (length: " + text.length + ")");
      }
    });
  }

  function parseSmsUrl(url) {
    let to = "";
    let body = "";

    if (url.startsWith("sms:")) {
      const parts = url.substring(4).split("?");
      to = parts[0];
      if (parts[1]) {
        const params = new URLSearchParams(parts[1]);
        body = params.get("body") || "";
      }
    } else if (url.startsWith("intent:")) {
      const match = url.match(/intent:\/\/.*?sms.*?;.*?S\.sms_body=([^;]+)/i);
      if (match) body = decodeURIComponent(match[1]);
      const toMatch = url.match(/intent:\/\/([\d+]+)/);
      if (toMatch) to = toMatch[1];
    }

    return { to, body };
  }

  function showSmsInfo(smsUrl) {
    const { to, body } = parseSmsUrl(smsUrl);

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 999999; background: #1a1a2e; color: #e0e0e0;
      border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5); font-family: Arial, sans-serif;
      border: 2px solid #4fc3f7;
    `;

    overlay.innerHTML = `
      <h2 style="color: #4fc3f7; margin: 0 0 12px; font-size: 16px;">SMS Verification Captured!</h2>
      <p style="font-size: 13px; color: #aaa; margin-bottom: 16px;">
        Send this SMS from your phone to complete verification:
      </p>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">SEND TO:</div>
        <div style="font-size: 18px; font-weight: bold; color: #fff; letter-spacing: 1px;" id="sms-to">${to || "See raw URL below"}</div>
      </div>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">MESSAGE:</div>
        <div style="font-size: 16px; font-weight: bold; color: #66bb6a;" id="sms-body">${body || "See raw URL below"}</div>
      </div>
      <div style="background: #0d1b2a; border-radius: 8px; padding: 8px; margin-bottom: 16px;">
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">RAW URL:</div>
        <div style="font-size: 10px; color: #78909c; word-break: break-all;">${smsUrl}</div>
      </div>
      <p style="font-size: 12px; color: #ffa726; margin-bottom: 12px;">
        Send this SMS from your rent phone number, then wait for this page to verify.
      </p>
      <button id="dismiss-sms-overlay" style="
        background: #333; color: #ccc; border: none; padding: 8px 20px;
        border-radius: 6px; cursor: pointer; font-size: 12px;
      ">Got it</button>
    `;

    document.body.appendChild(overlay);

    const backdrop = document.createElement("div");
    backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); z-index: 999998;
    `;
    document.body.appendChild(backdrop);

    document.getElementById("dismiss-sms-overlay").onclick = () => {
      overlay.remove();
      backdrop.remove();
    };

    // Also send to extension
    chrome.runtime.sendMessage({
      type: "SMS_CAPTURED",
      to,
      body,
      rawUrl: smsUrl,
    });
  }

  // Look for the page's verification data in the DOM
  function scanPageForVerificationData() {
    const bodyText = document.body ? document.body.innerText : "";

    // Look for phone numbers already on the page
    const phoneRegex = /[\+]?[\d\s\-\(\)]{10,}/g;
    const matches = bodyText.match(phoneRegex);
    if (matches) {
      log("Phone numbers found on page: " + JSON.stringify(matches));
    }

    // Look for data attributes with verification info
    document.querySelectorAll("[data-phone], [data-number], [data-sms], [data-verification]").forEach((el) => {
      log("Data attribute element: " + el.outerHTML.substring(0, 200));
    });

    // Look for the "Try Again" button and monitor what it does
    const buttons = document.querySelectorAll("button, [role='button'], a");
    buttons.forEach((btn) => {
      const text = (btn.innerText || btn.textContent || "").toLowerCase().trim();
      if (text.includes("try again") || text.includes("send sms") || text.includes("retry")) {
        log("Found action button: " + text);
      }
    });
  }

  // Run phone injection and scan
  setTimeout(() => {
    injectPhoneNumber();
    scanPageForVerificationData();
  }, 1000);

  // Monitor DOM changes
  const observer = new MutationObserver(() => {
    scanPageForVerificationData();
    injectPhoneNumber();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Show info banner
  const banner = document.createElement("div");
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    padding: 8px 16px; background: #1a73e8; color: white;
    font-family: Arial, sans-serif; font-size: 12px; text-align: center;
  `;
  banner.textContent = PHONE_NUMBER
    ? "Phone injector active - number: " + PHONE_NUMBER + " - monitoring for SMS intent..."
    : "Phone injector active (diagnostic mode) - monitoring network requests and SMS intents. Check console (F12) for details.";
  document.body.appendChild(banner);
})();
