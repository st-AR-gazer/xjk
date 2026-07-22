import "../../../shared/xjk-core/safe-html.js?v=2";
import {
  createAdminPage,
  fetchAdminAccounts,
  fetchAdminAudit,
  fetchAdminContentList,
  fetchAdminPage,
  fetchAdminSession,
  fetchAdminSuggestions,
  saveAdminAccount,
  saveAdminPage,
} from "./admin-api.js";
import { renderLearnMarkdown } from "./learn-markdown.js";
import { loginToNadeoProfile } from "./nadeo-profile.js";
import { escapeHtml, renderIcon, slugToHash } from "./utils.js";

const ROLES = ["owner", "admin", "editor", "viewer"];
const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function renderAdminView({ root, state, showToast }) {
  if (!root) return () => {};
  const model = {
    session: null,
    pages: [],
    accounts: [],
    audit: [],
    suggestions: [],
    selectedSlug: state.activeSlug || state.manifest?.defaultSlug || "",
    page: null,
    markdown: "",
    activeTab: "content",
    loading: true,
  };

  globalThis.XjkSafeHtml.set(
    root,
    `<div class="learn-workspace learn-single-workspace">
    <div class="learn-page-scaffold learn-admin" data-admin-root>
      <div class="learn-page-head">
        <div>
          <p class="learn-eyebrow">Admin</p>
          <h1 class="learn-page-title">Learn control room</h1>
          <p class="learn-page-subtitle">Nadeo-backed accounts, roles, and markdown editing for Learn content.</p>
        </div>
        <div class="learn-card-actions">
          <button class="learn-button" data-admin-action="refresh" type="button">${renderIcon("reset")} Refresh</button>
          <button class="learn-button" data-admin-action="reload-learn" type="button">${renderIcon("map")} Reload Learn</button>
        </div>
      </div>
      <div data-admin-body>${renderLoading()}</div>
    </div>
  </div>`
  );

  const adminRoot = root.querySelector("[data-admin-root]");
  const body = root.querySelector("[data-admin-body]");

  function toast(message) {
    if (typeof showToast === "function") showToast(message);
  }

  function update() {
    if (!body) return;
    if (model.loading) {
      globalThis.XjkSafeHtml.set(body, renderLoading());
      return;
    }
    if (model.error) {
      globalThis.XjkSafeHtml.set(body, renderError(model.error));
      return;
    }
    if (!model.session?.authenticated) {
      globalThis.XjkSafeHtml.set(body, renderLoginGate(model.session));
      return;
    }
    const account = model.session.account;
    if (!account?.permissions?.contentEdit && !account?.permissions?.roleManage) {
      globalThis.XjkSafeHtml.set(body, renderPendingGate(model.session));
      return;
    }
    globalThis.XjkSafeHtml.set(body, renderAdminPanel(model));
    hydratePreview();
  }

  async function loadAll({ keepPage = false } = {}) {
    model.loading = true;
    update();
    try {
      model.error = "";
      model.session = await fetchAdminSession();
      const canEdit = model.session.account?.permissions?.contentEdit;
      const canRoles = model.session.account?.permissions?.roleManage;
      if (canEdit) {
        const content = await fetchAdminContentList();
        model.pages = content.pages || [];
        model.suggestions = (await fetchAdminSuggestions()).suggestions || [];
        if (!keepPage || !model.page) {
          const first = model.pages.find((page) => page.slug === model.selectedSlug) || model.pages[0];
          if (first) await loadPage(first.slug, { quiet: true });
        }
      }
      if (canRoles) {
        model.accounts = (await fetchAdminAccounts()).accounts || [];
        model.audit = (await fetchAdminAudit()).entries || [];
      }
    } catch (error) {
      model.error = error?.message || "Admin API request failed.";
    } finally {
      model.loading = false;
      update();
    }
  }

  async function loadPage(slug, { quiet = false } = {}) {
    model.selectedSlug = slug;
    const payload = await fetchAdminPage(slug);
    model.page = payload.page;
    model.markdown = payload.markdown || "";
    if (!quiet) {
      update();
      toast("Markdown loaded");
    }
  }

  function metadataFromDom() {
    const fields = {};
    adminRoot.querySelectorAll("[data-admin-meta]").forEach((field) => {
      fields[field.dataset.adminMeta] = field.value;
    });
    fields.tags = fields.tags
      ? fields.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
    return fields;
  }

  async function saveCurrentPage() {
    const editor = adminRoot.querySelector("[data-admin-editor]");
    if (!model.page || !editor) return;
    const reason = adminRoot.querySelector("[data-admin-reason]")?.value || "";
    const payload = await saveAdminPage({
      slug: model.page.slug,
      markdown: editor.value,
      metadata: metadataFromDom(),
      reason,
    });
    model.page = payload.page;
    model.markdown = payload.markdown || editor.value;
    await loadAll({ keepPage: true });
    toast("Markdown saved");
  }

  async function createPage() {
    const form = adminRoot.querySelector("[data-admin-new-page]");
    if (!form) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    const payload = await createAdminPage({
      slug: fields.slug,
      title: fields.title,
      summary: fields.summary,
      section: fields.section,
      category: fields.category,
      cluster: fields.cluster,
      difficulty: fields.difficulty,
      time: fields.time,
      tags: fields.tags,
    });
    model.selectedSlug = payload.page.slug;
    model.page = payload.page;
    model.markdown = payload.markdown || "";
    model.activeTab = "content";
    await loadAll({ keepPage: true });
    toast("New Learn page created");
  }

  function accountFromRow(row) {
    const data = { id: row.dataset.accountId || "" };
    row.querySelectorAll("[data-account-field]").forEach((field) => {
      const key = field.dataset.accountField;
      data[key] = field.type === "checkbox" ? field.checked : field.value;
    });
    return data;
  }

  async function saveAccountFromRow(row) {
    const payload = await saveAdminAccount(accountFromRow(row));
    const index = model.accounts.findIndex((account) => account.id === payload.account.id);
    if (index >= 0) model.accounts[index] = payload.account;
    else model.accounts.unshift(payload.account);
    toast("Role saved");
    await loadAll({ keepPage: true });
  }

  async function createAccount() {
    const form = adminRoot.querySelector("[data-admin-account-form]");
    if (!form) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    await saveAdminAccount({
      username: fields.username,
      subject: fields.subject,
      displayName: fields.displayName,
      role: fields.role,
      note: fields.note,
      isActive: true,
    });
    form.reset();
    toast("Account added");
    await loadAll({ keepPage: true });
  }

  function hydratePreview() {
    const preview = adminRoot.querySelector("[data-admin-preview]");
    const editor = adminRoot.querySelector("[data-admin-editor]");
    if (!preview || !editor) return;
    function renderPreview() {
      model.markdown = editor.value;
      try {
        const rendered = renderLearnMarkdown(editor.value);
        const warnings = rendered.warnings?.length
          ? `<div class="learn-admin-warnings">${rendered.warnings.map((warning) => `<p>${escapeHtml(warning.message || warning)}</p>`).join("")}</div>`
          : "";
        globalThis.XjkSafeHtml.set(preview, `${warnings}<div class="learn-article-body">${rendered.html}</div>`);
      } catch (error) {
        globalThis.XjkSafeHtml.set(
          preview,
          `<div class="learn-empty">Preview failed: ${escapeHtml(error?.message || "Parse error")}</div>`
        );
      }
    }
    editor.addEventListener("input", renderPreview);
    renderPreview();
  }

  async function handleClick(event) {
    const action = event.target.closest("[data-admin-action]");
    if (!action) return;
    const name = action.dataset.adminAction;
    try {
      if (name === "login") loginToNadeoProfile();
      if (name === "refresh") await loadAll({ keepPage: true });
      if (name === "reload-learn") window.location.reload();
      if (name === "save-page") await saveCurrentPage();
      if (name === "create-page") await createPage();
      if (name === "create-account") await createAccount();
      if (name === "save-account") {
        const row = action.closest("[data-account-id]");
        if (row) await saveAccountFromRow(row);
      }
      if (name === "tab") {
        model.activeTab = action.dataset.adminTab || "content";
        update();
      }
    } catch (error) {
      toast(error?.message || "Admin action failed");
    }
  }

  async function handleChange(event) {
    const select = event.target.closest("[data-admin-page-select]");
    if (select?.value) {
      try {
        await loadPage(select.value);
      } catch (error) {
        toast(error?.message || "Could not load page");
      }
    }
  }

  adminRoot.addEventListener("click", handleClick);
  adminRoot.addEventListener("change", handleChange);
  loadAll();

  return () => {
    adminRoot.removeEventListener("click", handleClick);
    adminRoot.removeEventListener("change", handleChange);
  };
}

