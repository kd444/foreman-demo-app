// Shared helpers: criterion hashing and Foreman test-header parsing.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function normalizeCriterionText(text) {
  return text.trim().replace(/\s+/g, " ");
}

export function criterionHash(text) {
  return createHash("sha256").update(normalizeCriterionText(text), "utf8").digest("hex");
}

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Parses "// foreman-<key>: <value>" header lines from a generated test file. */
export function parseHeader(source) {
  const header = {};
  for (const line of source.split("\n")) {
    const m = line.match(/^\/\/\s*foreman-([a-z-]+):\s*(.*)$/);
    if (m) header[m[1]] = m[2].trim();
    else if (line.trim() && !line.startsWith("//")) break;
  }
  return header;
}

export function listCriterionTests(dir = "tests/foreman") {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const source = readFileSync(file);
      const header = parseHeader(source.toString("utf8"));
      return {
        id: header["criterion-id"],
        hash: header["criterion-hash"],
        hash12: (header["criterion-hash"] || "").slice(0, 12),
        file,
        fileSha256: sha256(source),
      };
    })
    .filter((t) => /^C\d+$/.test(t.id || "") && /^[0-9a-f]{64}$/.test(t.hash || ""));
}
