#!/usr/bin/env python3
"""Mirror the pinned base model into a Hugging Face repo, file by file.

    export HF_TOKEN=hf_...          # or: huggingface-cli login
    python3 scripts/mirror-base-model.py            # dry run, lists the plan
    python3 scripts/mirror-base-model.py --go

Why file-by-file: the repository is 23.7GB and this machine has ~12GB free. The
largest single file is 7.75GB, which fits. So each file is downloaded, uploaded,
and deleted before the next one starts, and peak disk stays under 8GB. Slower
than a bulk transfer, and it needs no droplet.

Why mirror at all: the weights are Apache 2.0 and are baked into the pushed
Replicate image, so a running model survives the upstream repo disappearing. A
REBUILD would not — and there are queued changes that need one. This protects
the realistic risk, which is BFL gating, relicensing or renaming the repo.

PUBLIC, for a practical reason rather than a philosophical one. Apache 2.0
expressly permits redistributing these weights. A private mirror was tried first
and failed: the beenga8 org hit its free-tier private storage limit at ~16GB with
a 403 on the 7.75GB transformer, and personal Pro does not raise an ORG quota.
Public storage is a separate and far larger pool, and free.

Because this IS redistribution, §4 applies. It is satisfied by construction:
upstream files are copied byte-for-byte and never modified, so the modified-file
marking in §4(b) never arises; LICENSE.md is part of the upstream repo and
travels with the copy; and the card written below states the source, the pinned
revision and the licence.

This repo is a build-reproducibility mirror, not a Beenga model. The card says so
plainly so nobody mistakes a copy for an asset.

Set HF_MIRROR_PRIVATE=1 to make it private instead — which needs an org plan
that can hold 23.7GB of private storage.
"""

import argparse
import os
import shutil
import sys
import tempfile

SRC = "black-forest-labs/FLUX.2-klein-4B"
# Pinned to the revision every measurement in MODEL_CARD.md was made against.
# Must match the revision= in cog/cog.yaml.
REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
DST = os.environ.get("HF_MIRROR_REPO", "beenga8/flux2-klein-4b-mirror")
PRIVATE = os.environ.get("HF_MIRROR_PRIVATE", "0") == "1"
# Fixed, self-cleaning scratch dir — see the pull loop for why.
SCRATCH = os.environ.get("HF_MIRROR_SCRATCH", "out/.mirror-scratch")

try:
    from huggingface_hub import (HfApi, hf_hub_download, list_repo_files,
                                 get_hf_file_metadata, hf_hub_url)
except ImportError:
    sys.exit("needs huggingface_hub:  pip install huggingface_hub")



CARD = """---
license: apache-2.0
base_model: black-forest-labs/FLUX.2-klein-4B
tags:
  - mirror
library_name: diffusers
inference: false
---

# FLUX.2 [klein] 4B — pinned mirror

**This is not a Beenga model.** It is a byte-for-byte copy of
[`black-forest-labs/FLUX.2-klein-4B`](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
at revision `e7b7dc27f91deacad38e78976d1f2b499d76a294`, kept so that
[Beenga Image](https://github.com/Beenga/beenga-image) builds stay reproducible
and can be rebuilt if the upstream repository is moved, gated or withdrawn.

All credit for these weights belongs to **Black Forest Labs**. Nothing here is
modified, retrained or fine-tuned. If you want this model, prefer the upstream
repository — it is the source of truth and will carry any corrections.

## Why a mirror exists

Every measurement in Beenga Image's model card was made against this exact
revision. Pinning the revision makes a rebuild reproducible; mirroring it makes a
rebuild *possible* independent of upstream availability.

## Licence

Apache 2.0, as published by Black Forest Labs. `LICENSE.md` is included in this
repository as part of the upstream copy. Use may also be subject to Black Forest
Labs' applicable usage policies.

**Note the variant.** BFL publishes the **4B** models under Apache 2.0 —
including `4b-fp8` and `4b-nvfp4` — and the **9B** models under the FLUX
Non-Commercial License v2.1, with `9b-fp8` additionally gated. The names differ
by two characters. Check the licence of any model you substitute.
"""


