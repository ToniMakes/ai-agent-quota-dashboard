const languageStorageKey = "aiqd-site:language";
const languageToggle = document.querySelector("#language-toggle");

let currentLanguage = loadInitialLanguage();

languageToggle?.addEventListener("click", () => {
  currentLanguage = currentLanguage === "zh" ? "en" : "zh";
  window.localStorage?.setItem(languageStorageKey, currentLanguage);
  applyLanguage();
});

applyLanguage();

function loadInitialLanguage() {
  try {
    const saved = window.localStorage?.getItem(languageStorageKey);
    return saved === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

function applyLanguage() {
  const isZh = currentLanguage === "zh";
  document.documentElement.lang = isZh ? "zh-Hans" : "en";
  document.title = "AI Agent Quota Dashboard";

  if (languageToggle) {
    languageToggle.textContent = isZh ? "EN" : "中文";
  }

  for (const element of document.querySelectorAll("[data-i18n-en]")) {
    element.textContent = isZh ? element.dataset.i18nZh : element.dataset.i18nEn;
  }

  for (const element of document.querySelectorAll("[data-i18n-html-en]")) {
    element.innerHTML = isZh
      ? element.dataset.i18nHtmlZh
      : element.dataset.i18nHtmlEn;
  }

  for (const element of document.querySelectorAll("[data-i18n-aria-label-en]")) {
    const value = isZh
      ? element.dataset.i18nAriaLabelZh
      : element.dataset.i18nAriaLabelEn;

    if (value) {
      element.setAttribute("aria-label", value);
    }
  }

  for (const element of document.querySelectorAll("[data-i18n-alt-en]")) {
    const value = isZh ? element.dataset.i18nAltZh : element.dataset.i18nAltEn;

    if (value) {
      element.setAttribute("alt", value);
    }
  }

  for (const element of document.querySelectorAll("[data-i18n-content-en]")) {
    const value = isZh
      ? element.dataset.i18nContentZh
      : element.dataset.i18nContentEn;

    if (value) {
      element.setAttribute("content", value);
    }
  }
}
