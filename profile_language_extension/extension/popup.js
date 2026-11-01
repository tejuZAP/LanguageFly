const form = document.querySelector("#profile-form");
const statusMessage = document.querySelector("#status");
const saveButton = document.querySelector("#save-button");

// Change this URL to the address where your Python API is running.
// For local development, start the backend on http://127.0.0.1:8000.
const API_URL = "http://127.0.0.1:8000/api/profile";

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

async function loadProfile() {
  // The extension remains usable even when the backend is not running.
  const local = await browser.storage.local.get("profile");
  const profile = local.profile;
  if (!profile) return;

  document.querySelector("#display-name").value = profile.displayName || "";
  document.querySelector("#native-language").value = profile.nativeLanguage || "";
  document.querySelector("#target-language").value = profile.targetLanguage || "";
  document.querySelector("#notes").value = profile.notes || "";
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
  showStatus("Saving…");

  try {
    // Save locally first so profile data is retained if the API is offline.
    await browser.storage.local.set({ profile });

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      showStatus("Profile saved and synced successfully.", "success");
    } catch (apiError) {
      console.warn("Backend sync unavailable; profile saved locally.", apiError);
      showStatus("Saved on this browser. Backend sync is unavailable.", "success");
    }
  } catch (error) {
    console.error(error);
    showStatus("Could not save profile. Please try again.", "error");
  } finally {
    saveButton.disabled = false;
  }
});

// Request readable text from the active webpage.
async function getCurrentPageContent() {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      showStatus("Could not find the active tab.", "error");
      return;
    }

    // Send a message to content.js.
    const pageInfo = await browser.tabs.sendMessage(
      activeTab.id,
      { type: "GET_PAGE_CONTENT" }
    );

    if (!pageInfo || !pageInfo.text) {
      showStatus("No readable webpage text found.", "error");
      return;
    }

    console.log("Extracted webpage:", pageInfo);

    showStatus(
      `Successfully read: ${pageInfo.title}`,
      "success"
    );

    // Display extracted text in the popup.
    const pageContent = document.querySelector("#page-content");

    if (pageContent) {
      pageContent.textContent = pageInfo.text;
    }

    return pageInfo;

  } catch (error) {
    console.error("Content script error:", error);

    showStatus(
      "Could not read this page. Try reloading the webpage.",
      "error"
    );
  }
}

// Connect the Read Page button.
const readPageButton = document.querySelector("#read-page-button");

if (readPageButton) {
  readPageButton.addEventListener(
    "click",
    getCurrentPageContent
  );
}

loadProfile().catch((error) => {
  console.error("Could not load saved profile:", error);
  showStatus("Could not load saved profile.", "error");
});
