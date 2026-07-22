import { escapeHtml } from "../../../shared/xjk-core/dom-utils.js?v=2";

const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NADEO_FORMAT_RE = /\$([0-9a-f]{1,3}|[gimnostuwz<>]|[hlp](\[[^\]]+\])?)/gi;

function stripFmt(value) {
  return String(value ?? "").replace(NADEO_FORMAT_RE, "");
}

function escN(value) {
  return escapeHtml(stripFmt(value));
}

function fmtTime(milliseconds) {
  if (!milliseconds || milliseconds <= 0) return "\u2014";
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function relTime(iso, emptyValue = "\u2014") {
  if (!iso) return emptyValue;
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function looksLikeAccountId(value) {
  return ACCOUNT_ID_RE.test(String(value || "").trim());
}

export { escapeHtml as esc, escN, fmtTime, looksLikeAccountId, relTime, stripFmt };
