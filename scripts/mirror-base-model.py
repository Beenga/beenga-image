#!/usr/bin/env python3
"""Mirror the pinned base model into a PRIVATE Hugging Face repo, file by file.

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

PRIVATE, deliberately. Apache 2.0 permits public redistribution, and a public
mirror would be legitimate — it just is not useful. Users who want the base model
get it from BFL. This is a backup, not a distribution channel, and a private copy
is not redistribution at all, so no §4 conditions attach.

The upstream files are copied byte-for-byte and never modified, so the
modified-file marking in Apache §4(b) never comes into play. LICENSE.md is part
of the upstream repo and travels with the copy automatically.
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

try:
    from huggingface_hub import (HfApi, hf_hub_download, list_repo_files,
                                 get_hf_file_metadata, hf_hub_url)
except ImportError:
    sys.exit("needs huggingface_hub:  pip install huggingface_hub")


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
    print(f"target   {DST}  (private)")
    print(f"files    {len(files)}   total {total / 1e9:.2f} GB")
    print(f"largest  {max(sizes.values()) / 1e9:.2f} GB  <- peak disk needed")
    free = shutil.disk_usage(tempfile.gettempdir()).free
    print(f"free     {free / 1e9:.2f} GB")
    if max(sizes.values()) > free * 0.8:
        sys.exit("not enough free disk for the largest file")

    if not args.go:
        print("\ndry run — pass --go to transfer")
        return

    api.create_repo(DST, repo_type="model", private=True, exist_ok=True, token=token)
    existing = set(list_repo_files(DST, token=token))

    done = 0
    for f in sorted(files, key=lambda x: sizes[x]):
        if f in existing:
            print(f"  skip   {f}  (already mirrored)")
            done += 1
            continue
        print(f"  pull   {f}  ({sizes[f] / 1e9:.2f} GB)", flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            local = hf_hub_download(SRC, f, revision=REVISION, local_dir=tmp, token=token)
            print(f"  push   {f}", flush=True)
            api.upload_file(path_or_fileobj=local, path_in_repo=f, repo_id=DST,
                            repo_type="model", token=token,
                            commit_message=f"Mirror {f} from {SRC}@{REVISION[:12]}")
        done += 1
        print(f"  ok     {done}/{len(files)}")

    print(f"\nmirrored to https://huggingface.co/{DST} (private)")
    print("Verify before relying on it:")
    print(f"  python3 scripts/mirror-base-model.py   # re-run; every file should say 'skip'")


if __name__ == "__main__":
    main()
