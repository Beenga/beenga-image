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

**Do not substitute the 9B variant.** See *Licence & attribution* below for the
exact terms and the quantised variants.

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
| Z-Image Turbo generations | 100% | Apache 2.0 (repo) | `datasets/recipes.mjs` — output terms not separately reviewed |
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
| "Clean-shaven" renders stubble | prompt layer — 8/12 clean vs 0/12 raw; see *Grooming* below |
| Requested deep complexions render lighter | prompt layer, per-tone stacks; luma monotonic across 7 tones over 42 images |
| Soft/salon curls collapse under attribute load | LoRA — served opt-in, partially fixed |

## Grooming — re-measured 2026-08-16

An earlier version of this card claimed 6/6 on clean-shaven. That figure did not survive
re-measurement and has been replaced.

Six prompts spanning age (20s, 40s, middle-aged) and complexion (unspecified, deep, very deep),
in both phrasings users actually type — `clean-shaven ... no beard, no moustache` and
`clean shave` — at two seeds each, with the layer on and off. 24 images, in `out/shave-eval/`.

| | Clean | Residual stubble |
|---|---|---|
| Layer on | **8 / 12** | 4 / 12 |
| Layer off | **0 / 12** | 12 / 12 |

The four misses show light stubble rather than a beard or moustache, and all four fall on the
same seed — the failure is seed-dependent, not prompt-dependent.

**The negation rewriting is not obviously the mechanism doing the work.** The two prompts where
no negation rule fired — `clean shave` with no "no X" phrasing, and a shopkeeper prompt that
never mentions facial hair — came back clean 4 times out of 4. The four prompts that did fire
`negation, negation` came back clean 4 times out of 8. The sample is too small to conclude from,
but it points the other way from the design: restating "no moustache" positively still puts the
concept in the prompt, and never raising it at all may do better. Worth a proper sweep.

Scoring here is by eye, with the same limitations as every other axis except complexion.

## Regional variation — measured, unfixed 2026-08-16

`delhi man in 20s`, `kerala man in 20s` and `andhra man in 20s` all return the same face.
Four things were tried and measured:

| Attempt | Result |
|---|---|
| Raw prompts, layer **off** — Kerala / Punjab / Tamil / Bengali | One face, one bone structure. **Klein does not encode Indian regional variation.** |
| Stating "South Indian appearance" instead of suppressing "North Indian" | No perceptible change |
| Sampling complexion and hair per prompt, inside the house look | Marginal — four regions still read as one man with different skin tone |
| Relaxing the house look's beauty descriptors | No change — the house look is **not** the homogeniser |

The cause appears to be **prompt dilution**, the first known problem below. The same
complexion-and-hair attributes appended to a ~12-word prompt produce four visibly different
people; appended to the layer's ~120-word output they produce one. The attributes are not
weak, they are outnumbered.

So the fix is not another rule. It is the length budget — terse defaults, full strength only
for what the user asked for. The face-variety rule was written, measured, and reverted rather
than shipped, because it lengthened the prompt without moving the result.

Regional facial diversity beyond this is a fine-tune target, not a prompt target.

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

Beenga Image does not currently introduce an independent safety or moderation layer. Deployers are responsible for implementing appropriate safeguards and complying with applicable usage policies.

The prompt layer deliberately supplies *contemporary* defaults for Indian scenes. That is an
editorial choice, and it is a substitution of one default for another — made because the
measured baseline skewed heavily ceremonial, not because it is neutral.

## Licence & attribution

**Beenga Image** is built on [**FLUX.2 [klein] 4B**](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
by Black Forest Labs.

FLUX.2 [klein] 4B is released under the **Apache License 2.0**, which permits commercial use,
modification and distribution subject to the terms of the licence. Beenga Image is also released
under the **Apache License 2.0** — see `LICENSE`.

> **Check the variant before substituting.** As of 2026-08-16, Black Forest Labs publishes the
> **4B** models under Apache 2.0 — including `4b-fp8` and `4b-nvfp4` — and the **9B** models under
> the **FLUX Non-Commercial License v2.1**, with `9b-fp8` additionally gated. The names differ by
> two characters (`4b-fp8` / `9b-fp8`) and all live in the same Hugging Face organisation. Verify
> the licence of any model you swap in.

As of 2026-08-15 the `black-forest-labs/flux2` repository ships no `NOTICE` file, so Apache §4(d)
propagation does not currently apply — recheck if re-vendoring at a later commit.

Use may also be subject to Black Forest Labs' applicable usage policies. See *Safety* above.

### Trademarks

**Beenga™** is a trademark of Beenga. The Apache License 2.0 grants no permission to use Beenga
trademarks, logos or branding, except as required for reasonable and customary attribution.
