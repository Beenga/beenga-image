// Dataset recipes for the wave-2 LoRA buckets.
//
// The trick these recipes rely on: Klein can already RENDER clean-shaven men and
// soft loose curls (IND-MEN-003 and IND-HAIR-004 both passed). What it cannot do
// is bind those visuals to the words users actually type — "no moustache",
// "salon curls" inside a long prompt. So we are not teaching a new appearance.
// We are teaching a vocabulary.
//
// Hence every bucket has two halves that deliberately differ:
//
//   genPrompt  — phrasing that RELIABLY PRODUCES the right image today.
//                Positive, short, uncluttered. This is generation only; it never
//                ships and never becomes a caption.
//
//   caption    — the words that FAIL today, which we want bound to that image.
//                This is what the LoRA actually learns. It must read like
//                something a real user would type.
//
// Diversity is enforced by combination, not by asking for it. The spec we are
// working from is explicit that the goal is not to replace one default with
// another, so each axis below is sampled independently and no single
// complexion, age, setting or build is allowed to dominate a bucket.

// ── Shared axes ──────────────────────────────────────────────────────────────
// Complexion is listed first and weighted evenly on purpose. If we let the model
// choose, it drifts fair, and the dataset would bake that in permanently.
const COMPLEXION = [
  "very fair skin",
  "fair skin with cool undertones",
  "light-medium skin with warm undertones",
  "wheatish medium-brown skin",
  "medium brown skin with olive undertones",
  "deep brown skin with warm undertones",
  "very deep dark brown skin",
];

const BUILD = ["a slim build", "an average build", "a heavy-set build", "a stocky build"];

const SETTING = [
  "in a modern apartment living room",
  "at a rooftop cafe",
  "on a college campus walkway",
  "in an open-plan office",
  "on a residential street",
  "in a metro station",
  "at a bus stop",
  "in a shopping mall atrium",
  "in a small neighbourhood shop",
  "in a plain studio against a grey backdrop",
  "in a home kitchen",
  "on a balcony overlooking apartment blocks",
];

const LIGHT = [
  "natural window light",
  "overcast daylight",
  "bright midday sun",
  "warm late-afternoon light",
  "soft indoor lamplight",
  "flat even studio lighting",
];

const FRAMING = [
  "head and shoulders portrait",
  "waist-up portrait",
  "three-quarter view portrait",
  "profile view",
  "full-length photograph",
  "candid mid-shot",
];

// Hair buckets need the hair legible. The curl_type pilot wasted its full-length
// and profile frames — at that distance the hair is a few hundred pixels and
// teaches nothing about curl shape. Close and medium only.
const HAIR_FRAMING = [
  "head and shoulders portrait",
  "waist-up portrait",
  "three-quarter view portrait",
  "close portrait",
];

// ── Bucket 1 — facial hair vocabulary ────────────────────────────────────────
//
// IND-MEN-001 asked for "no beard and no moustache and no stubble" and got
// stubble. Note the genPrompts never use the word "no" — that is precisely the
// vocabulary we are trying to teach, so it belongs in the caption, not here.
const MEN_AGE = ["a 19-year-old", "a 22-year-old", "a 25-year-old", "a 28-year-old", "a 31-year-old", "a 35-year-old"];

const MEN_HAIR = [
  "short cropped black hair",
  "neatly side-parted black hair",
  "a modern textured fringe",
  "hair tied in a small bun",
  "closely buzzed hair",
  "slightly longer wavy black hair",
];

const MEN_WEAR = [
  "a plain cotton t-shirt",
  "a casual button-down shirt",
  "a formal office shirt",
  "a hoodie",
  "a polo shirt",
  "a kurta",
];

// ── Bucket 2 — curl vocabulary ───────────────────────────────────────────────
//
// IND-MULTI-001 turned "loose salon curls" into tight ringlets whenever other
// attributes competed for attention. The genPrompt describes the wave shape
// physically, which works; the caption uses the salon/parlour vocabulary, which
// does not work yet.
const WOMEN_AGE = ["a 20-year-old", "a 24-year-old", "a 27-year-old", "a 31-year-old", "a 36-year-old", "a 42-year-old"];

const WOMEN_WEAR = [
  "a plain cotton kurti",
  "a casual t-shirt and jeans",
  "a formal office blouse",
  "a simple contemporary sari",
  "a salwar suit",
  "a casual summer dress",
];

