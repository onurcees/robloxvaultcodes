const SOCIAL_CODES_URLS = ["./social-codes.json", "./social-codes-lite.json", "social-codes.json"];
const DATA_VERSION = "20260303-6";
const PAGE_SIZE = 10;
const CONSENT_STORAGE_KEY = "cv_ad_consent_v1";
const DATA_CACHE_KEY = "cv_codes_lite_cache_v1";

const DEFAULT_SITE_CONFIG = {
  siteName: "Code Vault",
  siteUrl: "",
  adsenseClient: "",
  adsenseSlots: {
    top: "",
    middle: ""
  }
};

function runtimeFallbackSiteUrl() {
  if (typeof window === "undefined") {
    return "https://your-domain.com";
  }

  const isHttp = /^https?:$/i.test(window.location.protocol);
  if (!isHttp) {
    return "https://your-domain.com";
  }

  const pathBase = window.location.pathname.replace(/[^/]*$/, "");
  return `${window.location.origin}${pathBase}`.replace(/\/$/, "") || window.location.origin;
}

function normalizeSiteUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) {
    return runtimeFallbackSiteUrl();
  }

  try {
    const parsed = new URL(input);
    return parsed.toString().replace(/\/$/, "");
  } catch (error) {
    return runtimeFallbackSiteUrl();
  }
}

function resolveSiteConfig() {
  const external = window.SITE_CONFIG && typeof window.SITE_CONFIG === "object" ? window.SITE_CONFIG : {};
  return {
    ...DEFAULT_SITE_CONFIG,
    ...external,
    siteUrl: normalizeSiteUrl(external.siteUrl),
    adsenseClient: String(external.adsenseClient || "").trim(),
    adsenseSlots: {
      ...DEFAULT_SITE_CONFIG.adsenseSlots,
      ...(external.adsenseSlots || {})
    }
  };
}

const SITE_CONFIG = resolveSiteConfig();

const tableBody = document.getElementById("code-table-body");
const tableSummary = document.getElementById("table-summary");
const tableCount = document.getElementById("table-count");
const loadMoreBtn = document.getElementById("load-more-btn");
const adminForm = document.getElementById("admin-form");
const adminNote = document.getElementById("admin-note");
const heading = document.getElementById("main-heading");
const heroDescription = document.getElementById("hero-description");
const heroMeta = document.getElementById("hero-meta");
const faqJsonLd = document.getElementById("faq-jsonld");
const siteJsonLd = document.getElementById("site-jsonld");
const canonicalLink = document.getElementById("canonical-link");
const hreflangLinks = [...document.querySelectorAll("link[rel='alternate'][hreflang]")];
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mobileNav = document.getElementById("mobile-nav");
const mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");
const copyToast = document.getElementById("copy-toast");

const consentBanner = document.getElementById("consent-banner");
const consentMessage = document.getElementById("consent-message");
const consentAcceptBtn = document.getElementById("consent-accept");
const consentRejectBtn = document.getElementById("consent-reject");

const adCards = [...document.querySelectorAll("[data-ad-card]")];
const adUnits = [...document.querySelectorAll(".ad-unit")];

const state = {
  gameName: "Tüm Oyunlar",
  monthYear: "March 2026",
  rows: [],
  visible: 0
};

// Başlangıç verisi: uzaktan veri gelmezse tablo boş kalmasın.
const seedRows = [
  { code: "SEABEAST2026", reward: "20 dk x2 Deneyim", status: "active", game: "Blox Fruits", source: "" },
  { code: "UNITWAVE", reward: "5000 Gem", status: "active", game: "Anime Defenders", source: "" },
  { code: "CLUTCHSPIN", reward: "3 Spin", status: "active", game: "Blade Ball", source: "" },
  { code: "SHADOWDROP", reward: "Sınırlı kozmetik ödülü", status: "expired", game: "Murder Mystery 2", source: "" }
];

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timer);
  });
}

