# Handoff — 2026-08-18

State of play. Read this before touching anything.

## Current state (2026-08-18)

- **Live on Replicate:** version `a89289ee966c`, public, verified with real
  predictions — not just "the push succeeded". A `cog push` returning a digest proves
  nothing: version `91361ddc` pushed cleanly and was then disabled for failing setup.
  **Always confirm with an actual prediction.**
- **Git:** `origin/main` in sync.
- **Generation budget:** 60 (`GENERATE_BUDGET_WORDS`). Edit path stays at 0 — scene
  defaults fight a source image regardless of how good the gates are.
- **Build droplet:** created by `scripts/deploy.sh --go`, deliberately NOT destroyed by
  it. Destroy it yourself once satisfied; keeping it makes the next push ~40s instead
  of a cold rebuild.

### Two things that will waste your time if you don't know them

- **`guidance_scale` does nothing.** `Flux2KleinPipeline` gates real classifier-free
  guidance on `guidance_scale > 1 and not config.is_distilled`, and our checkpoint has
  `is_distilled: True`. Verified: guidance 0, 3.5, 7 and 10 at a fixed seed return the
  same image BYTE FOR BYTE. This also means **negative prompts are impossible** here —
  the negative branch is what CFG would have run. Steering away from extra limbs has to
  come from the prompt, the framing, or the step count.
- **`aspect_ratio: "1:1"` is the default and the worst choice for a standing person.**
  Same prompt and seed at 4 steps: 1:1 returned two braids where one was asked for and
  muddled the hands; 3:4 returned a single braid and correct hands. A square frame
  compresses a standing figure and the damage lands on hands and hair. The default has
  NOT been changed — it alters output shape for every caller.

### Open, not done

- Default aspect ratio 1:1 → 3:4. Free, biggest remaining win, changes every caller.
- Hands remain seed-dependent at 4 steps. Steps fix it (4 → 16 measured clean on 3
  prompts) but were ruled out on cost. **There is still no failure RATE for this** —
  every claim in this repo about hands is "N for N on one prompt". That gap is why the
  same argument keeps recurring; a VLM judge scoring hands/fingers would end it.
- The "teenager" adult-push was removed as part of the minor-safety fix, which reverses
  a decision recorded in the code comments. Flagged to the owner, not re-confirmed.
- Replicate showcase examples are stale — example [9] still requests "fair female" and
  the cover is the bride, so nothing on the page demonstrates the deep-complexion work.

## What exists

- **`lib/prompt.mjs`** — the product. A prompt-adherence layer over FLUX.2 Klein 4B.
  Every rule exists because a specific generation failed; the comments say which.
- **`cog/beenga_prompt.py`** — hand-maintained Python port of the same rules.
  **Check parity after every edit** (command below). It has caught four silent
  drifts that code review missed.
- **`cog/predict.py` + `cog/cog.yaml`** — the Replicate model.
- **`benchmarks/beenga-india-v1.json`** — 29 cases derived from the original spec.
- **`benchmarks/real-world-defects.json`** — 12 cases from actual usage. **More useful
  than the first suite**, which caught none of the defects found by using the product.
- **`benchmarks/layer-contradictions.json`** — 9 cases checked against the enhanced
  TEXT, not against an image: the layer must not contradict what the prompt already
  said. Free and instant, and it covers the one class of bug neither image suite can
  see (see "Benchmark blindness" below).
- **`scripts/`** — benchmark runner, complexion scorer, base-model comparison,
  dataset generation, Commons harvester.
- **`out/lora/`** — a trained curl LoRA. Benchmarked, leaks, shipped as opt-in only.

## Check — run this after any prompt-layer edit

```bash
node scripts/check-layer.mjs      # exit 0 only if everything below holds
```

It runs the contradiction suite against the enhanced text in JS, then checks parity
between `lib/prompt.mjs` and `cog/beenga_prompt.py` across **all three** suites (the
old hand-rolled snippet only covered the first one), and finally confirms
`fal/beenga_prompt.py` is still the symlink to `cog/` rather than a copy that has
started drifting. No GPU, no Replicate calls, no cost.

