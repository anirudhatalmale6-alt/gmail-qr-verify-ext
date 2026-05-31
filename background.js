let qrUrl = "";
let scanStatus = "idle";
let scanError = "";
let smsData = null;

function log(msg) {
  console.log("[Gmail QR Verify BG]", msg);
}

function parseSmsUrl(url) {
  let to = "", body = "";
  try { url = decodeURIComponent(url); } catch (e) {}
  const match = url.match(/sms:\/?\/?([^?]+)/);
  if (match) to = match[1].trim();
  const bodyMatch = url.match(/[?&]body=([^&]*)/i);
  if (bodyMatch) {
    try { body = decodeURIComponent(bodyMatch[1]); } catch (e) { body = bodyMatch[1]; }
  }
  return { to, body };
}

// =============================================
// WebNavigation: catch sms: URLs at browser level
// =============================================
try {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.url && details.url.match(/^sms:/i)) {
      log("webNavigation.onBeforeNavigate caught sms: URL: " + details.url);
      const parsed = parseSmsUrl(details.url);
      smsData = { to: parsed.to, body: parsed.body, rawUrl: details.url };
      chrome.action.setBadgeText({ text: "SMS!" });
      chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
      // Inject overlay on the tab that triggered this
      injectSmsOverlay(details.tabId, details.url);
    }
  });

  chrome.webNavigation.onErrorOccurred.addListener((details) => {
    if (details.url && details.url.match(/^sms:/i)) {
      log("webNavigation.onErrorOccurred caught sms: URL: " + details.url);
      const parsed = parseSmsUrl(details.url);
      smsData = { to: parsed.to, body: parsed.body, rawUrl: details.url };
      chrome.action.setBadgeText({ text: "SMS!" });
      chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
      injectSmsOverlay(details.tabId, details.url);
    }
  });

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.url && details.url.match(/^sms:/i)) {
      log("webNavigation.onCommitted caught sms: URL: " + details.url);
      const parsed = parseSmsUrl(details.url);
      smsData = { to: parsed.to, body: parsed.body, rawUrl: details.url };
      chrome.action.setBadgeText({ text: "SMS!" });
      chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
      injectSmsOverlay(details.tabId, details.url);
    }
  });

  log("webNavigation listeners installed");
} catch (e) {
  log("webNavigation setup failed: " + e.message);
}

// Also monitor tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.match(/^sms:/i)) {
    log("tabs.onUpdated caught sms: URL: " + changeInfo.url);
    const parsed = parseSmsUrl(changeInfo.url);
    smsData = { to: parsed.to, body: parsed.body, rawUrl: changeInfo.url };
    chrome.action.setBadgeText({ text: "SMS!" });
    chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
    injectSmsOverlay(tabId, changeInfo.url);
  }
});

async function injectSmsOverlay(tabId, smsUrl) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => {
        window.__capturedSmsUrl = url;
      },
      args: [smsUrl],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["inject-phone.js"],
      world: "MAIN",
    });
    log("SMS overlay injected for URL: " + smsUrl.substring(0, 80));
  } catch (e) {
    log("Failed to inject SMS overlay: " + e.message);
  }
}

// =============================================
// Message handling
// =============================================
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
    chrome.action.setBadgeText({ text: "SMS!" });
    chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
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
