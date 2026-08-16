"""Beenga Image — fal.ai serverless app.

The same product as cog/predict.py, on fal instead of Replicate. The prompt
layer is the shared cog/beenga_prompt.py, imported rather than re-implemented:
there are already two copies of these rules (JS and Python) and they drift. A
third would be worse.

    fal run    fal/app.py::BeengaImage      # temporary URL on real hardware
    fal deploy fal/app.py::BeengaImage      # persistent endpoint

Weights are NOT baked into the image here, unlike the Cog build. fal gives every
runner a persistent /data volume that survives restarts and redeploys, so the
first runner downloads the checkpoint and every later one reads it back. That is
the platform's answer to the same problem Cog solved by baking a ~70GB image,
and it is why cold starts should be minutes shorter.

Before the first deploy, put the adapter on that volume:

    fal files upload out/lora/beenga_curl_v1/beenga_curl_v1_000000500.safetensors \\
        loras/beenga_curl_v1.safetensors
"""

from typing import Optional

import fal
from fal.toolkit import Image
from pydantic import BaseModel, Field

MODEL = "black-forest-labs/FLUX.2-klein-4B"
# Everything on /data persists across runners and deploys.
CACHE = "/data/models"
LORA_DIR = "/data/loras"
LORA_NAME = "beenga_curl_v1.safetensors"

# Roughly 1 megapixel at each ratio, rounded to multiples of 16. Klein needs
# dimensions divisible by 16; anything else errors deep inside the pipeline with
# a shape mismatch that does not name the real cause.
DIMS = {
    "1:1": (1024, 1024),
    "16:9": (1360, 768),
    "9:16": (768, 1360),
    "4:3": (1184, 880),
    "3:4": (880, 1184),
    "3:2": (1248, 832),
    "2:3": (832, 1248),
}


class BeengaInput(BaseModel):
    prompt: str = Field(
        description="What to generate. Write it plainly — Beenga handles the phrasing.",
        examples=["modern indian man in 20s in gym, shorts and tshirt, clean shave"],
    )
    aspect_ratio: str = Field(default="1:1", description="Output shape")
    num_inference_steps: int = Field(
        default=4, ge=1, le=50,
        description="Denoising steps. The distilled model is tuned for 4.",
    )
    guidance_scale: float = Field(
        default=3.5, ge=0.0, le=10.0,
        description="Ignored by the distilled checkpoint, which is step-wise distilled.",
    )
    seed: Optional[int] = Field(
        default=None,
        description="Fix for reproducible output. Leave blank for random.",
    )
    curl_enhance: bool = Field(
        default=False,
        description="Sharpen salon-curl geometry using Beenga's curl adapter. Off by "
                    "default: it also nudges unspecified hair toward curly.",
    )
    beenga_prompt_layer: bool = Field(
        default=True,
        description="Apply Beenga's Indian-context prompt adherence. Turn off to see "
                    "the raw model's behaviour.",
    )


class BeengaOutput(BaseModel):
    image: Image = Field(description="The generated image")
    prompt: str = Field(description="The prompt after the Beenga layer rewrote it")
    applied: list[str] = Field(description="Which Beenga rules fired")
    seed: int = Field(description="The seed used — pass it back to reproduce this image")


class BeengaImage(
    fal.App,
    keep_alive=300,
    name="beenga-image",
):
    # GPU-L40 is 48GB, matching the L40S the Replicate deployment runs on. Klein
    # 4B plus its VLM text encoder does not fit a 16GB card — that OOMed setup
    # on the first Replicate deploy.
    machine_type = "GPU-L40"
    min_concurrency = 0
    max_concurrency = 1

    requirements = [
        "torch==2.6.0",
        "torchvision",
        "diffusers>=0.36",
        "transformers>=4.48",
        "accelerate",
        "safetensors",
        "sentencepiece",
        "protobuf",
        "peft",
        "pillow",
        "huggingface_hub",
        "--extra-index-url",
        "https://download.pytorch.org/whl/cu124",
    ]

    # Ship the prompt layer itself rather than vendoring a third copy of it.
    local_python_modules = ["beenga_prompt"]

    def setup(self):
        import torch
        from huggingface_hub import snapshot_download

        # First runner pays the download; every later one reads it back off the
        # persistent volume. No HF_HUB_OFFLINE here — that flag exists in the
        # Cog predictor to survive Replicate's workers, and it is what broke
        # LoRA loading there. Do not port it over without re-testing.
        path = snapshot_download(MODEL, cache_dir=CACHE)

        from diffusers import Flux2KleinPipeline

        self.pipe = Flux2KleinPipeline.from_pretrained(
            path, torch_dtype=torch.bfloat16,
        )

        # Size the loading strategy to whatever card we land on, so the app stays
        # runnable if it is ever scheduled somewhere smaller.
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if vram_gb >= 24:
            print(f"{vram_gb:.1f}GB VRAM — keeping weights resident")
            self.pipe.to("cuda")
        else:
            print(f"{vram_gb:.1f}GB VRAM — enabling CPU offload")
            self.pipe.enable_model_cpu_offload()
        self.pipe.set_progress_bar_config(disable=True)
        self.lora_loaded = False

        # Compile lazy kernels now rather than inside the first real request.
        self.pipe("warmup", width=512, height=512, num_inference_steps=1)

    def _set_curl_lora(self, on: bool):
        """Load or unload the curl adapter without rebuilding the pipeline.

        Directory plus weight_name, never a bare file path — passing the file
        directly is what broke this on Replicate under offline mode, and the
        split form is correct either way.
        """
        if on and not self.lora_loaded:
            self.pipe.load_lora_weights(
                LORA_DIR, weight_name=LORA_NAME, adapter_name="curl",
            )
            self.lora_loaded = True
        elif not on and self.lora_loaded:
            self.pipe.unload_lora_weights()
            self.lora_loaded = False

    @fal.endpoint("/")
    def generate(self, req: BeengaInput) -> BeengaOutput:
        import os

        import torch
        from beenga_prompt import enhance

        if req.aspect_ratio not in DIMS:
            raise ValueError(
                f"aspect_ratio must be one of {sorted(DIMS)}, got {req.aspect_ratio!r}"
            )

        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), "big")

        self._set_curl_lora(req.curl_enhance)
        # seed as variant: re-rolling varies unspecified garment choice, while the
        # same prompt+seed still reproduces byte-for-byte.
        final, applied = (
            enhance(req.prompt, variant=str(seed))
            if req.beenga_prompt_layer
            else (req.prompt, [])
        )
        if applied:
            print(f"beenga rules applied: {', '.join(applied)}")

        w, h = DIMS[req.aspect_ratio]
        image = self.pipe(
            prompt=final,
            width=w, height=h,
            num_inference_steps=req.num_inference_steps,
            guidance_scale=req.guidance_scale,
            generator=torch.Generator("cuda").manual_seed(seed),
        ).images[0]

        return BeengaOutput(
            image=Image.from_pil(image),
            prompt=final,
            applied=applied,
            seed=seed,
        )
