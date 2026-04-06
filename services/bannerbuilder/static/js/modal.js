(() => {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <div class="modal-box">
      <button id="close-modal" type="button">✕</button>
      <h3>Your permanent Dashmap link</h3>
      <input id="dm-link" readonly>
      <button id="copy-btn" type="button">Copy</button>
    </div>
  `;
  document.body.append(overlay);

  const linkInput = overlay.querySelector("#dm-link");
  const copyBtn = overlay.querySelector("#copy-btn");
  const closeBtn = overlay.querySelector("#close-modal");

  async function attemptCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { }

    try {
      linkInput.select();
      document.execCommand("copy");
      return true;
    } catch (_) { return false; }
  }

  copyBtn.onclick = async () => {
    const ok = await attemptCopy(linkInput.value);
    copyBtn.textContent = ok ? "Copied!" : "Failed";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  };

  function close() { overlay.classList.remove("open"); }
  closeBtn.onclick = close;
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close();
  });

  window.showDashmapModal = url => {
    linkInput.value = url;
    overlay.classList.add("open");
    linkInput.focus();
    linkInput.select();
  };
})();