function renderLoading() {
  return `<section class="learn-panel learn-admin-loading">
    <p class="learn-eyebrow">Checking account</p>
    <h2 class="learn-card-title">Loading Learn admin...</h2>
  </section>`;
}

function renderError(message) {
  return `<section class="learn-panel learn-admin-gate">
    <span class="learn-admin-gate-icon">${renderIcon("warning")}</span>
    <h2 class="learn-card-title">Admin API unavailable</h2>
    <p class="learn-card-text">${escapeHtml(message || "The Learn admin service could not be reached.")}</p>
    <button class="learn-button" data-admin-action="refresh" type="button">${renderIcon("reset")} Try again</button>
  </section>`;
}

function renderLoginGate(session) {
  return `<section class="learn-panel learn-admin-gate">
    <span class="learn-admin-gate-icon">${renderIcon("lock")}</span>
    <h2 class="learn-card-title">Connect your Nadeo account</h2>
    <p class="learn-card-text">Learn admin uses the Learn-owned profile integration. Once you sign in, the service creates an account record and applies any role that ar has assigned.</p>
    <div class="learn-card-actions">
      <button class="learn-button" data-admin-action="login" type="button">Connect Nadeo profile</button>
    </div>
    ${session?.configured === false ? `<p class="learn-admin-warning">OAuth is not configured for this Learn service yet.</p>` : ""}
  </section>`;
}

