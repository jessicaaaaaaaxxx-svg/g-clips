const HTML_LANG_MAP = { zh: "zh-CN", en: "en", id: "id", ms: "ms" };
const SUPPORTED_LANGS = ["zh", "en", "id", "ms"];
const CURRENCY_CONFIG = {
  zh: { symbol: "¥", rate: 1, locale: "zh-CN" },
  en: { symbol: "$", rate: 0.139, locale: "en-US" },
  id: { symbol: "Rp", rate: 2230, locale: "id-ID" },
  ms: { symbol: "RM", rate: 0.655, locale: "ms-MY" },
};
let activeLang = "zh";

function getStoredLang() {
  try {
    return localStorage.getItem("gclips-lang");
  } catch (error) {
    return null;
  }
}

function storeLang(lang) {
  try {
    localStorage.setItem("gclips-lang", lang);
  } catch (error) {
    /* localStorage unavailable (e.g. privacy mode) — ignore */
  }
}

function detectInitialLang() {
  const stored = getStoredLang();
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const browserLang = (navigator.language || "en").toLowerCase();
  if (browserLang.startsWith("zh")) return "zh";
  if (browserLang.startsWith("id")) return "id";
  if (browserLang.startsWith("ms")) return "ms";
  return "en";
}

function applyLanguage(lang) {
  const dict = window.translations[lang];
  if (!dict) return;
  activeLang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (dict[key] !== undefined) el.setAttribute("aria-label", dict[key]);
  });

  if (dict["meta.title"]) document.title = dict["meta.title"];
  const metaDescription = document.getElementById("meta-description");
  if (metaDescription && dict["meta.description"]) {
    metaDescription.setAttribute("content", dict["meta.description"]);
  }

  document.documentElement.setAttribute("lang", HTML_LANG_MAP[lang] || lang);

  document.querySelectorAll(".lang-current").forEach((el) => {
    el.textContent = window.LANG_NAMES[lang] || lang;
  });
  document.querySelectorAll(".lang-menu li").forEach((li) => {
    li.setAttribute("aria-selected", String(li.getAttribute("data-lang") === lang));
  });
  document.querySelectorAll(".mobile-lang button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === lang));
  });

  storeLang(lang);
  updateEstimator();
}

const currentLang = detectInitialLang();
applyLanguage(currentLang);

const langSwitcher = document.querySelector(".lang-switcher");
const langButton = document.querySelector(".lang-button");
const langMenu = document.querySelector(".lang-menu");

if (langSwitcher && langButton && langMenu) {
  langButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = langSwitcher.classList.toggle("open");
    langButton.setAttribute("aria-expanded", String(isOpen));
  });

  langMenu.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      applyLanguage(li.getAttribute("data-lang"));
      langSwitcher.classList.remove("open");
      langButton.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (event) => {
    if (!langSwitcher.contains(event.target)) {
      langSwitcher.classList.remove("open");
      langButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      langSwitcher.classList.remove("open");
      langButton.setAttribute("aria-expanded", "false");
    }
  });
}

document.querySelectorAll(".mobile-lang button").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyLanguage(btn.getAttribute("data-lang"));
  });
});

const menuButton = document.querySelector(".menu-button");
const mobileMenu = document.querySelector(".mobile-menu");

menuButton.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  mobileMenu.setAttribute("aria-hidden", String(!isOpen));
});

mobileMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    mobileMenu.setAttribute("aria-hidden", "true");
  });
});

document.querySelectorAll(".faq-list details").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    document.querySelectorAll(".faq-list details").forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

function formatCompact(num, lang) {
  if (lang === "zh") {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(num % 100000000 === 0 ? 0 : 1) + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(num % 10000 === 0 ? 0 : 1) + "万";
    }
    return String(Math.round(num));
  }
  if (num >= 1000000) return (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + "K";
  return String(Math.round(num));
}

function updateEstimator() {
  const slider = document.getElementById("estimatorSlider");
  if (!slider) return;

  const views = Number(slider.value);
  const min = Number(slider.min);
  const max = Number(slider.max);
  const cfg = CURRENCY_CONFIG[activeLang] || CURRENCY_CONFIG.zh;

  const earningsInCny = views * 0.0025;
  const earningsLocal = earningsInCny * cfg.rate;
  const engagement = views * 0.065;

  const viewsLabel = document.getElementById("estimatorViewsLabel");
  const earningsEl = document.getElementById("estimatorEarnings");
  const engagementEl = document.getElementById("estimatorEngagement");

  if (viewsLabel) viewsLabel.textContent = new Intl.NumberFormat(cfg.locale).format(views);
  if (earningsEl) {
    const maximumFractionDigits = earningsLocal < 1000 ? 2 : 0;
    const formattedAmount = new Intl.NumberFormat(cfg.locale, { maximumFractionDigits }).format(earningsLocal);
    earningsEl.textContent = `${cfg.symbol} ${formattedAmount}`;
  }
  if (engagementEl) engagementEl.textContent = formatCompact(engagement, activeLang);

  const percent = ((views - min) / (max - min)) * 100;
  slider.style.setProperty("--fill", `${percent}%`);
}

const estimatorSlider = document.getElementById("estimatorSlider");
if (estimatorSlider) {
  estimatorSlider.addEventListener("input", updateEstimator);
  updateEstimator();
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
