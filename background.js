const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240205.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36";

const MOBILE_UA_RULE_ID = 1;
let verifyTabId = null;
let originTabId = null;
let qrUrl = "";

function log(msg) {
  console.log("[Gmail QR Verify BG]", msg);
}

async function setMobileUARule(tabId) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [MOBILE_UA_RULE_ID],
      addRules: [
        {
          id: MOBILE_UA_RULE_ID,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "User-Agent",
                operation: "set",
                value: MOBILE_UA,
              },
              {
                header: "Sec-CH-UA-Mobile",
                operation: "set",
                value: "?1",
              },
              {
                header: "Sec-CH-UA-Platform",
                operation: "set",
                value: '"Android"',
              },
              {
                header: "Sec-CH-UA-Platform-Version",
                operation: "set",
                value: '"14.0"',
              },
            ],
          },
          condition: {
            tabIds: [tabId],
            resourceTypes: [
              "main_frame",
              "sub_frame",
              "xmlhttprequest",
              "script",
              "stylesheet",
              "image",
              "other",
            ],
          },
        },
      ],
    });
    log(`Mobile UA rule set for tab ${tabId}`);
  } catch (e) {
    log(`Error setting UA rule: ${e.message}`);
  }
}

async function removeMobileUARule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [MOBILE_UA_RULE_ID],
    });
    log("Mobile UA rule removed");
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QR_DECODED") {
    log(`QR decoded: ${message.url}`);
    qrUrl = message.url;
    originTabId = sender.tab ? sender.tab.id : null;

    openMobileVerifyTab(message.url)
      .then(() => sendResponse({ success: true }))
      .catch((e) => {
        log(`Error: ${e.message}`);
        sendResponse({ success: false, error: e.message });
      });

    return true;
  }

  if (message.type === "MOBILE_VERIFY_STATUS") {
    log(`Mobile verify status: ${message.status}`);
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

async function openMobileVerifyTab(url) {
  const tab = await chrome.tabs.create({
    url: url,
    active: false,
  });

  verifyTabId = tab.id;
  await setMobileUARule(tab.id);

  log(`Opened mobile verify tab ${tab.id} for: ${url}`);

  await chrome.storage.local.set({
    verifyTabId: tab.id,
    qrUrl: url,
    originTabId: originTabId,
    startTime: Date.now(),
  });

  setTimeout(() => {
    injectMobileVerifyScript(tab.id);
  }, 3000);
}

async function injectMobileVerifyScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["mobile-verify.js"],
    });
    log(`Injected mobile-verify.js into tab ${tabId}`);
  } catch (e) {
    log(`Could not inject script: ${e.message}`);
  }
}

function handleVerifyStatus(status, details) {
  if (status === "complete" || status === "success") {
    log("Verification successful!");

    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, { type: "VERIFICATION_COMPLETE" });
    }

    setTimeout(async () => {
      if (verifyTabId) {
        try {
          await chrome.tabs.remove(verifyTabId);
        } catch (e) {}
      }
      await removeMobileUARule();
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
    removeMobileUARule();
    verifyTabId = null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === verifyTabId && changeInfo.status === "complete") {
    log(`Verify tab loaded, re-injecting mobile-verify.js`);
    setTimeout(() => injectMobileVerifyScript(tabId), 1000);
  }
});
