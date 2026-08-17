# Beenga Image — raw material for LinkedIn

Everything below was measured or verified on 2026-08-16, not recalled. Numbers
are exact. Combine with beenga-video material as needed.

---

## THE STRONGEST STORY: your benchmark shares your blind spot

- Wrote **29 benchmark cases** derived from the specification. Careful work:
  fixed seeds, each case declaring whether it tested an explicit instruction or
  an unprompted default.
- Then used the product. Found **12 defects**. **Three of them were bugs in the
  prompt layer itself** that the 29-case suite could not catch.
- Cause: the rules and the test cases were written from the same assumptions on
  the same afternoon. They agreed with each other, not with reality. The suite
  passed. Its passing meant only internal consistency.
- The specific misses are mundane and that's the point. Rules matched
  `clean-shaven`; users type `clean shave`. Rules handled `sari`; users write
  `saree`. Rules keyed on `woman`; users write `lady`. Rules parsed explicit
  ages; users write `20s`.
- What broke the loop was a different **source** of cases, not more cases from
  the same source.
- The 12-case real-world suite is now more useful than the 29-case one, which
  caught none of the defects that using the product found.

**Quotable:** "A benchmark that agrees with you is worse than no benchmark. It
costs the same and buys confidence instead of information."

**It happened again, twice, in one day:**
- `INDIA` regex listed 14 cities, no states. `kerala man in 20s` was Indian
  enough to suppress the North Indian descriptor but not Indian enough to
  receive the contemporary default — the headline feature, silently skipped, for
  any prompt naming a state. The benchmark cases all used city names.
- A published claim of 6/6 on clean-shaven did not reproduce (see below). The
  benchmark case used different phrasing from the README's own hero prompt.

---

## MEASURE, DON'T ASSERT

### Complexion — the one thing scored by instrument
- 42 images, 7 tones, both genders, 3 seeds.
- Median Rec.709 face luma falls **monotonically** from very fair to very deep,
  no inversions.
- Stated limitation: not calibrated to any standard skin-tone scale, so only the
  ordering is meaningful, and at the light end per-seed spread exceeds the gap
  between adjacent tones.

### Fair-by-default was removed
- It was in the product. It made outputs more conventionally flattering.
- Dropped because it repeated the exact bias the project had just measured in
  other models, in a market where skin lightening is a live controversy.
- Requested tones still render correctly. Unrequested ones are not pushed either
  way.
- A decision with a price, which is what makes it worth writing about.

### A published claim that didn't survive re-measurement
- README claimed clean-shaven "correct on 6 of 6".
- Re-tested: 24 images, 6 prompts spanning age and complexion, both phrasings
  users type, 2 seeds each, layer on and off.
- Actual: **8 of 12 clean with the layer, 0 of 12 without it.**
- The four misses are light stubble, not beards, and all four fall on the same
  seed — seed-dependent, not prompt-dependent.
- Old figure retired from README, model card and the public Replicate page.
- The replacement is better material: a **zero baseline** is a stronger claim
  than a perfect score, and it's honest about what still fails.

---

## FINDINGS THAT CONTRADICT OUR OWN DESIGN

### The negation rewriting may be the weaker path
The whole layer is built on rewriting negations, because diffusion models can't
negate — "no moustache" contributes the token *moustache* and nothing else.

But in the 24-image sweep:
- Prompts where the negation rule **fired**: clean **4 of 8**
- Prompts where it **never fired** (never said "no X"): clean **4 of 4**

Restating "no moustache" positively still puts the concept in the prompt. Never
raising it may simply do better. Sample too small to conclude from — written
down rather than dropped.

### More inference steps make it worse
Same prompt, same seed, 4 → 8 → 16 steps: facial hair becomes **progressively
more defined**. Extra steps add facial detail, and the detail the model adds to a
young Indian male face is stubble. You cannot buy your way out with compute.

### The layer became the disease it treats
- Built to stop attribute dilution in long prompts.
- Measured across 41 cases: median **20 user words → 81 added → 101 sent**.
- Worst case: `"beautiful delhi girl in sari"` — 5 words — reaches the model as
  **142 words**. The user wrote **4%** of it.
- Biggest single cost: `hair-realism` at **26 words**, an anti-AI-tell quality
  rule, not an adherence rule. It fires on every person prompt.
- Second biggest: **20 words spent reinforcing an age the user never gave** —
  inferred "early twenties" from the word "girl".

**The proof it matters:** identical complexion and hair attributes appended to a
~35-word prompt produce four visibly different people. Appended to the layer's
~120-word output, they produce one face repeatedly. Same attributes, same seed.
They were never weak — they were outnumbered.

**Result of the fix:** mean prompt 98.9 → 62.7 words. Grooming at the seed that
previously failed 4 of 4 went to **3 of 4 clean**.

---

## WHAT PROMPTING CANNOT FIX

`delhi man`, `kerala man`, `andhra man` all returned the same face. Four things
tried and measured:

| Attempt | Result |
|---|---|
| Raw prompts, layer **off** — Kerala / Punjab / Tamil / Bengali | One face, one bone structure |
| Stating "South Indian appearance" | No perceptible change |
| Sampling complexion and hair per prompt | Marginal |
| Relaxing the house look's beauty descriptors | No change |

