// Emits the GitHub Actions matrix of approved criterion tests: matrix=[{id,hash,hash12,file,fileSha256}]
import { listCriterionTests } from "./criteria.mjs";

const tests = listCriterionTests();
if (tests.length === 0) {
  console.error("No Foreman criterion tests found in tests/foreman");
  process.exit(1);
}
console.log(`matrix=${JSON.stringify(tests)}`);
