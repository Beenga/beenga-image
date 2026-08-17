#!/usr/bin/env bash
# Rebuild and push Beenga Image to Replicate.
#
#   bash scripts/deploy.sh --check     # preflight only, creates nothing
#   bash scripts/deploy.sh --go        # create droplet, build, push
#
# Cog needs a real Docker daemon, which is why this uses a droplet rather than
# running locally. It does NOT destroy the droplet on completion — a failed
# build's Setup logs are the only way to diagnose it, and eight builds were once
# spent guessing because that banner is misleading. The destroy command is
# printed at the end; run it yourself once you are satisfied.
#
# What this ships that production does not currently have:
#   - the step-500 curl adapter, not the overtrained step-1500 one
#   - Indian STATE names recognised, so kerala/punjab/andhra get the
#     contemporary default instead of silently skipping it
#   - the base model pinned by revision, so rebuilds are reproducible
#   - the MINOR gate: no beauty descriptor on prompts about children
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:---check}"
NAME="${DROPLET_NAME:-beenga-deploy}"
REGION="${DROPLET_REGION:-blr1}"
# 320GB disk is not optional: a ~70GB image will not unpack on 155GB.
SIZE="${DROPLET_SIZE:-s-8vcpu-16gb}"
SSH_KEY="${DO_SSH_KEY:-58516323}"
COG_VERSION="0.22.0"
IMAGE="r8.im/beenga/beenga-image-1"

LORA_SRC="out/lora/beenga_curl_v1/beenga_curl_v1_000000500.safetensors"
LORA_SHA="bea8e082a3ed30dd63d37a217a726a9e2f60422cfba2e8de4c453a601ecef6b4"

say() { printf "\n\033[1m== %s\033[0m\n" "$*"; }
die() { printf "\033[31mFAIL: %s\033[0m\n" "$*" >&2; exit 1; }

# ── preflight ────────────────────────────────────────────────────────────────
say "preflight"

[[ -f .env ]] || die "no .env"
set -a; . ./.env; set +a
[[ -n "${REPLICATE_API_TOKEN:-}" ]] || die "REPLICATE_API_TOKEN not set"
command -v doctl >/dev/null || die "doctl not installed"

# The adapter is the whole reason for this rebuild — verify it before anything
# else. Three checkpoints share a byte size and differ only in content, and the
# wrong one has already reached production once.
[[ -f "$LORA_SRC" ]] || die "missing $LORA_SRC"
actual=$(shasum -a 256 "$LORA_SRC" | cut -d' ' -f1)
[[ "$actual" == "$LORA_SHA" ]] || die "LoRA sha mismatch — expected $LORA_SHA got $actual"
python3 - "$LORA_SRC" <<'EOF'
import json, struct, sys
with open(sys.argv[1], "rb") as fh:
    hdr = json.loads(fh.read(struct.unpack("<Q", fh.read(8))[0]))
step = json.loads(hdr["__metadata__"]["training_info"])["step"]
assert step == 500, f"expected step 500, file says {step}"
print(f"  adapter    step {step}, sha verified")
EOF

# The build must download from OUR mirror, not from upstream. A mirror nothing
# builds from protects nothing: if BFL withdraw or gate their repo, a rebuild
# for any bug fix or fine-tune dies here while a full copy sits unused.
grep -q "snapshot_download('beenga8/" cog/cog.yaml \
  || die "cog.yaml downloads from upstream, not our mirror — a purge would block rebuilds"
cogsrc=$(grep -o "snapshot_download('[^']*'" cog/cog.yaml | sed "s/.*('//;s/'//")
predsrc=$(grep -o '^MODEL = "[^"]*"' cog/predict.py | sed 's/.*"\(.*\)"/\1/')
[[ "$cogsrc" == "$predsrc" ]] \
  || die "repo mismatch: cog.yaml=$cogsrc predict.py=$predsrc (cache path is derived from the repo id)"
