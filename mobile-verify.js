(function () {
  if (window.__mobileVerifyLoaded) return;
  window.__mobileVerifyLoaded = true;

  function log(msg) {
    console.log("[Gmail QR Mobile Verify]", msg);
  }

  log("Mobile verify script loaded on: " + window.location.href);
  log("User-Agent: " + navigator.userAgent);

  function getPageText() {
    return (document.body ? document.body.innerText : "").toLowerCase();
  }

  function findClickableButtons() {
    const results = [];
    const selectors = [
      "button",
      '[role="button"]',
      'input[type="submit"]',
      'input[type="button"]',
      "a.button",
      '[class*="button"]',
      '[data-action]',
    ];

    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const text = (el.innerText || el.textContent || el.value || "").toLowerCase().trim();
        const isVisible =
          el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
        if (isVisible && text) {
          results.push({ el, text });
        }
      });
    });
    return results;
  }

  function tryAutoVerify() {
    const text = getPageText();
    const buttons = findClickableButtons();

    log(`Page text preview: ${text.substring(0, 200)}`);
    log(`Found ${buttons.length} clickable elements`);

    if (
      text.includes("verification complete") ||
      text.includes("verified") ||
      text.includes("you can now go back") ||
      text.includes("go back to your") ||
      text.includes("you're all set") ||
      text.includes("verification successful")
    ) {
      log("Verification appears complete!");
      chrome.runtime.sendMessage({
        type: "MOBILE_VERIFY_STATUS",
        status: "complete",
        details: "Verification page shows success",
      });
      return true;
    }

    const verifyKeywords = [
      "verify",
      "continue",
      "confirm",
      "yes, it's me",
      "yes it's me",
      "yes, i'm",
      "approve",
      "allow",
      "accept",
      "next",
      "proceed",
      "i agree",
      "got it",
      "ok",
      "done",
      "submit",
      "tap to verify",
      "yes",
    ];

    const skipKeywords = [
      "cancel",
      "back",
      "no",
      "deny",
      "reject",
      "sign out",
      "sign in",
      "create account",
      "learn more",
      "privacy",
      "terms",
      "help",
    ];

    for (const { el, text: btnText } of buttons) {
      const isSkip = skipKeywords.some((kw) => btnText.includes(kw));
      if (isSkip) continue;

      const isVerify = verifyKeywords.some((kw) => btnText.includes(kw));
      if (isVerify) {
        log(`Clicking verify button: "${btnText}"`);
        el.click();

        setTimeout(tryAutoVerify, 3000);
        return true;
      }
    }

    if (
      text.includes("error") ||
      text.includes("something went wrong") ||
      text.includes("couldn't verify") ||
      text.includes("try again") ||
      text.includes("unable to verify")
    ) {
      log("Verification page shows error");

      const retryBtn = buttons.find(
        ({ text: t }) => t.includes("try again") || t.includes("retry")
      );
      if (retryBtn) {
        log("Found retry button, clicking...");
        retryBtn.el.click();
        setTimeout(tryAutoVerify, 3000);
        return true;
      }

      chrome.runtime.sendMessage({
        type: "MOBILE_VERIFY_STATUS",
        status: "failed",
        details: "Verification page shows error - may need manual verification",
      });
      return false;
    }

    log("No clear action found yet, will retry...");
    return false;
  }

  function startVerification() {
    let attempts = 0;
    const maxAttempts = 15;

    function attempt() {
      attempts++;
      log(`Verification attempt ${attempts}/${maxAttempts}`);

      if (tryAutoVerify()) return;

      if (attempts < maxAttempts) {
        setTimeout(attempt, 2000);
      } else {
        log("Max attempts reached");
        chrome.runtime.sendMessage({
          type: "MOBILE_VERIFY_STATUS",
          status: "failed",
          details: "Could not find verification action after " + maxAttempts + " attempts. Page may need manual interaction.",
        });
      }
    }

    setTimeout(attempt, 1500);
  }

  const observer = new MutationObserver(() => {
    if (!window.__verifyStarted) {
      const text = getPageText();
      if (
        text.includes("verify") ||
        text.includes("confirm") ||
        text.includes("continue")
      ) {
        window.__verifyStarted = true;
        log("Page content changed, starting verification...");
        startVerification();
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  startVerification();
})();
