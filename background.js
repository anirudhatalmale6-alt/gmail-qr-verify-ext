let verifyTabId = null;
let originTabId = null;
let qrUrl = "";

function log(msg) {
  console.log("[Gmail QR Verify BG]", msg);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QR_DECODED") {
    log(`QR decoded: ${message.url}`);
    qrUrl = message.url;
    originTabId = sender.tab ? sender.tab.id : null;

    openVerifyTab(message.url)
      .then(() => sendResponse({ success: true }))
      .catch((e) => {
        log(`Error: ${e.message}`);
        sendResponse({ success: false, error: e.message });
      });

    return true;
  }

  if (message.type === "VERIFY_TAB_STATUS") {
    log(`Verify tab status: ${message.status} - ${message.details}`);
    handleVerifyStatus(message.status, message.details);
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      qrUrl,
      verifyTabId,
      originTabId,
      status: verifyTabId ? "verifying" : qrUrl ? "decoded" : "idle",
    });
    return true;
  }

  if (message.type === "RETRY_SCAN") {
    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, { type: "MANUAL_SCAN" });
    }
    sendResponse({ ok: true });
  }
});

async function openVerifyTab(url) {
  const tab = await chrome.tabs.create({
    url: url,
    active: true,
  });

  verifyTabId = tab.id;

  log(`Opened verify tab ${tab.id} (desktop mode, no mobile UA) for: ${url}`);

  await chrome.storage.local.set({
    verifyTabId: tab.id,
    qrUrl: url,
    originTabId: originTabId,
    startTime: Date.now(),
  });
}

function handleVerifyStatus(status, details) {
  if (status === "complete" || status === "success") {
    log("Verification successful!");

    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, { type: "VERIFICATION_COMPLETE" });
      chrome.tabs.update(originTabId, { active: true });
    }

    setTimeout(async () => {
      if (verifyTabId) {
        try {
          await chrome.tabs.remove(verifyTabId);
        } catch (e) {}
      }
      verifyTabId = null;
    }, 2000);
  } else if (status === "failed" || status === "error") {
    log(`Verification failed: ${details}`);
    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, {
        type: "VERIFICATION_FAILED",
        details,
      });
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === verifyTabId) {
    verifyTabId = null;
  }
});