echo "  source     builds from $cogsrc"
# Pinning the DOWNLOAD without pinning the LOAD is what disabled version
# 91361ddc for "consistently fails to complete setup": snapshot_download with an
# explicit revision writes snapshots/<sha> but no refs/main, and from_pretrained
# resolves the default revision through refs/main. Both must agree, always.
cogrev=$(grep -o "revision='[a-f0-9]\{40\}'" cog/cog.yaml | head -1 | grep -o '[a-f0-9]\{40\}')
predrev=$(grep -o 'REVISION = "[a-f0-9]\{40\}"' cog/predict.py | grep -o '[a-f0-9]\{40\}')
[[ -n "$predrev" ]] || die "predict.py has no REVISION — from_pretrained must be pinned too"
[[ "$cogrev" == "$predrev" ]] \
  || die "revision mismatch: cog.yaml=$cogrev predict.py=$predrev"
echo "  revisions  cog.yaml and predict.py agree (${predrev:0:12})"

# The Python port is what actually runs in production; the JS is the reference.
# They are hand-maintained and drift, so never push without checking.
python3 - <<'EOF'
import sys, json, subprocess
sys.path.insert(0, "cog")
from beenga_prompt import enhance as py
bad_total = 0
for name in ["beenga-india-v1", "real-world-defects"]:
    cases = json.load(open(f"benchmarks/{name}.json"))["cases"]
    js = json.loads(subprocess.run(["node", "-e", f"""
import('./lib/prompt.mjs').then(async ({{enhance}})=>{{const fs=await import('node:fs');
const c=JSON.parse(fs.readFileSync('benchmarks/{name}.json','utf8')).cases;
console.log(JSON.stringify(c.map(x=>enhance(x.prompt).prompt)));}});"""],
    capture_output=True, text=True).stdout.strip())
    bad = [c["id"] for c, j in zip(cases, js) if py(c["prompt"])[0].strip() != j.strip()]
    bad_total += len(bad)
    print(f"  parity     {name}: {len(cases)-len(bad)}/{len(cases)} {bad if bad else ''}")
sys.exit(1 if bad_total else 0)
EOF
node scripts/check-place-lists.mjs >/dev/null || die "place-list check failed"
node scripts/check-rule-budget.mjs >/dev/null || die "rule-budget registries disagree"
echo "  checks     place lists and rule registries agree"

# The safety gate is the reason this rebuild matters most. Assert it in the
# Python port specifically, since that is the copy that ships.
python3 - <<'EOF'
import sys
sys.path.insert(0, "cog")
from beenga_prompt import enhance
for p in ["indian child", "indian kid playing", "indian children in a park", "indian schoolgirl"]:
    out = enhance(p)[0]
    assert "conventionally attractive" not in out, f"MINOR gate leaked on: {p}"
for p in ["beautiful delhi girl in sari", "modern indian man in 20s"]:
    assert "conventionally attractive" in enhance(p)[0], f"house look lost on: {p}"
print("  MINOR      gate holds, house look intact on adult prompts")
EOF

if [[ "$MODE" != "--go" ]]; then
  say "preflight passed — rerun with --go to build"
  exit 0
fi

# ── droplet ──────────────────────────────────────────────────────────────────
say "creating droplet ($SIZE, $REGION)"
doctl compute droplet create "$NAME" --region "$REGION" --size "$SIZE" \
  --image docker-20-04 --ssh-keys "$SSH_KEY" --wait
ID=$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$NAME" '$2==n{print $1; exit}')
IP=$(doctl compute droplet get "$ID" --format PublicIPv4 --no-header)
echo "  droplet $ID at $IP"

say "waiting for ssh"
for i in $(seq 1 40); do
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 \
      "root@$IP" true 2>/dev/null; then echo "  up"; break; fi
  sleep 15
  [[ $i -eq 40 ]] && die "ssh never came up"
done

say "installing cog $COG_VERSION"
ssh -o BatchMode=yes "root@$IP" "
  set -e
  curl -sSL -o /usr/local/bin/cog \
    https://github.com/replicate/cog/releases/download/v$COG_VERSION/cog_\$(uname -s)_\$(uname -m)
  chmod +x /usr/local/bin/cog
  cog --version
  mkdir -p /root/beenga/loras
"

