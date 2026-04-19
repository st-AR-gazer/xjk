(() => {
  ["#history-toggle", "#history-drawer"].forEach((sel) =>
    document.querySelectorAll(sel).forEach((el) => el.remove())
  );

  const drawer = document.createElement("div");
  drawer.id = "history-drawer";
  document.body.append(drawer);

  const toggle = document.createElement("div");
  toggle.id = "history-toggle";
  toggle.innerHTML = "&#x1F5D3;";
  toggle.title = "History";
  document.body.append(toggle);

  toggle.onclick = () => {
    const open = drawer.classList.toggle("open");
    toggle.classList.toggle("open", open);
  };

  const previewImg = document.getElementById("preview-img");

  window.__addBannerHistory = (id, url) => {
    window.__latestBannerId = id;
    window.__selectedBannerId = id;

    const wrap = document.createElement("div");
    wrap.className = "ring-wrapper";

    const thumb = document.createElement("img");
    thumb.className = "history-thumb";
    thumb.src = url;
    thumb.alt = `Banner ${id}`;
    wrap.append(thumb);

    wrap.onclick = () => {
      previewImg.src = url;
      previewImg.classList.add("visible");

      window.__selectedBannerId = id;
      window.__setDownloadReady?.(true);
      window.__setDashmapReady?.(true);
    };

    drawer.prepend(wrap);
  };
})();
