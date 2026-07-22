export function toneClass(v) {
  const n = String(v || "").toLowerCase();
  if (["healthy", "success", "online", "fresh", "approved", "done"].includes(n)) return "tone-success";
  if (["blocked", "failed", "error", "rejected"].includes(n)) return "tone-error";
  if (["degraded", "warning", "warn", "paused", "processing", "stale"].includes(n)) return "tone-warn";
  if (["running", "info", "job", "poll-run", "wr-change", "scheduler"].includes(n)) return "tone-info";
  return "tone-muted";
}

export function toneLabel(v) {
  const n = String(v || "").trim();
  if (!n) return "Unknown";
  return n.replace(/[-_]/g, " ");
}

export function similarityStateMeta(candidate = {}) {
  const classification = String(candidate?.similarityMatchClassification || "")
    .trim()
    .toLowerCase();
  if (classification === "fallback-manual-review") {
    return { tone: "tone-warn", label: "sim:manual" };
  }
  if (classification === "ambiguous-close-slots" || classification === "manual-multi-selection") {
    return { tone: "tone-warn", label: "sim:ambiguous" };
  }
  if (classification === "unique-strong" || classification === "manual-selected") {
    return { tone: "tone-success", label: "sim:closest" };
  }
  if (classification === "unique-slot-supported" || classification === "unique-weak") {
    return { tone: "tone-info", label: "sim:review" };
  }
  if (classification === "weak-best") {
    return { tone: "tone-warn", label: "sim:weak" };
  }
  if (candidate?.similarityStatus === "matched") {
    return { tone: "tone-success", label: "sim:matched" };
  }
  if (candidate?.similarityStatus === "scanned") {
    return { tone: "tone-info", label: "sim:scanned" };
  }
  return { tone: "tone-muted", label: "sim:missing" };
}

export function similarityDetailMeta(classification) {
  const normalized = String(classification || "")
    .trim()
    .toLowerCase();
  if (normalized === "fallback-manual-review") {
    return { tone: "tone-warn", label: "Manual Review" };
  }
  if (normalized === "unique-strong" || normalized === "manual-selected") {
    return { tone: "tone-success", label: "Unique Closest" };
  }
  if (normalized === "unique-slot-supported") {
    return { tone: "tone-info", label: "Supported Closest" };
  }
  if (normalized === "ambiguous-close-slots" || normalized === "manual-multi-selection") {
    return { tone: "tone-warn", label: "Ambiguous Close Match" };
  }
  if (normalized === "unique-weak" || normalized === "weak-best") {
    return { tone: "tone-warn", label: "Weak Closest Match" };
  }
  return { tone: "tone-muted", label: "No Match" };
}

export function btnClass(tone) {
  if (tone === "main") return "btn primary";
  if (tone === "warn") return "btn danger";
  return "btn outline";
}

export function fmtNum(v) {
  return new Intl.NumberFormat("en-US").format(Number(v || 0));
}

export function fmtClock(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtTimeAgo(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function alertCheckCount() {
  return 10;
}

export function fmtDuration(v) {
  const ms = Number(v || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function fmtBytes(v) {
  const bytes = Number(v || 0);
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
export function stripFmt(v) {
  return String(v ?? "").replace(NADEO_FMT_RE, "");
}

export function escN(v) {
  return esc(stripFmt(v));
}