function titleCaseWords(input) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeGameName(rawName) {
  const normalized = String(rawName || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "Tüm Oyunlar";
}

function isAllGames(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "tüm oyunlar" || normalized === "tum oyunlar" || normalized === "all games" || normalized === "all";
}

function currentMonthYearEn() {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
}

function normalizeStatus(statusValue) {
  return String(statusValue || "").toLowerCase() === "active" ? "active" : "expired";
}

function statusLabel(statusValue) {
  return normalizeStatus(statusValue) === "active" ? "Aktif" : "Geçersiz";
}

function inferReward(item, status) {
  if (item.reward && String(item.reward).trim()) {
    return String(item.reward).trim();
  }
  if (item.type && item.type !== "Community Code") {
    return String(item.type).trim();
  }
  return status === "active" ? "Oyunda açıklanan ödül" : "Süresi geçmiş";
}

function codeKey(item) {
  return String(item.code || "").trim().toUpperCase();
}

function rowKey(item) {
  return `${String(item.game || "").trim().toLowerCase()}::${codeKey(item)}`;
}

function normalizeExternalRows(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const status = normalizeStatus(item.status);
      return {
        code: codeKey(item),
        reward: inferReward(item, status),
        status,
        game: String(item.game || "").trim(),
        source: String(item.source || "").trim()
      };
    })
    .filter((item) => item.code.length >= 3);
}

// Aynı kod tekrar ederse aktif olan kaydı koru.
function mergeRows(list) {
  const map = new Map();
  for (const row of list) {
    const key = rowKey(row);
    if (!map.has(key)) {
      map.set(key, row);
      continue;
    }

    const existing = map.get(key);
    if (existing.status === "expired" && row.status === "active") {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function sortRows(list) {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }
    return a.code.localeCompare(b.code);
  });
}

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildCanonicalUrl() {
  const base = ensureTrailingSlash(SITE_CONFIG.siteUrl);
  const canonical = new URL(base);
  if (!isAllGames(state.gameName)) {
    canonical.searchParams.set("oyun", state.gameName);
  }
  return canonical.toString();
}

