document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      document.getElementById(btn.dataset.target).classList.add("active");

      if (btn.dataset.target === "logs") loadLogs();
      if (btn.dataset.target === "abuse") initAbuse();
    };
  });

  async function loadLogs() {
    const box = document.getElementById("log-box");
    if (!box) return;
    box.textContent = "Loading…";
    const res = await fetch("logs");
    box.textContent = res.ok ? await res.text() : "Failed to load logs";
    box.scrollTop = box.scrollHeight;
  }

  const daysSlider = document.getElementById("abuse-days");
  const daysLabel = document.getElementById("abuse-days-label");
  const abuseBody = document.getElementById("abuse-tbody");

  function renderAbuse(rows) {
    abuseBody.innerHTML = "";
    if (!rows.length) {
      abuseBody.innerHTML = `<tr><td colspan="2" style="text-align:center">No data</td></tr>`;
      return;
    }
    for (const { ip, count } of rows) {
      abuseBody.insertAdjacentHTML("beforeend", `<tr><td>${ip}</td><td>${count}</td></tr>`);
    }
  }

  async function fetchAbuse(days) {
    abuseBody.innerHTML = `<tr><td colspan="2">Loading…</td></tr>`;
    const res = await fetch(`abuse?days=${days}`);
    const data = res.ok ? await res.json() : [];
    renderAbuse(data);
  }

  function initAbuse() {
    if (abuseBody?.dataset.ready) return;
    abuseBody.dataset.ready = "1";
    fetchAbuse(daysSlider.value);
  }

  if (daysSlider) {
    daysLabel.textContent = daysSlider.value;
    daysSlider.addEventListener("input", () => {
      daysLabel.textContent = daysSlider.value;
    });
    daysSlider.addEventListener("change", () => {
      fetchAbuse(daysSlider.value);
    });
  }

  const masterChk = document.getElementById("master-checkbox");
  const selCnt = document.getElementById("sel-count");

  function updateCounter() {
    const n = document.querySelectorAll(".card input:checked").length;
    selCnt.textContent = n ? `${n} selected` : "";
  }

  masterChk?.addEventListener("change", () => {
    document.querySelectorAll(".card input[type=checkbox]")
      .forEach(c => (c.checked = masterChk.checked));
    updateCounter();
  });

  document.addEventListener("click", e => {
    const card = e.target.closest(".card");
    if (!card) return;

    if (e.target.closest(".actions") ||
      e.target.closest("input") ||
      e.target.closest("a")) return;

    const chk = card.querySelector("input[type=checkbox]");
    chk.checked = !chk.checked;
    updateCounter();
    if (!chk.checked) masterChk.checked = false;
  });

  document.addEventListener("change", e => {
    if (e.target.matches(".card input[type=checkbox]")) {
      updateCounter();
      if (!e.target.checked) masterChk.checked = false;
    }
  });

  document.addEventListener("click", e => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;

    navigator.clipboard.writeText(btn.dataset.value || "").then(() => {
      const old = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => (btn.textContent = old), 1000);
    });
  });

  const delBtn = document.getElementById("delete-btn");
  delBtn?.addEventListener("click", e => {
    e.preventDefault();
    const picks = [...document.querySelectorAll(".card input:checked")];
    if (!picks.length) return alert("Select at least one banner.");

    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Delete ${picks.length} banner${picks.length > 1 ? "s" : ""}?</h3>
        <p>This action cannot be undone.</p>
        <div style="display:flex;justify-content:flex-end;gap:.6rem">
          <button id="cancel" class="btn btn-secondary">Cancel</button>
          <button id="confirm" class="btn btn-danger">Delete</button>
        </div>
      </div>`;
    document.body.append(overlay);
    overlay.classList.add("open");

    overlay.querySelector("#cancel").onclick = () => overlay.remove();
    overlay.querySelector("#confirm").onclick = () => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "delete";

      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "csrf_token";
      hidden.value = csrf;
      form.append(hidden);

      picks.forEach(chk =>
        form.insertAdjacentHTML("beforeend", `<input type="hidden" name="file" value="${chk.value}">`));
      document.body.append(form);
      form.submit();
    };
  });

});
