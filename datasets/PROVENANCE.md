# Dataset provenance

One record per training release. The point is that anyone — a customer, an
acquirer, a regulator — can trace every image a Beenga model learned from back
to a generator, a revision, and a licence as it stood on the day of generation.

Licences change. Recording the licence *at generation date* alongside the exact
upstream revision is what makes this a record rather than an assertion, because
it stays true even if upstream terms move afterwards.

Fill one of these in for every adapter or fine-tune before training, not after.

---

## beenga_curl_v1

| | |
|---|---|
| Release | `beenga_curl_v1` |
| Published | [`beenga8/beenga-curl-v1`](https://huggingface.co/beenga8/beenga-curl-v1) |
| Images | 200 |
| Real photographs | 0 |
| Scraped data | none |
| Identifiable real people | none |

### Generator

| | |
|---|---|
| Model | `Tongyi-MAI/Z-Image-Turbo` |
| Revision | *not recorded at generation time — see Gaps* |
| Licence at generation date | Apache 2.0 (repository), verified 2026-08-16 |
| Output terms | **not separately reviewed.** The repository is Apache 2.0; Apache governs the model, not output rights, which most model licences address separately and Apache does not. Read Tongyi-MAI's full model documentation before relying on this. |
| Prompts | `datasets/recipes.mjs` |
| Generation date | 2026-08-15 |

### Filtering and deduplication

| | |
|---|---|
| Filtering | none |
| Deduplication | none |
| Caption source | single template, single generator |

**This is the recorded cause of the adapter's failure.** All 200 captions came
from one template with no contrast examples — nothing straight, tight, coily or
glamorous — so the adapter could not learn that curl geometry is separable from
everything else in frame. A provenance record that captures caption diversity
would have made this visible before training rather than after.

### Training

| | |
|---|---|
| Base | `black-forest-labs/FLUX.2-klein-4B` |
| Base revision | `e7b7dc27f91deacad38e78976d1f2b499d76a294` |
| Base licence at training date | Apache 2.0 |
| Method | LoRA, rank 32, alpha 32 |
| Steps | 1500, checkpoints at 500 / 1000 / 1500 |
| Optimiser | adamw8bit, lr 1e-4, flowmatch scheduler, bf16, quantised |
| Resolutions | 512 / 768 / 1024 |
| Hardware | 1× NVIDIA A40 48GB, ~35 min |
| Toolkit | ai-toolkit 0.12.23 |
| Config | `training/beenga_curl_v1.yaml` |

### Resulting checkpoints

| Checkpoint | SHA-256 | Status |
|---|---|---|
| step 500 | `bea8e082a3ed30dd63d37a217a726a9e2f60422cfba2e8de4c453a601ecef6b4` | published, best of three |
| step 1000 | `684705d08d9801c59c8edbc9484bbf2c0639e5fe6242061d5c399fdfa0924316` | not released |
| step 1500 | `184f058c19c8dc06…` (full hash in `out/lora/`) | **served in production** — packaging slip, overtrained |

### Gaps in this record

Stated rather than quietly omitted, because a provenance record that hides its
own holes is worth less than none:

- **Generator revision not pinned or recorded.** The 200 images cannot be
  regenerated exactly. Fix for the next release: record the generator's commit
  SHA before generating.
- **No per-image manifest.** Prompt, seed and output hash per image were not
  kept, only the recipe file.
- **Output terms unread** — see above.
