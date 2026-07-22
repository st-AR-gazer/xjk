const alteredHubUrl = window.__alteredUrl || ((value) => value);

async function configureLocalLinks() {
  const xjkSite = window.XjkSite || (await import("/shared/xjk-core/site-runtime.js")).XjkSite;
  xjkSite.applySiteDataLinks(document, { location: window.location });
}

function initScrollReveal() {
  const reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  reveals.forEach((el) => observer.observe(el));
}

/* ── Site Nav Bar ── */

function initSiteNav() {
  const nav = document.getElementById("site-nav");
  if (!nav) return;

  const hero = document.querySelector(".hero-section");
  if (!hero) {
    nav.classList.add("site-nav--solid");
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      nav.classList.toggle("site-nav--solid", !entry.isIntersecting);
    },
    { threshold: 0, rootMargin: "-48px 0px 0px 0px" }
  );
  observer.observe(hero);
}

function initMobileNav() {
  const nav = document.getElementById("site-nav");
  const toggle = document.getElementById("site-nav-toggle");
  if (!nav || !toggle) return;

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-menu-open");
    if (!open) {
      const dropdown = document.getElementById("season-dropdown");
      if (dropdown) {
        dropdown.classList.remove("is-open");
        const trigger = dropdown.querySelector(".site-nav-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    }
  });
}

function initSeasonDropdown() {
  const dropdown = document.getElementById("season-dropdown");
  const trigger = dropdown?.querySelector(".site-nav-trigger");
  if (!dropdown || !trigger) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

/* ── Dynamic Seasons ── */

const SEASON_ORDER = ["winter", "spring", "summer", "fall"];
const SEASON_BG = {
  winter: alteredHubUrl("/bannerbuilder/assets/backgrounds/Winter.png"),
  spring: alteredHubUrl("/bannerbuilder/assets/backgrounds/Spring.png"),
  summer: alteredHubUrl("/bannerbuilder/assets/backgrounds/Summer.png"),
  fall: alteredHubUrl("/bannerbuilder/assets/backgrounds/Fall.png"),
};

const NONSTANDARD_SEASONS = [
  { key: "training", label: "Training", test: (n) => n.startsWith("training") },
  { key: "snow-discovery", label: "Snow Discovery", test: (n) => n.startsWith("snow") },
  { key: "rally-discovery", label: "Rally Discovery", test: (n) => n.startsWith("rally") },
  { key: "desert-discovery", label: "Desert Discovery", test: (n) => n.startsWith("desert") },
  { key: "stunt-discovery", label: "Stunt Discovery", test: (n) => n.startsWith("stunt") },
  { key: "platform-discovery", label: "Platform Discovery", test: (n) => n.startsWith("platform") },
];

let _seasonDataPromise = null;

function fetchSeasonData() {
  if (_seasonDataPromise) return _seasonDataPromise;
  _seasonDataPromise = fetch(alteredHubUrl("/api/v1/alterations/campaigns?limit=5000&offset=0&catalog_only=1"))
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
      const pairs = new Map();
      const foundNonstandard = new Set();

      for (const c of campaigns) {
        const name = String(c.name || "").toLowerCase();
        const apiSeason = String(c.season || "").toLowerCase();
        const apiSeasonYear = Number(c.season_year || 0) || null;

        if (SEASON_ORDER.includes(apiSeason)) {
          const yearMatch = name.match(/(\d{4})/);
          const year = apiSeasonYear || (yearMatch ? Number(yearMatch[1]) : 0);
          if (!year) continue;
          if (apiSeason === "winter" && year === 2020) continue;
          const key = `${apiSeason}-${year}`;
          if (!pairs.has(key)) {
            pairs.set(key, {
              season: apiSeason,
              year,
              label: `${apiSeason.charAt(0).toUpperCase() + apiSeason.slice(1)} ${year}`,
              key,
            });
          }
          continue;
        }

        for (const ns of NONSTANDARD_SEASONS) {
          if (!foundNonstandard.has(ns.key) && ns.test(name)) {
            foundNonstandard.add(ns.key);
            pairs.set(ns.key, {
              season: ns.key,
              year: null,
              label: ns.label,
              key: ns.key,
              nonstandard: true,
            });
            break;
          }
        }
      }

      const sorted = [...pairs.values()].sort((a, b) => {
        if (a.nonstandard && !b.nonstandard) return 1;
        if (!a.nonstandard && b.nonstandard) return -1;
        if (a.nonstandard && b.nonstandard) {
          return (
            NONSTANDARD_SEASONS.findIndex((ns) => ns.key === a.key) -
            NONSTANDARD_SEASONS.findIndex((ns) => ns.key === b.key)
          );
        }
        if (a.year !== b.year) return b.year - a.year;
        return SEASON_ORDER.indexOf(b.season) - SEASON_ORDER.indexOf(a.season);
      });
      return sorted;
    })
    .catch(() => []);
  return _seasonDataPromise;
}

