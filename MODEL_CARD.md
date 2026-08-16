# Model Card — Beenga Image

**Status: deployed. The adapter is served, not distributed.** Beenga Image runs in production
on Replicate. The prompt layer is the product; the curl LoRA ships inside the served image
behind an opt-in flag, and is not published as a downloadable checkpoint. This card documents
what exists and what was measured.

## What Beenga Image is

A prompt-adherence layer over an Apache-2.0 base model, built for contemporary Indian imagery.
As of this version it is **not a new set of weights** — it is a measured, versioned pipeline.
A LoRA was trained; it did not meet the bar to be on by default, and is served opt-in only
(see *Adapters* below).

```
user prompt
   ↓
Beenga prompt layer   lib/prompt.mjs — negation rewriting, contemporary defaults,
   ↓                  attribute stacking
FLUX.2 Klein 4B       Apache-2.0
   ↓
image
```

## Base model

| | |
|---|---|
| Model | `black-forest-labs/FLUX.2-klein-4B` (distilled, for inference) |
| Fine-tuning base | `black-forest-labs/FLUX.2-klein-base-4B` (undistilled) |
| Licence | Apache 2.0 — commercial use permitted |
| Provider | Black Forest Labs |

**Do not substitute the 9B variant.** BFL releases the 4B models under Apache 2.0 and the 9B
models under a non-commercial licence. The names differ by two characters and both live in the
same Hugging Face organisation.

## Adapters

| | |
|---|---|
| Name | `beenga_curl_v1` |
| Status | **served opt-in** as `curl_enhance`, default off — did not meet the bar to be a default |
| Distribution | not published as a downloadable checkpoint |
| Served checkpoint | step 1500 — see *Outstanding* below, the step-500 checkpoint scored better |
| Method | LoRA, rank 32, alpha 32 |
| Steps | 1500 (checkpoints at 500 / 1000 / 1500) |
| Optimiser | adamw8bit, lr 1e-4, flowmatch scheduler, bf16, quantised |
| Resolutions | 512 / 768 / 1024 |
| Hardware | 1× NVIDIA A40 48 GB, ~35 min |
| Training data | 200 images, **100% synthetic** (Z-Image Turbo, Apache-2.0) |
| Real photographs | 0% |

**Why it is opt-in rather than on by default.** Explicit control survived — asked for
pin-straight hair, it renders pin-straight hair. But it shifted the default for *unspecified*
hair toward curly, and dragged the whole visual style of its training set along with it:
plainer backgrounds, more ordinary faces, deeper complexions, neutral expressions, applied
regardless of prompt. Enabling that by default would tax every generation to fix one
attribute, so the caller chooses.

The cause is the dataset. Every one of the 200 captions used the same template, from a single
generator, with no contrast examples — nothing straight, tight, coily or glamorous. The adapter
had no way to learn that curl geometry is separable from everything else in frame.

The step-500 checkpoint is the best of the three; step 1500 is visibly overtrained.

**Outstanding.** The checkpoint currently served is step 1500 — the overtrained one — not
step 500. The deployed file's own `training_info` metadata reads `{"step": 1500, "epoch": 2}`.
This is a packaging mistake, not a considered choice: the final checkpoint was saved under the
plain `beenga_curl_v1.safetensors` name and that is the name the predictor loads. Correcting it
means rebuilding and repushing the image, so it is recorded here rather than quietly fixed.

## Training data provenance

| Source | Share | Licence | Notes |
|---|---|---|---|
| Z-Image Turbo generations | 100% | Apache 2.0, no output restriction | `datasets/recipes.mjs` |
| Real photographs | 0% | — | none used |

No scraped data, no stock imagery, no images of identifiable real people, no user-contributed
photographs.

## Benchmark methodology

`benchmarks/beenga-india-v1.json` — 29 cases across hair, grooming, facial hair, clothing,
scenes, dance, appearance, complexion and multi-attribute adherence. Each case declares whether
it tests an **explicit instruction** (`must_obey`) or an **unprompted default**
(`default_behavior`).

Run with `scripts/run-benchmark.mjs`, with or without the prompt layer. Fixed seeds throughout,
so differences are attributable to the prompt or adapter rather than sampling noise.

**Scoring is manual except for complexion.** `scripts/score-complexion.py` measures median
Rec.709 luma of the face region, which is objective and reproducible. Every other axis is a
human judging images — subjective, not reproducible, and a real limitation of this benchmark.

## Results

| Defect | Fix |
|---|---|
| Generic Indian prompts default to traditional/ceremonial | prompt layer |
| "Clean-shaven" renders stubble | prompt layer — five stacked positive restatements, 6/6 |
| Requested deep complexions render lighter | prompt layer, per-tone stacks; luma monotonic across 7 tones over 42 images |
| Soft/salon curls collapse under attribute load | LoRA — served opt-in, partially fixed |

## Known limitations

- Manual scoring on every axis except complexion.
- Several findings rest on single-seed samples; only the complexion sweep and the
  default-behaviour cases have multi-seed confirmation.
- The benchmark covers Indian contexts only. Nothing here says anything about other domains.
- Curl geometry remains partially unfixed. It is the one defect prompting did not fully resolve.
- The complexion measurement is not calibrated to any standard skin-tone scale; only the
  ordering is meaningful, and at the light end the per-seed spread exceeds the gap between
  adjacent tones.

## Safety

Beenga Image adds no safety capability of its own. The base model's filters and BFL's
Out-of-Scope Use policy apply. That policy binds conduct separately from the Apache licence,
which BFL's model card states it does not modify.

The prompt layer deliberately supplies *contemporary* defaults for Indian scenes. That is an
editorial choice, and it is a substitution of one default for another — made because the
measured baseline skewed heavily ceremonial, not because it is neutral.

## Licence

Apache 2.0. See `LICENSE`.

Upstream components are Apache 2.0. As of 2026-08-15 the `black-forest-labs/flux2` repository
ships no `NOTICE` file, so Apache §4(d) propagation does not currently apply — recheck if
re-vendoring at a later commit.

"Beenga" is a trademark. Apache 2.0 grants no trademark rights.
