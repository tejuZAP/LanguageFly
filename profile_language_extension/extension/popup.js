const form = document.querySelector("#profile-form");
const statusMessage = document.querySelector("#status");
const saveButton = document.querySelector("#save-button");

const analyzeButton = document.querySelector("#analyze-page-button");
const vocabularyStatus = document.querySelector("#vocabulary-status");
const vocabularyResults = document.querySelector("#vocabulary-results");

// Python backend URLs
const PROFILE_API_URL = "http://127.0.0.1:8000/api/profile";
const VOCABULARY_API_URL = "http://127.0.0.1:8000/api/vocabulary";

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

// Load the previously saved user profile.
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

// Save the user's profile locally and sync it with the backend.
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
  showStatus("Saving…");

  try {
    await browser.storage.local.set({ profile });

    try {
      const response = await fetch(PROFILE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profile)
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      showStatus("Profile saved and synced successfully.", "success");

    } catch (apiError) {
      console.warn("Backend sync unavailable:", apiError);
      showStatus(
        "Saved on this browser. Backend sync is unavailable.",
        "success"
      );
    }

  } catch (error) {
    console.error(error);
    showStatus("Could not save profile. Please try again.", "error");

  } finally {
    saveButton.disabled = false;
  }
});

// Get webpage content from content.js.
async function getCurrentPageContent() {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tabs.length || !tabs[0].id) {
    throw new Error("Could not find the current browser tab.");
  }

  try {
    const pageInfo = await browser.tabs.sendMessage(
      tabs[0].id,
      { type: "GET_PAGE_CONTENT" }
    );

    if (!pageInfo || !pageInfo.text) {
      throw new Error("No readable webpage text was found.");
    }

    return pageInfo;

  } catch (error) {
    throw new Error(
      "Could not read this webpage. Make sure it is a supported website and reload the page."
    );
  }
}

// Send webpage text to the Python vocabulary API.
async function requestVocabulary(pageInfo) {

  // Get the saved user profile.
  const local = await browser.storage.local.get("profile");
  const profile = local.profile;

  if (!profile || !profile.targetLanguage) {
    throw new Error(
      "Please save your profile and choose a target language first."
    );
  }

  const response = await fetch(VOCABULARY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: pageInfo.text,
      language: pageInfo.language || "english",
      target_language: profile.targetLanguage,
      max_results: 20
    })
  });

  if (!response.ok) {
    let errorMessage = "Could not retrieve vocabulary.";

    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch {
      // Use the default error message.
    }

    throw new Error(errorMessage);
  }

  return await response.json();
}

// Display vocabulary results in the extension popup.
function displayVocabulary(vocabulary) {

  vocabularyResults.replaceChildren();

  if (!vocabulary || vocabulary.length === 0) {
    vocabularyResults.textContent =
      "No vocabulary words were found.";

    return;
  }

  vocabulary.forEach((item) => {

    const card = document.createElement("div");
    card.className = "vocabulary-card";

    const word = document.createElement("h3");
    word.textContent = item.word;

    const translation = document.createElement("p");
    translation.className = "vocabulary-translation";
    translation.textContent =
      `Translation: ${item.translation}`;

    const details = document.createElement("p");
    details.className = "vocabulary-details";
    details.textContent =
      `Frequency: ${item.frequency} | Part of speech: ${item.part_of_speech}`;

    const example = document.createElement("p");
    example.className = "vocabulary-example";
    example.textContent =
      `Example: ${item.example}`;

    card.append(
      word,
      translation,
      details,
      example
    );

    vocabularyResults.appendChild(card);
  });
}

// Main button action: read page, analyze it, and display the results.
analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  vocabularyResults.replaceChildren();
  vocabularyStatus.textContent = "Reading webpage…";

  try {
    const pageInfo = await getCurrentPageContent();

    vocabularyStatus.textContent =
      `Analyzing "${pageInfo.title}"…`;

    const result = await requestVocabulary(pageInfo);

    displayVocabulary(result.vocabulary);

    vocabularyStatus.textContent =
      `Found ${result.vocabulary.length} vocabulary items.`;

  } catch (error) {
    console.error("Vocabulary extraction error:", error);
    vocabularyStatus.textContent = error.message;

  } finally {
    analyzeButton.disabled = false;
  }
});

// Load the saved profile when the popup opens.
loadProfile().catch((error) => {
  console.error("Could not load saved profile:", error);
  showStatus("Could not load saved profile.", "error");
});