**The base model does not encode Indian regional facial variation at all.** No
descriptor retrieves a distinction the model does not hold. This is a fine-tune
target, not a prompt target — and the first defect in the project that prompting
genuinely could not reach.

A rule was written to fix it, measured, and **reverted rather than shipped**,
because it lengthened the prompt without moving the result.

---

## TWO CORRECT FIXES, FATAL TOGETHER

- Deployment kept dying at startup with `RemoteProtocolError`. Fix: set
  `HF_HUB_OFFLINE=1` so the pipeline never calls the Hub at setup. This is what
  made the model deployable at all.
- That same flag makes diffusers refuse to guess a LoRA filename — it raises
  `ValueError: When using the offline mode, you must specify a weight_name`
  **before it ever looks at the path**. A perfectly valid local file fails with a
  message that doesn't say so.
- Result: the curl adapter failed on **100% of calls**, while the default path
  stayed green the entire time. Nobody noticed because the feature is opt-in.

**Quotable:** "The flag that made deployment survive was the same flag that
silently broke the feature. Each fix was correct alone."

---

## SHIPPING THE WRONG FILE

- Three LoRA checkpoints — steps 500, 1000, 1500 — **all exactly 92,426,528
  bytes**. Identical size, different content.
- The final checkpoint was saved under the plain output name, and that is the
  name the predictor loads.
- Production has been serving **step 1500**, which the project's own model card
  calls "visibly overtrained", while **step 500** measured best.
- Found by reading the safetensors metadata header:
  `training_info: {"step": 1500, "epoch": 2}`.
- The publish script now **refuses to upload** unless both the SHA-256 and the
  file's own metadata agree it's step 500.

---

## OPERATIONS AND ECONOMICS

- Warm generation: **1.7s**. Cold start: **340s**.
- On an L40S at $0.000975/s: warm image ≈ **$0.0017**, cold start ≈ **$0.33** —
  roughly **200×**. For sporadic traffic, cold starts *are* the bill.
- The model image is ~70GB because the weights are baked in. That was deliberate
  — downloading at boot failed repeatedly with `RemoteProtocolError`.
- **8 builds were spent guessing** before reading the right log. The summary
  banner shows a misleading dependency warning; the real error is in Setup logs.
- `cog.yaml` had **no revision pin** on the weight download. Every rebuild pulled
  whatever was at `main`, so an upstream update would have silently changed the
  model with nothing recording which build shipped which weights. Now pinned.
- The fp8 variant of the same model is **4.08 GB against 23.74 GB** — 5.8×
  smaller, same Apache 2.0 licence, ungated.

---

## LICENSING AND PROVENANCE

- Base model is Apache 2.0 — commercial use, modification and redistribution all
  permitted.
- **The trap:** the 4B models are Apache 2.0; the 9B models are under the FLUX
  Non-Commercial License v2.1. The names differ by two characters. With
  quantised variants the gap is now `4b-fp8` vs `9b-fp8` — and `9b-fp8` is
  additionally auto-gated.
- Training data for the adapter: **200 images, 100% synthetic**, generated by an
  Apache-2.0 model. No scraped data, no stock imagery, no identifiable real
  people, no user-contributed photographs.
- A provenance manifest now records generator, revision, licence **at generation
  date**, prompts, filtering, training config and checkpoint hashes — and states
  its own gaps. The most useful entry is the honest one: the generator revision
  was never recorded, so that dataset cannot be regenerated exactly.

**A correction made today:** the docs claimed "the base model's filters apply".
Open weights don't generally carry an intrinsic content filter — that machinery
is largely API-side. The claim asserted a protection that probably doesn't
exist, on a public endpoint. Replaced with: no independent moderation layer,
deployers are responsible.

---

## THE ADAPTER THAT FAILED ITS OWN BAR

- Trained to sharpen curl geometry. It works: ask for pin-straight hair and it
  still renders pin-straight hair.
- But it leaks. Hair you never mentioned drifts curly, and the flat visual style
  of its training set bleeds into unrelated scenes — plainer backgrounds, more
  ordinary faces, neutral expressions, applied regardless of prompt.
- Cause is unglamorous and specific: **200 captions from one template, one
  generator, no contrast examples** — nothing straight, tight, coily or
  glamorous. It never learned that curl geometry is separable from everything
  else in frame.
- Ships behind an opt-in flag, off by default, with the leak documented on its
  public model card.

---

## LINES THAT TRAVEL

- "A benchmark that agrees with you is worse than no benchmark."
- "The tests and the code were written from the same assumptions, so they agreed
  with each other, not with reality."
- "They were never weak instructions — they were outnumbered ones."
- "The flag that made deployment survive was the flag that broke the feature."
- "If a default needs 26 words to work, it isn't a default. It's an opinion
  competing with the user."
- "Every previous fix was a rule added to treat a symptom, and each addition made
  the shared cause slightly worse."
- "Three checkpoints, identical byte size, different content. The wrong one
  reached production."

---

## WHAT'S STILL BROKEN (state these — they're the credibility)

- Scoring is manual on every axis except complexion.
- Several findings rest on single-seed samples.
- Curl geometry improved, not solved.
- Regional facial variation unfixed and not fixable by prompting.
- Production still serves the overtrained checkpoint; correcting it needs a
  rebuild.
- Cultural objects are a known gap — the base model renders congas for a tabla.
- The contemporary defaults are an editorial choice, not a neutral one.
