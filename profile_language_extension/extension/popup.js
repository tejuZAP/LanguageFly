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

loadProfile().catch((error) => {
  console.error("Could not load saved profile:", error);
  showStatus("Could not load saved profile.", "error");
});
