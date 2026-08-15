# Beenga Image

**Image generation that renders contemporary India the way you asked for it.**

General-purpose image models know what a sari is. What they get wrong is everything around it —
they hear "a rooftop in Delhi" and reach for a weathered terrace and ceremonial silk; they read
"clean-shaven" and add stubble anyway; they take "deep complexion" and quietly lighten it.

Beenga Image is a prompt-adherence layer over [FLUX.2 Klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
(Apache-2.0) that fixes those failures. Same model, same speed, same cost — your prompt is
rewritten before it reaches the model so the attributes you specified actually survive.

```js
import { enhance } from "beenga-image/lib/prompt.mjs";

const { prompt } = enhance(
  "A clean-shaven young Indian man on a rooftop in Delhi, no moustache, no beard"
);
// → negations rewritten into positive description, contemporary context supplied,
//   fragile attributes restated. Send `prompt` to any FLUX.2 Klein endpoint.
```

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
- **Zero added cost** — text transformation only; no extra inference, no hosting, no GPU
- **Portable** — plain ES modules with no dependencies; works with any FLUX.2 Klein endpoint

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

## Install

```bash
git clone https://github.com/Beenga/beenga-image
cd beenga-image
cp .env.example .env     # add your inference provider token
```

Node 18+. No dependencies.

---

## Licence

Apache 2.0 — see [LICENSE](LICENSE).

Built on FLUX.2 Klein 4B from Black Forest Labs, Apache-2.0 and released for commercial use.
Note that BFL publishes the 4B models under Apache 2.0 and the **9B models under a non-commercial
licence** — the names differ by two characters.

"Beenga" is a trademark. Apache 2.0 grants no trademark rights.