function renderPendingGate(session) {
  const account = session.account || {};
  return `<section class="learn-panel learn-admin-gate">
    <span class="learn-admin-gate-icon">${renderIcon("profile")}</span>
    <h2 class="learn-card-title">Account waiting for editor permissions</h2>
    <p class="learn-card-text">You are signed in as ${escapeHtml(account.displayName || account.username || "a Learn user")}, but this role cannot edit Learn yet.</p>
    <div class="learn-admin-account-card">
      <span>Role</span><strong>${escapeHtml(ROLE_LABELS[account.role] || account.role || "Viewer")}</strong>
      <span>Account</span><strong>${escapeHtml(account.username || account.subject || account.id || "Unknown")}</strong>
    </div>
  </section>`;
}

function renderAdminPanel(model) {
  const account = model.session.account || {};
  const canRoles = Boolean(account.permissions?.roleManage);
  const tabs = [
    ["content", "Markdown"],
    ["new", "Add page"],
    ["suggestions", "Suggestions"],
    ...(canRoles
      ? [
          ["roles", "Roles"],
          ["audit", "Audit"],
        ]
      : []),
  ];
  return `<div class="learn-panel-grid learn-admin-grid">
    <section class="learn-panel learn-span-12">
      <div class="learn-admin-status">
        <div>
          <p class="learn-eyebrow">Signed in</p>
          <h2 class="learn-card-title">${escapeHtml(account.displayName || account.username || "Learn editor")}</h2>
        </div>
        <div class="learn-admin-role">${escapeHtml(ROLE_LABELS[account.role] || account.role)}</div>
      </div>
      <div class="learn-admin-tabs" role="tablist">
        ${tabs.map(([id, label]) => `<button class="learn-chip ${model.activeTab === id ? "is-active" : ""}" data-admin-action="tab" data-admin-tab="${id}" type="button">${escapeHtml(label)}</button>`).join("")}
      </div>
    </section>
    ${model.activeTab === "content" ? renderEditor(model) : ""}
    ${model.activeTab === "new" ? renderNewPage(model) : ""}
    ${model.activeTab === "suggestions" ? renderSuggestions(model) : ""}
    ${model.activeTab === "roles" && canRoles ? renderRoles(model) : ""}
    ${model.activeTab === "audit" && canRoles ? renderAudit(model) : ""}
  </div>`;
}

