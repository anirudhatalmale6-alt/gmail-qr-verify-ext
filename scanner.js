(async function () {
  function log(msg) {
    console.log("[Gmail QR Scanner]", msg);
  }

  log("Scanner injected, looking for QR code...");

  function findQrElements() {
    const candidates = [];

    document.querySelectorAll("img").forEach((img) => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w >= 80 && h >= 80 && Math.abs(w - h) < 60) {
        candidates.push({ type: "img", el: img, size: w });
      }
    });

    document.querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.width >= 80 && canvas.height >= 80) {
        candidates.push({ type: "canvas", el: canvas, size: canvas.width });
      }
    });

    document.querySelectorAll("svg").forEach((svg) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width >= 80 && rect.height >= 80 && Math.abs(rect.width - rect.height) < 60) {
        candidates.push({ type: "svg", el: svg, size: rect.width });
      }
    });

    candidates.sort((a, b) => b.size - a.size);
    return candidates;
  }

  function getImageData(element) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (element.type === "canvas") {
        canvas.width = element.el.width;
        canvas.height = element.el.height;
        ctx.drawImage(element.el, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        return;
      }

      if (element.type === "img") {
        const img = element.el;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h));
        return;
      }

      if (element.type === "svg") {
        const svgData = new XMLSerializer().serializeToString(element.el);
        const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width * 2;
          canvas.height = img.height * 2;
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

  const elements = findQrElements();
  log(`Found ${elements.length} potential QR elements`);

  if (elements.length === 0) {
    chrome.runtime.sendMessage({
      type: "SCAN_RESULT",
      success: false,
      error: "No QR code images found on the page. Make sure the QR code is visible.",
    });
    return;
  }

  for (const element of elements) {
    try {
      const imageData = await getImageData(element);
      if (!imageData) continue;

      log(`Trying ${element.type} element (${imageData.width}x${imageData.height})...`);

      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code && code.data) {
        log(`QR decoded: ${code.data}`);
        chrome.runtime.sendMessage({
          type: "SCAN_RESULT",
          success: true,
          url: code.data,
          pageUrl: window.location.href,
        });
        return;
      }
    } catch (e) {
      log(`Error with ${element.type}: ${e.message}`);
    }
  }

  log("Could not decode any QR code");

  log("Trying higher resolution capture...");
  for (const element of elements) {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const el = element.el;

      if (element.type === "img") {
        const scale = 3;
        const w = (el.naturalWidth || el.width) * scale;
        const h = (el.naturalHeight || el.height) * scale;
        canvas.width = w;
        canvas.height = h;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(el, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });

        if (code && code.data) {
          log(`QR decoded (hi-res): ${code.data}`);
          chrome.runtime.sendMessage({
            type: "SCAN_RESULT",
            success: true,
            url: code.data,
            pageUrl: window.location.href,
          });
          return;
        }
      }
    } catch (e) {}
  }

  chrome.runtime.sendMessage({
    type: "SCAN_RESULT",
    success: false,
    error: `Found ${elements.length} image(s) but could not decode QR. The QR code might be rendered in a way that prevents reading. Try right-clicking the QR image and check if it's a regular image.`,
  });
})();
