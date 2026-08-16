# Deploying to fal.ai

The same product as the Cog build, on fal. Written because fal's packaging model
removes most of what made the Replicate deploy painful.

## Why this is simpler than the Cog path

| Cog / Replicate | fal |
|---|---|
| Needs a Docker daemon, so builds run on a DigitalOcean droplet | `fal deploy` builds remotely — no Docker, no droplet |
| `cuda: "12.4"` pinned to dodge Ubuntu 24.04's PEP 668 | CUDA selected from `machine_type`; torch pinned in `requirements` |
| ~15GB of weights baked into a ~70GB image at build time | Weights live on the persistent `/data` volume, downloaded once |
| Cold start places a ~70GB image | Small image; weights read back off `/data` |
| `HF_HUB_OFFLINE=1` to stop setup dying on a Hub round-trip | Not needed — and deliberately not ported, see below |

## One-time setup

```bash
pip install fal
fal auth login                      # or export FAL_KEY=...

# Put the curl adapter on the persistent volume.
fal files upload out/lora/beenga_curl_v1/beenga_curl_v1_000000500.safetensors \
    loras/beenga_curl_v1.safetensors
fal files list loras/
```

**Note which checkpoint that is.** The Replicate image ships step 1500, which
`MODEL_CARD.md` calls visibly overtrained — a packaging slip, since the final
save took the plain filename the predictor loads. Step 500 measured best, so
this deploy uploads step 500 deliberately. Do not "fix" it back to the bare
`beenga_curl_v1.safetensors` file.

## Run and deploy

```bash
fal run    fal/app.py::BeengaImage     # temporary URL on real hardware
fal deploy fal/app.py::BeengaImage     # persistent endpoint
```

Endpoints are private by default.

## Things to check on the first run

None of this has been exercised against a live fal account yet — the app was
written from fal's documentation, not from a successful deploy. Verify in this
order, because each one has a known failure mode behind it:

1. **`Flux2KleinPipeline` exists in the resolved `diffusers`.** It needs
   `>=0.36`. The Replicate image resolved to 0.39.0.
2. **The prompt layer imports.** `beenga_prompt.py` here is a symlink to
   `cog/beenga_prompt.py`, so there is one Python copy, not two. If fal's
   packaging does not follow symlinks, replace it with a real copy *and* add it
   to the parity check in `HANDOFF.md`.
3. **`local_python_modules` actually ships the layer.** If the endpoint returns
   images with an empty `applied` list, the layer is not being applied.
4. **The LoRA loads.** `curl_enhance: true` must return an image, not an error.
   On Replicate this failed on every call because `load_lora_weights` was given
   a bare file path under offline mode. This app passes directory plus
   `weight_name`, which is correct either way.
5. **VRAM branch.** `GPU-L40` is 48GB and should keep weights resident. The log
   line says which branch was taken.

## Deliberately not ported

`HF_HUB_OFFLINE=1` / `local_files_only=True`. Those exist in `cog/predict.py`
because a single Hub metadata round-trip at setup was enough to kill a Replicate
worker with `RemoteProtocolError`. That is a Replicate-specific failure, and the
flag is also what broke LoRA loading there. If fal shows the same symptom, add
it back — but add it back together with a `curl_enhance` test.