**Then diff the existing cases against the last commit.** A layer edit that changes
the output of a case nobody meant to touch is a regression, and parity will not
catch it — both implementations agree on the wrong answer:

```bash
git show HEAD:lib/prompt.mjs > /tmp/prompt-old.mjs
node -e 'const fs=require("fs");Promise.all([import("/tmp/prompt-old.mjs"),import("./lib/prompt.mjs")])
 .then(([o,n])=>{let c=0;for(const f of ["benchmarks/beenga-india-v1.json","benchmarks/real-world-defects.json"])
 for(const t of JSON.parse(fs.readFileSync(f,"utf8")).cases)
 if(o.enhance(t.prompt).prompt!==n.enhance(t.prompt).prompt){c++;console.log("CHANGED",t.id);}
 console.log(c?c+" changed":"all 41 unchanged");});'
```

## Deploying

Replicate model: `beenga/beenga-image-1`, single L40S 48GB (set in model Settings).

Cog cannot build on RunPod — their pods are containers without Docker. Use a
DigitalOcean droplet:

```bash
doctl compute droplet create beenga-deploy --region blr1 --size s-8vcpu-16gb \
  --image docker-20-04 --ssh-keys 58516323 --wait
# install cog 0.22.0, scp cog/* and the LoRA, docker login r8.im -u beenga
cog push r8.im/beenga/beenga-image-1 --separate-weights
doctl compute droplet delete <id> --force      # ALWAYS, it is $0.14/hr
```

**Hard-won build settings** — changing any of these broke a build:
- `cuda: "12.4"` — 12.8 pulls an Ubuntu 24.04 base that enforces PEP 668 and breaks
  dependency installation at Replicate runtime.
- Weights baked in via `snapshot_download` at build time. Downloading at boot failed
  repeatedly with `RemoteProtocolError`.
- `HF_HUB_OFFLINE=1` + `local_files_only=True` before diffusers imports. Even with
  weights cached, `from_pretrained` calls the Hub for metadata and that call fails
  on Replicate workers.
- VRAM-aware loading. `.to("cuda")` OOMs on the 16GB default card.
- 320GB builder disk. A ~70GB image will not unpack on 155GB.

**Read Setup logs on the model version page when a deploy fails.** The summary banner
shows a misleading dependency warning; the real error is in Setup logs. Eight builds
were spent guessing before reading them.

## Base model — settled

Klein vs Z-Image vs Qwen, head-to-head on real-world defects, layer off:
Klein wins Delhi scenes, North Indian faces and deep complexion. Z-Image wins only
on cultural objects (renders a real tabla; Klein renders congas). Qwen is stylised
and slow. **Stay on Klein.**

## Known problems, unfixed

1. **Prompt dilution — addressed, then over-corrected, then re-balanced (2026-08-18).**
   The length budget landed (`RULE_BUDGET`, tiers 1-3, `GENERATE_BUDGET_WORDS`). It was
   first set to 0 — Tier 1 only — on a measurement showing the full layer worse in 5 of
   6 prompt types. That measurement was real but scored SCENE fidelity only: crop,
   setting, complexion. It never scored hair or skin, and it was reported as a verdict
   on the whole layer. On portraits the dropped rules were doing real work, and "it used
   to be better except the crop" was an accurate report.

   The actual cause of the crop was narrower: `house-look` and `hair-realism` are ~30
   words describing a face, and that description mass MOVES THE CAMERA — it cropped a
   market scene to a headshot, and adding `FULL_FRAME` on top did not pull it back.
   Nine words of framing cannot out-vote thirty words of face. Fixed by gating on
   `faceIsSubject()` rather than by deletion, and the budget is now 60.

   Standing lesson: a measurement that scores one axis is not a verdict on every axis.
