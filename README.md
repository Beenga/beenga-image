# Beenga Image

**Image generation that renders contemporary India the way you asked for it.**

General-purpose image models know what a sari is. What they get wrong is everything around it —
they hear "a rooftop in Delhi" and reach for a weathered terrace and ceremonial silk; they read
"clean-shaven" and add stubble anyway; they take "deep complexion" and quietly lighten it.

Beenga Image is an image-generation system built for India. One endpoint, one call — you send a
prompt, you get an image that matches it. No prompt engineering, no wrestling with negations, no
stacking the same instruction five times to make it stick.

```js
const res = await fetch("https://api.replicate.com/v1/predictions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  },
  body: JSON.stringify({
    version: "beenga/beenga-image-1",
    input: {
      prompt: "A clean-shaven young Indian man on a rooftop in Delhi, no moustache, no beard",
    },
  }),
});
const { output } = await res.json();
```

That prompt fails on every general-purpose model — you get stubble and a weathered terrace.
Through Beenga it renders as written.

---

## What it fixes

### Negations actually work

FLUX cannot negate. "no moustache" contributes the token *moustache* and nothing else — which is
why asking for a clean-shaven man keeps returning stubble. Beenga rewrites every negation into a
positive description of the wanted state, and stacks it.

> **clean-shaven, no beard, no moustache** — correct on 6 of 6 across the full complexion and age
> range, where the raw prompt failed on 3 of 4.

### Contemporary India is the default

A generic Indian prompt returns a modern, well-maintained, present-day scene unless you ask for
something traditional. Ask for a wedding or a classical dance form and Beenga stays out of the way.

| Prompt | Raw model | With Beenga |
|---|---|---|
| "a rooftop in Delhi" | weathered terrace, historic domes, ceremonial sari | clean modern terrace, shirt and jeans |
| "an Indian woman dancing to music" | stage, band, heavy silk, classical pose | living room, casual clothes, natural movement |
| "a portrait of an Indian woman" | maroon-and-gold silk, gold jewellery | contemporary dress, natural complexion |

### Complexion renders as specified

Requested skin tones below wheatish come back lighter than asked on the raw model. Beenga applies
per-tone descriptions so each lands on its own target — not a blanket darkening, which would be
the same bias mirrored.

Measured with `scripts/score-complexion.py` across 42 images, seven tones, both genders, three
seeds. Median face luma falls monotonically from very fair to very deep, with no inversions.

### Attributes survive long prompts

Braid count, sleeve length, curl type and complexion get diluted when a prompt carries many
attributes at once. Beenga restates the fragile ones so they hold.

---

## Features

- **Negation rewriting** — positive restatement of anything phrased as an absence
- **Contemporary-context defaults** — present-day India unless traditional is requested
- **Per-tone complexion descriptions** — seven tones, each on target
- **Attribute reinforcement** — braids, sleeves, curls and complexion survive multi-attribute prompts
- **Venue defaults** — scene-less prompts get a coherent setting instead of stray props
- **Explicit intent always wins** — every rule checks that you have not asked for the opposite
- **One call** — prompt in, image out; nothing to configure, chain or tune
- **Built for India** — every default, every benchmark case, every fix is aimed at Indian subjects,
  dress, settings and skin tones

---

## Benchmark

`benchmarks/beenga-india-v1.json` — 29 cases across hair, grooming, facial hair, clothing, scenes,
dance, appearance, complexion and multi-attribute adherence. Each case declares whether it tests an
explicit instruction or an unprompted default.

```bash
node scripts/run-benchmark.mjs                        # raw prompts
node scripts/run-benchmark.mjs --enhance --tag beenga # with Beenga
python3 scripts/score-complexion.py                   # objective complexion scoring
```

Fixed seeds throughout, so differences are attributable to the prompt rather than sampling noise.

**Limitations, stated plainly:** scoring is manual on every axis except complexion. Some findings
rest on single-seed samples. The suite covers Indian contexts only. Curl geometry under heavy
attribute load is improved but not fully solved. The complexion measurement is not calibrated to a
standard skin-tone scale — only the ordering is meaningful.

---

## Getting started

Beenga Image is available as a hosted API. Request access at [beenga.com](https://beenga.com).

### Run it on Replicate

The model is published as [`beenga/beenga-image-1`](https://replicate.com/beenga/beenga-image-1).

```bash
export REPLICATE_API_TOKEN=...          # replicate.com/account/api-tokens

curl -s -X POST https://api.replicate.com/v1/predictions \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d '{
    "version": "beenga/beenga-image-1",
    "input": {
      "prompt": "A clean-shaven young Indian man on a rooftop in Delhi, no moustache, no beard",
      "aspect_ratio": "3:4"
    }
  }'
```

| Input | Default | What it does |
|---|---|---|
| `prompt` | — | Write it plainly. The layer handles the phrasing. |
| `beenga_prompt_layer` | `true` | Turn off to see the raw FLUX.2 Klein behaviour — this is how the before/after tables above were produced. |
| `aspect_ratio` | `1:1` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` |
| `num_inference_steps` | `4` | The distilled checkpoint is tuned for 4. |
| `seed` | random | Fix it and the same prompt reproduces byte-for-byte. |
| `curl_enhance` | `false` | Opt-in curl adapter. Read the caveats in [MODEL_CARD.md](MODEL_CARD.md) before enabling it. |

Warm generations take about 1.7s. The model scales to zero, so the first call after an idle
period pays a cold start of several minutes while a ~70GB image is placed.

This repository holds the prompt layer, the benchmark suite and the evaluation tooling behind
the system, so the claims above can be checked rather than taken on trust.

---

## Licence & attribution

**Beenga Image** is built on [**FLUX.2 [klein] 4B**](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
by Black Forest Labs.

FLUX.2 [klein] 4B is released under the **Apache License 2.0**, which permits commercial use,
modification and distribution subject to the terms of the licence. Beenga Image is also released
under the **Apache License 2.0** — see [LICENSE](LICENSE).

> **Check the variant before substituting.** As of 2026-08-16, Black Forest Labs publishes the
> **4B** models under Apache 2.0 and the **9B** models under the **FLUX Non-Commercial License
> v2.1**. The names differ by two characters and both live in the same Hugging Face organisation.
> Verify the licence of any model you swap in.

Use of the underlying model is also subject to Black Forest Labs' **Out-of-Scope Use policy**,
which binds conduct separately from the Apache 2.0 copyright licence.

### Safety

Beenga Image introduces no independent safety or moderation system — the base model's filters are
what apply. Applications and hosting providers built on it should add appropriate safeguards and
comply with the usage policies above.

### Trademarks

**Beenga™** is a trademark of Beenga. The Apache License 2.0 grants no permission to use Beenga
trademarks, logos or branding, except as required for reasonable and customary attribution.
