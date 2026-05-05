import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAlterationGroupingDocument } from "../src/services/alterationGrouping.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_DIR = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(SERVICE_DIR, "alteration-groups.example.json");
const DEFAULT_OUTPUT = path.join(SERVICE_DIR, "alteration-groups.local.json");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node tools/write-alteration-groups-local.mjs [--input path] [--output path]",
      "",
      'Input: { "categories": [{ "name": "Category", "items": ["channel-name"] }], "aliases": {} }',
      'Also accepts: { "grouping": { "Category": ["channel-name"] } }',
    ].join("\n")
  );
}

function parseArgs(argv = []) {
  const out = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--input" && argv[index + 1]) {
      out.input = path.resolve(SERVICE_DIR, String(argv[index + 1]));
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      out.output = path.resolve(SERVICE_DIR, String(argv[index + 1]));
      index += 1;
      continue;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file not found: ${args.input}`);
  }

  const parsed = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const normalized = normalizeAlterationGroupingDocument(parsed);
  fs.writeFileSync(args.output, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        input: args.input,
        output: args.output,
        category_count: normalized.categories.length,
        alias_count: Object.keys(normalized.aliases || {}).length,
      },
      null,
      2
    )
  );
}

main();
