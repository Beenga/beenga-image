#!/usr/bin/env python3
"""Benchmark a LoRA against the base it was trained on — same model, A/B.

    python3 bench_lora.py --lora /workspace/beenga_curl_v1_000000500.safetensors

Runs each case twice on FLUX.2-klein-base-4B: once with the LoRA loaded, once
without. Writes out/<case>-{base,lora}.png.

WHY BOTH HALVES RUN HERE. The obvious shortcut is to compare LoRA output against
the wave-1 images already on disk. That would be wrong: wave-1 was generated on
the DISTILLED checkpoint, and this LoRA was trained on the BASE. Comparing across
those two would confound the LoRA's effect with the base-vs-distilled difference
and produce a confident, meaningless answer. Same seed, same checkpoint, one
variable.

WHAT IS ACTUALLY BEING TESTED. Not "did curls improve" — the training samples
already showed they did. The question is whether the LoRA stayed in its lane.
Trained on 200 images that ALL say "soft loose salon curls", with no contrast
examples, the likely failure is that it learned `Indian woman -> curls` rather
than `"salon curls" -> this geometry`.

So the case list is mostly regression probes, and IND-HAIR-003 is the sharpest
of them: it explicitly asks for pin-straight hair. If that comes back wavy, the
LoRA is overreaching and the dataset needs contrast examples before it ships.
"""
import argparse
import json
import os
import sys

import torch

CASES = {
    # --- the two the LoRA is supposed to fix -------------------------------
    "IND-HAIR-004": "A 25-year-old Indian woman with long black hair styled in soft loose salon curls, beauty-parlor blowout curls, glossy and voluminous, realistic photography.",
    "IND-MULTI-001": "A 25-year-old Indian woman standing on a clean modern apartment rooftop at sunset, long dense softly curled black hair styled in loose salon curls, subtle kajal, contemporary blue sari with a sleeveless blouse, casually dancing with one hand raised, realistic photography.",
    # --- regression probes; the LoRA must NOT touch these ------------------
    "IND-HAIR-003": "A 25-year-old Indian woman with long dense waist-length pin-straight glossy black hair, smooth and shiny, standing indoors, realistic photography.",
    "IND-HAIR-001": "A 25-year-old Indian woman with her long black hair styled in exactly two braids, one braid falling over each shoulder, standing outdoors, realistic photography.",
    "IND-HAIR-005": "A 25-year-old Indian woman with naturally wavy long black hair, loose natural waves, realistic photography.",
    "IND-MEN-001": "A clean-shaven 23-year-old Indian man wearing a casual shirt at a modern rooftop cafe in Bengaluru, short neatly styled black hair, completely smooth face, realistic photography.",
    "IND-CLOTH-001": "A 27-year-old Indian woman wearing a contemporary teal sari with a completely sleeveless fitted blouse, standing indoors, realistic fashion photography.",
    "IND-SCENE-001": "A young Indian woman standing on a rooftop in Delhi, realistic photography.",
    "IND-DANCE-002": "A 25-year-old Indian woman casually dancing at a house party, natural relaxed hand movement, wearing jeans and a casual top, candid realistic photography.",
    "IND-APPEAR-001": "An ordinary average-looking 30-year-old Indian woman, everyday appearance, realistic skin texture, ordinary grooming, documentary photography.",
    "IND-SKIN-001": "A 28-year-old Indian woman with a deep dark complexion and warm undertones, natural skin texture, plain background, realistic portrait photography.",
    "IND-GROOM-002": "Close portrait of a 26-year-old Indian woman with a completely bare face, no makeup, natural skin texture, realistic photography.",
}

SEED = 1234


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lora", required=True)
    ap.add_argument("--model", default="black-forest-labs/FLUX.2-klein-base-4B")
    ap.add_argument("--out", default="/workspace/bench")
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--scale", type=float, default=1.0, help="LoRA strength")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    from diffusers import Flux2KleinPipeline

    print(f"loading {args.model} ...", flush=True)
    pipe = Flux2KleinPipeline.from_pretrained(args.model, torch_dtype=torch.bfloat16)
    pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)

    def run(tag, use_lora):
        for name, prompt in CASES.items():
            path = os.path.join(args.out, f"{name}-{tag}.png")
            if os.path.exists(path):
                continue
            g = torch.Generator("cuda").manual_seed(SEED)
            img = pipe(prompt=prompt, num_inference_steps=args.steps,
                       guidance_scale=4.0, generator=g,
                       height=1024, width=1024).images[0]
            img.save(path)
            print(f"  {name}-{tag}", flush=True)

    print("=== baseline (no LoRA) ===", flush=True)
    run("base", False)

    print(f"=== with LoRA {os.path.basename(args.lora)} @ {args.scale} ===", flush=True)
    pipe.load_lora_weights(args.lora)
    try:
        pipe.set_adapters(pipe.get_active_adapters(), adapter_weights=[args.scale])
    except Exception:
        pass  # older diffusers: weights applied at load time
    run("lora", True)

    json.dump({"model": args.model, "lora": args.lora, "seed": SEED,
               "steps": args.steps, "scale": args.scale, "cases": list(CASES)},
              open(os.path.join(args.out, "bench.json"), "w"), indent=2)
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
