(function () {
  if (window.__phoneInjectorLoaded) return;
  window.__phoneInjectorLoaded = true;

  const PHONE_NUMBER = window.__injectedPhoneNumber || "";

  function log(msg) {
    console.log("[Phone Injector]", msg);
  }

  log("SMS interceptor loaded");
  log("Page URL: " + window.location.href);

  function parseSmsUrl(url) {
    let to = "";
    let body = "";

    // Handle sms://NUMBER?body=... and sms:NUMBER?body=...
    const match = url.match(/sms:\/?\/?([^?]+)/);
    if (match) to = match[1].trim();

    const bodyMatch = url.match(/[?&]body=([^&]*)/);
    if (bodyMatch) body = decodeURIComponent(bodyMatch[1]);

    return { to, body };
  }

  function showSmsOverlay(smsUrl) {
    const { to, body } = parseSmsUrl(smsUrl);

    log("SMS CAPTURED!");
    log("TO: " + to);
    log("BODY: " + body);
    log("RAW: " + smsUrl);

    // Remove any existing overlay
    document.getElementById("sms-overlay")?.remove();
    document.getElementById("sms-backdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "sms-backdrop";
    backdrop.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999998;";

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
      setTimeout(() => document.getElementById("copy-number-btn").textContent = "Copy Number", 2000);
    };
    document.getElementById("copy-msg-btn").onclick = () => {
      navigator.clipboard.writeText(body);
      document.getElementById("copy-msg-btn").textContent = "Copied!";
      setTimeout(() => document.getElementById("copy-msg-btn").textContent = "Copy Message", 2000);
    };
    document.getElementById("close-sms-overlay").onclick = () => {
      overlay.remove();
      backdrop.remove();
    };

    // Send to extension background
    try {
      chrome.runtime.sendMessage({ type: "SMS_CAPTURED", to, body, rawUrl: smsUrl });
    } catch (e) {}
  }

  // ============================================
  // METHOD 1: Override window.open
  // ============================================
  const origOpen = window.open;
  window.open = function (url, ...args) {
    if (url && typeof url === "string" && url.match(/^sms:/i)) {
      log("window.open intercepted: " + url);
      showSmsOverlay(url);
      return null;
    }
    return origOpen.call(this, url, ...args);
  };

  // ============================================
  // METHOD 2: Override location changes
  // ============================================
  try {
    const locationDesc = Object.getOwnPropertyDescriptor(window, "location");
    const origLocation = window.location;

    // Proxy approach - intercept property access on location
    const locationProxy = new Proxy(origLocation, {
      set: function (target, prop, value) {
        if (prop === "href" && typeof value === "string" && value.match(/^sms:/i)) {
          log("location.href intercepted: " + value);
          showSmsOverlay(value);
          return true;
        }
        target[prop] = value;
        return true;
      },
    });
  } catch (e) {
    log("Proxy approach failed: " + e.message);
  }

  // Override Location.prototype.assign and replace
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

  // ============================================
  // METHOD 3: Intercept anchor clicks
  // ============================================
  document.addEventListener("click", function (e) {
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
  }, true);

  // Override HTMLAnchorElement click
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

  // ============================================
  // METHOD 4: Scan DOM for sms: links
  // ============================================
  function scanForSmsLinks() {
    const allElements = document.querySelectorAll("a[href], [data-url], [data-href]");
    allElements.forEach((el) => {
      const href = el.getAttribute("href") || el.getAttribute("data-url") || el.getAttribute("data-href") || "";
      if (href.match(/^sms:/i)) {
        log("Found SMS link in DOM: " + href);
        showSmsOverlay(href);
      }
    });

    // Also check onclick attributes
    document.querySelectorAll("[onclick]").forEach((el) => {
      const onclick = el.getAttribute("onclick") || "";
      const smsMatch = onclick.match(/sms:\/?\/?[^'")\s]+/i);
      if (smsMatch) {
        log("Found SMS in onclick: " + smsMatch[0]);
        showSmsOverlay(smsMatch[0]);
      }
    });
  }

  // ============================================
  // METHOD 5: Monitor for dynamic anchor creation
  // ============================================
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

      // Also watch the href property
      let _href = "";
      try {
        Object.defineProperty(el, "href", {
          set: function (val) {
            if (typeof val === "string" && val.match(/^sms:/i)) {
              log("Dynamic anchor .href set: " + val);
              showSmsOverlay(val);
            }
            _href = val;
            origSetAttr("href", val);
          },
          get: function () {
            return _href || this.getAttribute("href") || "";
          },
        });
      } catch (e) {}
    }
    return el;
  };

  // ============================================
  // METHOD 6: MutationObserver for new SMS links
  // ============================================
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // Check the node itself
          if (node.tagName === "A") {
            const href = node.getAttribute("href") || "";
            if (href.match(/^sms:/i)) {
              log("MutationObserver caught SMS link: " + href);
              showSmsOverlay(href);
            }
          }
          // Check children
          if (node.querySelectorAll) {
            node.querySelectorAll("a[href]").forEach((a) => {
              const href = a.getAttribute("href") || "";
              if (href.match(/^sms:/i)) {
                log("MutationObserver caught child SMS link: " + href);
                showSmsOverlay(href);
              }
            });
          }
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initial scan
  setTimeout(scanForSmsLinks, 500);
  setTimeout(scanForSmsLinks, 2000);
  setTimeout(scanForSmsLinks, 5000);

  // Banner
  const banner = document.createElement("div");
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:999999;
    padding:8px 16px;background:#1a73e8;color:white;
    font-family:Arial,sans-serif;font-size:12px;text-align:center;
  `;
  banner.textContent = "SMS Interceptor active - click 'Send SMS' and the extension will capture the verification details.";
  document.body.appendChild(banner);

  log("All SMS interception methods active. Click 'Send SMS' now.");
})();
