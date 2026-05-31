(function () {
  if (window.__gmailQrVerifyLoaded) return;
  window.__gmailQrVerifyLoaded = true;

  let scanning = false;
  let lastDecodedUrl = "";
  let scanInterval = null;
  let triedAlternatives = false;

  function log(msg) {
    console.log("[Gmail QR Verify]", msg);
  }

  function isQrVerificationPage() {
    const url = window.location.href;
    const text = document.body ? document.body.innerText : "";
    return (
      url.includes("mophoneverification") ||
      url.includes("phoneverification") ||
      url.includes("deviceverification") ||
      text.includes("Scan the QR code") ||
      text.includes("Verify some info before creating")
    );
  }

  function tryAlternativeVerification() {
    if (triedAlternatives) return false;
    triedAlternatives = true;

    log("Looking for alternative verification methods...");

    const allLinks = document.querySelectorAll(
      'a, button, [role="link"], [role="button"], [jsname], [data-action]'
    );

    const altKeywords = [
      "try another way",
      "try a different way",
      "more options",
      "other options",
      "use phone",
      "phone number",
      "enter phone",
      "skip",
      "i don't have",
      "can't scan",
      "another method",
      "different method",
      "verify another way",
      "use another method",
    ];

    for (const el of allLinks) {
      const text = (el.innerText || el.textContent || "").toLowerCase().trim();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const combined = text + " " + ariaLabel;

      for (const kw of altKeywords) {
        if (combined.includes(kw)) {
          log(`Found alternative: "${text}" - clicking it`);
          showBanner(`Found "${text}" option - clicking...`, "working");
          el.click();
          return true;
        }
      }
    }

    const smallLinks = document.querySelectorAll(
      'a[href], span[tabindex], div[tabindex], [class*="link"], [class*="secondary"]'
    );
    for (const el of smallLinks) {
      const text = (el.innerText || el.textContent || "").toLowerCase().trim();
      if (text.length > 3 && text.length < 50) {
        const style = window.getComputedStyle(el);
        if (style.color.includes("66") || style.color.includes("138") ||
            style.textDecoration.includes("underline") ||
            el.tagName === "A") {
          log(`Potential link found: "${text}"`);
        }
      }
    }

    log("No alternative verification methods found on page");
    return false;
  }

  function findQrCodeElements() {
    const candidates = [];

    document.querySelectorAll("img").forEach((img) => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w >= 100 && h >= 100 && Math.abs(w - h) < 50) {
        candidates.push({ type: "img", el: img });
      }
    });

    document.querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.width >= 100 && canvas.height >= 100) {
        candidates.push({ type: "canvas", el: canvas });
      }
    });

    document.querySelectorAll("svg").forEach((svg) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width >= 100 && rect.height >= 100 && Math.abs(rect.width - rect.height) < 50) {
        candidates.push({ type: "svg", el: svg });
      }
    });

    document.querySelectorAll('div[role="img"], div[data-qr], [class*="qr"], [id*="qr"]').forEach((div) => {
      const rect = div.getBoundingClientRect();
      if (rect.width >= 100 && rect.height >= 100) {
        candidates.push({ type: "div", el: div });
      }
    });

    return candidates;
  }

  function elementToImageData(element) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (element.type === "canvas") {
        const src = element.el;
        canvas.width = src.width;
        canvas.height = src.height;
        ctx.drawImage(src, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        return;
      }

      if (element.type === "img") {
        const img = element.el;
        if (!img.complete) {
          img.onload = () => {
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
          };
          return;
        }
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        return;
      }

      if (element.type === "svg" || element.type === "div") {
        const el = element.el;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        canvas.width = size * 2;
        canvas.height = size * 2;

        const svgEl = element.type === "svg" ? el : el.querySelector("svg");
        if (!svgEl) { resolve(null); return; }

        const svgData = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
        return;
      }

      resolve(null);
    });
  }

  async function scanForQrCode() {
    if (scanning) return;
    scanning = true;

    try {
      const elements = findQrCodeElements();
      log(`Found ${elements.length} potential QR elements`);

      for (const element of elements) {
        try {
          const imageData = await elementToImageData(element);
          if (!imageData) continue;

          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });

          if (code && code.data) {
            log(`Decoded QR: ${code.data}`);

            if (code.data !== lastDecodedUrl) {
              lastDecodedUrl = code.data;
              handleDecodedUrl(code.data);
            }
            break;
          }
        } catch (e) {
          log(`Error decoding element: ${e.message}`);
        }
      }
    } finally {
      scanning = false;
    }
  }

  function handleDecodedUrl(url) {
    log(`QR URL decoded: ${url}`);
    showBanner(`QR Code detected! Opening verification page...`, "working");

    chrome.runtime.sendMessage(
      {
        type: "QR_DECODED",
        url: url,
        pageUrl: window.location.href,
      },
      (response) => {
        if (response && response.success) {
          log("Background opened verification tab");
          showBanner(
            "Verification tab opened! Check the new tab - enter your phone number there if asked.",
            "working"
          );
          pollForCompletion();
        } else {
          log("Failed to open verification tab");
          showBanner("Could not open verification tab. URL: " + url, "error");
        }
      }
    );
  }

  function pollForCompletion() {
    let checks = 0;
    const maxChecks = 120;

    const poll = setInterval(() => {
      checks++;

      const isStillOnQr = isQrVerificationPage();
      if (!isStillOnQr) {
        clearInterval(poll);
        showBanner("Verification complete! Continuing signup...", "success");
        log("QR verification page is gone - verification succeeded!");
        return;
      }

      const continueBtn = findContinueButton();
      if (continueBtn) {
        clearInterval(poll);
        showBanner("Verification complete! Clicking continue...", "success");
        continueBtn.click();
        return;
      }

      if (checks >= maxChecks) {
        clearInterval(poll);
        showBanner("Still waiting for verification. Complete it in the other tab.", "working");
      }
    }, 2000);
  }

  function findContinueButton() {
    const buttons = document.querySelectorAll("button, [role='button']");
    for (const btn of buttons) {
      const text = (btn.innerText || btn.textContent || "").toLowerCase();
      if (text.includes("continue") || text.includes("next") || text.includes("proceed")) {
        return btn;
      }
    }
    return null;
  }

  function showBanner(message, status) {
    let banner = document.getElementById("gmail-qr-verify-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "gmail-qr-verify-banner";
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        padding: 12px 20px; font-family: Arial, sans-serif; font-size: 14px;
        text-align: center; transition: all 0.3s;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(banner);
    }

    const colors = {
      working: { bg: "#1a73e8", color: "#fff" },
      success: { bg: "#0d9f0d", color: "#fff" },
      error: { bg: "#d93025", color: "#fff" },
    };

    const c = colors[status] || colors.working;
    banner.style.backgroundColor = c.bg;
    banner.style.color = c.color;
    banner.textContent = message;

    if (status === "success") {
      setTimeout(() => banner.remove(), 8000);
    }
  }

  function startScanning() {
    if (!isQrVerificationPage()) {
      log("Not a QR verification page, skipping");
      return;
    }

    log("QR verification page detected!");
    showBanner("QR verification detected - looking for alternatives...", "working");

    if (tryAlternativeVerification()) {
      log("Clicked alternative verification option, waiting for page change...");
      return;
    }

    showBanner("No alternative found - scanning QR code...", "working");
    scanForQrCode();

    scanInterval = setInterval(() => {
      if (!isQrVerificationPage()) {
        clearInterval(scanInterval);
        return;
      }
      if (lastDecodedUrl) return;
      scanForQrCode();
    }, 2000);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(startScanning, 1000);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(startScanning, 1000));
  }

  const observer = new MutationObserver(() => {
    if (isQrVerificationPage() && !lastDecodedUrl && !scanInterval) {
      startScanning();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "VERIFICATION_COMPLETE") {
      showBanner("Verification complete!", "success");
    } else if (msg.type === "VERIFICATION_FAILED") {
      showBanner("Auto-verify had issues. Check the verification tab.", "error");
    } else if (msg.type === "MANUAL_SCAN") {
      lastDecodedUrl = "";
      triedAlternatives = false;
      scanForQrCode();
    }
  });
})();