function renderSuggestions(model) {
  return `<section class="learn-panel learn-span-12">
    <div class="learn-panel-head">
      <div>
        <p class="learn-eyebrow">Suggestions</p>
        <h2>Reader improvement notes</h2>
      </div>
    </div>
    <div class="learn-admin-audit-list">
      ${
        model.suggestions
          .map(
            (entry) => `<div class="learn-admin-audit-row">
        <strong>${escapeHtml(entry.title || entry.slug || "Suggestion")}</strong>
        <span>${escapeHtml(entry.account?.displayName || entry.account?.username || "reader")}</span>
        <small>${escapeHtml(entry.createdAt || "")}</small>
        <code>${escapeHtml(entry.text || "")}</code>
        ${entry.slug ? `<a class="learn-button" href="${slugToHash(entry.slug)}">${renderIcon("link")} Open</a>` : ""}
      </div>`
          )
          .join("") || `<div class="learn-empty">No reader suggestions yet.</div>`
      }
    </div>
  </section>`;
}

function renderEditor(model) {
  const page = model.page || {};
  return `<section class="learn-panel learn-span-12">
    <div class="learn-panel-head">
      <div>
        <p class="learn-eyebrow">Markdown editor</p>
        <h2>${escapeHtml(page.title || "Select a page")}</h2>
      </div>
      <div class="learn-card-actions">
        ${page.slug ? `<a class="learn-button" href="${slugToHash(page.slug)}">${renderIcon("link")} Open</a>` : ""}
        <button class="learn-button" data-admin-action="save-page" type="button">${renderIcon("check")} Save</button>
      </div>
    </div>
    <div class="learn-admin-editor-grid">
      <div class="learn-admin-editor-meta">
        <label><span class="learn-eyebrow">Page</span><select class="learn-select" data-admin-page-select>
          ${model.pages.map((item) => `<option value="${escapeHtml(item.slug)}" ${item.slug === page.slug ? "selected" : ""}>${escapeHtml(item.title || item.slug)}</option>`).join("")}
        </select></label>
        ${metaInput("title", "Title", page.title)}
        ${metaInput("summary", "Summary", page.summary)}
        ${metaInput("section", "Section", page.section)}
        ${metaInput("category", "Category", page.category)}
        ${metaInput("cluster", "Cluster", page.cluster || page.graph?.primaryCluster)}
        ${metaInput("difficulty", "Difficulty", page.difficulty)}
        ${metaInput("time", "Time", page.time)}
        ${metaInput("tags", "Tags", (page.tags || []).join(", "))}
        <label><span class="learn-eyebrow">Save note</span><input class="learn-input" data-admin-reason value="" placeholder="Optional edit note" /></label>
      </div>
      <textarea class="learn-admin-editor learn-textarea" data-admin-editor spellcheck="false">${escapeHtml(model.markdown)}</textarea>
      <div class="learn-admin-preview" data-admin-preview></div>
    </div>
  </section>`;
}

function metaInput(key, label, value = "") {
  return `<label><span class="learn-eyebrow">${escapeHtml(label)}</span><input class="learn-input" data-admin-meta="${escapeHtml(key)}" value="${escapeHtml(value || "")}" /></label>`;
}