async function populateSeasonNav() {
  const panel = document.getElementById("season-nav-panel");
  if (!panel) return;

  const sorted = await fetchSeasonData();
  if (!sorted.length) {
    globalThis.XjkSafeHtml.set(panel, '<div class="site-nav-panel-loading">No seasons found</div>');
    return;
  }

  const standard = sorted.filter((s) => !s.nonstandard);
  const nonstandard = sorted.filter((s) => s.nonstandard);

  const byYear = new Map();
  for (const item of standard) {
    if (!byYear.has(item.year)) byYear.set(item.year, []);
    byYear.get(item.year).push(item);
  }

  let html = "";
  for (const [year, items] of byYear) {
    items.sort((a, b) => SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season));
    html += `<div class="season-nav-year">
      <span class="season-nav-year-label">${year}</span>
      <div class="season-nav-year-items">
        ${items.map((i) => `<a class="season-nav-item" href="${alteredHubUrl(`/season/?s=${i.key}`)}">${i.label}</a>`).join("")}
      </div>
    </div>`;
  }

  if (nonstandard.length) {
    html += `<div class="season-nav-year">
      <span class="season-nav-year-label">Other</span>
      <div class="season-nav-year-items">
        ${nonstandard.map((i) => `<a class="season-nav-item" href="${alteredHubUrl(`/season/?s=${i.key}`)}">${i.label}</a>`).join("")}
      </div>
    </div>`;
  }

  globalThis.XjkSafeHtml.set(panel, html);
}

async function populateSeasonRibbon() {
  const ribbon = document.getElementById("season-ribbon");
  if (!ribbon) return;

  const sorted = await fetchSeasonData();
  const standard = sorted.filter((s) => !s.nonstandard);
  if (!standard.length) return;

  const recent = standard.slice(0, 4);
  globalThis.XjkSafeHtml.set(
    ribbon,
    recent
      .map((item) => {
        const bg = SEASON_BG[item.season] || SEASON_BG.winter;
        return `<a href="${alteredHubUrl(`/season/?s=${item.key}`)}" class="ribbon-panel">
        <img src="${bg}" alt="" />
        <span class="ribbon-label">${item.label}</span>
      </a>`;
      })
      .join("")
  );
}

async function populateCurrentSeasonCard() {
  const card = document.getElementById("nav-hub-season");
  const title = document.getElementById("nav-hub-season-title");
  if (!card || !title) return;

  const sorted = await fetchSeasonData();
  const latest = sorted.find((s) => !s.nonstandard);
  if (!latest) return;

  card.href = alteredHubUrl(`/season/?s=${latest.key}`);
  title.textContent = latest.label;
}

async function bootAlteredHub() {
  await import("/shared/xjk-core/safe-html.js?v=2");
  window.__rewriteAlteredUrls?.();
  initScrollReveal();
  initSiteNav();
  initMobileNav();
  initSeasonDropdown();

  await Promise.all([configureLocalLinks(), populateSeasonNav(), populateSeasonRibbon(), populateCurrentSeasonCard()]);
}

void bootAlteredHub().catch((error) => {
  console.error("Failed to initialize the Altered hub.", error);
});
