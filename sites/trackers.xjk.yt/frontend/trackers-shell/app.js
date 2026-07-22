import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js?v=2";
import { resolveSiteHref } from "/shared/xjk-core/site-runtime.js?v=2";
import { bootTrackerShell } from "./app/controller.js?v=2";

bootTrackerShell({ fetchJsonImpl: fetchJson, resolveSiteHrefImpl: resolveSiteHref });
