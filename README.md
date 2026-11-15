# foreman-demo-app

A tiny demo web app for **Agent Foreman** (Atlassian Codegeist 2026 hackathon project).

Agent Foreman is a Jira (Forge) app: every issue has a *Done Contract* of acceptance criteria
(C1..Cn), each criterion needs fresh, verified proof, and a workflow validator blocks *Done*
until it has it. Coding agents tend to "grade their own homework", so for UI criteria Foreman
runs **its own** browser test in CI and uses the CI run itself as the proof.

## The feature

`/forgot-password.html`: enter an email, click **Send reset link**, and a confirmation
**"Check your inbox"** appears (the fake API answers in ~400 ms).

The `buggy-confirmation` branch contains a realistic regression: the success branch checks for
HTTP `201` while the API returns `200`, so the confirmation never appears.

## How Foreman verifies a criterion

1. **Generate once.** `foreman/generate-test.mjs "C3: ..."` asks Gemini to turn the criterion
   text into a Playwright test at `tests/foreman/C3.spec.ts`. The header records the criterion
   id and the sha256 of the normalised criterion text. A human reviews and commits it once
   (that commit *is* the approval). In the product this generation runs inside the Forge app
   using the Forge LLM; the script here is a local stand-in.
2. **Run in CI.** The **Foreman Verify** workflow (`.github/workflows/foreman-verify.yml`) runs on
   every push and pull request: it discovers the approved criterion tests, runs each one in its
   own job named `verify C3 criterion:<hash12>`, uploads screenshots/video/trace, and writes a
   PASS/FAIL job summary.
3. **Check the proof.** `foreman/check-run.mjs <runUrl> <criterionHash>` uses only the public
   GitHub API (no token) to decide `VERIFIED` / `REJECTED` / `UNVERIFIED`: right workflow,
   completed, the criterion job passed, the test file at the run's commit is the approved one
   (matching criterion hash), and none of the protected Foreman files were changed relative to
   `main`.

```bash
npm ci && npx playwright install chromium
npm run test:foreman
node foreman/check-run.mjs https://github.com/kd444/foreman-demo-app/actions/runs/<id> <criterionHash>
```