// The pilot's phrasing under-delivered: "wide relaxed S-shaped waves" produced
// hair that read as barely wavy, and one sample came out essentially straight.
// These push harder toward visible curl while staying clear of the tight-ringlet
// end the bucket exists to avoid.
const CURL_SHAPE = [
  "large soft spiral curls that fall in clearly defined loose coils past the shoulders",
  "voluminous bouncy curls with deep rounded curl loops, salon-styled",
  "big soft blowout curls with strong visible curl definition and plenty of body",
  "wide open curl loops, thick and springy, each curl broad and generously spaced",
];

const pick = (arr, i) => arr[i % arr.length];

export const BUCKETS = {
  /** Teach: "clean-shaven", "no moustache", "no beard", "no stubble". */
  facial_hair: {
    id: "facial_hair",
    target: 150,
    defect: "IND-MEN-001 — explicit clean-shaven request still renders stubble",
    // Generated from Z-Image, NOT Klein. A 12-image pilot on Klein returned ~1 in 4
    // usable: even told "perfectly smooth freshly shaved face, bare upper lip",
    // it kept adding stubble. Its single pass was a boyish 19-year-old, so culling
    // hard would have taught "clean-shaven = teenager".
    //
    // Run head-to-head on identical prompts and seeds, Z-Image returned 3/3 clean
    // where Klein returned 0/3, with a convincing 35-year-old among them. Klein's
    // resistance here is a genuine prior, not a vocabulary gap — so the training
    // signal has to come from outside Klein.
    //
    // Z-Image Turbo is Apache-2.0 and places no restriction on its outputs, so
    // using them as training data for a Klein LoRA is clean. Costs $0.005/image
    // against Klein's $0.001 — $0.75 for this bucket instead of $0.15.
    model: "prunaai/z-image-turbo",
    // Deliberately generated WITHOUT negations, because negations are the thing
    // that fails. We produce the picture with words that work, then label it
    // with the words that don't.
    genPrompt: (i) =>
      `${pick(FRAMING, i)} of ${pick(MEN_AGE, i)} Indian man with a perfectly smooth freshly ` +
      `shaved face, bare upper lip, smooth clean jawline, ${pick(MEN_HAIR, i * 5)}, ` +
      `${pick(COMPLEXION, i)}, ${pick(BUILD, i * 5)}, wearing ${pick(MEN_WEAR, i * 7)}, ` +
      `${pick(SETTING, i * 11)}, ${pick(LIGHT, i * 13)}, realistic documentary photography, ` +
      `natural skin texture`,
    caption: (i) =>
      `a clean-shaven Indian man, no moustache, no beard, no stubble, completely smooth face, ` +
      `${pick(MEN_AGE, i).replace("a ", "")}, ${pick(COMPLEXION, i)}, ${pick(MEN_HAIR, i * 5)}, ` +
      `wearing ${pick(MEN_WEAR, i * 7)}, ${pick(SETTING, i * 11)}, realistic photography`,
  },

  /** Teach: "soft curls", "salon curls", "loose curls", "beauty-parlour curls". */
  curl_type: {
    id: "curl_type",
    target: 200,
    defect: "IND-MULTI-001 — soft/salon curls collapse into tight ringlets under attribute load",
    // Z-Image, not Klein — for a different reason than facial_hair. Klein renders
    // curls acceptably, but the pilot showed it silently LIGHTENING the specified
    // complexion: index 0004 asked for "medium brown with olive undertones" and
    // came back light-medium. Training a Klein LoRA on Klein's own lightened
    // output would bake that bias in permanently and work directly against the
    // complexion bucket. Z-Image held the specified tone in the facial_hair test.
    model: "prunaai/z-image-turbo",
    genPrompt: (i) =>
      `${pick(HAIR_FRAMING, i)} of ${pick(WOMEN_AGE, i)} Indian woman, long black hair falling in ` +
      `${pick(CURL_SHAPE, i * 3)}, ${pick(COMPLEXION, i)}, ${pick(BUILD, i * 5)}, ` +
      `wearing ${pick(WOMEN_WEAR, i * 7)}, ${pick(SETTING, i * 11)}, ${pick(LIGHT, i * 13)}, ` +
      `realistic photography, natural skin texture`,
    caption: (i) =>
      `an Indian woman with soft loose salon curls, beauty-parlour blowout curls, gentle curled ` +
      `hair, ${pick(WOMEN_AGE, i).replace("a ", "")}, ${pick(COMPLEXION, i)}, ` +
      `wearing ${pick(WOMEN_WEAR, i * 7)}, ${pick(SETTING, i * 11)}, realistic photography`,
  },
};

/** Rough per-bucket generation cost at ~$0.001/image, 1MP Klein. */
export const costOf = (bucket, n) => (n ?? BUCKETS[bucket].target) * 0.001;
