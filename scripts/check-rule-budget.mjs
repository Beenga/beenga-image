// Report the length budget, and assert the JS and Python rule registries agree.
//
//   node scripts/check-rule-budget.mjs
//
// Run alongside the JS/Python parity check after touching either registry. The
// two are hand-maintained, like the rules themselves, and drift the same way.
import { execFileSync } from "node:child_process";
import { ruleCosts, BUDGET_WORDS } from "../lib/prompt.mjs";

const js = ruleCosts();

const py = JSON.parse(
  execFileSync("python3", ["-c", `
import sys, json
sys.path.insert(0, "cog")
from beenga_prompt import rule_costs
print(json.dumps(rule_costs()))
`], { encoding: "utf8" }).trim()
);

const pyById = Object.fromEntries(py.map((r) => [r.id, r]));
const problems = [];

for (const r of js) {
  const p = pyById[r.id];
  if (!p) { problems.push(`${r.id}: missing from cog/beenga_prompt.py`); continue; }
  for (const k of ["tier", "full", "terse", "dynamic"]) {
    if (r[k] !== p[k]) problems.push(`${r.id}.${k}: js=${r[k]} py=${p[k]}`);
  }
}
for (const id of Object.keys(pyById)) {
  if (!js.some((r) => r.id === id)) problems.push(`${id}: only in cog/beenga_prompt.py`);
}

console.log("tier  rule                    full  terse  saved");
let full = 0, terse = 0;
for (const r of [...js].sort((a, b) => a.tier - b.tier || b.full - a.full)) {
  if (r.dynamic) {
    console.log(`  ${r.tier}   ${r.id.padEnd(22)}  dynamic — sized at assembly`);
    continue;
  }
  full += r.full; terse += r.terse;
  console.log(`  ${r.tier}   ${r.id.padEnd(22)} ${String(r.full).padStart(4)} ` +
              `${String(r.terse).padStart(6)} ${String(r.full - r.terse).padStart(6)}`);
}

console.log(`\n  static rules: ${full} -> ${terse} words (saves ${full - terse})`);
console.log(`  budget ceiling: ${BUDGET_WORDS}`);
console.log(`  headroom for dynamic rules: ${BUDGET_WORDS - terse}`);

if (problems.length) {
  console.error("\nFAIL — registries disagree:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("\nOK — JS and Python registries agree");