function renderNewPage(model) {
  const clusters = [...new Set((model.pages || []).map((page) => page.cluster).filter(Boolean))];
  return `<section class="learn-panel learn-span-12">
    <div class="learn-panel-head">
      <div>
        <p class="learn-eyebrow">Add content</p>
        <h2>Create a markdown-backed Learn page</h2>
      </div>
      <button class="learn-button" data-admin-action="create-page" type="button">${renderIcon("check")} Create page</button>
    </div>
    <form class="learn-panel-grid learn-admin-form" data-admin-new-page>
      <label class="learn-span-6"><span class="learn-eyebrow">Slug</span><input class="learn-input" name="slug" placeholder="advanced/movement/new-topic" required /></label>
      <label class="learn-span-6"><span class="learn-eyebrow">Title</span><input class="learn-input" name="title" placeholder="New Topic" required /></label>
      <label class="learn-span-12"><span class="learn-eyebrow">Summary</span><input class="learn-input" name="summary" placeholder="One sentence summary." /></label>
      <label class="learn-span-3"><span class="learn-eyebrow">Section</span><input class="learn-input" name="section" placeholder="advanced" /></label>
      <label class="learn-span-3"><span class="learn-eyebrow">Category</span><input class="learn-input" name="category" placeholder="movement" /></label>
      <label class="learn-span-3"><span class="learn-eyebrow">Cluster</span><input class="learn-input" name="cluster" list="learn-admin-clusters" placeholder="advanced" /></label>
      <label class="learn-span-3"><span class="learn-eyebrow">Difficulty</span><select class="learn-select" name="difficulty">
        ${["beginner", "intermediate", "advanced", "expert"].map((level) => `<option value="${level}">${escapeHtml(level)}</option>`).join("")}
      </select></label>
      <label class="learn-span-3"><span class="learn-eyebrow">Time</span><input class="learn-input" name="time" value="5 min" /></label>
      <label class="learn-span-9"><span class="learn-eyebrow">Tags</span><input class="learn-input" name="tags" placeholder="underwater, rally, inputs" /></label>
      <datalist id="learn-admin-clusters">${clusters.map((cluster) => `<option value="${escapeHtml(cluster)}"></option>`).join("")}</datalist>
    </form>
  </section>`;
}

function renderRoles(model) {
  return `<section class="learn-panel learn-span-12">
    <div class="learn-panel-head">
      <div>
        <p class="learn-eyebrow">Roles</p>
        <h2>Accounts and permissions</h2>
      </div>
    </div>
    <form class="learn-admin-role-create" data-admin-account-form>
      <input class="learn-input" name="username" placeholder="username" />
      <input class="learn-input" name="subject" placeholder="subject/account id" />
      <input class="learn-input" name="displayName" placeholder="display name" />
      <select class="learn-select" name="role">${roleOptions("editor")}</select>
      <input class="learn-input" name="note" placeholder="note" />
      <button class="learn-button" data-admin-action="create-account" type="button">${renderIcon("profile")} Add account</button>
    </form>
    <div class="learn-admin-role-list">
      ${model.accounts.map(renderAccountRow).join("") || `<div class="learn-empty">No Learn accounts yet.</div>`}
    </div>
  </section>`;
}

function renderAccountRow(account) {
  return `<div class="learn-admin-account-row" data-account-id="${escapeHtml(account.id)}">
    <div>
      <strong>${escapeHtml(account.displayName || account.username || account.subject || "Unnamed")}</strong>
      <small>${escapeHtml(account.subject || account.accountId || account.id || "")}</small>
    </div>
    <input class="learn-input" data-account-field="username" value="${escapeHtml(account.username || "")}" placeholder="username" />
    <select class="learn-select" data-account-field="role">${roleOptions(account.role)}</select>
    <label class="learn-admin-active"><input type="checkbox" data-account-field="isActive" ${account.isActive ? "checked" : ""} /> Active</label>
    <input class="learn-input" data-account-field="note" value="${escapeHtml(account.note || "")}" placeholder="note" />
    <button class="learn-button" data-admin-action="save-account" type="button">${renderIcon("check")} Save</button>
  </div>`;
}

function roleOptions(selected = "viewer") {
  return ROLES.map(
    (role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${escapeHtml(ROLE_LABELS[role])}</option>`
  ).join("");
}

function renderAudit(model) {
  return `<section class="learn-panel learn-span-12">
    <div class="learn-panel-head">
      <div>
        <p class="learn-eyebrow">Audit</p>
        <h2>Recent admin actions</h2>
      </div>
    </div>
    <div class="learn-admin-audit-list">
      ${
        model.audit
          .map(
            (entry) => `<div class="learn-admin-audit-row">
        <strong>${escapeHtml(entry.action || "action")}</strong>
        <span>${escapeHtml(entry.actor?.username || "unknown")}</span>
        <small>${escapeHtml(entry.at || "")}</small>
        <code>${escapeHtml(JSON.stringify(entry.detail || {}))}</code>
      </div>`
          )
          .join("") || `<div class="learn-empty">No admin actions logged yet.</div>`
      }
    </div>
  </section>`;
}
