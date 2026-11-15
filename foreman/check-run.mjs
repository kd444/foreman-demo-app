#!/usr/bin/env node
// Decides whether a "Foreman Verify" GitHub Actions run is valid proof for one criterion version,
// using only the public, unauthenticated GitHub REST API (what the Forge app can call).
//
// Usage: node foreman/check-run.mjs <runUrl> <criterionHash> [--approved-blob <gitBlobSha>]
// Prints VERIFIED / REJECTED / UNVERIFIED with a reason. Exit code 0 / 1 / 2.
const WORKFLOW_NAME = "Foreman Verify";
const WORKFLOW_PATH = ".github/workflows/foreman-verify.yml";
// Anything that decides what gets tested or how the result is reported.
const PROTECTED = [
  /^tests\/foreman\//,
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /^playwright\.config\.[cm]?[jt]s$/,
  /^foreman\//,
  /^package(-lock)?\.json$/,
];

const [runUrl, criterionHashArg, ...rest] = process.argv.slice(2);
const approvedBlobArg = rest.includes("--approved-blob") ? rest[rest.indexOf("--approved-blob") + 1] : null;

function finish(verdict, reason, details = {}) {
  console.log(`${verdict}: ${reason}`);
  console.log(JSON.stringify(details, null, 2));
  process.exit(verdict === "VERIFIED" ? 0 : verdict === "REJECTED" ? 1 : 2);
}

if (!runUrl || !criterionHashArg) {
  console.error("Usage: node foreman/check-run.mjs <runUrl> <criterionHash> [--approved-blob <sha>]");
  process.exit(2);
}
const m = runUrl.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)/);
if (!m) finish("UNVERIFIED", "not a GitHub Actions run URL", { runUrl });
const [, owner, repo, runId] = m;
const criterionHash = criterionHashArg.toLowerCase();
if (!/^[0-9a-f]{12,64}$/.test(criterionHash)) finish("UNVERIFIED", "criterion hash must be 12-64 hex chars");

const api = `https://api.github.com/repos/${owner}/${repo}`;
let calls = 0;
async function gh(path) {
  calls++;
  const res = await fetch(api + path, {
    headers: { accept: "application/vnd.github+json", "user-agent": "agent-foreman-check-run" },
  });
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new Error(`GET ${path} -> HTTP ${res.status}${remaining === "0" ? " (rate limited)" : ""}`);
  }
  return res.json();
}

const details = { runUrl, criterionHash };
try {
  const run = await gh(`/actions/runs/${runId}`);
  Object.assign(details, {
    workflow: run.name,
    path: run.path,
    event: run.event,
    branch: run.head_branch,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.run_started_at,
    updatedAt: run.updated_at,
  });
  if (run.name !== WORKFLOW_NAME || !String(run.path).startsWith(WORKFLOW_PATH))
    finish("REJECTED", `run is not the ${WORKFLOW_NAME} workflow (${run.name} @ ${run.path})`, details);
  if (run.status !== "completed") finish("UNVERIFIED", `run is still ${run.status}`, details);

  const { jobs } = await gh(`/actions/runs/${runId}/jobs?per_page=100`);
  const job = jobs.find((j) => {
    const jm = j.name.match(/^verify (C\d+) criterion:([0-9a-f]{12})$/);
    return jm && criterionHash.startsWith(jm[2]);
  });
  if (!job) {
    details.jobs = jobs.map((j) => `${j.name}: ${j.conclusion}`);
    const ranOtherVersion = jobs.some(
      (j) => /^verify C\d+ criterion:[0-9a-f]{12}$/.test(j.name) && ["success", "failure"].includes(j.conclusion),
    );
    if (ranOtherVersion)
      finish("REJECTED", "run tested a different criterion version (criterion text changed or test not regenerated)", details);
    finish("UNVERIFIED", `criterion tests never ran (run concluded ${run.conclusion}; infrastructure or setup failure, not a test result)`, details);
  }
  const criterionId = job.name.split(" ")[1];
  Object.assign(details, { criterionId, job: job.name, jobConclusion: job.conclusion, jobUrl: job.html_url });

  // Tamper check 1: nothing that controls the test or its reporting changed vs the default branch.
  const { default_branch } = await gh("");
  const cmp = await gh(`/compare/${default_branch}...${run.head_sha}`);
  if ((cmp.files || []).length >= 300) finish("UNVERIFIED", "diff too large to inspect via the public API", details);
  const touched = (cmp.files || []).map((f) => f.filename).filter((f) => PROTECTED.some((re) => re.test(f)));
  details.changedVsDefault = (cmp.files || []).map((f) => f.filename);
  if (touched.length)
    finish("REJECTED", `run's commit modifies protected Foreman files vs ${default_branch}: ${touched.join(", ")}`, details);

  // Tamper check 2: the test file at the run's commit is the approved one for this criterion version.
  const testPath = `tests/foreman/${criterionId}.spec.ts`;
  const atRun = await gh(`/contents/${testPath}?ref=${run.head_sha}`);
  const source = Buffer.from(atRun.content, "base64").toString("utf8");
  const headerHash = (source.match(/^\/\/\s*foreman-criterion-hash:\s*([0-9a-f]{64})/m) || [])[1];
  const approvedBlob = approvedBlobArg || (await gh(`/contents/${testPath}?ref=${default_branch}`)).sha;
  Object.assign(details, { testPath, testBlobAtRun: atRun.sha, approvedTestBlob: approvedBlob, headerHash });
  if (!headerHash || !headerHash.startsWith(criterionHash))
    finish("REJECTED", "test file header does not match the criterion hash", details);
  if (atRun.sha !== approvedBlob) finish("REJECTED", "test file differs from the approved version", details);

  details.apiCalls = calls;
  if (job.conclusion === "success" && run.conclusion === "success")
    finish("VERIFIED", `${criterionId} passed in ${WORKFLOW_NAME} on ${run.head_sha.slice(0, 7)}`, details);
  if (job.conclusion === "failure")
    finish("REJECTED", `${criterionId} test FAILED in ${WORKFLOW_NAME} on ${run.head_sha.slice(0, 7)}`, details);
  finish("UNVERIFIED", `job concluded ${job.conclusion}, run concluded ${run.conclusion}`, details);
} catch (err) {
  details.apiCalls = calls;
  finish("UNVERIFIED", err.message, details);
}