2. **Two implementations by hand.** JS and Python drift constantly. Consider generating
   one from the other, or moving the layer server-side only. (`fal/beenga_prompt.py` is
   a symlink to the cog copy, not a third implementation — keep it that way, and
   `check-layer.mjs` will say so if it stops being one.)
3. **Cold starts.** Public models scale to zero; a ~70GB image takes minutes to place.
   Fix is a Replicate Deployment with `min_instances=1`, ~$85/mo on an L40S.
4. **Cultural objects.** Klein does not know tabla, and neither model knows deity
   iconography without being told. Iconography is now stated for seven deities; the
   general gap is a LoRA target.
5. **Benchmark blindness.** Three defects were bugs in the layer that the spec-derived
   suite could not catch, because the rules and the test cases were written from the
   same assumptions. Real-world phrasing variants matter: `clean shave` vs
   `clean-shaven`, `saree`, `lady`, `20s`.

   **2026-08-16, one level up:** *every one of the 41 cases across both image suites
   contains a person*, so a layer that assumes there is always a subject passed all of
   them. Using the model on a channel that renders people-free still lifes
   (`demo/romantichive`) surfaced three contradictions in an afternoon:
   `no people in frame` → *"The person is Indian…"*, a stated `bedroom` →
   *"The setting is a metro station platform"*, and `in the evening` →
   *"Bright natural daylight"*. All three are fixed and are now
   `benchmarks/layer-contradictions.json`. The lesson generalises: the image suites can
   only test prompts someone thought to write, and both were written by the same person
   who wrote the rules. **When a new consumer starts using the model, read what it
   actually sends before assuming the layer suits it.**

   **2026-08-18, two more blind spots, both found only by using the product:**

   *Every benchmark case runs at the DEFAULT variant.* So a per-seed bug is structurally
   invisible to the suite. Raising the budget to 60 started sending a full description
   of the person in which every word was a CONSTANT — one outfit sentence, one face
   sentence — and three seeds of "an indian man" came back as the same face in the same
   light-blue shirt. Parity was 41/41 throughout. Fixed by wiring face and dress into
   the same per-seed picker `sari-variety` already used; parity on the new paths has to
   be checked ACROSS SEEDS explicitly, because the suite never will.

   *`scripts/audit-layer.mjs` had only negative probes*, so it tested for a vocabulary
   list that was too WIDE and was blind to one too NARROW. Tightening the
   `SETTING_NAMED` wildcard silently dropped "marketplace", "hillside" and "hilltop",
   and a missed setting is worse than a spurious one — `scene-variety` then paves a
   different scene over the one the caller named, which is the reported "couple on a bed
   in front of a building". The audit now carries 45 POSITIVE probes as well: every
   setting the layer claims to know must survive `scene-variety`.

   The generalisation of both: **a green check only covers the axis it was written to
   cover.** Ask what a passing suite is structurally incapable of seeing.

## Product decisions taken

- Attractive-by-default: **kept**. Every image model does it; "farmer" overrides it.
- Fair-by-default: **still dropped — but the house look now carries a complexion
  RANGE, which is a real change from "no complexion default at all" (2026-08-18).**
  The original decision was that defaulting fair repeats the bias this project measures
  in other models, in a market where skin-lightening is a live controversy. That still
  holds and there is still no fair default.

  What changed: emitting no complexion at all meant the house look was one fixed
  sentence, and one fixed sentence produced one repeated face — three seeds of
  "an indian woman" came back as the same person. `HOUSE_LOOKS` now holds ten face
  variants picked per seed, each carrying a complexion spanning fair to deep. Fair
  comes up often and never always. A stated complexion, or a prompt naming a minor,
  still suppresses the house look entirely.

  Read that as: the anti-bias decision is intact, the mechanism moved from *omission*
  to *variation*. Anyone auditing this should look at the spread of `HOUSE_LOOKS`, not
  at the absence of a default.
- North Indian default: kept, overridden by any southern or eastern place name.
- LoRA: opt-in `curl_enhance` only. It leaks — shifts unspecified hair toward curly and
  drags its training set's flatter look into unrelated scenes.
