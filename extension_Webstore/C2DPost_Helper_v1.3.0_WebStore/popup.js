// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("openWebBtn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // Try to open active tab or create new tab
      chrome.tabs.query({ url: "*://*.vercel.app/*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          chrome.tabs.create({ url: "https://c2dpost-web.vercel.app" });
        }
      });
    });
  }
});
