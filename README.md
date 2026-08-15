# Beenga Image

An image-generation model system built for Indian users, by [Beenga](https://beenga.com).

Beenga Image is not a new set of weights. It is a measured, versioned pipeline around an
Apache-2.0 base model, built to fix a specific problem: general-purpose image models render
contemporary India badly unless you fight them prompt by prompt.

**Status: pre-release.** Wave 1 complete. Nothing published to Replicate or Hugging Face yet.

---

## The problem, measured

29 benchmark cases were built from a specification of failures observed in real use, then run
against `black-forest-labs/flux-2-klein-4b`. The results were not what we expected.

| Prompt type | Result |
|---|---|
| **Explicit attributes** — "exactly two braids", "sleeveless blouse", "average-looking" | 5 pass, 3 partial, 0 fail |
| **Generic prompts** — "a rooftop in Delhi", "dancing to music", "a portrait of an Indian woman" | 0 pass, 3 fail |

Klein knows these concepts. It just never reaches for the modern ones unprompted. Ask for a
rooftop in Delhi and you get a weathered terrace, historic domes and a ceremonial silk sari.
Ask for a portrait of an Indian woman and you get gold jewellery and heavy traditional dress.

That is a prompt problem, not a weights problem — and it turned out to be free to fix.

## What wave 1 changed

`lib/prompt.mjs` applies three rules, each one added because a specific benchmark case failed:

1. **Negation rewriting.** FLUX cannot negate. "no moustache" contributes the token
   *moustache* and nothing else. Every negation is rewritten into a positive description.
2. **Contemporary default.** When a prompt names India and does not ask for something
   traditional, the present day is stated explicitly. This is a default, not an override —
   ask for a wedding or a classical form and the rule stays out of the way.
3. **Fragile-attribute reinforcement.** Attributes that survive alone but get diluted in long
   prompts are restated once, positively, at the end.

Result, confirmed across three seeds:

| Case | Baseline | Wave 1 |
|---|---|---|
| "rooftop in Delhi" | weathered terrace, traditional sari | clean modern terrace, shirt and jeans |
| "portrait of an Indian woman" | maroon-gold silk, gold necklace | contemporary dress, natural complexion |
| "dancing to music" | stage, band, ceremonial sari, classical pose | living room, casual clothes, natural dancing |

Cost of the fix: **$0 in training.** Total spend across all benchmarking to date: **~$0.11.**

## What is still broken

Three defects did not move when re-stated more forcefully. That is the signature of a
weights-level limitation, and it is what a LoRA is for.

| Defect | Evidence | Data needed |
|---|---|---|
| "Clean-shaven" still leaves stubble | `IND-MEN-001` | ~150 images, synthetic acceptable |
| Soft/salon curls collapse to tight ringlets under attribute load | `IND-MULTI-001` vs `IND-HAIR-004` | ~200 images, synthetic acceptable |
| Deep complexion rendered lighter than requested | `IND-SKIN-001` | ~250 **real licensed photographs** |

The third cannot use synthetic data. Training "deep complexion" on images produced by a model
that lightens complexion only relearns the bias.

The original specification proposed ~69 concept buckets and 3,000–5,000 images. Measuring first
reduced that to roughly **600**.

## Known limitations

- **"dancing to music" pulls a stray instrument into frame.** The venue default removed the
  full band rig on 3 of 3 seeds, but a lone mic stand or guitar survives on 2 of 3. The word
  *music* is being rendered literally. Thin edge case; logged rather than fixed.
- Benchmark scoring is manual. 22 of 29 cases are generated but unscored.
- Single-seed results are marked as such. Only the three default-behaviour cases have
  multi-seed confirmation.

## Layout

```
benchmarks/beenga-india-v1.json   29 cases, machine-readable
lib/prompt.mjs                    the prompt layer
scripts/run-benchmark.mjs         runner
out/<tag>/                        images + runs.json + SCORES.md per run
```

## Running it

```bash
cp .env.example .env          # add your Replicate token
npm i                          # no dependencies yet; node 18+ for global fetch

node scripts/run-benchmark.mjs                          # baseline, raw prompts
node scripts/run-benchmark.mjs --enhance --tag wave1     # with the prompt layer
node scripts/run-benchmark.mjs --enhance --only IND-MEN-001 --seed 77 --tag spot
```

Roughly $0.001 per image at 1 MP. A full 29-case run costs about three cents.

## Roadmap

| Wave | Scope | Cost | Ships as |
|---|---|---|---|
| 0 | Benchmark suite, baseline | $0.03 | — |
| 1 | Prompt layer | **$0** | **← done** |
| 2 | Facial hair + curl-type LoRA | ~$2 GPU | Beenga Image 1.1 |
| 3 | Scenes, broader coverage | ~$2 GPU | 1.2 |
| 4 | Complexion fidelity — needs licensed photography | data cost | 2.0 |

Training runs on `FLUX.2-klein-base-4B` via [ai-toolkit](https://github.com/ostris/ai-toolkit)
on a rented 24 GB GPU. Replicate has no FLUX.2 Klein trainer; it is the hosting target only.

## Licensing

Beenga Image will be released under Apache 2.0.

The base model is [FLUX.2 klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
from Black Forest Labs — Apache-2.0, explicitly released for commercial use. Its `LICENSE` and
`NOTICE` must be preserved in any fork.

**Do not use the 9B variant.** It carries a non-commercial licence under a near-identical name.

"Beenga" is a trademark. Apache-2.0 grants no trademark rights.
