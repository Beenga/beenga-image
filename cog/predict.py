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

# MUST match the revision= in cog.yaml, and must be passed to from_pretrained.
#
# Pinning the download by commit SHA and NOT pinning the load is what disabled
# version 91361ddc: "consistently fails to complete setup". snapshot_download
# with an explicit revision writes snapshots/<sha> but does NOT create refs/main,
# and from_pretrained resolves the default revision THROUGH refs/main. Verified
# inside that image — try_to_load_from_cache returned None without the revision
# and the real path with it.
#
# The reproducibility fix broke the boot. Same shape as HF_HUB_OFFLINE breaking
# the LoRA: each change correct alone, fatal together. If you bump one of these
# two constants, bump both.
REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
CURL_LORA = "/src/loras/beenga_curl_v1.safetensors"

# Word budget for the prompt layer on the EDIT path. Tight on purpose: the
# layer's scene defaults are written for generation and fight a source image.
# Tier 1 — what the caller actually asked for — is never trimmed by the budget,
# so this keeps the useful half and drops the scenery.
# 0 means Tier 1 only — what the caller explicitly asked for, and nothing else.
# Not a small budget: a small budget keeps whichever house defaults happen to be
# cheap, and "Bright natural daylight" is five words that flatly contradict
# "make it night". On an edit the scenery goes entirely.
EDIT_BUDGET_WORDS = 0

# Matches the upstream Klein model's documented ceiling.
MAX_REFERENCE_IMAGES = 5


class Predictor(BasePredictor):
    def setup(self):
        from diffusers import Flux2KleinPipeline

        # local_files_only as well as the env flags: belt and braces, since a
        # single Hub round-trip at setup is enough to fail the whole worker.
        self.pipe = Flux2KleinPipeline.from_pretrained(
            MODEL, revision=REVISION, torch_dtype=torch.bfloat16, cache_dir=CACHE,
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
            # Directory plus weight_name, never the bare file path. HF_HUB_OFFLINE
            # is set at the top of this module, and under it lora_state_dict
            # refuses to guess a filename — it raises "When using the offline
            # mode, you must specify a `weight_name`" before it ever looks at the
            # path, so a perfectly valid local file still fails. The two fixes
            # collided: offline mode is what makes setup survive, and it is what
            # broke this. Splitting the path satisfies both.
            self.pipe.load_lora_weights(
                os.path.dirname(CURL_LORA),
                weight_name=os.path.basename(CURL_LORA),
                adapter_name="curl",
            )
            self.lora_loaded = True
        elif not on and self.lora_loaded:
            self.pipe.unload_lora_weights()
            self.lora_loaded = False

    def predict(
        self,
        prompt: str = Input(
            description="What to generate, or what to change if you supply an image. "
                        "Write it plainly — Beenga handles the phrasing.",
        ),
        images: List[Path] = Input(
            description="Source images to edit or reference. Leave empty to generate "
                        "from scratch. With images, the prompt is an instruction — "
                        "'change the sari to green', 'put her on a rooftop at night'. "
                        "Pass more than one to hold a subject across a scene. Max 5.",
            default=[],
        ),
        aspect_ratio: str = Input(
            description="Output shape. Ignored when editing — the source image's "
                        "dimensions are kept.",
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

        editing = bool(images)

        self._set_curl_lora(curl_enhance)

        # The prompt layer is built for GENERATION prompts. Its defaults describe
        # a whole scene — contemporary India, a setting, a house look, lighting —
        # and on an edit those fight the source image instead of the model's
        # priors. "make it night" does not want "Bright natural daylight" and a
        # randomly chosen rooftop appended to it.
        #
        # So on the edit path the layer runs Tier 1 ONLY — the attributes the
        # caller explicitly asked for, including the negation rewriting that is
        # useful in any mode — and drops every scene default.
        #
        # A first attempt used a small word budget instead, and was wrong in a way
        # worth recording: a budget keeps whichever defaults happen to be CHEAP,
        # so "make it night" came back with "Bright natural daylight, clear
        # colour" appended. Five words, flatly contradicting the instruction.
        # Scene defaults fight a source image regardless of what they cost.
        if beenga_prompt_layer:
            # seed as variant: re-rolling varies unspecified garment choice, while
            # the same prompt+seed still reproduces byte-for-byte.
            final, applied = enhance(prompt, variant=str(seed),
                                     budget=EDIT_BUDGET_WORDS if editing else False)
        else:
            final, applied = prompt, []
        if applied:
            print(f"beenga rules applied: {', '.join(applied)}")

        call = dict(
            prompt=final,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=torch.Generator("cuda").manual_seed(seed),
        )

        if editing:
            from diffusers.utils import load_image

            if len(images) > MAX_REFERENCE_IMAGES:
                raise ValueError(
                    f"at most {MAX_REFERENCE_IMAGES} images, got {len(images)}"
                )

            # Klein needs dimensions divisible by 16 or it fails deep inside the
            # pipeline with a shape mismatch that does not name the real cause.
            # Every reference is conformed, not just the first.
            def _fit(im):
                w, h = (max(16, (d // 16) * 16) for d in im.size)
                return im if (w, h) == im.size else im.resize((w, h))

            srcs = [_fit(load_image(str(p))) for p in images]
            # Output takes the FIRST reference's shape, so an edit comes back
            # lined up with what was sent. Later references are context — a
            # subject to hold, a style to follow — not the frame.
            w, h = srcs[0].size
            # The pipeline normalises a bare image to a list internally, but pass
            # the list explicitly so single and multi-reference take one path.
            call["image"] = srcs
            print(f"editing {w}x{h} from {len(srcs)} reference"
                  f"{'s' if len(srcs) != 1 else ''}")
        else:
            w, h = _dims(aspect_ratio)
        call["width"], call["height"] = w, h

        t0 = time.time()
        out_image = self.pipe(**call).images[0]
        print(f"{'edited' if editing else 'generated'} in {time.time() - t0:.2f}s  seed={seed}")

        out = Path(f"/tmp/out.{output_format}")
        out_image.save(str(out), quality=95) if output_format != "png" else out_image.save(str(out))
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
