(function () {
  if (window.__verifyTabLoaded) return;
  window.__verifyTabLoaded = true;

  function log(msg) {
    console.log("[Gmail QR Verify Tab]", msg);
  }

  log("Verify tab script loaded on: " + window.location.href);

  function getPageText() {
    return (document.body ? document.body.innerText : "").toLowerCase();
  }

  function checkForSuccess() {
    const text = getPageText();
    if (
      text.includes("verification complete") ||
      text.includes("verified successfully") ||
      text.includes("you can now go back") ||
      text.includes("go back to your") ||
      text.includes("you're all set") ||
      text.includes("verification successful") ||
      text.includes("account created")
    ) {
      log("Verification appears complete!");
      chrome.runtime.sendMessage({
        type: "VERIFY_TAB_STATUS",
        status: "complete",
        details: "Success detected on page",
      });
      return true;
    }
    return false;
  }

  function checkForPhoneInput() {
    const inputs = document.querySelectorAll(
      'input[type="tel"], input[type="phone"], input[name*="phone"], input[id*="phone"], input[autocomplete*="tel"], input[aria-label*="phone"], input[placeholder*="phone"], input[placeholder*="number"]'
    );

    if (inputs.length > 0) {
      log(`Found ${inputs.length} phone input(s) on the page!`);
      highlightPhoneInput(inputs[0]);
      return true;
    }

    const allInputs = document.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])');
    for (const inp of allInputs) {
      const parent = inp.closest("div, label, fieldset");
      if (parent) {
        const parentText = (parent.innerText || "").toLowerCase();
        if (parentText.includes("phone") || parentText.includes("number") || parentText.includes("mobile")) {
          log(`Found phone-related input via parent text: "${parentText.substring(0, 50)}"`);
          highlightPhoneInput(inp);
          return true;
        }
      }
    }

    return false;
  }

  function highlightPhoneInput(input) {
    input.style.outline = "3px solid #4fc3f7";
    input.style.boxShadow = "0 0 10px rgba(79, 195, 247, 0.5)";

    let hint = document.getElementById("qr-verify-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "qr-verify-hint";
      hint.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        padding: 10px 20px; background: #1a73e8; color: white;
        font-family: Arial, sans-serif; font-size: 14px; text-align: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      hint.textContent = "Phone number input found! Enter your phone number here to verify.";
      document.body.appendChild(hint);
    }
  }

  function checkForCodeInput() {
    const text = getPageText();
    if (
      text.includes("enter the code") ||
      text.includes("verification code") ||
      text.includes("enter code") ||
      text.includes("we sent") ||
      text.includes("code sent")
    ) {
      log("Code entry page detected!");

      let hint = document.getElementById("qr-verify-hint");
      if (!hint) {
        hint = document.createElement("div");
        hint.id = "qr-verify-hint";
        hint.style.cssText = `
          position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
          padding: 10px 20px; background: #ff9800; color: white;
          font-family: Arial, sans-serif; font-size: 14px; text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        hint.textContent = "Enter the verification code you received via SMS.";
        document.body.appendChild(hint);
      }
      return true;
    }
    return false;
  }

  function monitorPage() {
    let checks = 0;
    const maxChecks = 90;

    function check() {
      checks++;

      if (checkForSuccess()) return;
      if (checkForPhoneInput()) return;
      if (checkForCodeInput()) return;

      const text = getPageText();
      log(`Check ${checks}: page text preview: "${text.substring(0, 100)}"`);

      if (text.includes("this may take") || text.includes("few moments")) {
        log("Page is loading/processing...");
      }

      if (checks < maxChecks) {
        setTimeout(check, 2000);
      }
    }

    setTimeout(check, 1500);
  }

  monitorPage();

  const observer = new MutationObserver(() => {
    checkForSuccess();
    checkForPhoneInput();
    checkForCodeInput();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
