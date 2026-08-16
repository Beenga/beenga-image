# Handoff — 2026-08-16

State of play after one long session. Read this before touching anything.

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

1. **Prompt dilution.** The layer appends ~120 words across a dozen rules to a short
   prompt. That is the exact attribute-dilution this project exists to fix, created by
   adding a rule per piece of feedback. Needs a length budget: terse defaults, full
   strength only for attributes the user explicitly asked for.
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

## Product decisions taken

- Attractive-by-default: **kept**. Every image model does it; "farmer" overrides it.
- Fair-by-default: **dropped**. It repeats the bias this project measured and fixed in
  other models, in a market where skin-lightening is a live controversy, and it removes
  the differentiator. Requested tones render correctly and are measured monotonic.
- North Indian default: kept, overridden by any southern or eastern place name.
- LoRA: opt-in `curl_enhance` only. It leaks — shifts unspecified hair toward curly and
  drags its training set's flatter look into unrelated scenes.
