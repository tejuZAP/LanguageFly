(() => {
    "use strict";
  
    // Prevent the script from running more than once.
    if (window.__languageLearningContentScriptLoaded) return;
    window.__languageLearningContentScriptLoaded = true;
  
    const SUPPORTED_HOSTS = [
      "wikipedia.org",
      "bbc.com",
      "bbc.co.uk"
    ];
  
    function isSupportedWebsite(hostname) {
      return SUPPORTED_HOSTS.some(
        domain =>
          hostname === domain ||
          hostname.endsWith("." + domain)
      );
    }
  
    function getReadableText() {
      const pageCopy = document.body.cloneNode(true);
  
      // Remove unnecessary webpage elements.
      pageCopy.querySelectorAll(
        "script, style, noscript, nav, header, footer, aside, form, button"
      ).forEach(element => element.remove());
  
      // Find the main article content.
      const mainContent =
        pageCopy.querySelector("main, article, [role='main']") ||
        pageCopy;
  
      return (
        mainContent.innerText ||
        mainContent.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 20000);
    }
  
    function collectPageInformation() {
      return {
        url: window.location.href,
        title: document.title,
        hostname: window.location.hostname,
        language: document.documentElement.lang || null,
        text: getReadableText(),
        extractedAt: new Date().toISOString()
      };
    }
  
    // Only run on supported websites.
    if (!isSupportedWebsite(window.location.hostname)) {
      return;
    }
  
    // Receive requests from the extension popup.
    browser.runtime.onMessage.addListener(message => {
      if (message?.type === "GET_PAGE_CONTENT") {
        return Promise.resolve(
          collectPageInformation()
        );
      }
  
      return undefined;
    });
  
    // Notify the extension that the script is running.
    browser.runtime.sendMessage({
      type: "CONTENT_SCRIPT_READY",
      payload: {
        url: window.location.href,
        title: document.title,
        hostname: window.location.hostname
      }
    }).catch(() => {
      // Ignore errors if no extension page is listening.
    });
  
  })();
  