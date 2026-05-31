const scanBtn = document.getElementById("scanBtn");
const dot = document.getElementById("dot");
const statusMsg = document.getElementById("statusMsg");
const errorMsg = document.getElementById("errorMsg");
const resultSection = document.getElementById("resultSection");
const urlBox = document.getElementById("urlBox");
const openBtn = document.getElementById("openBtn");

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  dot.className = "dot dot-scanning";
  statusMsg.textContent = "Scanning page for QR code...";
  errorMsg.classList.add("hidden");
  resultSection.classList.add("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showError("No active tab found");
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
        showDecoded(resp.qrUrl);
      } else if (resp.scanStatus === "error") {
        clearInterval(poll);
        showError(resp.scanError);
      } else if (checks > 15) {
        clearInterval(poll);
        showError("Scan timed out. Make sure the QR code is visible on the page.");
      }
    });
  }, 500);
});

urlBox.addEventListener("click", () => {
  navigator.clipboard.writeText(urlBox.textContent).then(() => {
    urlBox.classList.add("copied");
    setTimeout(() => urlBox.classList.remove("copied"), 1500);
  });
});

openBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_URL", url: urlBox.textContent });
});

function showDecoded(url) {
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan QR Code Now";
  dot.className = "dot dot-decoded";
  statusMsg.innerHTML = '<span class="success-text">QR Code decoded successfully!</span>';
  errorMsg.classList.add("hidden");
  resultSection.classList.remove("hidden");
  urlBox.textContent = url;
}

function showError(msg) {
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan QR Code Now";
  dot.className = "dot dot-error";
  statusMsg.textContent = "Scan failed";
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
  resultSection.classList.add("hidden");
}

chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
  if (resp && resp.scanStatus === "decoded" && resp.qrUrl) {
    showDecoded(resp.qrUrl);
  }
});
