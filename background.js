let qrUrl = "";
let scanStatus = "idle";
let scanError = "";
let smsData = null;

function log(msg) {
  console.log("[Gmail QR Verify BG]", msg);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_QR") {
    log("Manual scan requested");
    scanStatus = "scanning";
    qrUrl = "";
    scanError = "";
    injectScanner(message.tabId);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "SCAN_RESULT") {
    if (message.success) {
      log(`QR decoded: ${message.url}`);
      qrUrl = message.url;
      scanStatus = "decoded";
      scanError = "";
    } else {
      log(`Scan failed: ${message.error}`);
      scanStatus = "error";
      scanError = message.error;
    }
    return;
  }

  if (message.type === "SMS_CAPTURED") {
    log(`SMS captured! To: ${message.to}, Body: ${message.body}`);
    smsData = {
      to: message.to,
      body: message.body,
      rawUrl: message.rawUrl,
    };
    return;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      qrUrl,
      scanStatus,
      scanError,
      smsData,
    });
    return true;
  }

  if (message.type === "OPEN_URL") {
    chrome.tabs.create({ url: message.url, active: true });
    sendResponse({ ok: true });
    return;
  }
});

async function injectScanner(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["jsqr.js"],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["scanner.js"],
    });

    log(`Scanner injected into tab ${tabId}`);
  } catch (e) {
    log(`Injection error: ${e.message}`);
    scanStatus = "error";
    scanError = `Could not inject scanner: ${e.message}`;
  }
}
