// Writes a Markdown job summary with per-criterion PASS/FAIL from the Playwright JSON report.
import { existsSync, readFileSync } from "node:fs";
import { listCriterionTests } from "./criteria.mjs";

const reportPath = "foreman-report/report.json";
const only = process.env.FOREMAN_CRITERION_ID;
const tests = listCriterionTests().filter((t) => !only || t.id === only);

const results = new Map();
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      const file = `tests/foreman/${spec.file}`.replace("tests/foreman/tests/foreman/", "tests/foreman/");
      const runs = spec.tests.flatMap((t) => t.results);
      const passed = spec.ok && runs.every((r) => r.status === "passed");
      const prev = results.get(file);
      const error = runs.map((r) => r.error?.message).find(Boolean);
      results.set(file, {
        passed: (prev?.passed ?? true) && passed,
        durationMs: (prev?.durationMs ?? 0) + runs.reduce((a, r) => a + r.duration, 0),
        error: prev?.error || error,
      });
    }
    (suite.suites || []).forEach(walk);
  };
  (report.suites || []).forEach(walk);
}

const sha = process.env.GITHUB_SHA || "local";
const headSha = process.env.FOREMAN_HEAD_SHA || sha;
const lines = [
  "## Foreman Verify",
  "",
  `Commit under test: \`${headSha}\` (checked-out ref \`${sha}\`)`,
  "",
  "| Criterion | Result | Criterion hash | Test file sha256 | Duration |",
  "|---|---|---|---|---|",
];
for (const t of tests) {
  const r = [...results.entries()].find(([f]) => f.endsWith(t.file.split("/").pop()))?.[1];
  const status = !r ? "NOT RUN" : r.passed ? "PASS" : "FAIL";
  lines.push(
    `| ${t.id} | **${status}** | \`${t.hash.slice(0, 16)}\` | \`${t.fileSha256.slice(0, 16)}\` | ${r ? (r.durationMs / 1000).toFixed(1) + " s" : "-"} |`,
  );
  if (r?.error) {
    const clean = r.error.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 6).join("\n");
    lines.push("", `<details><summary>${t.id} failure</summary>\n\n\`\`\`\n${clean}\n\`\`\`\n</details>`, "");
  }
}
lines.push("", "Screenshots, video and trace are attached as workflow artifacts.");
console.log(lines.join("\n"));
