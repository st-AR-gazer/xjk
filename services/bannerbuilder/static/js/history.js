(() => {
  const TOTAL = 600;
  const NS = "http://www.w3.org/2000/svg";

  ["#history-toggle", "#history-drawer"].forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove())
  );

  const drawer = document.createElement("div");
  drawer.id = "history-drawer";
  document.body.append(drawer);

  const toggle = document.createElement("div");
  toggle.id = "history-toggle";
  toggle.innerHTML = "&#x1F5D3;"; // 🗓
  toggle.title = "History";
  document.body.append(toggle);

  toggle.onclick = () => {
    const open = drawer.classList.toggle("open");
    toggle.classList.toggle("open", open);
  };

  function buildRing(wrapper) {
    const svg = document.createElementNS(NS, "svg");
    svg.classList.add("ring-svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "#2e87ff");
    rect.setAttribute("stroke-width", "2");
    rect.setAttribute("rx", "8");
    rect.setAttribute("ry", "8");
    rect.setAttribute("vector-effect", "non-scaling-stroke");

    svg.append(rect);

    const warn = document.createElement("div");
    warn.className = "expired-icon";
    warn.innerHTML = "&#9888;"; // ⚠
    wrapper.append(svg, warn);

    return rect;
  }

  const rings = [];
  let animating = false;

  function measure(entry) {
    const w = entry.wrapper.offsetWidth;
    const h = entry.wrapper.offsetHeight;
    if (w < 5 || h < 5) return false;

    entry.rect.setAttribute("x", 2);
    entry.rect.setAttribute("y", 2);
    entry.rect.setAttribute("width", w - 4);
    entry.rect.setAttribute("height", h - 4);

    entry.perim = 2 * (w - 4 + h - 4);
    entry.rect.style.strokeDasharray = entry.perim;
    return true;
  }

  function installRing(wrapper, expiresEpoch) {
    if (!wrapper.classList.contains("ring-wrapper"))
      wrapper.classList.add("ring-wrapper");

    let entry = rings.find(r => r.wrapper === wrapper);
    if (!entry) {
      const rect = buildRing(wrapper);
      entry = { wrapper, rect, perim: 0, expires: expiresEpoch, active: true };
      rings.push(entry);
    } else {
      wrapper.classList.remove("expired");
      entry.rect.style.display = "";
      entry.expires = expiresEpoch;
      entry.active = true;
    }

    if (!measure(entry)) {
      const ro = new ResizeObserver(() => {
        if (measure(entry)) ro.disconnect();
      });
      ro.observe(wrapper);
    }

    if (!animating) {
      animating = true;
      requestAnimationFrame(tick);
    }
  }

  function tick() {
    const now = Date.now() / 1000;
    let anyActive = false;

    for (const entry of rings) {
      if (!entry.active) continue;

      const left = entry.expires - now;
      if (left <= 0) {
        entry.active = false;
        entry.wrapper.classList.add("expired");
        entry.rect.style.display = "none";
        continue;
      }
      anyActive = true;
      const elapsed = TOTAL - left;
      entry.rect.style.strokeDashoffset = (elapsed / TOTAL) * entry.perim;
    }

    if (anyActive) requestAnimationFrame(tick);
    else animating = false;
  }

  const previewImg = document.getElementById("preview-img");
  const dashBtn = document.getElementById("dashmap-btn");

  const previewWrapper =
    previewImg.closest(".preview-wrapper") ||
    (() => {
      const w = document.createElement("div");
      w.className = "preview-wrapper ring-wrapper";
      previewImg.parentNode.insertBefore(w, previewImg);
      w.append(previewImg);
      return w;
    })();

  window.__addBannerHistory = (id, url, expiresEpoch) => {
    window.__latestBannerId = id;
    window.__selectedBannerId = id;

    const wrap = document.createElement("div");
    wrap.className = "ring-wrapper";

    const thumb = document.createElement("img");
    thumb.className = "history-thumb";
    thumb.src = url;
    wrap.append(thumb);

    wrap.onclick = () => {
      previewImg.src = url;
      previewImg.classList.add("visible");

      window.__selectedBannerId = id;
      window.__setDownloadReady?.(true);
      window.__setDashmapReady?.(true);

      const ringTarget = () => installRing(previewWrapper, expiresEpoch);
      previewImg.complete ? ringTarget()
        : previewImg.addEventListener("load", ringTarget, { once: true });
    };

    drawer.prepend(wrap);
    installRing(wrap, expiresEpoch);

    const ringTarget = () => installRing(previewWrapper, expiresEpoch);
    previewImg.complete ? ringTarget()
      : previewImg.addEventListener("load", ringTarget, { once: true });
  };
})();
