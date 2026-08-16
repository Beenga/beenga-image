// Assert that every place INDIAN_PLACE knows about, INDIA also knows about.
//
//   node scripts/check-place-lists.mjs
//
// The two lists serve different questions — INDIA asks "is this prompt about
// India?" (apply contemporary defaults), INDIAN_PLACE asks "is this a
// non-northern place?" (suppress the North Indian descriptor). INDIA must
// therefore be a SUPERSET. It was not: INDIAN_PLACE listed kerala, andhra,
// karnataka and two dozen more that INDIA did not, so those prompts skipped the
// contemporary default entirely while still suppressing the regional look.
//
// Run this after touching either list, alongside the JS/Python parity check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "lib/prompt.mjs"), "utf8");

const grab = (name) => {
  const m = src.match(new RegExp(`const ${name} = /\\\\b\\(([^]*?)\\)\\\\b/i;`));
  if (!m) throw new Error(`could not find ${name} in lib/prompt.mjs`);
  return m[1].split("|");
};

const india = grab("INDIA");
const places = grab("INDIAN_PLACE");

// Compare on the literal alternatives, normalising the \s+ / \s* forms so
// "north\s*east" and "north east" count as the same term.
const norm = (s) => s.replace(/\\s[+*]/g, " ").trim();
const indiaSet = new Set(india.map(norm));
const missing = places.map(norm).filter((p) => !indiaSet.has(p));

console.log(`INDIA        ${india.length} terms`);
console.log(`INDIAN_PLACE ${places.length} terms`);

if (missing.length) {
  console.error(`\nFAIL — in INDIAN_PLACE but not INDIA (${missing.length}):`);
  for (const m of missing) console.error(`  ${m}`);
  console.error("\nThose prompts suppress the North Indian look but skip the");
  console.error("contemporary default. Add them to INDIA in BOTH lib/prompt.mjs");
  console.error("and cog/beenga_prompt.py.");
  process.exit(1);
}

console.log("\nOK — INDIAN_PLACE is a subset of INDIA");