say "uploading build context"
scp -o BatchMode=yes cog/predict.py cog/cog.yaml cog/beenga_prompt.py "root@$IP:/root/beenga/"
scp -o BatchMode=yes "$LORA_SRC" "root@$IP:/root/beenga/loras/beenga_curl_v1.safetensors"
ssh -o BatchMode=yes "root@$IP" "
  cd /root/beenga
  echo '$LORA_SHA  loras/beenga_curl_v1.safetensors' | sha256sum -c - \
    || { echo 'LoRA corrupted in transit'; exit 1; }
"
echo "  adapter checksum verified on the droplet"

say "cog push (this takes a while — weights download, then a ~70GB image)"
ssh -o BatchMode=yes "root@$IP" "
  cd /root/beenga
  docker login r8.im -u beenga -p '$REPLICATE_API_TOKEN'
  setsid nohup cog push $IMAGE --separate-weights > /root/push.log 2>&1 < /dev/null &
  echo started
"
# Poll with a fresh connection each time. A single long-lived streaming ssh
# dropped mid-build on the last run ("Connection reset by peer"), and under set -e
# that aborted the script before the mirror step — while cog push itself carried
# on under setsid nohup. A dropped connection must not end the deploy.
echo "  polling until the push finishes (a dropped connection is survivable)"
while true; do
  if ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$IP" \
       'pgrep -f "cog push" >/dev/null' 2>/dev/null; then
    sleep 60
  elif ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$IP" true 2>/dev/null; then
    break                       # reachable and no push running: finished
  else
    echo "  ssh unreachable, retrying in 60s"; sleep 60
  fi
done
ssh -o BatchMode=yes "root@$IP" 'tail -20 /root/push.log' || true

# cog push exiting is not the same as Replicate accepting the version. The last
# build pushed cleanly and was then DISABLED for failing setup, so check.
say "checking Replicate accepted the version"
sleep 60
newv=$(curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  "https://api.replicate.com/v1/models/beenga/beenga-image-1" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['latest_version']['id'])")
probe=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.replicate.com/v1/predictions \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" \
  -d "{\"version\":\"$newv\",\"input\":{\"prompt\":\"a test\",\"seed\":1}}")
echo "  latest_version ${newv:0:12}  prediction probe HTTP $probe"
if [[ "$probe" == "422" ]]; then
  echo "  A 422 here usually means the version was DISABLED for failing setup." >&2
  echo "  Read Setup logs on the model version page, not the summary banner." >&2
fi

# ── optional: mirror the base model from the droplet ─────────────────────────
# Two attempts from the laptop failed. The 7.75GB downloads succeeded and the
# UPLOADS stalled — pushing that much LFS over a home connection is the fragile
# part, and each killed attempt stranded a full 7.75GB in /var/folders until the
# machine hit 100% disk. The droplet has 320GB and a datacenter uplink in both
# directions, and it is already up. This is where the mirror should have run.
if [[ "${MIRROR:-0}" == "1" ]]; then
  say "mirroring base model to Hugging Face"
  [[ -n "${HF_TOKEN:-}" ]] || die "MIRROR=1 needs HF_TOKEN in .env"
  scp -o BatchMode=yes scripts/mirror-base-model.py "root@$IP:/root/"
  ssh -o BatchMode=yes "root@$IP" "
    pip install -q 'huggingface_hub[cli]' 2>/dev/null || pip3 install -q 'huggingface_hub[cli]'
    cd /root && HF_TOKEN='$HF_TOKEN' HF_MIRROR_SCRATCH=/root/mirror-scratch \
      python3 mirror-base-model.py --go
  " || die "mirror failed — the script names which files are missing"
fi

say "done"
echo "Verify the new version, then TEST IT before destroying:"
echo "  curl -s -H \"Authorization: Bearer \$REPLICATE_API_TOKEN\" \\"
echo "    https://api.replicate.com/v1/models/beenga/beenga-image-1 | python3 -m json.tool | head"
echo
echo "Then, and only then:"
echo "  doctl compute droplet delete $ID --force     # \$0.14/hr until you do"
echo
echo "If the build failed, read Setup logs on the model VERSION page — not the"
echo "summary banner, which shows a misleading dependency warning."
