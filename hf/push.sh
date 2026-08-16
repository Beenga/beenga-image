#!/usr/bin/env bash
# Publish beenga-curl-v1 to the Hugging Face Hub.
#
#   export HF_TOKEN=hf_...        # huggingface.co/settings/tokens, needs write scope
#   bash hf/push.sh               # add --dry-run to stage without uploading
#
# Publishes the STEP-500 checkpoint, not the step-1500 one the production image
# currently serves. That is deliberate — step 500 measured better. See
# hf/beenga-curl-v1/README.md.
set -euo pipefail

# Model repo, not a Space. Spaces host demo apps; weights live in a model repo,
# and `huggingface-cli upload --repo-type=model` creates it if it does not exist.
REPO="${HF_REPO:-beenga8/beenga-curl-v1}"
SRC="out/lora/beenga_curl_v1/beenga_curl_v1_000000500.safetensors"
EXPECTED_SHA="bea8e082a3ed30dd63d37a217a726a9e2f60422cfba2e8de4c453a601ecef6b4"
STAGE="hf/beenga-curl-v1"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

cd "$(dirname "$0")/.."

[[ -f "$SRC" ]] || { echo "missing $SRC" >&2; exit 1; }

# Verify we are shipping the checkpoint we think we are. The whole reason this
# script exists is that three checkpoints share a byte size and only differ by
# content, and the wrong one already reached production once.
echo "verifying checkpoint..."
ACTUAL_SHA=$(shasum -a 256 "$SRC" | cut -d' ' -f1)
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "SHA mismatch — refusing to publish" >&2
  echo "  expected $EXPECTED_SHA" >&2
  echo "  actual   $ACTUAL_SHA" >&2
  exit 1
fi
python3 - "$SRC" <<'EOF'
import json, struct, sys
with open(sys.argv[1], "rb") as fh:
    hdr = json.loads(fh.read(struct.unpack("<Q", fh.read(8))[0]))
step = json.loads(hdr["__metadata__"]["training_info"])["step"]
assert step == 500, f"expected step 500, file reports step {step}"
print(f"  ok: training_info reports step {step}")
EOF

cp "$SRC" "$STAGE/beenga_curl_v1.safetensors"
echo "staged $STAGE/"
ls -la "$STAGE"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "dry run — not uploading"; exit 0
fi

: "${HF_TOKEN:?set HF_TOKEN (write scope) first}"
command -v huggingface-cli >/dev/null || pip install -q "huggingface_hub[cli]"

huggingface-cli upload "$REPO" "$STAGE" . \
  --repo-type=model \
  --token="$HF_TOKEN" \
  --commit-message="Publish beenga-curl-v1 (step 500)"

echo
echo "published: https://huggingface.co/$REPO"
echo "now set weights_url on the Replicate model to that URL"
