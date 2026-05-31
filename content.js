(function () {
  if (window.__gmailQrVerifyLoaded) return;
  window.__gmailQrVerifyLoaded = true;

  let scanning = false;
  let lastDecodedUrl = "";
  let triedAlternatives = false;

  function log(msg) {
    console.log("[Gmail QR Verify]", msg);
  }

  function hasQrCodeOnPage() {
    const text = document.body ? document.body.innerText : "";
    return (
      text.includes("Scan the QR code") ||
      text.includes("Verify some info before creating")
    );
  }

  function tryAlternativeVerification() {
    if (triedAlternatives) return false;
    triedAlternatives = true;

    log("Looking for alternative verification methods...");

    const clickables = document.querySelectorAll(
      'a, button, [role="link"], [role="button"], [jsname], span[tabindex], div[tabindex]'
    );

    const altKeywords = [
      "try another way",
      "try a different way",
      "more options",
      "other options",
      "use phone number",
      "enter phone",
      "can't scan",
      "another method",
      "different method",
      "i don't have",
      "having trouble",
    ];

    for (const el of clickables) {
      const text = (el.innerText || el.textContent || "").toLowerCase().trim();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const combined = text + " " + ariaLabel;

      if (text.length > 100) continue;

      for (const kw of altKeywords) {
        if (combined.includes(kw)) {
          log(`Found alternative: "${text}" - clicking it`);
          showBanner(`Found "${text}" - clicking...`, "working");
          el.click();
          return true;
        }
      }
    }

    log("No alternative verification links found");
    return false;
  }

  function tryAlternativeUrls() {
    const currentUrl = window.location.href;

    const altPaths = [
      currentUrl.replace("mophoneverification", "phoneverification"),
      currentUrl.replace("mophoneverification", "smsverification"),
      currentUrl.replace("/mophoneverification/initial", "/phonenumber/initial"),
    ];

    log("Will try alternative verification URLs...");
    chrome.runtime.sendMessage({
      type: "TRY_ALT_URLS",
      urls: altPaths,
      currentUrl: currentUrl,
    });
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

      if (element.type === "svg") {
        const el = element.el;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        canvas.width = size * 2;
        canvas.height = size * 2;

        const svgData = new XMLSerializer().serializeToString(el);
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

    showBanner(`QR decoded! URL: ${url.substring(0, 80)}...`, "working");

    chrome.runtime.sendMessage({
      type: "QR_DECODED",
      url: url,
      pageUrl: window.location.href,
    });
  }

  function showBanner(message, status) {
    let banner = document.getElementById("gmail-qr-verify-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "gmail-qr-verify-banner";
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        padding: 10px 16px; font-family: Arial, sans-serif; font-size: 13px;
        text-align: center; transition: all 0.3s;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(banner);
    }

    const colors = {
      working: { bg: "#1a73e8", color: "#fff" },
      success: { bg: "#0d9f0d", color: "#fff" },
      error: { bg: "#d93025", color: "#fff" },
      info: { bg: "#333", color: "#fff" },
    };

    const c = colors[status] || colors.info;
    banner.style.backgroundColor = c.bg;
    banner.style.color = c.color;
    banner.textContent = message;
  }

  function startScanning() {
    if (!hasQrCodeOnPage()) {
      log("No QR code text found on page, skipping");
      return;
    }

    log("QR verification page detected!");
    showBanner("QR verification page detected - scanning...", "working");

    if (tryAlternativeVerification()) {
      log("Clicked alternative verification option");
      return;
    }

    scanForQrCode();

    const scanInterval = setInterval(() => {
      if (!hasQrCodeOnPage()) {
        clearInterval(scanInterval);
        showBanner("Page changed - verification may be complete!", "success");
        return;
      }
      if (lastDecodedUrl) {
        clearInterval(scanInterval);
        return;
      }
      scanForQrCode();
    }, 3000);

    setTimeout(() => {
      if (lastDecodedUrl) {
        tryAlternativeUrls();
      }
    }, 5000);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(startScanning, 1500);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(startScanning, 1500));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MANUAL_SCAN") {
      lastDecodedUrl = "";
      triedAlternatives = false;
      scanForQrCode();
    }
  });
})();