function buildAssetUrl(relativePath) {
  const cleanPath = String(relativePath || "").replace(/^\.?\//, "");
  return new URL(cleanPath, ensureTrailingSlash(SITE_CONFIG.siteUrl)).toString();
}

function setMetaContent(selector, content) {
  const meta = document.querySelector(selector);
  if (meta) {
    meta.setAttribute("content", content);
  }
}

function buildHeadingText() {
  if (isAllGames(state.gameName)) {
    return `Roblox Vault Codes - Working Promo Codes ${state.monthYear}`;
  }
  return `Roblox ${state.gameName} Codes - Working Promo Codes ${state.monthYear}`;
}

// Başlık ve meta açıklamayı oyun adına göre dinamik günceller.
function updateSeo() {
  const headingText = buildHeadingText();
  const description = "Find the latest working and free Roblox promo codes in one place. Copy codes instantly and track active/expired status.";

  heading.textContent = headingText;
  heroDescription.textContent = "Latest working Roblox promo codes with one-click copy, clear status labels, and fast updates.";
  document.title = `${headingText} | ${SITE_CONFIG.siteName}`;

  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', `${headingText} | ${SITE_CONFIG.siteName}`);
  setMetaContent('meta[property="og:description"]', "En güncel, çalışan ve bedava Roblox promo kodları burada.");
  setMetaContent('meta[name="twitter:title"]', `${headingText} | ${SITE_CONFIG.siteName}`);
  setMetaContent('meta[name="twitter:description"]', "En güncel, çalışan ve bedava Roblox promo kodları burada.");

  const canonical = buildCanonicalUrl();
  const ogImage = buildAssetUrl("assets/roblox-codes-banner.svg");

  if (canonicalLink) {
    canonicalLink.setAttribute("href", canonical);
  }
  for (const link of hreflangLinks) {
    link.setAttribute("href", canonical);
  }

  setMetaContent('meta[property="og:url"]', canonical);
  setMetaContent('meta[property="og:image"]', ogImage);
  setMetaContent('meta[name="twitter:image"]', ogImage);
}

// SERP'te FAQ rich result alınması için JSON-LD oluşturur.
function updateFaqSchema() {
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `${state.gameName} kodları nasıl kullanılır?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Oyuna girip kod ekranını açın, tablodan kopyaladığınız kodu yapıştırıp onaylayın."
        }
      },
      {
        "@type": "Question",
        name: "Kodların aktiflik durumu neye göre değişir?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Kodlar oyunun geliştiricisi tarafından açılır veya kapatılır. Durum kolonu aktif ya da geçersiz olarak gösterilir."
        }
      },
      {
        "@type": "Question",
        name: "Kopyala butonu ne işe yarar?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Kopyala butonu kodu tek tıkla panoya alır ve manuel seçim ihtiyacını kaldırır."
        }
      }
    ]
  };
  faqJsonLd.textContent = JSON.stringify(faqData);
}

function updateSiteSchema() {
  if (!siteJsonLd) {
    return;
  }

  const logoUrl = buildAssetUrl("assets/roblox-codes-banner.svg");
  const siteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE_CONFIG.siteName,
        url: ensureTrailingSlash(SITE_CONFIG.siteUrl),
        logo: logoUrl
      },
      {
        "@type": "WebSite",
        name: SITE_CONFIG.siteName,
        url: ensureTrailingSlash(SITE_CONFIG.siteUrl),
        inLanguage: "tr-TR"
      }
    ]
  };

  siteJsonLd.textContent = JSON.stringify(siteSchema);
}

function updateAdsenseMeta() {
  const meta = document.querySelector('meta[name="google-adsense-account"]');
  if (!meta) {
    return;
  }

  if (isValidAdsenseClient(SITE_CONFIG.adsenseClient)) {
    meta.setAttribute("content", SITE_CONFIG.adsenseClient);
  } else {
    meta.setAttribute("content", "");
  }
}

// Tablo satırını semantik hücrelerle üretir.
function renderRow(item) {
  const tr = document.createElement("tr");

  const codeTd = document.createElement("td");
  codeTd.dataset.label = "Kod";
  const codeWrap = document.createElement("div");
  codeWrap.className = "code-cell";

  const codeValue = document.createElement("span");
  codeValue.className = "code-value";
  codeValue.textContent = item.code;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "copy-btn";
  copyBtn.dataset.code = item.code;
  copyBtn.textContent = "Kopyala";

  codeWrap.appendChild(codeValue);
  codeWrap.appendChild(copyBtn);
  codeTd.appendChild(codeWrap);

  const rewardTd = document.createElement("td");
  rewardTd.dataset.label = "Ödül";
  rewardTd.textContent = item.reward;

  if (item.game) {
    const gameLine = document.createElement("div");
    gameLine.className = "row-source";
    gameLine.textContent = `Oyun: ${item.game}`;
    rewardTd.appendChild(gameLine);
  }

  if (item.source) {
    const sourceLine = document.createElement("div");
    sourceLine.className = "row-source";

    const sourceAnchor = document.createElement("a");
    sourceAnchor.href = item.source;
    sourceAnchor.target = "_blank";
    sourceAnchor.rel = "noopener noreferrer";
    sourceAnchor.textContent = "Kaynak";

    sourceLine.appendChild(sourceAnchor);
    rewardTd.appendChild(sourceLine);
  }

  const statusTd = document.createElement("td");
  statusTd.dataset.label = "Durum";
  const statusChip = document.createElement("span");
  statusChip.className = `status-chip ${item.status === "active" ? "status-active" : "status-expired"}`;
  statusChip.textContent = statusLabel(item.status);
  statusTd.appendChild(statusChip);

  tr.appendChild(codeTd);
  tr.appendChild(rewardTd);
  tr.appendChild(statusTd);
  return tr;
}

function updateTableHeaderInfo() {
  const total = state.rows.length;
  const active = state.rows.filter((row) => row.status === "active").length;
  if (isAllGames(state.gameName)) {
    tableSummary.textContent = `Tüm oyunlarda ${active} aktif kod bulundu.`;
  } else {
    tableSummary.textContent = `${state.gameName} için ${active} aktif kod bulundu.`;
  }
  tableCount.textContent = `${state.visible} / ${total} kod`;
}

function renderNextPage(reset = false) {
  if (reset) {
    state.visible = 0;
    tableBody.innerHTML = "";
  }

  const target = Math.min(state.visible + PAGE_SIZE, state.rows.length);
  for (let i = state.visible; i < target; i += 1) {
    tableBody.appendChild(renderRow(state.rows[i]));
  }
  state.visible = target;

  if (state.rows.length === 0) {
    tableBody.innerHTML = "<tr><td colspan=\"3\">Bu oyun için kod bulunamadı.</td></tr>";
  }

  updateTableHeaderInfo();
  loadMoreBtn.classList.toggle("hidden", state.visible >= state.rows.length);
}

async function copyToClipboard(value, button) {
  let ok = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch (error) {
      ok = false;
    }
  }

  if (!ok) {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    ok = document.execCommand("copy");
    document.body.removeChild(area);
  }

  button.textContent = ok ? "Kopyalandı!" : "Başarısız";
  if (ok && copyToast) {
    copyToast.classList.remove("hidden");
    setTimeout(() => {
      copyToast.classList.add("hidden");
    }, 900);
  }
  setTimeout(() => {
    button.textContent = "Kopyala";
  }, 1100);
}

async function loadRemoteCodes() {
  let cachedRows = [];
  try {
    const cacheRaw = localStorage.getItem(DATA_CACHE_KEY);
    if (cacheRaw) {
      const cacheData = JSON.parse(cacheRaw);
      if (cacheData && cacheData.version === DATA_VERSION && Array.isArray(cacheData.rows)) {
        cachedRows = normalizeExternalRows(cacheData.rows);
      }
    }
  } catch (error) {
    cachedRows = [];
  }

  if (cachedRows.length > 0) {
    return cachedRows;
  }

  for (const sourceUrl of SOCIAL_CODES_URLS) {
    try {
      const response = await fetchWithTimeout(`${sourceUrl}?v=${DATA_VERSION}`, { cache: "force-cache" });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const rows = normalizeExternalRows(payload);
      if (rows.length === 0) {
        continue;
      }

      try {
        localStorage.setItem(
          DATA_CACHE_KEY,
          JSON.stringify({
            version: DATA_VERSION,
            rows
          })
        );
      } catch (error) {
        // no-op
      }

      return rows;
    } catch (error) {
      // try next source
    }
  }

  return cachedRows;
}

function filterByGame(rows) {
  if (isAllGames(state.gameName)) {
    return rows;
  }

  const lookup = state.gameName.toLowerCase();
  const exact = rows.filter((row) => row.game.toLowerCase() === lookup);
  if (exact.length > 0) {
    return exact;
  }
  const partial = rows.filter((row) => row.game.toLowerCase().includes(lookup));
  if (partial.length > 0) {
    return partial;
  }
  return rows.filter((row) => row.status === "active");
}

function isValidAdsenseClient(value) {
  return /^ca-pub-\d{16}$/.test(String(value || ""));
}

function isValidAdsenseSlot(value) {
  return /^\d{10}$/.test(String(value || ""));
}

function setAdCardMessage(card, message) {
  const note = card.querySelector(".ad-note");
  if (note) {
    note.textContent = message;
  }
}

function hideAllAdCards(message) {
  for (const card of adCards) {
    card.classList.add("ad-hidden");
    setAdCardMessage(card, message);
  }
}

function prepareAdSlots() {
  if (!isValidAdsenseClient(SITE_CONFIG.adsenseClient)) {
    hideAllAdCards("AdSense client ID girilmedi.");
    return 0;
  }

  let readyCount = 0;
  for (const unit of adUnits) {
    const slotKey = String(unit.dataset.slotKey || "");
    const slotValue = SITE_CONFIG.adsenseSlots[slotKey];
    const card = unit.closest("[data-ad-card]");

    if (!card || !isValidAdsenseSlot(slotValue)) {
      if (card) {
        card.classList.add("ad-hidden");
        setAdCardMessage(card, `Ad slot ayarı eksik: ${slotKey || "bilinmiyor"}`);
      }
      continue;
    }

    unit.setAttribute("data-ad-client", SITE_CONFIG.adsenseClient);
    unit.setAttribute("data-ad-slot", slotValue);
    card.classList.remove("ad-hidden");
    setAdCardMessage(card, "Sponsorlu içerik");
    readyCount += 1;
  }

  return readyCount;
}

function loadAdsenseScript(client) {
  const existing = document.querySelector("script[data-role='adsense-loader']");
  if (existing) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.crossOrigin = "anonymous";
    script.dataset.role = "adsense-loader";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function renderAds() {
  if (!Array.isArray(window.adsbygoogle)) {
    window.adsbygoogle = [];
  }

  for (const unit of adUnits) {
    const card = unit.closest("[data-ad-card]");
    const alreadyRendered = unit.dataset.rendered === "1";
    const hasSlot = Boolean(unit.dataset.adSlot);

    if (!card || card.classList.contains("ad-hidden") || alreadyRendered || !hasSlot) {
      continue;
    }

    try {
      window.adsbygoogle.push({});
      unit.dataset.rendered = "1";
    } catch (error) {
      setAdCardMessage(card, "Reklam şu anda yüklenemedi.");
    }
  }
}

async function activateAds() {
  const slotCount = prepareAdSlots();
  if (slotCount === 0) {
    return;
  }

  const loaded = await loadAdsenseScript(SITE_CONFIG.adsenseClient);
  if (!loaded) {
    hideAllAdCards("AdSense script yüklenemedi.");
    return;
  }

  renderAds();
}

function getStoredConsent() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function setStoredConsent(value) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch (error) {
    // no-op
  }
}

function setConsentBannerVisible(visible) {
  if (!consentBanner) {
    return;
  }
  consentBanner.classList.toggle("hidden", !visible);
}

function applyConsentState(consent) {
  if (!isValidAdsenseClient(SITE_CONFIG.adsenseClient)) {
    setConsentBannerVisible(false);
    hideAllAdCards("AdSense client ID tanımlanmadı.");
    return;
  }

  if (consent === "accepted") {
    setConsentBannerVisible(false);
    activateAds();
    return;
  }

  if (consent === "rejected") {
    setConsentBannerVisible(false);
    hideAllAdCards("Reklam çerezi reddedildi.");
    return;
  }

  if (consentMessage) {
    consentMessage.textContent = "Reklamların gösterilmesi için çerez onayı gerekiyor. Onay verirsen AdSense reklamları yüklenir.";
  }
  hideAllAdCards("Reklamlar onay bekliyor.");
  setConsentBannerVisible(true);
}

function setMobileMenuOpen(openState) {
  if (!mobileNav || !mobileNavBackdrop || !mobileMenuToggle) {
    return;
  }

  const open = Boolean(openState);
  mobileNav.classList.toggle("hidden", !open);
  mobileNavBackdrop.classList.toggle("hidden", !open);
  mobileMenuToggle.setAttribute("aria-expanded", String(open));
  mobileMenuToggle.setAttribute("aria-label", open ? "Menüyü Kapat" : "Menüyü Aç");
  document.body.classList.toggle("menu-open", open);
}

function attachEvents() {
  if (mobileMenuToggle && mobileNav && mobileNavBackdrop) {
    mobileMenuToggle.addEventListener("click", () => {
      const shouldOpen = mobileNav.classList.contains("hidden");
      setMobileMenuOpen(shouldOpen);
    });

    mobileNavBackdrop.addEventListener("click", () => {
      setMobileMenuOpen(false);
    });

    mobileNav.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        setMobileMenuOpen(false);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) {
        setMobileMenuOpen(false);
      }
    });
  }

  tableBody.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.dataset.code) {
      copyToClipboard(target.dataset.code, target);
    }
  });

  loadMoreBtn.addEventListener("click", () => {
    renderNextPage(false);
  });

  if (adminForm) {
    adminForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const code = codeKey({ code: document.getElementById("admin-code").value });
      const reward = String(document.getElementById("admin-reward").value || "").trim();
      const status = normalizeStatus(document.getElementById("admin-status").value);

      if (code.length < 3 || reward.length < 2) {
        adminNote.textContent = "Kod ve ödül alanları zorunludur.";
        return;
      }

      state.rows = sortRows(
        mergeRows([
          { code, reward, status, game: state.gameName, source: "" },
          ...state.rows
        ])
      );

      adminForm.reset();
      adminNote.textContent = `${code} kodu tabloya eklendi.`;
      renderNextPage(true);
    });
  }

  if (consentAcceptBtn) {
    consentAcceptBtn.addEventListener("click", () => {
      setStoredConsent("accepted");
      applyConsentState("accepted");
    });
  }

  if (consentRejectBtn) {
    consentRejectBtn.addEventListener("click", () => {
      setStoredConsent("rejected");
      applyConsentState("rejected");
    });
  }

  setMobileMenuOpen(false);
}

// Açılış akışı: query param -> SEO -> veri yükleme -> ilk render.
async function init() {
  const params = new URLSearchParams(window.location.search);
  const gameQuery = params.get("oyun") || params.get("game");
  state.gameName = sanitizeGameName(gameQuery || "Tüm Oyunlar");
  state.monthYear = currentMonthYearEn();

  updateSeo();
  updateFaqSchema();
  updateSiteSchema();
  updateAdsenseMeta();
  tableSummary.textContent = "Searching latest codes...";

  const isFileProtocol = window.location.protocol === "file:";
  const remoteRows = isFileProtocol ? [] : await loadRemoteCodes();
  const sourceRows = remoteRows.length > 0 ? remoteRows : seedRows;
  const combined = mergeRows(filterByGame(sourceRows));
  state.rows = sortRows(combined);

  const activeCount = state.rows.filter((row) => row.status === "active").length;
  if (isFileProtocol) {
    heroMeta.textContent = "file:// kullanımında veri dosyası engellenir. Siteyi localhost veya canlı domain üzerinden aç.";
  } else if (remoteRows.length > 0) {
    heroMeta.textContent = `Kaynak: ${remoteRows.length.toLocaleString("tr-TR")} kayıt yüklendi. Aktif: ${activeCount.toLocaleString("tr-TR")}.`;
  } else {
    heroMeta.textContent = "Uzak veri yüklenemedi, geçici örnek kodlar gösteriliyor.";
  }

  renderNextPage(true);
  attachEvents();
  applyConsentState(getStoredConsent());
}

init();







