const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const urlCard = document.getElementById("urlCard");
const qrUrlEl = document.getElementById("qrUrl");
const rescanBtn = document.getElementById("rescanBtn");
const openUrlBtn = document.getElementById("openUrlBtn");
const logArea = document.getElementById("logArea");

function addLog(msg) {
  const time = new Date().toLocaleTimeString();
  logArea.textContent += `\n[${time}] ${msg}`;
  logArea.scrollTop = logArea.scrollHeight;
}

function updateStatus(status, text, url) {
  statusText.textContent = text;
  statusDot.className = "dot";

  switch (status) {
    case "idle":
      statusDot.classList.add("dot-idle");
      break;
    case "scanning":
    case "verifying":
      statusDot.classList.add("dot-working");
      break;
    case "success":
      statusDot.classList.add("dot-active");
      break;
    case "error":
      statusDot.classList.add("dot-error");
      break;
  }

  if (url) {
    urlCard.style.display = "block";
    qrUrlEl.textContent = url;
    openUrlBtn.style.display = "block";
    openUrlBtn.onclick = () => {
      chrome.tabs.create({ url: url });
    };
  }
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      updateStatus("idle", "Idle - waiting for QR page");
      return;
    }

    switch (response.status) {
      case "idle":
        updateStatus("idle", "Idle - waiting for QR page");
        break;
      case "decoded":
        updateStatus("scanning", "QR decoded - preparing verification", response.qrUrl);
        addLog("QR URL: " + response.qrUrl);
        break;
      case "verifying":
        updateStatus("verifying", "Verification in progress...", response.qrUrl);
        addLog("Verifying in tab " + response.verifyTabId);
        break;
    }
  });
}

rescanBtn.addEventListener("click", () => {
  addLog("Requesting rescan...");
  chrome.runtime.sendMessage({ type: "RETRY_SCAN" }, () => {
    addLog("Rescan triggered");
  });
});

refresh();
setInterval(refresh, 3000);
