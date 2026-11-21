
const form = document.querySelector("#profile-form");
const statusMessage = document.querySelector("#status");
const saveButton = document.querySelector("#save-button");

const API_URL = "http://127.0.0.1:8000/api/profile";
const VOCABULARY_API_URL = "http://127.0.0.1:8000/api/vocabulary";

const analyzeButton = document.querySelector("#analyze-page-button");
const vocabularyStatus = document.querySelector("#vocabulary-status");

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

async function loadProfile() {
  const local = await browser.storage.local.get("profile");
  const profile = local.profile;

  if (!profile) return;

  document.querySelector("#display-name").value =
    profile.displayName || "";
  document.querySelector("#native-language").value =
    profile.nativeLanguage || "";
  document.querySelector("#target-language").value =
    profile.targetLanguage || "";
  document.querySelector("#notes").value =
    profile.notes || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const profile = {
    displayName: document.querySelector("#display-name").value.trim(),
    nativeLanguage: document.querySelector("#native-language").value,
    targetLanguage: document.querySelector("#target-language").value,
    notes: document.querySelector("#notes").value.trim()
  };

  if (!profile.displayName) {
    showStatus("Please enter your name.", "error");
    return;
  }

  saveButton.disabled = true;
  showStatus("Saving...");

  try {
    await browser.storage.local.set({ profile });

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      showStatus("Profile saved and synced successfully.", "success");
    } catch (apiError) {
      console.warn("Backend sync unavailable:", apiError);
      showStatus("Saved locally. Backend sync is unavailable.", "success");
    }
  } catch (error) {
    console.error(error);
    showStatus("Could not save profile.", "error");
  } finally {
    saveButton.disabled = false;
  }
});

// Convert the webpage's HTML language attribute into a language
// name accepted by the backend's spaCy language-model mapping.
function getSourceLanguage(languageAttribute) {
  const languageCodes = {
    en: "english",
    es: "spanish",
    fr: "french",
    de: "german",
    it: "italian",
    pt: "portuguese",
    zh: "chinese",
    ja: "japanese",
    ko: "korean",
    nl: "dutch",
    ru: "russian"
  };

  const code = (languageAttribute || "en")
    .toLowerCase()
    .split("-")[0];

  return languageCodes[code] || "english";
}

async function analyzeCurrentPage() {
  analyzeButton.disabled = true;
  vocabularyStatus.textContent = "Reading webpage...";

  try {
    const local = await browser.storage.local.get("profile");
    const profile = local.profile;

    if (!profile?.targetLanguage) {
      throw new Error("Please save your profile and choose a target language first.");
    }

    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    const activeTab = tabs[0];

    if (!activeTab?.id) {
      throw new Error("Could not find the active browser tab.");
    }

    // Ask content.js to extract the webpage text.
    const pageInfo = await browser.tabs.sendMessage(
      activeTab.id,
      { type: "GET_PAGE_CONTENT" }
    );

    if (!pageInfo?.text || pageInfo.text.length < 40) {
      throw new Error("Not enough readable webpage text was found.");
    }

    vocabularyStatus.textContent = "Processing vocabulary and translations...";

    // Send the extracted text to the Python backend.
    const response = await fetch(VOCABULARY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: pageInfo.text,
        language: getSourceLanguage(pageInfo.language),
        target_language: profile.targetLanguage,
        max_results: 20
      })
    });

    if (!response.ok) {
      let detail = `Vocabulary API returned ${response.status}.`;

      try {
        const errorData = await response.json();
        detail = errorData.detail || detail;
      } catch {
        // Keep the default error message.
      }

      throw new Error(detail);
    }

    const result = await response.json();

    // Send the API results back to content.js for display in the webpage.
    await browser.tabs.sendMessage(activeTab.id, {
      type: "DISPLAY_VOCABULARY",
      payload: result
    });

    vocabularyStatus.textContent =
      `Displayed ${result.vocabulary?.length || 0} vocabulary words on the webpage.`;

  } catch (error) {
    console.error("Vocabulary analysis failed:", error);
    vocabularyStatus.textContent = error.message;
  } finally {
    analyzeButton.disabled = false;
  }
}

analyzeButton.addEventListener("click", analyzeCurrentPage);

loadProfile().catch(error => {
  console.error("Could not load saved profile:", error);
  showStatus("Could not load saved profile.", "error");
});
