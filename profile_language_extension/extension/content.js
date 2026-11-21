
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

  let learnerProfile = null;
  let tooltip = null;
  let lastDetectedWord = "";
  let lastHoverTime = 0;

  function isSupportedWebsite(hostname) {
    return SUPPORTED_HOSTS.some(
      domain =>
        hostname === domain ||
        hostname.endsWith("." + domain)
    );
  }

  // Convert language names and HTML language codes
  // into a consistent format.
  const LANGUAGE_CODES = {
    english: ["en"],
    spanish: ["es"],
    french: ["fr"],
    german: ["de"],
    italian: ["it"],
    portuguese: ["pt"],
    chinese: ["zh"],
    japanese: ["ja"],
    korean: ["ko"],
    arabic: ["ar"],
    hindi: ["hi"],
    yoruba: ["yo"],
    russian: ["ru"]
  };

  function normalizeLanguage(language) {
    if (!language) return null;

    const value = language.toLowerCase().trim();

    for (const [name, codes] of Object.entries(LANGUAGE_CODES)) {
      if (value === name || codes.includes(value.split("-")[0])) {
        return name;
      }
    }

    return null;
  }

  // Load the learner's saved profile.
  async function loadLearnerProfile() {
    try {
      const result = await browser.storage.local.get("profile");
      learnerProfile = result.profile || null;
    } catch (error) {
      console.error("Could not load learner profile:", error);
    }
  }

  // Update the profile if the learner changes their settings.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.profile) {
      learnerProfile = changes.profile.newValue || null;
    }
  });

  function getReadableText() {
    const pageCopy = document.body.cloneNode(true);

    pageCopy.querySelectorAll(
      "script, style, noscript, nav, header, footer, aside, form, button"
    ).forEach(element => element.remove());

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

  // Create the hover tooltip.
  function createTooltip() {
    if (tooltip) return;

    tooltip = document.createElement("div");
    tooltip.id = "language-fly-hover-tooltip";

    Object.assign(tooltip.style, {
      position: "fixed",
      display: "none",
      zIndex: "2147483647",
      background: "#222",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "6px",
      fontSize: "13px",
      fontFamily: "Arial, sans-serif",
      pointerEvents: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
    });

    document.documentElement.appendChild(tooltip);
  }

  function showTooltip(word, x, y) {
    createTooltip();

    tooltip.textContent = `Language Fly detected: ${word}`;
    tooltip.style.display = "block";

    // Keep the tooltip inside the visible browser window.
    const left = Math.min(
      x + 12,
      window.innerWidth - tooltip.offsetWidth - 10
    );

    const top = Math.min(
      y + 18,
      window.innerHeight - tooltip.offsetHeight - 10
    );

    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${Math.max(10, top)}px`;
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.display = "none";
    }

    lastDetectedWord = "";
  }

  // Get the text position underneath the mouse.
  function getTextPosition(x, y) {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);

      if (position) {
        return {
          node: position.offsetNode,
          offset: position.offset
        };
      }
    }

    // Fallback for browsers supporting caretRangeFromPoint.
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);

      if (range) {
        return {
          node: range.startContainer,
          offset: range.startOffset
        };
      }
    }

    return null;
  }

  // Find the word surrounding the mouse position.
  function getWordAtPosition(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const parent = node.parentElement;

    if (!parent) return null;

    // Ignore text inside extension UI or non-readable elements.
    if (
      parent.closest(
        "#language-fly-hover-tooltip, script, style, noscript, " +
        "input, textarea, select, button, nav, header, footer"
      )
    ) {
      return null;
    }

    const article = document.querySelector(
      "main, article, [role='main']"
    );

    if (article && !article.contains(parent)) {
      return null;
    }

    const text = node.textContent || "";

    // Find word boundaries around the cursor.
    const wordPattern = /[\p{L}\p{M}\p{N}'’'-]+/gu;

    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (offset >= start && offset <= end) {
        return match[0];
      }
    }

    return null;
  }

  // Check whether the current webpage matches the learner's target language.
  function isTargetLanguagePage() {
    if (!learnerProfile?.targetLanguage) {
      return false;
    }

    const targetLanguage = normalizeLanguage(
      learnerProfile.targetLanguage
    );

    const pageLanguage = normalizeLanguage(
      document.documentElement.lang
    );

    return (
      targetLanguage !== null &&
      pageLanguage !== null &&
      targetLanguage === pageLanguage
    );
  }

  // Detect words when the learner moves the mouse.
  function handleWordHover(event) {
    if (!isTargetLanguagePage()) {
      hideTooltip();
      return;
    }

    const position = getTextPosition(event.clientX, event.clientY);

    if (!position) {
      hideTooltip();
      return;
    }

    const word = getWordAtPosition(
      position.node,
      position.offset
    );

    if (!word || word === lastDetectedWord) {
      if (!word) hideTooltip();
      return;
    }

    // Avoid displaying numbers and punctuation as vocabulary.
    if (!/\p{L}/u.test(word)) {
      hideTooltip();
      return;
    }

    lastDetectedWord = word;
    lastHoverTime = Date.now();

    showTooltip(
      word,
      event.clientX,
      event.clientY
    );

    // Notify the extension runtime that a word was detected.
    browser.runtime.sendMessage({
      type: "TARGET_WORD_HOVERED",
      payload: {
        word: word,
        targetLanguage: learnerProfile.targetLanguage,
        pageTitle: document.title,
        pageUrl: window.location.href,
        detectedAt: new Date().toISOString()
      }
    }).catch(() => {
      // No listener is required for the tooltip to work.
    });
  }

  // Only run on supported websites.
  if (!isSupportedWebsite(window.location.hostname)) {
    return;
  }

  // Listen for requests from the extension popup.
  browser.runtime.onMessage.addListener(message => {
    if (message?.type === "GET_PAGE_CONTENT") {
      return Promise.resolve(collectPageInformation());
    }

    return undefined;
  });

  // Load the learner's settings before enabling hover detection.
  loadLearnerProfile().then(() => {
    createTooltip();

    document.addEventListener(
      "mousemove",
      handleWordHover
    );
  });

  // Notify the extension that the content script is running.
  browser.runtime.sendMessage({
    type: "CONTENT_SCRIPT_READY",
    payload: {
      url: window.location.href,
      title: document.title,
      hostname: window.location.hostname
    }
  }).catch(() => {
    // The popup may not be open.
  });

})();