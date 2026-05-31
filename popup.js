const scanBtn = document.getElementById("scanBtn");
const scanDot = document.getElementById("scanDot");
const scanMsg = document.getElementById("scanMsg");
const qrResult = document.getElementById("qrResult");
const urlBox = document.getElementById("urlBox");
const openBtn = document.getElementById("openBtn");
const phoneInput = document.getElementById("phoneInput");
const injectBtn = document.getElementById("injectBtn");
const diagBtn = document.getElementById("diagBtn");
const injectError = document.getElementById("injectError");
const smsResult = document.getElementById("smsResult");
const smsTo = document.getElementById("smsTo");
const smsBody = document.getElementById("smsBody");

// Load saved phone number
chrome.storage.local.get(["phoneNumber"], (data) => {
  if (data.phoneNumber) phoneInput.value = data.phoneNumber;
});

// Step 1: Scan QR
scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  scanDot.className = "dot dot-scanning";
  scanMsg.textContent = "Scanning for QR code...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showScanError("No active tab");
    return;
  }

  chrome.runtime.sendMessage({ type: "SCAN_QR", tabId: tab.id });

  let checks = 0;
  const poll = setInterval(() => {
    checks++;
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
      if (!resp) return;
      if (resp.scanStatus === "decoded" && resp.qrUrl) {
        clearInterval(poll);
        showScanSuccess(resp.qrUrl);
      } else if (resp.scanStatus === "error") {
        clearInterval(poll);
        showScanError(resp.scanError);
      } else if (checks > 20) {
        clearInterval(poll);
        showScanError("Scan timed out");
      }
    });
  }, 500);
});

function showScanSuccess(url) {
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan QR Code";
  scanDot.className = "dot dot-decoded";
  scanMsg.innerHTML = '<span class="success-text">QR decoded!</span>';
  qrResult.classList.remove("hidden");
  urlBox.textContent = url;
}

function showScanError(msg) {
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan QR Code";
  scanDot.className = "dot dot-error";
  scanMsg.textContent = msg;
}

urlBox.addEventListener("click", () => {
  navigator.clipboard.writeText(urlBox.textContent);
  urlBox.style.borderColor = "#66bb6a";
  setTimeout(() => (urlBox.style.borderColor = "transparent"), 1000);
});

openBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_URL", url: urlBox.textContent });
});

// Step 2: Phone Inject
injectBtn.addEventListener("click", () => injectPhone(true));
diagBtn.addEventListener("click", () => injectPhone(false));

async function injectPhone(withNumber) {
  const phone = phoneInput.value.trim();

  if (withNumber && !phone) {
    injectError.textContent = "Enter a phone number first";
    injectError.classList.remove("hidden");
    return;
  }

  if (withNumber) {
    chrome.storage.local.set({ phoneNumber: phone });
  }

  injectError.classList.add("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    injectError.textContent = "No active tab";
    injectError.classList.remove("hidden");
    return;
  }

  const btn = withNumber ? injectBtn : diagBtn;
  btn.disabled = true;
  btn.textContent = "Injecting...";

  try {
    // Set the phone number in the page context first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (num) => {
        window.__injectedPhoneNumber = num;
      },
      args: [withNumber ? phone : ""],
      world: "MAIN",
    });

    // Inject the phone interceptor
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["inject-phone.js"],
      world: "MAIN",
    });

    btn.textContent = withNumber ? "Injected!" : "Diagnostics Running";
    btn.style.background = "#66bb6a";

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = withNumber ? "Inject Phone Number + Monitor" : "Run Diagnostics Only";
      btn.style.background = "";
    }, 3000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = withNumber ? "Inject Phone Number + Monitor" : "Run Diagnostics Only";
    injectError.textContent = "Error: " + e.message;
    injectError.classList.remove("hidden");
  }
}

// Check for SMS captures
setInterval(() => {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
    if (resp && resp.smsData) {
      smsResult.classList.remove("hidden");
      smsTo.textContent = resp.smsData.to || "Check console";
      smsBody.textContent = resp.smsData.body || "Check console";
    }
  });
}, 2000);

// Load previous state
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
  if (resp && resp.scanStatus === "decoded" && resp.qrUrl) {
    showScanSuccess(resp.qrUrl);
  }
  if (resp && resp.smsData) {
    smsResult.classList.remove("hidden");
    smsTo.textContent = resp.smsData.to || "Check console";
    smsBody.textContent = resp.smsData.body || "Check console";
  }
});
