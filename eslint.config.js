import { builtinModules } from "node:module";

const nodeBuiltinNames = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

const preferNodeProtocolRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require the node: protocol for Node.js built-in modules",
    },
    fixable: "code",
    schema: [],
    messages: {
      requireNodeProtocol: "Use the node: protocol when importing Node.js built-in modules.",
    },
  },
  create(context) {
    function checkSource(sourceNode) {
      const source = sourceNode?.value;
      if (typeof source !== "string" || source.startsWith("node:") || !nodeBuiltinNames.has(source)) return;
      context.report({
        node: sourceNode,
        messageId: "requireNodeProtocol",
        fix: (fixer) => fixer.replaceText(sourceNode, JSON.stringify(`node:${source}`)),
      });
    }

    return {
      ExportAllDeclaration: (node) => checkSource(node.source),
      ExportNamedDeclaration: (node) => checkSource(node.source),
      ImportDeclaration: (node) => checkSource(node.source),
      ImportExpression: (node) => checkSource(node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          checkSource(node.arguments[0]);
        }
      },
    };
  },
};

function staticPropertyName(member) {
  if (member?.type !== "MemberExpression") return "";
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (member.computed && member.property.type === "Literal") return String(member.property.value || "");
  return "";
}

const noUnsafeHtmlSinksRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Route parsed HTML through the shared sanitizer",
    },
    schema: [],
    messages: {
      unsafeHtml: "Use XjkSafeHtml.set() instead of writing parsed HTML directly.",
    },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: "unsafeHtml" });
    return {
      AssignmentExpression(node) {
        if (["innerHTML", "outerHTML"].includes(staticPropertyName(node.left))) report(node);
      },
      CallExpression(node) {
        const name = staticPropertyName(node.callee);
        if (name === "insertAdjacentHTML") {
          report(node);
          return;
        }
        if (
          ["write", "writeln"].includes(name) &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "document"
        ) {
          report(node);
        }
      },
    };
  },
};

const xjkPlugin = {
  rules: {
    "no-unsafe-html-sinks": noUnsafeHtmlSinksRule,
    "prefer-node-protocol": preferNodeProtocolRule,
  },
};

const sharedGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Blob: "readonly",
  clearImmediate: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  performance: "readonly",
  queueMicrotask: "readonly",
  Request: "readonly",
  Response: "readonly",
  setImmediate: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

const nodeGlobals = {
  ...sharedGlobals,
  Buffer: "readonly",
  global: "readonly",
  process: "readonly",
  WebSocket: "readonly",
};

const commonJsGlobals = {
  ...nodeGlobals,
  __dirname: "readonly",
  __filename: "readonly",
  exports: "writable",
  module: "readonly",
  require: "readonly",
};

const browserGlobals = {
  ...sharedGlobals,
  alert: "readonly",
  Audio: "readonly",
  atob: "readonly",
  btoa: "readonly",
  caches: "readonly",
  CSS: "readonly",
  CustomEvent: "readonly",
  document: "readonly",
  Document: "readonly",
  DOMParser: "readonly",
  Element: "readonly",
  Event: "readonly",
  EventSource: "readonly",
  File: "readonly",
  FileReader: "readonly",
  getComputedStyle: "readonly",
  history: "readonly",
  HTMLAnchorElement: "readonly",
  HTMLButtonElement: "readonly",
  HTMLCanvasElement: "readonly",
  HTMLElement: "readonly",
  HTMLFormElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLTextAreaElement: "readonly",
  Image: "readonly",
  ImageEncoder: "readonly",
  indexedDB: "readonly",
  IntersectionObserver: "readonly",
  Intl: "readonly",
  localStorage: "readonly",
  location: "readonly",
  matchMedia: "readonly",
  MutationObserver: "readonly",
  navigator: "readonly",
  Node: "readonly",
  NodeFilter: "readonly",
  prompt: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  ResizeObserver: "readonly",
  screen: "readonly",
  self: "readonly",
  sessionStorage: "readonly",
  MediaRecorder: "readonly",
  VideoFrame: "readonly",
  WebSocket: "readonly",
  window: "readonly",
  Worker: "readonly",
  XMLHttpRequest: "readonly",
};

const nodeFiles = [
  "services/**/*.{js,mjs,cjs}",
  "scripts/**/*.{js,mjs,cjs}",
  "deploy/**/*.{js,mjs,cjs}",
  "config/**/*.{js,mjs,cjs}",
  "test/**/*.{js,mjs,cjs}",
  "sites/**/backend/**/*.{js,mjs,cjs}",
  "sites/learn.xjk.yt/tools/**/*.{js,mjs,cjs}",
];
const browserFiles = [
  "sites/**/frontend/**/*.{js,mjs,cjs}",
  "sites/shared/**/*.{js,mjs,cjs}",
  "sites/tools.xjk.yt/shared/*.{js,mjs,cjs}",
];

const maintainabilityRules = {
  complexity: ["error", 80],
  curly: ["error", "multi-line"],
  eqeqeq: ["error", "always", { null: "ignore" }],
  "max-lines-per-function": [
    "error",
    {
      max: 350,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "no-async-promise-executor": "error",
  "no-constant-binary-expression": "error",
  "no-duplicate-imports": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-prototype-builtins": "error",
  "no-self-compare": "error",
  "no-throw-literal": "error",
  "no-undef": "error",
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "no-useless-catch": "error",
  "no-useless-concat": "error",
  "no-useless-rename": "error",
  "no-var": "error",
  "object-shorthand": "error",
  "prefer-const": "error",
  "prefer-promise-reject-errors": "error",
  radix: "error",
};

export default [
  {
    ignores: [
      "**/.runtime/**",
      "**/.venv/**",
      "**/build/**",
      "**/coverage/**",
      "**/data/**",
      "**/data_server/**",
      "**/dist/**",
      "**/generated/**",
      "**/node_modules/**",
      "**/tmp*/**",
      "**/vendor/**",
      "services/altered/tools/GbxMapLayoutParser/**",
      "sites/tools.xjk.yt/*/tools/**",
    ],
  },
  {
    files: nodeFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: nodeGlobals,
      sourceType: "module",
    },
    plugins: {
      xjk: xjkPlugin,
    },
    rules: {
      ...maintainabilityRules,
      "xjk/prefer-node-protocol": "error",
    },
  },
  {
    files: browserFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: browserGlobals,
      sourceType: "module",
    },
    plugins: {
      xjk: xjkPlugin,
    },
    rules: {
      ...maintainabilityRules,
      "xjk/no-unsafe-html-sinks": "error",
    },
  },
  {
    files: ["sites/shared/xjk-core/safe-html.js"],
    rules: {
      "xjk/no-unsafe-html-sinks": "off",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: commonJsGlobals,
      sourceType: "commonjs",
    },
  },
  {
    files: ["sites/altered.xjk.yt/frontend/bannerbuilder/static/js/admin-chart.js"],
    languageOptions: {
      globals: {
        Chart: "readonly",
      },
    },
  },
];
