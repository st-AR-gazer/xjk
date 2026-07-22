import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = path.join(repoRoot, "coverage", "coverage-summary.json");
const baselinePath = path.join(repoRoot, "config", "coverage-baseline.json");
const metricNames = ["lines", "functions", "branches", "statements"];

function emptyMetric() {
  return { covered: 0, total: 0 };
}

function emptyCoverage() {
  return Object.fromEntries(metricNames.map((name) => [name, emptyMetric()]));
}

function addCoverage(target, source) {
  for (const name of metricNames) {
    target[name].covered += Number(source?.[name]?.covered || 0);
    target[name].total += Number(source?.[name]?.total || 0);
  }
}

function percentage(metric) {
  if (!metric.total) return 100;
  return Number(((metric.covered / metric.total) * 100).toFixed(2));
}

function coverageRecord(coverage) {
  return Object.fromEntries(
    metricNames.map((name) => [
      name,
      {
        covered: coverage[name].covered,
        total: coverage[name].total,
        pct: percentage(coverage[name]),
      },
    ])
  );
}

function relativeSourcePath(sourcePath) {
  const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(repoRoot, sourcePath);
  return path.relative(repoRoot, absolutePath).replaceAll("\\", "/");
}

function areaForSource(sourcePath) {
  const parts = sourcePath.split("/");
  if (["services", "sites"].includes(parts[0]) && parts[1]) return `${parts[0]}/${parts[1]}`;
  return parts[0] || "root";
}

function buildReport(rawSummary) {
  const total = emptyCoverage();
  const areaCoverage = new Map();
  const sourceEntries = Object.entries(rawSummary).filter(([sourcePath]) => sourcePath !== "total");

  for (const [sourcePath, coverage] of sourceEntries) {
    const relativePath = relativeSourcePath(sourcePath);
    const area = areaForSource(relativePath);
    if (!areaCoverage.has(area)) areaCoverage.set(area, emptyCoverage());
    addCoverage(areaCoverage.get(area), coverage);
    addCoverage(total, coverage);
  }

  const areas = Object.fromEntries(
    [...areaCoverage.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([area, coverage]) => [area, coverageRecord(coverage)])
  );

  return {
    schemaVersion: 1,
    scope: "All tracked first-party JavaScript modules selected by .c8rc.json; test and generated sources excluded.",
    total: coverageRecord(total),
    areas,
  };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDelta(current, baseline) {
  if (baseline === undefined || baseline === null) return "new";
  const delta = Number(current || 0) - Number(baseline || 0);
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function printReport(report, baseline) {
  const rows = Object.entries(report.areas).map(([area, coverage]) => ({
    area,
    lines: formatPercent(coverage.lines.pct),
    functions: formatPercent(coverage.functions.pct),
    branches: formatPercent(coverage.branches.pct),
    lineDelta: formatDelta(coverage.lines.pct, baseline?.areas?.[area]?.lines?.pct),
  }));
  rows.push({
    area: "TOTAL",
    lines: formatPercent(report.total.lines.pct),
    functions: formatPercent(report.total.functions.pct),
    branches: formatPercent(report.total.branches.pct),
    lineDelta: formatDelta(report.total.lines.pct, baseline?.total?.lines?.pct),
  });

  console.log("\nCoverage by repository area (reporting only; no percentage gate):");
  console.table(rows);
}

function main() {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Coverage summary not found: ${summaryPath}`);
  }

  const rawSummary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const report = buildReport(rawSummary);
  const writeBaseline = process.argv.includes("--write");

  if (writeBaseline) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Coverage baseline written to ${path.relative(repoRoot, baselinePath)}`);
  }

  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : null;
  printReport(report, baseline);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) main();

export { areaForSource, buildReport, coverageRecord, formatDelta, main, percentage };
