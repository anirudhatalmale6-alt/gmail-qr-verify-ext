let originTabId = null;
let qrUrl = "";
let altUrlResults = [];

function log(msg) {
  console.log("[Gmail QR Verify BG]", msg);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QR_DECODED") {
    log(`QR decoded: ${message.url}`);
    qrUrl = message.url;
    originTabId = sender.tab ? sender.tab.id : null;
    return;
  }

  if (message.type === "TRY_ALT_URLS") {
    log(`Trying ${message.urls.length} alternative URLs...`);
    tryAlternativeUrls(message.urls, sender.tab ? sender.tab.id : null);
    return;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      qrUrl,
      originTabId,
      altUrlResults,
      status: qrUrl ? "decoded" : "idle",
    });
    return true;
  }

  if (message.type === "RETRY_SCAN") {
    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, { type: "MANUAL_SCAN" });
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "OPEN_QR_URL") {
    if (qrUrl) {
      chrome.tabs.create({ url: qrUrl, active: true });
    }
    sendResponse({ ok: true });
    return;
  }
});

async function tryAlternativeUrls(urls, tabId) {
  altUrlResults = [];

  for (const url of urls) {
    try {
      log(`Testing: ${url}`);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        credentials: "include",
      });

      const finalUrl = response.url;
      const status = response.status;
      const text = await response.text();

      const hasPhoneInput =
        text.includes('type="tel"') ||
        text.includes("phone number") ||
        text.includes("Enter your phone");

      const isRedirectBack =
        finalUrl.includes("mophoneverification") ||
        finalUrl.includes("Scan the QR");

      altUrlResults.push({
        url,
        finalUrl,
        status,
        hasPhoneInput,
        isRedirectBack,
      });

      log(`Result: status=${status}, hasPhoneInput=${hasPhoneInput}, redirectBack=${isRedirectBack}, finalUrl=${finalUrl}`);

      if (hasPhoneInput && !isRedirectBack) {
        log(`Found phone input at: ${finalUrl}`);
        chrome.tabs.create({ url: finalUrl, active: true });
        return;
      }
    } catch (e) {
      log(`Error testing ${url}: ${e.message}`);
      altUrlResults.push({ url, error: e.message });
    }
  }

  log("No alternative URL had a phone input form");
}
