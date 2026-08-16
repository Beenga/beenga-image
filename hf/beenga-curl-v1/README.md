---
license: apache-2.0
base_model: black-forest-labs/FLUX.2-klein-4B
library_name: diffusers
pipeline_tag: text-to-image
tags:
  - lora
  - text-to-image
  - diffusers
  - india
inference: false
---

# beenga-curl-v1

A LoRA adapter for FLUX.2 [klein] 4B that sharpens soft and salon-curl hair geometry,
trained as part of [Beenga Image](https://github.com/Beenga/beenga-image).

**Read the limitations before using this.** The adapter works, and it leaks. Both halves
are documented below, because the leak is the reason it is opt-in rather than default in
the product it was built for.

| | |
|---|---|
| Adapter | LoRA, rank 32, alpha 32 |
| Base model | `black-forest-labs/FLUX.2-klein-4B` (Apache 2.0) |
| Checkpoint | **step 500** of a 1500-step run — see *Which checkpoint* below |
| File | `beenga_curl_v1.safetensors`, 160 tensors, 92,426,528 bytes |
| SHA-256 | `bea8e082a3ed30dd63d37a217a726a9e2f60422cfba2e8de4c453a601ecef6b4` |
| Trained with | [ai-toolkit](https://github.com/ostris/ai-toolkit) 0.12.23 |

## Usage

```python
import torch
from diffusers import Flux2KleinPipeline

pipe = Flux2KleinPipeline.from_pretrained(
    "black-forest-labs/FLUX.2-klein-4B", torch_dtype=torch.bfloat16,
).to("cuda")

pipe.load_lora_weights(
    "beenga8/beenga-curl-v1",
    weight_name="beenga_curl_v1.safetensors",
    adapter_name="curl",
)

image = pipe(
    "a young indian woman with soft salon curls, rooftop in Delhi",
    num_inference_steps=4,
).images[0]
```

**Always pass `weight_name` explicitly.** If you run with `HF_HUB_OFFLINE=1` or
`local_files_only=True` — which you may well need to, on serverless workers that cannot
reach the Hub during setup — the loader will not guess a filename and raises
`ValueError: When using the offline mode, you must specify a 'weight_name'` before it
ever looks at the path. A valid local file fails with a message that does not say so.
This cost us a shipped feature that failed on 100% of calls; the explicit form is correct
either way.

To unload:

```python
pipe.unload_lora_weights()
```

## What it does

Asked for curls, it renders better curl geometry than the base model. Explicit control in
the other direction survives intact: ask for pin-straight hair and it renders pin-straight
hair.

## What it does wrong

This is the important section.

- **Unspecified hair drifts curly.** If the prompt says nothing about hair, the adapter
  pushes toward curls anyway. It changes a default you did not ask it to change.
- **The training set's look bleeds into unrelated scenes.** Plainer backgrounds, more
  ordinary faces, deeper complexions, flatter and more neutral expressions — applied
  regardless of what the prompt asked for.

The cause is the dataset, not the training run. All 200 captions came from a single
template and a single generator, with no contrast examples — nothing straight, tight,
coily or glamorous. The adapter had no way to learn that curl geometry is separable from
everything else in the frame, so it learned "curls" and "this visual style" as one thing.

If you use this, use it deliberately, on prompts where curls are the subject. In Beenga
Image it is exposed as an opt-in flag that is off by default, for exactly this reason.

## Which checkpoint

Checkpoints were saved at steps 500, 1000 and 1500. **Step 500 is published here because
it is the best of the three**; step 1500 is visibly overtrained.

Stated plainly because it matters to anyone comparing: the Beenga Image production image
currently serves the step-1500 file, which is a packaging mistake — the final checkpoint
was saved under the plain output name and that is the name the predictor loads. It is
recorded in the project's model card and will be corrected on the next rebuild. The file
in *this* repository is step 500, verified from its own `training_info` metadata
(`{"step": 500, "epoch": 0}`) and by the SHA-256 above.

## Training

| | |
|---|---|
| Steps | 500 (published) of 1500 run |
| Optimiser | adamw8bit, lr 1e-4 |
| Scheduler | flowmatch |
| Precision | bf16, quantised |
| Resolutions | 512 / 768 / 1024 |
| Hardware | 1× NVIDIA A40 48GB, ~35 min for the full 1500-step run |

## Training data

| Source | Share | Licence |
|---|---|---|
| Z-Image Turbo generations | 100% | Apache 2.0, no output restriction |
| Real photographs | 0% | — |

200 images, entirely synthetic. **No scraped data, no stock imagery, no images of
identifiable real people, no user-contributed photographs.** Generation recipes are in
[`datasets/recipes.mjs`](https://github.com/Beenga/beenga-image/blob/main/datasets/recipes.mjs).

## Evaluation

Assessed by human judgement against the Beenga Image benchmark suites, with fixed seeds so
differences are attributable to the adapter rather than sampling noise. Scoring for hair
geometry is manual and therefore subjective and not reproducible — a real limitation, and
the same one that applies to every axis of that project except complexion, which is
measured by script.

## Licence

Apache 2.0, matching the base model. Use of FLUX.2 [klein] 4B is also subject to Black
Forest Labs' Out-of-Scope Use policy, which binds conduct separately from the copyright
licence.

> **Check the variant before substituting.** As of 2026-08-16, Black Forest Labs publishes
> the **4B** models under Apache 2.0 and the **9B** models under the **FLUX Non-Commercial
> License v2.1**. The names differ by two characters and both live in the same
> organisation.

This adapter introduces no safety or moderation capability of its own.

**Beenga™** is a trademark of Beenga. Apache 2.0 grants no trademark rights.
