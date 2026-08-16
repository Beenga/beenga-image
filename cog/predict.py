"""Beenga Image — Replicate predictor.

Wraps FLUX.2 Klein 4B with the Beenga prompt layer. The caller sends a plain
prompt; the layer rewrites it before it reaches the model, so attributes that
would otherwise be dropped survive.

The distilled checkpoint is used for inference — four steps, sub-second — while
the base checkpoint is what fine-tuning targets. Callers get the fast one.
"""

import os

# Before diffusers/transformers import, or the flags are read too late.
#
# Setup kept dying with "RemoteProtocolError: peer closed connection without
# sending complete message body (received 0 bytes, expected 5536)" even after the
# checkpoint was baked into the image. 5536 bytes is a metadata file, not
# weights: from_pretrained still calls the Hub to resolve refs and check for
# updates, and that call was failing on Replicate's workers. The cached weights
# were never the problem — the liveness check was.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

import time
from typing import List, Optional

import torch
from cog import BasePredictor, Input, Path

from beenga_prompt import enhance

MODEL = "black-forest-labs/FLUX.2-klein-4B"
CACHE = "/src/model-cache"
CURL_LORA = "/src/loras/beenga_curl_v1.safetensors"


class Predictor(BasePredictor):
    def setup(self):
        from diffusers import Flux2KleinPipeline

        # local_files_only as well as the env flags: belt and braces, since a
        # single Hub round-trip at setup is enough to fail the whole worker.
        self.pipe = Flux2KleinPipeline.from_pretrained(
            MODEL, torch_dtype=torch.bfloat16, cache_dir=CACHE,
            local_files_only=True,
        )
        # Size the loading strategy to whatever card we land on.
        #
        # The first deploy hard-coded .to("cuda") and died in setup with
        # "CUDA out of memory ... total capacity of 14.56 GiB" — Klein 4B plus
        # its VLM text encoder does not fit the 16GB default. Replicate reports
        # that on the model page only as "failed to complete setup"; the OOM is
        # in the per-version setup logs.
        #
        # Resident weights are much faster, so use them when there is room and
        # fall back to offloading when there is not. That keeps the model
        # runnable if it is ever rescheduled onto smaller hardware, instead of
        # silently depending on a large-GPU assignment.
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if vram_gb >= 24:
            print(f"{vram_gb:.1f}GB VRAM — keeping weights resident")
            self.pipe.to("cuda")
        else:
            print(f"{vram_gb:.1f}GB VRAM — enabling CPU offload")
            self.pipe.enable_model_cpu_offload()
        self.pipe.set_progress_bar_config(disable=True)
        self.lora_loaded = False

    def _set_curl_lora(self, on):
        """Load or unload the curl adapter without rebuilding the pipeline.

        Kept opt-in. Benchmarked at out/bench/SCORES.md: it sharpens salon-curl
        geometry and leaves explicitly-straight hair alone, but it also shifts
        the default for UNSPECIFIED hair toward curly and pulls its training
        set's flatter look into unrelated scenes. Enabled by default that would
        tax every generation to fix one attribute, so the caller chooses.
        """
        if on and not self.lora_loaded:
            self.pipe.load_lora_weights(CURL_LORA, adapter_name="curl")
            self.lora_loaded = True
        elif not on and self.lora_loaded:
            self.pipe.unload_lora_weights()
            self.lora_loaded = False

    def predict(
        self,
        prompt: str = Input(
            description="What to generate. Write it plainly — Beenga handles the phrasing.",
        ),
        aspect_ratio: str = Input(
            description="Output shape",
            choices=["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
            default="1:1",
        ),
        num_inference_steps: int = Input(
            description="Denoising steps. The distilled model is tuned for 4.",
            ge=1, le=50, default=4,
        ),
        guidance_scale: float = Input(
            description="Prompt adherence strength",
            ge=0.0, le=10.0, default=3.5,
        ),
        seed: Optional[int] = Input(
            description="Fix for reproducible output. Leave blank for random.",
            default=None,
        ),
        curl_enhance: bool = Input(
            description="Sharpen salon-curl geometry using Beenga's curl adapter. "
                        "Off by default: it also nudges unspecified hair toward curly.",
            default=False,
        ),
        beenga_prompt_layer: bool = Input(
            description="Apply Beenga's Indian-context prompt adherence. "
                        "Turn off to see the raw model's behaviour.",
            default=True,
        ),
        output_format: str = Input(
            description="Image format", choices=["png", "jpg", "webp"], default="png",
        ),
    ) -> List[Path]:
        if seed is None:
            seed = int.from_bytes(os.urandom(4), "big")

        self._set_curl_lora(curl_enhance)
        # seed as variant: re-rolling varies unspecified garment choice, while the
        # same prompt+seed still reproduces byte-for-byte.
        final, applied = (enhance(prompt, variant=str(seed))
                          if beenga_prompt_layer else (prompt, []))
        if applied:
            print(f"beenga rules applied: {', '.join(applied)}")

        w, h = _dims(aspect_ratio)
        gen = torch.Generator("cuda").manual_seed(seed)
        t0 = time.time()
        image = self.pipe(
            prompt=final,
            width=w, height=h,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=gen,
        ).images[0]
        print(f"generated in {time.time() - t0:.2f}s  seed={seed}")

        out = Path(f"/tmp/out.{output_format}")
        image.save(str(out), quality=95) if output_format != "png" else image.save(str(out))
        return [out]


def _dims(ratio: str):
    """Roughly 1 megapixel at each ratio, rounded to multiples of 16.

    Klein needs dimensions divisible by 16; anything else errors deep inside the
    pipeline with a shape mismatch that does not name the real cause.
    """
    table = {
        "1:1": (1024, 1024),
        "16:9": (1360, 768),
        "9:16": (768, 1360),
        "4:3": (1184, 880),
        "3:4": (880, 1184),
        "3:2": (1248, 832),
        "2:3": (832, 1248),
    }
    return table[ratio]
