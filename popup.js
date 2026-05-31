const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const urlCard = document.getElementById("urlCard");
const qrUrlEl = document.getElementById("qrUrl");
const rescanBtn = document.getElementById("rescanBtn");
const openUrlBtn = document.getElementById("openUrlBtn");
const altResults = document.getElementById("altResults");
const altResultsList = document.getElementById("altResultsList");

qrUrlEl.addEventListener("click", () => {
  navigator.clipboard.writeText(qrUrlEl.textContent).then(() => {
    qrUrlEl.style.border = "1px solid #66bb6a";
    setTimeout(() => (qrUrlEl.style.border = "none"), 1000);
  });
});

function updateStatus(status, text, url) {
  statusText.textContent = text;
  statusDot.className = "dot";
  statusDot.classList.add(
    status === "idle" ? "dot-idle" : status === "decoded" ? "dot-active" : "dot-working"
  );

  if (url) {
    urlCard.style.display = "block";
    qrUrlEl.textContent = url;
    openUrlBtn.style.display = "block";
    openUrlBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: "OPEN_QR_URL" });
    };
  }
}

function showAltResults(results) {
  if (!results || results.length === 0) return;
  altResults.style.display = "block";
  altResultsList.innerHTML = "";

  results.forEach((r) => {
    const div = document.createElement("div");
    if (r.error) {
      div.textContent = `${r.url.split("/").pop()} - Error`;
    } else {
      const phoneTag = r.hasPhoneInput
        ? '<span class="tag tag-yes">PHONE INPUT</span>'
        : '<span class="tag tag-no">no input</span>';
      const redirectTag = r.isRedirectBack
        ? '<span class="tag tag-no">redirect</span>'
        : '<span class="tag tag-yes">different page</span>';
      div.innerHTML = `${r.url.split("/signup/")[1] || r.url.substring(0, 40)} ${phoneTag} ${redirectTag}`;
    }
    altResultsList.appendChild(div);
  });
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      updateStatus("idle", "Idle - navigate to a QR verification page");
      return;
    }

    if (response.qrUrl) {
      updateStatus("decoded", "QR code decoded", response.qrUrl);
    } else {
      updateStatus("idle", "Idle - navigate to a QR verification page");
    }

    if (response.altUrlResults) {
      showAltResults(response.altUrlResults);
    }
  });
}

rescanBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RETRY_SCAN" });
});

refresh();
setInterval(refresh, 3000);
