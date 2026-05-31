const scanBtn = document.getElementById("scanBtn");
const scanDot = document.getElementById("scanDot");
const scanMsg = document.getElementById("scanMsg");
const qrResult = document.getElementById("qrResult");
const urlBox = document.getElementById("urlBox");
const openBtn = document.getElementById("openBtn");
const switchFlowBtn = document.getElementById("switchFlowBtn");
const phoneInput = document.getElementById("phoneInput");
const injectBtn = document.getElementById("injectBtn");
const injectError = document.getElementById("injectError");
const smsResult = document.getElementById("smsResult");
const smsTo = document.getElementById("smsTo");
const smsBody = document.getElementById("smsBody");

chrome.storage.local.get(["phoneNumber"], (data) => {
  if (data.phoneNumber) phoneInput.value = data.phoneNumber;
});

// ==================
// Step 1: Scan QR
// ==================
scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  scanDot.className = "dot dot-scanning";
  scanMsg.textContent = "Scanning...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { showScanError("No active tab"); return; }

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
        showScanError("Timeout - QR not found");
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

// ==================
// Step 2: Flow Switch
// ==================
async function switchToFlow(flowNum) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (flow) => {
      const url = new URL(window.location.href);
      const currentFlow = url.searchParams.get("pnv_flow");
      console.log("[Flow Switch] Current flow: " + currentFlow + " -> Switching to: " + flow);

      // Method 1: Change pnv_flow parameter
      url.searchParams.set("pnv_flow", flow);
      const newUrl = url.toString();
      console.log("[Flow Switch] Navigating to: " + newUrl);

      window.location.href = newUrl;
    },
    args: [String(flowNum)],
  });
}

switchFlowBtn.addEventListener("click", () => switchToFlow(1));
document.getElementById("flow0").addEventListener("click", () => switchToFlow(0));
document.getElementById("flow3").addEventListener("click", () => switchToFlow(3));
document.getElementById("flow4").addEventListener("click", () => switchToFlow(4));

// ==================
// Step 3: Inject
// ==================
injectBtn.addEventListener("click", async () => {
  const phone = phoneInput.value.trim();
  if (phone) chrome.storage.local.set({ phoneNumber: phone });

  injectError.classList.add("hidden");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    injectError.textContent = "No active tab";
    injectError.classList.remove("hidden");
    return;
  }

  injectBtn.disabled = true;
  injectBtn.textContent = "Injecting...";

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (num) => { window.__injectedPhoneNumber = num; },
      args: [phone],
      world: "MAIN",
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["inject-phone.js"],
      world: "MAIN",
    });

    injectBtn.textContent = "Injected! Check console (F12)";
    injectBtn.style.background = "#66bb6a";
    setTimeout(() => {
      injectBtn.disabled = false;
      injectBtn.textContent = "Inject + Monitor (check F12 console)";
      injectBtn.style.background = "";
    }, 3000);
  } catch (e) {
    injectBtn.disabled = false;
    injectBtn.textContent = "Inject + Monitor (check F12 console)";
    injectError.textContent = "Error: " + e.message;
    injectError.classList.remove("hidden");
  }
});

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
  if (resp && resp.scanStatus === "decoded" && resp.qrUrl) showScanSuccess(resp.qrUrl);
  if (resp && resp.smsData) {
    smsResult.classList.remove("hidden");
    smsTo.textContent = resp.smsData.to || "Check console";
    smsBody.textContent = resp.smsData.body || "Check console";
  }
});
