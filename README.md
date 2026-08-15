# Beenga Image

**Image generation that renders contemporary India the way you asked for it.**

General-purpose image models know what a sari is. What they get wrong is everything around it —
they hear "a rooftop in Delhi" and reach for a weathered terrace and ceremonial silk; they read
"clean-shaven" and add stubble anyway; they take "deep complexion" and quietly lighten it.

Beenga Image is an image-generation system built for India. One endpoint, one call — you send a
prompt, you get an image that matches it. No prompt engineering, no wrestling with negations, no
stacking the same instruction five times to make it stick.

```js
const res = await fetch("https://api.beenga.com/v1/image", {
  method: "POST",
  headers: { Authorization: `Bearer ${BEENGA_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt: "A clean-shaven young Indian man on a rooftop in Delhi, no moustache, no beard",
  }),
});
const { image } = await res.json();
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

This repository holds the benchmark suite and the evaluation tooling behind the system, so the
claims above can be checked rather than taken on trust.

---

## Licence

Apache 2.0 — see [LICENSE](LICENSE).

Built on FLUX.2 Klein 4B from Black Forest Labs, Apache-2.0 and released for commercial use.
Note that BFL publishes the 4B models under Apache 2.0 and the **9B models under a non-commercial
licence** — the names differ by two characters.

"Beenga" is a trademark. Apache 2.0 grants no trademark rights.
