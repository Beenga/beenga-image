# Beenga Image

**Image generation that renders contemporary India the way you asked for it.**

General-purpose image models know what a sari is. What they get wrong is everything around it — they hear "a rooftop in Delhi" and reach for a weathered terrace and ceremonial silk; they read "clean-shaven" and add stubble anyway; they take "deep complexion" and quietly lighten it.

Beenga Image is a prompt-adherence layer over an Apache-2.0 base model, built for Indian subjects, dress, settings and skin tones. You send a plain prompt; the layer rewrites it so the attributes you asked for survive. No prompt engineering, no wrestling with negations, no stacking the same instruction five times to make it stick.

```
prompt: "modern indian man in 20s in gym, shorts and tshirt, clean shave"
```

Every rule in the layer exists because a specific generation failed. The full source, the benchmark suite and the evaluation tooling are public at [github.com/Beenga/beenga-image](https://github.com/Beenga/beenga-image).

---

## What the layer fixes

### Negations actually work

Diffusion models cannot negate. "no moustache" contributes the token *moustache* and nothing else — which is why asking for a clean-shaven man keeps returning stubble. Beenga rewrites every negation into a positive description of the wanted state, and stacks it.

*clean-shaven, no beard, no moustache* — **8 of 12 renders come back clean with the layer, against 0 of 12 without it.** Six prompts spanning age and complexion, two seeds each. The four misses show light residual stubble rather than a beard, and all four fall on the same seed. Scored by eye, so subjective; the sweep is reproducible with a fixed seed. An improvement, not a solved problem.

### Contemporary India is the default

A generic Indian prompt returns a modern, present-day scene unless you ask for something traditional. Ask for a wedding or a classical dance form and the layer stays out of the way.

| Prompt | Raw model | With Beenga |
|---|---|---|
| "a rooftop in Delhi" | weathered terrace, historic domes, ceremonial sari | clean modern terrace, shirt and jeans |
| "an Indian woman dancing to music" | stage, band, heavy silk, classical pose | living room, casual clothes, natural movement |
| "a portrait of an Indian woman" | maroon-and-gold silk, gold jewellery | contemporary dress, natural complexion |

### Complexion renders as specified

Requested skin tones below wheatish come back lighter than asked on the raw model. Beenga applies per-tone descriptions so each lands on its own target — not a blanket darkening, which would be the same bias mirrored.

Measured across 42 images, seven tones, both genders, three seeds. Median face luma falls monotonically from very fair to very deep, with no inversions.

**Fair-by-default was deliberately dropped.** It repeats the bias this project measured and fixed in other models, in a market where skin lightening is a live controversy. Requested tones render correctly; unrequested ones are not pushed either way.

### Attributes survive long prompts

Braid count, sleeve length, curl type and complexion get diluted when a prompt carries many attributes at once. The layer restates the fragile ones so they hold.

### Deity iconography

Neither the base model nor its peers know the iconography without being told. Iconography is stated for seven deities, so Hanuman gets a gada and a crown rather than a generic monkey.

---

## Inputs

| Input | Default | What it does |
|---|---|---|
| `prompt` | — | Write it plainly. The layer handles the phrasing. |
| `beenga_prompt_layer` | `true` | Turn off to see the raw base model's behaviour. This is how the comparisons above were produced — flip it to check them yourself. |
| `aspect_ratio` | `1:1` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` |
| `num_inference_steps` | `4` | The distilled checkpoint is tuned for 4. |
| `guidance_scale` | `3.5` | Ignored by the distilled model, which is step-wise distilled. |
| `seed` | random | Fix it and the same prompt reproduces byte-for-byte. Re-rolling varies unspecified garment choices. |
| `curl_enhance` | `false` | Opt-in curl adapter. Read the caveat below before enabling. |
| `output_format` | `png` | `png`, `jpg`, `webp` |

### `curl_enhance`

A LoRA trained to sharpen salon-curl geometry. It is off by default and should stay off unless curls are what you are generating.

It works — asked for pin-straight hair it still renders pin-straight hair — but it leaks. It shifts the default for *unspecified* hair toward curly, and drags the flatter look of its training set into unrelated scenes: plainer backgrounds, more ordinary faces, neutral expressions. Enabling it by default would tax every generation to fix one attribute.

The adapter was trained on 200 images, 100% synthetic, no real photographs and no scraped data. It is published at [`beenga8/beenga-curl-v1`](https://huggingface.co/beenga8/beenga-curl-v1) — step 500, the best of three checkpoints. See the [model card](https://github.com/Beenga/beenga-image/blob/main/MODEL_CARD.md).

---

## Performance

Warm generations take about 1.7s on an L40S. The model scales to zero, so the first request after an idle period pays a cold start of several minutes while a ~70GB image is placed. If you need consistently low latency, run it behind a Replicate Deployment with `min_instances=1`.

---

## Limitations, stated plainly

- **Scoring is manual on every axis except complexion.** Complexion is measured objectively as median Rec.709 face luma; everything else is a human judging images — subjective and not reproducible.
- **Several findings rest on single-seed samples.** Only the complexion sweep and the default-behaviour cases have multi-seed confirmation.
- **Indian contexts only.** Nothing here says anything about other domains.
- **Curl geometry is improved, not solved.**
- **Cultural objects are a known gap.** The base model does not know a tabla and will render congas. Stating iconography fixes deities; the general gap is unfixed.
- **The complexion measurement is not calibrated to any standard skin-tone scale.** Only the ordering is meaningful, and at the light end the per-seed spread exceeds the gap between adjacent tones.
- **The contemporary defaults are an editorial choice.** The layer substitutes one default for another, made because the measured baseline skewed heavily ceremonial — not because it is neutral.

---

## Licence & attribution

**Beenga Image** is built on [**FLUX.2 [klein] 4B**](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) by Black Forest Labs.

FLUX.2 [klein] 4B is released under the **Apache License 2.0**, which permits commercial use, modification and distribution subject to the terms of the licence. Beenga Image is also released under the **Apache License 2.0**.

> **Check the variant before substituting.** As of 2026-08-16, Black Forest Labs publishes the **4B** models under Apache 2.0 — including `4b-fp8` and `4b-nvfp4` — and the **9B** models under the **FLUX Non-Commercial License v2.1**, with `9b-fp8` additionally gated. The names differ by two characters (`4b-fp8` / `9b-fp8`) and all live in the same Hugging Face organisation. Verify the licence of any model you swap in.

Use may also be subject to Black Forest Labs' applicable usage policies.

### Safety

Beenga Image does not currently introduce an independent safety or moderation layer. Deployers are responsible for implementing appropriate safeguards and complying with applicable usage policies.

### Trademarks

**Beenga™** is a trademark of Beenga. The Apache License 2.0 grants no permission to use Beenga trademarks, logos or branding, except as required for reasonable and customary attribution.