def _write_card(api, token):
    """Publish the mirror's own card, so a copy is never mistaken for an asset."""
    import io
    api.upload_file(path_or_fileobj=io.BytesIO(CARD.encode()), path_in_repo="README.md",
                    repo_id=DST, repo_type="model", token=token,
                    commit_message="Mirror card: source, pinned revision, licence")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true", help="actually transfer")
    args = ap.parse_args()

    api = HfApi()
    token = os.environ.get("HF_TOKEN")

    files = list_repo_files(SRC, revision=REVISION, token=token)
    sizes = {}
    total = 0
    for f in files:
        try:
            meta = get_hf_file_metadata(hf_hub_url(SRC, f, revision=REVISION), token=token)
            sizes[f] = meta.size or 0
        except Exception:
            sizes[f] = 0
        total += sizes[f]

    print(f"source   {SRC}@{REVISION[:12]}")
    print(f"target   {DST}  ({'private' if PRIVATE else 'public'})")
    print(f"files    {len(files)}   total {total / 1e9:.2f} GB")
    print(f"largest  {max(sizes.values()) / 1e9:.2f} GB  <- peak disk needed")
    free = shutil.disk_usage(tempfile.gettempdir()).free
    print(f"free     {free / 1e9:.2f} GB")
    if max(sizes.values()) > free * 0.8:
        sys.exit("not enough free disk for the largest file")

    if not args.go:
        print("\ndry run — pass --go to transfer")
        return

    shutil.rmtree(SCRATCH, ignore_errors=True)   # clear anything a prior crash left
    api.create_repo(DST, repo_type="model", private=PRIVATE, exist_ok=True, token=token)
    _write_card(api, token)
    existing = set(list_repo_files(DST, token=token))

    done = 0
    for f in sorted(files, key=lambda x: sizes[x]):
        if f in existing:
            print(f"  skip   {f}  (already mirrored)")
            done += 1
            continue
        print(f"  pull   {f}  ({sizes[f] / 1e9:.2f} GB)", flush=True)
        # A fixed scratch dir, wiped at the start of every run, rather than
        # tempfile.TemporaryDirectory. Two earlier attempts were killed mid-push
        # and each stranded a full 7.75GB download in /var/folders that nothing
        # ever cleaned — together they took the machine to 100% disk. A crash
        # here now costs one file, and the next run clears it.
        try:
            local = hf_hub_download(SRC, f, revision=REVISION, local_dir=SCRATCH, token=token)
            print(f"  push   {f}", flush=True)
            api.upload_file(path_or_fileobj=local, path_in_repo=f, repo_id=DST,
                            repo_type="model", token=token,
                            commit_message=f"Mirror {f} from {SRC}@{REVISION[:12]}")
        finally:
            shutil.rmtree(SCRATCH, ignore_errors=True)
        done += 1
        print(f"  ok     {done}/{len(files)}")

    # Verify against the source rather than trusting that nothing threw. The
    # first run of this script exited 0 having silently failed to transfer the
    # 7.75GB transformer — the org had hit its private storage limit, the
    # traceback went to stderr, and the shell pipeline masked the status. A
    # mirror that reports success it did not achieve is worse than no mirror.
    remote = set(list_repo_files(DST, token=token))
    missing = [f for f in files if f not in remote]
    if missing:
        print(f"\nINCOMPLETE — {len(missing)} of {len(files)} files did not transfer:")
        for f in missing:
            print(f"  {f}  ({sizes[f] / 1e9:.2f} GB)")
        sys.exit(1)

    print(f"\nmirrored to https://huggingface.co/{DST}")
    print(f"all {len(files)} files present")


if __name__ == "__main__":
    main()
