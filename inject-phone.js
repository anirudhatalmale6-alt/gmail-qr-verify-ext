(function () {
  if (window.__phoneInjectorLoaded) return;
  window.__phoneInjectorLoaded = true;

  let pendingSmsUrl = null;
  let overlayShown = false;

  function log(msg) {
    console.log("[SMS Interceptor]", msg);
  }

  function parseSmsUrl(url) {
    let to = "";
    let body = "";
    try { url = decodeURIComponent(url); } catch (e) {}
    const match = url.match(/sms:\/?\/?([^?]+)/);
    if (match) to = match[1].trim();
    const bodyMatch = url.match(/[?&]body=([^&]*)/i);
    if (bodyMatch) {
      try { body = decodeURIComponent(bodyMatch[1]); } catch (e) { body = bodyMatch[1]; }
    }
    return { to, body };
  }

  function showSmsOverlay(smsUrl) {
    if (overlayShown) return;
    if (!document.body) {
      pendingSmsUrl = smsUrl;
      return;
    }
    overlayShown = true;

    const { to, body } = parseSmsUrl(smsUrl);
    log("SMS CAPTURED! TO: " + to + " BODY: " + body);

    document.getElementById("sms-overlay")?.remove();
    document.getElementById("sms-backdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "sms-backdrop";
    backdrop.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999998;";

    const overlay = document.createElement("div");
    overlay.id = "sms-overlay";
    overlay.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:999999;background:#1a1a2e;color:#e0e0e0;
      border-radius:12px;padding:24px;max-width:500px;width:90%;
      box-shadow:0 10px 40px rgba(0,0,0,0.5);font-family:Arial,sans-serif;
      border:2px solid #66bb6a;
    `;

    overlay.innerHTML = `
      <h2 style="color:#66bb6a;margin:0 0 16px;font-size:18px;">SMS Verification Captured!</h2>
      <p style="font-size:13px;color:#aaa;margin-bottom:16px;">
        Open your rent phone and send this EXACT SMS:
      </p>
      <div style="background:#0d1b2a;border-radius:8px;padding:14px;margin-bottom:12px;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">SEND TO THIS NUMBER:</div>
        <div style="font-size:28px;font-weight:bold;color:#fff;letter-spacing:2px;user-select:all;" id="sms-to-display">${to}</div>
      </div>
      <div style="background:#0d1b2a;border-radius:8px;padding:14px;margin-bottom:12px;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">MESSAGE (copy exactly):</div>
        <div style="font-size:14px;font-weight:bold;color:#66bb6a;word-break:break-all;user-select:all;" id="sms-body-display">${body}</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button id="copy-number-btn" style="flex:1;background:#1a73e8;color:#fff;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Copy Number</button>
        <button id="copy-msg-btn" style="flex:1;background:#2e7d32;color:#fff;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Copy Message</button>
      </div>
      <p style="font-size:12px;color:#ffa726;margin-bottom:12px;">
        After sending the SMS, wait here. This page will auto-detect when verification is complete.
      </p>
      <button id="close-sms-overlay" style="background:#333;color:#ccc;border:none;padding:8px 24px;border-radius:6px;cursor:pointer;font-size:12px;">Close</button>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(overlay);

    document.getElementById("copy-number-btn").onclick = () => {
      navigator.clipboard.writeText(to);
      document.getElementById("copy-number-btn").textContent = "Copied!";
      setTimeout(() => (document.getElementById("copy-number-btn").textContent = "Copy Number"), 2000);
    };
    document.getElementById("copy-msg-btn").onclick = () => {
      navigator.clipboard.writeText(body);
      document.getElementById("copy-msg-btn").textContent = "Copied!";
      setTimeout(() => (document.getElementById("copy-msg-btn").textContent = "Copy Message"), 2000);
    };
    document.getElementById("close-sms-overlay").onclick = () => {
      overlay.remove();
      backdrop.remove();
      overlayShown = false;
    };

    try {
      chrome.runtime.sendMessage({ type: "SMS_CAPTURED", to, body, rawUrl: smsUrl });
    } catch (e) {}
  }

  // ============================================================
  // PHASE 1: EARLY INTERCEPTION (runs at document_start)
  // Override JS APIs before Google's scripts even load
  // ============================================================

  log("Phase 1: Setting up early interception hooks");

  // METHOD 1: Override window.open
  const origOpen = window.open;
  window.open = function (url, ...args) {
    if (url && typeof url === "string" && url.match(/^sms:/i)) {
      log("window.open intercepted: " + url);
      showSmsOverlay(url);
      return null;
    }
    return origOpen.call(this, url, ...args);
  };

  // METHOD 2: Override Location.prototype.assign and replace
  try {
    const origAssign = Location.prototype.assign;
    Location.prototype.assign = function (url) {
      if (typeof url === "string" && url.match(/^sms:/i)) {
        log("location.assign intercepted: " + url);
        showSmsOverlay(url);
        return;
      }
      return origAssign.call(this, url);
    };
    const origReplace = Location.prototype.replace;
    Location.prototype.replace = function (url) {
      if (typeof url === "string" && url.match(/^sms:/i)) {
        log("location.replace intercepted: " + url);
        showSmsOverlay(url);
        return;
      }
      return origReplace.call(this, url);
    };
  } catch (e) {
    log("Location override failed: " + e.message);
  }

  // METHOD 3: Try to shadow window.location setter
  try {
    const origLocDesc = Object.getOwnPropertyDescriptor(Window.prototype, "location");
    if (origLocDesc) {
      Object.defineProperty(window, "location", {
        get: function () { return origLocDesc.get.call(this); },
        set: function (url) {
          if (typeof url === "string" && url.match(/^sms:/i)) {
            log("window.location= intercepted: " + url);
            showSmsOverlay(url);
            return;
          }
          if (origLocDesc.set) origLocDesc.set.call(this, url);
        },
        configurable: true,
        enumerable: true,
      });
      log("window.location shadow installed");
    }
  } catch (e) {
    log("window.location shadow failed (expected): " + e.message);
  }

  // METHOD 4: Try to shadow document.location setter
  try {
    const origDocLocDesc = Object.getOwnPropertyDescriptor(Document.prototype, "location");
    if (origDocLocDesc) {
      Object.defineProperty(document, "location", {
        get: function () { return origDocLocDesc.get.call(this); },
        set: function (url) {
          if (typeof url === "string" && url.match(/^sms:/i)) {
            log("document.location= intercepted: " + url);
            showSmsOverlay(url);
            return;
          }
          if (origDocLocDesc.set) origDocLocDesc.set.call(this, url);
        },
        configurable: true,
        enumerable: true,
      });
      log("document.location shadow installed");
    }
  } catch (e) {
    log("document.location shadow failed (expected): " + e.message);
  }

  // METHOD 5: Override Location.prototype.href setter
  try {
    const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, "href");
    if (hrefDesc && hrefDesc.set) {
      const origHrefSet = hrefDesc.set;
      Object.defineProperty(Location.prototype, "href", {
        get: hrefDesc.get,
        set: function (url) {
          if (typeof url === "string" && url.match(/^sms:/i)) {
            log("location.href= intercepted: " + url);
            showSmsOverlay(url);
            return;
          }
          origHrefSet.call(this, url);
        },
        configurable: hrefDesc.configurable,
        enumerable: hrefDesc.enumerable,
      });
      log("Location.prototype.href setter overridden!");
    }
  } catch (e) {
    log("Location.href override failed: " + e.message);
  }

  // METHOD 6: Override fetch to catch SMS data in API responses
  try {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const clone = response.clone();
        const text = await clone.text();
        if (text.includes("sms:") || text.includes("sms%3A")) {
          log("Fetch response contains SMS data!");
          const match = text.match(/sms(?:%3A|:)\/?\/?([^"'\s;,)<>]+)/i);
          if (match) {
            showSmsOverlay(decodeURIComponent(match[0]));
          }
        }
      } catch (e) {}
      return response;
    };
  } catch (e) {
    log("Fetch override failed: " + e.message);
  }

  // METHOD 7: Override XMLHttpRequest to catch SMS data
  try {
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (...args) {
      this._xhrUrl = args[1];
      return origXhrOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          const text = this.responseText;
          if (text && (text.includes("sms:") || text.includes("sms%3A"))) {
            log("XHR response contains SMS data!");
            const match = text.match(/sms(?:%3A|:)\/?\/?([^"'\s;,)<>]+)/i);
            if (match) {
              showSmsOverlay(decodeURIComponent(match[0]));
            }
          }
        } catch (e) {}
      });
      return origXhrSend.apply(this, args);
    };
  } catch (e) {
    log("XHR override failed: " + e.message);
  }

  // METHOD 8: Navigation API (Chrome 102+)
  try {
    if (window.navigation) {
      window.navigation.addEventListener("navigate", (e) => {
        if (e.destination && e.destination.url && e.destination.url.match(/^sms:/i)) {
          e.preventDefault();
          log("Navigation API intercepted: " + e.destination.url);
          showSmsOverlay(e.destination.url);
        }
      });
      log("Navigation API listener installed");
    }
  } catch (e) {
    log("Navigation API failed: " + e.message);
  }

  // METHOD 9: Override HTMLAnchorElement click
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.getAttribute("href") || this.href || "";
    if (href.match(/^sms:/i)) {
      log("Anchor.click() intercepted: " + href);
      showSmsOverlay(href);
      return;
    }
    return origAnchorClick.call(this);
  };

  // METHOD 10: Override document.createElement for anchors
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag, ...args) {
    const el = origCreateElement(tag, ...args);
    if (tag.toLowerCase() === "a") {
      const origSetAttr = el.setAttribute.bind(el);
      el.setAttribute = function (name, value) {
        if (name === "href" && typeof value === "string" && value.match(/^sms:/i)) {
          log("Dynamic anchor href set: " + value);
          showSmsOverlay(value);
        }
        return origSetAttr(name, value);
      };
    }
    return el;
  };

  log("Phase 1 complete - all early hooks installed");

  // ============================================================
  // PHASE 2: DOM-READY ACTIONS
  // Scan page, hijack buttons, set up observers
  // ============================================================

  function scanPageForSmsData() {
    log("Scanning page source for embedded SMS data...");

    // Scan raw HTML for sms: URLs with phone number and body
    const html = document.documentElement.innerHTML;

    // Pattern 1: sms://NUMBER?body=... or sms:NUMBER?body=...
    const patterns = [
      /sms:\/?\/?(\+?\d{3,})\?body=[^"'<\s\]},)]+/gi,
      /sms:\/?\/?(\+?\d{3,})[^"'<\s\]},)]+/gi,
      /sms%3A\/?\/?(\+?\d{3,})%3Fbody%3D[^"'<\s\]},)]+/gi,
    ];

    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        const decoded = decodeURIComponent(matches[0]);
        log("Found SMS URL in page source: " + decoded);
        showSmsOverlay(decoded);
        return true;
      }
    }

    // Scan all script tag contents
    const scripts = document.querySelectorAll("script");
    for (const s of scripts) {
      const text = s.textContent || "";
      if (text.length < 10) continue;
      const scriptMatch = text.match(/sms(?:%3A|:)\/?\/?(\+?\d{3,})[^"'\s;,)<>]*/i);
      if (scriptMatch) {
        const decoded = decodeURIComponent(scriptMatch[0]);
        log("Found SMS URL in script: " + decoded);
        showSmsOverlay(decoded);
        return true;
      }
    }

    // Check all element attributes for sms: URLs
    const allEls = document.querySelectorAll("a[href], [data-url], [data-href], [data-action-url]");
    for (const el of allEls) {
      for (const attr of el.attributes) {
        if (attr.value && attr.value.match(/sms(?:%3A|:)/i)) {
          const decoded = decodeURIComponent(attr.value);
          log("Found SMS in attribute " + attr.name + ": " + decoded);
          showSmsOverlay(decoded);
          return true;
        }
      }
    }

    // Check Google's known data structures
    try {
      const globalKeys = ["AF_dataServiceRequests", "AF_initDataChunkQueue", "WIZ_global_data"];
      for (const key of globalKeys) {
        if (window[key]) {
          const json = JSON.stringify(window[key]);
          const match = json.match(/sms(?:%3A|:)\/?\/?([^"'\s;,)<>]+)/i);
          if (match) {
            log("Found SMS in window." + key);
            showSmsOverlay(decodeURIComponent(match[0]));
            return true;
          }
        }
      }
    } catch (e) {}

    log("No SMS data found in page source yet");
    return false;
  }

  function hijackSendSmsButton() {
    const allClickables = document.querySelectorAll('button, [role="button"], [jsaction], [data-action]');
    let foundButton = null;

    for (const el of allClickables) {
      const text = (el.textContent || "").trim().toLowerCase();
      if (text === "send sms" || text === "send" || text.includes("send sms")) {
        foundButton = el;
        break;
      }
    }

    if (!foundButton) {
      for (const el of allClickables) {
        const label = (el.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("send") || label.includes("sms")) {
          foundButton = el;
          break;
        }
      }
    }

    if (!foundButton) return;

    if (foundButton._hijacked) return;
    foundButton._hijacked = true;

    log('Found "Send SMS" button: ' + foundButton.tagName + " / " + foundButton.textContent.trim());

    foundButton.addEventListener(
      "click",
      function (e) {
        log("Send SMS button clicked - intercepting!");

        // Try scanning page NOW
        if (scanPageForSmsData()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }

        // Let Google's handler run, but check afterward
        log("SMS data not in page source yet - letting Google handler run, checking after...");

        setTimeout(() => scanPageForSmsData(), 100);
        setTimeout(() => scanPageForSmsData(), 500);
        setTimeout(() => scanPageForSmsData(), 1500);
        setTimeout(() => scanPageForSmsData(), 3000);
      },
      true
    );
  }

  function onDomReady() {
    log("Phase 2: DOM ready, starting page scan and button hijack");

    if (pendingSmsUrl) {
      showSmsOverlay(pendingSmsUrl);
    }

    // Capture-phase click listener for anchor tags
    document.addEventListener(
      "click",
      function (e) {
        const link = e.target.closest("a");
        if (link) {
          const href = link.getAttribute("href") || link.href || "";
          if (href.match(/^sms:/i)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            log("Link click intercepted: " + href);
            showSmsOverlay(href);
            return false;
          }
        }
      },
      true
    );

    // MutationObserver for new elements
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.tagName === "A") {
              const href = node.getAttribute("href") || "";
              if (href.match(/^sms:/i)) {
                log("MutationObserver: SMS link added: " + href);
                showSmsOverlay(href);
              }
            }
            if (node.querySelectorAll) {
              node.querySelectorAll("a[href]").forEach((a) => {
                const href = a.getAttribute("href") || "";
                if (href.match(/^sms:/i)) {
                  log("MutationObserver: child SMS link: " + href);
                  showSmsOverlay(href);
                }
              });
            }
          }
        }
      }
      if (!overlayShown) hijackSendSmsButton();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Initial scans
    scanPageForSmsData();
    hijackSendSmsButton();

    // Periodic rescans
    setTimeout(() => { if (!overlayShown) { scanPageForSmsData(); hijackSendSmsButton(); } }, 2000);
    setTimeout(() => { if (!overlayShown) { scanPageForSmsData(); hijackSendSmsButton(); } }, 5000);
    setTimeout(() => { if (!overlayShown) scanPageForSmsData(); }, 10000);

    // Banner
    const banner = document.createElement("div");
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:999999;
      padding:8px 16px;background:#1a73e8;color:white;
      font-family:Arial,sans-serif;font-size:12px;text-align:center;
    `;
    banner.textContent = "SMS Interceptor v2.4 active - click 'Send SMS' and the extension will capture the verification details.";
    document.body.appendChild(banner);

    log("Phase 2 complete - all DOM hooks active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }
})();
