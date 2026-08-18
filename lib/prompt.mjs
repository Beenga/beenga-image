// Beenga prompt layer — wave 1.
//
// Every rule here exists because a specific benchmark case failed. Nothing is
// speculative. See out/baseline/SCORES.md for the evidence.
//
// The baseline run found one clean pattern: Klein obeys attributes it is told
// about, and reaches for traditional/ceremonial India when it is told nothing.
// 5 pass / 3 partial / 0 fail on explicit attributes; 0 pass / 3 fail on
// generic prompts. So this layer does three jobs, in order of measured payoff:
//
//   1. Rewrite negations, because FLUX ignores them outright.
//   2. Supply a contemporary default when the prompt names India but no era.
//   3. Restate fragile attributes that get diluted in long prompts.

// ── 1. Negations ─────────────────────────────────────────────────────────────
//
// IND-MEN-001 asked for "no beard and no moustache and no stubble" and got
// stubble anyway. The words are not weak — they are inert. FLUX has no
// mechanism for negation in the prompt, so "no moustache" contributes the
// token "moustache" and nothing else. The only fix is to describe the face as
// it should positively appear.
//
// Ordered longest-first so "no facial hair" wins before "no hair" could match.
//
// Replacements must never contain a phrase that a LATER rule matches. The first
// draft rewrote "no kajal" into "...with no eyeliner of any kind", which the
// next rule then rewrote again, yielding "bare clean eyelids with bare clean
// eyelids of any kind". Keep the right-hand side free of negation wording.
const NEGATIONS = [
  [/\bno\s+facial\s+hair\b/gi, "a completely smooth clean-shaven face"],
  [/\bwithout\s+a\s+moustache\b/gi, "with a bare smooth upper lip"],
  [/\bno\s+moustache\b/gi, "a bare smooth upper lip"],
  [/\bno\s+beard\b/gi, "a smooth bare jawline and chin"],
  [/\bno\s+stubble\b/gi, "freshly shaved smooth skin"],
  [/\bno\s+makeup\s+at\s+all\b/gi, "a completely bare unmade-up face"],
  [/\bno\s+makeup\b/gi, "a bare unmade-up face"],
  [/\bno\s+kajal\b/gi, "completely undecorated bare eyes"],
  [/\bno\s+eyeliner\b/gi, "bare clean eyelids"],
  [/\bno\s+heavy\s+embroidery\b/gi, "plain unadorned fabric"],
  [/\bno\s+glamou?r\b/gi, "a plain everyday unglamorous appearance"],
  [/\bno\s+styling\s+products\b/gi, "hair left in its natural untreated state"],
  [/\bnot\s+cropped\b/gi, "the whole subject inside the frame"],
];

// ── 2. Contemporary default ──────────────────────────────────────────────────
//
// IND-SCENE-001, IND-DANCE-001 and IND-SKIN-003 all failed the same way: a
// generic Indian prompt produced heavy silk, gold jewellery, a weathered
// terrace or a performance stage. The model's prior for "India" is ceremonial.
//
// So when a prompt names India and does NOT ask for something traditional, we
// state the present day explicitly. This is a default, not an override — the
// moment the user asks for a wedding or a classical form, we stay out of it.
// Cities AND states. The first version listed only cities, so "kerala man in
// 20s" or "punjab man in 20s" did not register as India at all and silently got
// no contemporary default — the headline feature, skipped, for any prompt that
// named a state instead of a city. INDIAN_PLACE below already listed those
// states, so the layer knew Kerala was Indian when suppressing the North Indian
// look but not when applying contemporary defaults. Two lists that must agree
// and did not; scripts/check-place-lists.mjs now asserts INDIAN_PLACE ⊆ INDIA.
//
// Same failure shape as `clean shave` vs `clean-shaven`: the benchmark cases
// were written with city names, so the state-name path was never exercised.
const INDIA = /\b(indian?|desi|delhi|new\s+delhi|noida|gurgaon|gurugram|punjab|punjabi|haryana|rajasthan|jaipur|udaipur|jodhpur|lucknow|kanpur|varanasi|banaras|agra|uttar\s+pradesh|bihar|patna|jharkhand|chandigarh|amritsar|ludhiana|dehradun|uttarakhand|himachal|shimla|kashmir|srinagar|jammu|madhya\s+pradesh|indore|bhopal|chhattisgarh|raipur|mumbai|bombay|bengaluru|bangalore|chennai|madras|kolkata|calcutta|hyderabad|pune|ahmedabad|surat|kochi|cochin|trivandrum|kerala|tamil|telugu|kannada|malayalam|mysore|coimbatore|madurai|vizag|visakhapatnam|bengali|bangla|assam|odisha|orissa|bhubaneswar|goa|konkan|marathi|nagpur|gujarat|gujarati|manipur|naga|mizo|khasi|sikkim|north\s*east|northeast|south\s+india|south\s+indian|east\s+india|west\s+india|andhra|karnataka|maharashtra)\b/i;

const TRADITIONAL_INTENT = new RegExp(
  "\\b(traditional|classical|bride|groom|priest|pandit|purohit|sadhu|sant|monk|nun|lehenga|sherwani|ghagra|ghaghra|achkan|jodhpuri|mundu|veshti|dhoti|angavastram|pattu|langa|bharatanatyam|kathak|kuchipudi|odissi|bhangra|garba|" +
  "temple|ritual|ceremon|wedding|bridal|festival|puja|pooja|diwali|navratri|" +
  "historical|period|ancient|mytholog|village|rural|folk|hanuman|krishna|krishn|radha|\\brama\\b|\\bram\\b|shiva|shiv\\b|vishnu|ganesh|ganpati|lakshmi|laxmi|durga|kali\\b|saraswati|brahma|parvati|murugan|ayyappa|venkatesw|balaji|jagannath|nataraj|buddha|mahavir|nanak|sai baba|deity|goddess|\\bgod\\b|\\blord\\b|avatar|ramayana|mahabharata|bhagavad|bhakti|devotional|aarti|mandir|idol|murti|shrine|pilgrim|sadhu|saint|yogi|ascetic|epic\\b|scripture|vedic|sanskrit)\\w*\\b", "i");

const CONTEMPORARY =
  "Present-day contemporary India, modern well-maintained surroundings, clean and " +
  "tidy environment, current-day styling.";

// Clothing is handled separately: only nudge toward modern dress when the user
// has not named a garment at all. Otherwise we would fight an explicit request.
const GARMENT = /\b(sari|saree|lehenga|salwar|kurti|kurta|dupatta|sherwani|dhoti|blouse|dress|shirt|t-?shirt|jeans|suit|top|gown|uniform)\b/i;
const MODERN_DRESS = "Modern everyday clothing.";

// ── 2b. Venue for dance prompts ──────────────────────────────────────────────
//
// Fixing the classical-dance stereotype exposed a second failure underneath it.
// "An Indian woman dancing to music" stopped producing temple costume and
// started producing a drum kit, cymbals, mic stands and a strapped-on dhol —
// on 2 of 2 seeds, so systematic rather than noise. The word "music" was being
// rendered literally as equipment because nothing else furnished the scene.
//
// The fix is to give the scene something to be. Note this is stated positively:
// naming the unwanted objects would summon them (see the NEGATIONS note above).
const DANCE = /\bdanc(e|es|ing|er)\b/i;
const VENUE = new RegExp(
  "\\b(rooftop|terrace|balcony|room|home|house|apartment|flat|hall|stage|studio|" +
  "club|bar|party|cafe|café|restaurant|kitchen|garden|park|beach|street|road|" +
  "campus|college|school|office|mall|metro|station|temple|wedding|venue|floor|" +
  "courtyard|lawn|field|outdoors|indoors)\\w*\\b", "i");
const DANCE_VENUE =
  "An ordinary domestic living room.";




// ── Framing ──────────────────────────────────────────────────────────────────
//
// Klein frames almost everything as a head-and-shoulders portrait. Asked for a
// couple lying on a bed it returned their upper halves and cropped the rest,
// which reads as a mistake rather than a choice.
//
// So when the prompt describes a pose that only makes sense with the whole
// figure visible, say so. Stated positively — "the full figure in frame", never
// "not cropped", since naming the crop argues for it.
//
// Skipped when the caller has framed the shot themselves: a close-up of a face
// is a legitimate request and this must not fight it.
const FULL_BODY_POSE = new RegExp(
  "\\b(lying|lie|lies|laying|reclining|reclined|sprawled|stretched\\s+out|" +
  "sitting|seated|squatting|kneeling|crouching|crossed[-\\s]?legs|" +
  "standing|walking|running|jogging|jumping|leaping|dancing|stretching|" +
  "yoga|asana|exercising|working\\s+out|cycling|riding|climbing|" +
  "full[-\\s]?body|full[-\\s]?length|head[-\\s]?to[-\\s]?toe|whole\\s+body)\\b", "i");
const FRAMING_STATED = new RegExp(
  "\\b(close[-\\s]?up|closeup|headshot|head\\s+shot|portrait|bust|face\\s+only|" +
  "waist[-\\s]?up|half[-\\s]?body|shoulders\\s+up|crop|cropped|macro|" +
  "full[-\\s]?body|full[-\\s]?length|head[-\\s]?to[-\\s]?toe|wide\\s+shot)\\b", "i");
// No body-part nouns. The first version read "from head to feet", which names
// two of them on exactly the prompts where hands and feet are visible and
// anatomy fails hardest. This file already carries the lesson: "bare shoulders
// and bare upper arms" on a prompt saying "one hand raised" rendered a third
// hand. Describe the FRAMING, never the body inside it.
const FULL_FRAME = "Framed wide, with the entire subject inside the frame.";

// ── Is the face actually the subject? ────────────────────────────────────────
//
// house-look and hair-realism are ~30 words describing a face and hair. That
// description mass MOVES THE CAMERA: measured on "an indian girl with two
// pigtails at a delhi market", adding them cropped a full market scene down to
// a headshot, and adding FULL_FRAME on top did not pull it back out — 9 words
// of framing cannot out-vote 30 words of face.
//
// That is the whole crop bug. It was previously "fixed" by deleting both rules
// from every prompt, which also deleted the hair and skin detail they buy, on
// the prompts where that detail is the only thing in frame.
//
// So gate them instead: describe the face when the face is what we are looking
// at, and stay quiet when it is a scene.
const FRAMING_CLOSE = new RegExp(
  "\\b(close[-\\s]?up|closeup|headshot|head\\s+shot|portrait|bust|face\\s+only|" +
  "shoulders\\s+up|waist[-\\s]?up|half[-\\s]?body|macro)\\b", "i");
const FRAMING_WIDE = new RegExp(
  "\\b(full[-\\s]?body|full[-\\s]?length|head[-\\s]?to[-\\s]?toe|whole\\s+body|" +
  "wide\\s+shot)\\b", "i");

// Order matters: an explicit close framing wins over everything, then an
// explicit wide one, then a pose that puts the body in frame, and only then the
// fallback — a prompt with no setting in it is effectively a portrait.
function faceIsSubject(raw) {
  if (FRAMING_CLOSE.test(raw)) return true;
  if (FRAMING_WIDE.test(raw)) return false;
  if (FULL_BODY_POSE.test(raw)) return false;
  return !SETTING_NAMED.test(raw);
}

// Region and grooming are identity decisions, not decoration, and they are
// short enough not to drag the camera. They survive on scene prompts; the long
// beauty description does not.
const HOUSE_REGION_ALONE = "North Indian appearance.";

// ── Cartoon style default ────────────────────────────────────────────────────
//
// "cartoon" left to itself lands on flat 2D illustration, which is not what
// people mean by it now — the modern default reading is a 3D animated feature.
// So state 3D unless the caller has asked for something 2D, and stay out of the
// way entirely when they have.
//
// Stated positively and without naming what we do not want, per the NEGATIONS
// note: writing "not flat 2D" would contribute "flat" and "2D" as tokens and
// argue for the thing it meant to prevent.
const CARTOON = /\b(cartoon|cartoons|cartoonish|toon|animated|animation)\b/i;

// Anything here means the caller has chosen their own style, including a 3D one
// they have already described — restating it would only spend budget.
const STYLE_STATED = new RegExp(
  "\\b(2d|two[-\\s]?dimensional|flat|hand[-\\s]?drawn|line[-\\s]?art|lineart|" +
  "sketch|sketched|doodle|anime|manga|comic|cel[-\\s]?shaded|cel|vector|" +
  "watercolou?r|gouache|ink|woodcut|linocut|storybook|picture[-\\s]?book|" +
  "paper[-\\s]?cut|collage|pixel[-\\s]?art|8[-\\s]?bit|sticker|clip[-\\s]?art|" +
  "3d|three[-\\s]?dimensional|cgi|render|rendered|pixar|claymation|stop[-\\s]?motion|" +
  "low[-\\s]?poly|voxel)\\b", "i");

const CARTOON_3D =
  "Modern 3D animated film style, rounded volumetric forms, soft global " +
  "illumination, subtle subsurface scattering in the skin.";

// ── 2c. Hair realism ─────────────────────────────────────────────────────────
//
// Klein renders hair as a solid moulded mass with a hard, high hairline — it is
// one of the strongest tells that an image is generated. Naming the fine detail
// pushes against it: measured side by side on one seed, this brought back
// visible flyaway strands, a soft hairline with baby hairs, and real scalp
// detail.
//
// Skipped for non-photographic styles, where strand detail is meaningless.
const NON_PHOTO = /\b(cartoon|anime|illustration|illustrated|painting|painted|sketch|drawing|3d\s+render|cgi|pixar|vector|comic)\b/i;
// Occupations, kinship and age words as well as the bare nouns. "an indian
// farmer", "an indian shopkeeper", "an indian teenager", "an indian uncle" and
// "an elderly indian" were ALL invisible to the layer — no house look, no hair
// realism, no scene variety, no clothing default. HANDOFF names "farmer" as a
// worked example of overriding the attractive default, and it never worked.
//
// Same pattern as the scene and place lists: the vocabulary was whatever the
// benchmark authors happened to type.
const PERSON_WORD = new RegExp(
  "\\b(woman|women|man|men|girl|boy|lady|ladies|person|people|couple|friends?|" +
  "family|group|crowd|child|children|kid|student|model|portrait|face|hair|male|" +
  "female|guy|gentleman|bride|groom|" +
  // age
  "teen|teens|teenager|teenagers|adult|adults|elder|elderly|senior|seniors|" +
  "youth|toddler|infant|grandmother|grandfather|granny|" +
  // kinship, including the Indian-English forms people actually type
  "mother|father|sister|brother|daughter|son|aunt|aunty|auntie|uncle|cousin|" +
  "wife|husband|bhai|didi|bhabhi|beta|beti|amma|appa|maa|papa|dada|dadi|nani|nana|" +
  // occupations that show up constantly in real prompts
  "farmer|shopkeeper|vendor|hawker|driver|teacher|doctor|nurse|engineer|" +
  "entrepreneur|founder|professional|worker|labourer|labourer|tailor|barber|" +
  "chef|cook|waiter|officer|policeman|soldier|priest|artist|musician|" +
  "dancer|singer|athlete|actor|actress|influencer|blogger|" +
  "customer|passenger|commuter|shopper|pedestrian|villager)\\b", "i");
// Deliberately NOT included: figure, subject, character, human, someone,
// somebody, individual, player, guard, baby. Each was added in the same
// expansion and each is more often a thing than a person — "a chess figure",
// "the subject of the painting", "a player piano", "a guard rail", "baby
// corn". Widening a list to close one hole opens others, and the generic
// words are where they open. scripts/audit-layer.mjs now probes for exactly
// this.

// A prompt can say there is nobody in the picture, and until 2026-08-16 this layer
// could not hear it: PERSON matched the word "people" INSIDE "no people in frame",
// so an empty-room still life came back with a house look, hair realism, a randomly
// chosen setting and the line "The person is Indian, with South Asian features and
// colouring" — an instruction to draw a person into a scene that asked for none.
//
// Found by using the product (demo/romantichive renders still lifes almost
// exclusively) and invisible to both benchmark suites, where all 41 cases have a
// person in them. That is the same blindness the HANDOFF names, one level up: the
// suites and the rules share the assumption that there IS a subject.
//
// "empty" is qualified rather than matched bare — "a woman holding an empty cup"
// has a person in it. "still life" is included because it is the genre name for
// exactly this.
const NO_PEOPLE =
  /\b(no|without)\s+(people|persons?|humans?|figures?|models?|subjects?)\b|\bnobody\b|\bno\s+one\b|\bunoccupied\b|\bdeserted\b|\bstill\s+life\b|\bempty\s+(room|street|scene|chair|table|bed|house|office|platform)\b/i;

// Every person rule goes through this, never PERSON_WORD directly.
const PERSON = { test: (raw) => PERSON_WORD.test(raw) && !NO_PEOPLE.test(raw) };
const HAIR_REALISM =
  "Fine individual hair strands visible, wispy flyaway hairs catching the light, " +
  "soft natural hairline with baby hairs at the temples, realistic scalp and hair root detail.";

// ── 2d. Garment variety ──────────────────────────────────────────────────────
//
// Every unqualified "sari" came back as the same teal-blue silk with a gold zari
// border. That is Klein's prior, not a coincidence, and it makes a batch of
// generations look like one photoshoot.
//
// When the user has not named a fabric or colour, pick one deterministically
// from the prompt text. Deterministic matters: the same prompt and seed must
// still reproduce, so this cannot use a random source. Different prompts get
// different cloth; the same prompt always gets its own.

// Klein's default exposure for an unlit prompt is flat and grey — muted clothes,
// overcast sky, dull tiles. Naming daylight lifts it. Only applied when the
// prompt says nothing about light, so "candlelit" or "night" are untouched.
// Times of day that CONTRADICT bright daylight are listed here so the default does
// not fire against them: "a living room sofa in the evening" was coming back with
// "Bright natural daylight, clear colour." appended to it.
//
// "morning", "afternoon", "noon" are deliberately NOT in this list. They imply
// light without contradicting it, and Klein's unlit exposure is flat and grey — a
// morning prompt still wants the daylight line. Only words that fight it belong here.
const LIGHTING = /\b(light|lighting|lit|sunset|sunrise|golden\s+hour|night|dusk|dawn|evening|twilight|midnight|moonlit|moonlight|firelight|lantern|candlelit|shade|shadow|backlit|neon|candle|lamp|studio|overcast|cloudy|moody|dim|gloom|dark|silhouette)\w*\b/i;
const DAYLIGHT = "Bright natural daylight, clear colour.";


// Beenga is an India-first product: when a prompt names a person and nothing
// about who they are, the subject should be Indian. FLUX ships regional priors
// the same way. This only holds while nothing contradicts it — another
// ethnicity, nationality or a clearly non-Indian place all take precedence.
const FOREIGN = /\b(paris|london|new\s+york|tokyo|beijing|shanghai|dubai|sydney|moscow|berlin|rome|madrid|bangkok|singapore|seoul|cairo|lagos|nairobi|toronto|chicago|los\s+angeles|san\s+francisco|europe|european|america|american|african|chinese|japanese|korean|thai|arab|arabic|latina?|hispanic|russian|british|french|german|italian|spanish|mexican|brazilian|nigerian|kenyan|caucasian|white|black\s+(man|woman|person)|scandinavian|nordic)\b/i;
const STATED_INDIAN = /\bindian\b|\bsouth\s+asian\b|\bdesi\b/i;

const SARI = /\b(sari|saree)\b/i;
const FABRIC_OR_COLOUR = /\b(silk|cotton|chiffon|georgette|linen|handloom|khadi|organza|banarasi|kanjivaram|red|blue|green|yellow|pink|purple|orange|black|white|cream|maroon|teal|mustard|ivory|beige|grey|gray|navy|coral|lavender|turquoise|magenta)\b/i;

// Midriff coverage. A sari exposes the midsection by default in Klein's prior,
// and the spec this project works from treats visible midriff as something the
// user asks for, not something they get handed. Stated as drape, not as an
// absence — naming what should not be shown would summon it.
const WANTS_MIDRIFF = /\b(midriff|bare\s+waist|exposed\s+waist|navel|crop|bare\s+midsection|low\s+drape)\b/i;
const MODEST_DRAPE =
  "The pallu passes over the shoulder and falls straight down the back, " +
  "with the sari covering the midsection.";

const SARI_LOOKS = [
  "a soft cotton handloom sari in a warm mustard tone with a thin contrasting border",
  "a light chiffon sari in dusty rose with a narrow silver edge",
  "a crisp cotton sari in off-white with a fine indigo stripe",
  "a georgette sari in deep green with a plain matte finish",
  "a linen sari in terracotta with an unadorned selvedge",
  "a printed cotton sari in faded coral with small block-print motifs",
  "a handwoven khadi sari in slate grey with a plain border",
  "a soft silk sari in aubergine with a restrained narrow border",
];
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const pickLook = (s) => SARI_LOOKS[hash(s) % SARI_LOOKS.length];



// ── Deity iconography ────────────────────────────────────────────────────────
//
// "Lord Hanuman lifting a mountain" produced a crowned human figure on both
// Klein and Z-Image — neither renders the vanara face that defines him. Deities
// have fixed, non-negotiable iconography, and the models only half-know it.
const DEITY_ICONS = [
  [/\bhanuman\b/i, "Hanuman has the face of a vanara monkey, orange-red fur, a golden crown and mace, and a long tail."],
  [/\bganesh|ganpati\b/i, "Ganesha has an elephant head with one broken tusk, a large belly, and four arms."],
  [/\bshiva\b/i, "Shiva has a blue throat, matted jata hair with a crescent moon, a third eye, and a trident."],
  [/\bkrishna\b/i, "Krishna has blue skin, a peacock feather in his hair, and a bamboo flute."],
  [/\bdurga\b/i, "Durga has many arms holding weapons and rides a lion."],
  [/\bsaraswati\b/i, "Saraswati wears white, holds a veena, and sits with a swan."],
  [/\blakshmi|laxmi\b/i, "Lakshmi sits on a lotus with gold coins flowing from her palms."],
];

// ── Scene variety ────────────────────────────────────────────────────────────
//
// The contemporary default says "modern clean surroundings" and nothing more, so
// Klein reaches for the same apartment walkway every time. Same treatment as the
// sari: pick deterministically from prompt + seed when no setting is named.
// VENUE has "room", but `\broom\w*\b` cannot match the room people actually name:
// there is no word boundary inside "bedroom". So "a quiet bedroom at night" counted
// as setting-less and this rule appended "The setting is a metro station platform."
// — overriding a setting the prompt had already stated. Compound rooms and the rest
// of a house are matched explicitly below; a named piece of furniture counts too,
// since "on the bedside table" locates a scene as surely as naming the room does.
const SETTING_NAMED = new RegExp(
  // Plurals only, NOT \\w*. The wildcard made `car` match "cartoon", `port`
  // match "portrait", `bus` match "business", `farm` match "farmer", `study`
  // match "studying" and `ground` match "groundwater" — twelve measured false
  // positives, each one silently telling the layer a scene-less prompt had a
  // named setting. Compound settings that are still wanted are listed
  // explicitly above rather than reached by wildcard.
  VENUE.source +
  // Indian venue vocabulary the first VENUE list missed. Without these the layer
  // treats the prompt as scene-less and OVERRIDES it with one of the SCENES
  // below, which produced genuinely absurd output: "at a mela" came back with
  // "a modern apartment balcony overlooking the city" appended, "at a ghat"
  // with "a leafy residential lane", "at a factory" with "a small local cafe
  // interior". Thirteen of twenty-six common scene words were being overridden.
  //
  // Same failure shape as `clean shave` vs `clean-shaven` and the city-only
  // INDIA list: the benchmark cases were written with a narrow vocabulary, so
  // everything outside it went untested.
  "|\\b(concert|gig|festival|mela|fair|procession|parade|rally|" +
  "tea\\s*stall|dhaba|canteen|railway|platform|bus\\s*stand|bus\\s*stop|depot|" +
  "auto\\s*stand|rickshaw|taxi\\s*stand|junction|crossing|chowk|bazaar|bazar|haat|mandi|" +
  "ghat|riverbank|riverside|river|lake|pond|backwater|canal|coast|shore|harbour|" +
  "port|jetty|desert|dune|hill|hills|mountain|valley|forest|jungle|plantation|" +
  "orchard|farm|farmland|paddy|field|fields|village|hamlet|town|" +
  "construction|factory|workshop|godown|warehouse|shop|store|showroom|" +
  "salon|parlour|gym|clinic|hospital|pharmacy|library|museum|gallery|" +
  "airport|terminal|stadium|ground|maidan|playground|court|pool|" +
  "hotel|lobby|lounge|rooftop\\s*bar|terrace\\s*garden|verandah|veranda|" +
  "courtyard|balcony|staircase|corridor|alley|gully|lane|bylane|" +
  // Furniture and surfaces. "indian couple on bed" was getting "a busy
  // neighbourhood street with shopfronts" appended over it — a bed placed
  // outdoors, which is exactly what the caller reported seeing. "bedroom" and
  // "sofa" were recognised; "bed" and "chair" were not. If the prompt says what
  // the subject is ON, the layer has no business choosing somewhere else.
  "bed|beds|bedside|cot|charpai|charpoy|mattress|couch|sofa|settee|divan|" +
  "chair|chairs|stool|bench|swing|jhula|hammock|table|desk|counter|" +
  "carpet|rug|mat|mattress|floor|steps|stairs|ladder|windowsill|sill|" +
  "car|auto|bike|scooter|motorcycle|cycle|bicycle|bus|train|boat|" +
  "pool|poolside|bathtub|shower|mirror|window)(?:s|es)?\\b" +
  // Spelled out rather than `\w*room\w*`, which would also match "groom",
  // "bridegroom", "broom" and "mushroom" and silently suppress scene-variety on
  // a wedding portrait.
  "|\\b(bedroom|bathroom|washroom|restroom|classroom|storeroom|showroom|ballroom|" +
  "guestroom|playroom|boardroom|living\\s+room|drawing\\s+room|dining\\s+room|" +
  "sitting\\s+room|waiting\\s+room|kitchen)(?:s|es)?\\b" +
  "|\\b(hallway|corridor|landing|porch|doorway|staircase|stairwell|basement|attic|" +
  "study|nursery|balcony|verandah|veranda|patio|driveway|pavement|sidewalk|" +
  "bedside|sofa|couch|armchair|worktop|countertop|counter|dresser|nightstand)(?:s|es)?\\b" +
  "|\\b(market|bazaar|temple|gym|shop|beach|hill|mountain|village|farm|airport|" +
  "hospital|library|museum|stadium|terrace)(?:s|es)?\\b" +
  // Compound settings that the old `\\w*` reached by accident and the plural-only
  // form does not. Listed rather than wildcarded: three of these (marketplace,
  // hillside, hilltop) regressed when the wildcard went, and "seaside" never
  // matched at all. A missed setting is not a small bug — scene-variety then
  // appends a DIFFERENT scene over the one the user named, which is the
  // "bed in front of a building" failure.
  // A stated BACKGROUND is a stated setting. Without these, "deep dark
  // complexion, plain background" — a benchmark case — had scene-variety append
  // a market or a balcony on top of the plain background the caller asked for.
  // Same failure as the reported "couple on a bed in front of a building": the
  // layer did not see the scene, so it invented one over it.
  "|\\b(background|backdrop|seamless|plain\\s+wall|blank\\s+wall|against\\s+a\\s+wall|" +
  "against\\s+the\\s+wall|studio\\s*setup|no\\s+background)\\b" +
  "|\\b(marketplace|hillside|hilltop|hillock|seaside|seashore|seafront|" +
  "roadside|wayside|lakeside|mountainside|countryside|waterfront|dockside|" +
  "streetside|kerbside|curbside)\\b", "i");
// Eight was too few, and all eight were metro-modern, so a prompt that named no
// setting could never land anywhere rural, coastal, industrial or crowded. The
// contemporary default is about the PRESENT DAY, not about cities — a tea stall
// and a paddy field are as present-day as a metro platform.
const SCENES = [
  "a busy neighbourhood street with shopfronts and parked scooters",
  "a leafy residential lane with low boundary walls",
  "a modern apartment balcony overlooking the city",
  "a tidy indoor room with plain painted walls",
  "a college campus courtyard",
  "a small local cafe interior",
  "a metro station platform",
  "a rooftop terrace at the top of an apartment block",
  "a covered market lane with produce stalls",
  "a small-town high street with painted shopfronts",
  "a roadside tea stall with steel benches",
  "a railway platform with waiting passengers",
  "a village lane with low houses and open sky",
  "the edge of a paddy field under a wide sky",
  "a riverside ghat with worn stone steps",
  "a coastal road with palms and parked boats",
  "a co-working office with glass partitions",
  "a neighbourhood park in the early evening",
  "a lit-up street during a local festival",
  "a workshop interior with tools on the wall",
];

// ── Focus ────────────────────────────────────────────────────────────────────
// Klein defaults to a heavily blurred background on portraits, which reads as
// washed out. Only stated when the prompt has not asked for depth of field.
const DOF = /\b(depth\s+of\s+field|bokeh|blurred?\s+background|shallow\s+focus|f\/1|f1\.|portrait\s+lens|cinematic)\b/i;
const DEEP_FOCUS = "Background in clear focus with visible detail.";
// A caller who named a photographic TREATMENT has already decided the lighting
// and the depth of field. "bride ... luxury wedding venue, editorial
// photography" came back in flat outdoor daylight with everything in focus,
// because neither daylight-default nor deep-focus recognised "editorial" —
// the same override shape as appending daylight to "make it night".
const PHOTO_STYLE_STATED = new RegExp(
  "\\b(editorial|lookbook|campaign|fashion\\s+(shoot|photography)|glamour|" +
  "studio\\s+(lit|light|lighting)|golden\\s+hour|backlit|rim\\s+light|" +
  "soft\\s+focus|dreamy|moody|candle\\s*lit|fairy\\s+lights)\\b", "i");
// A caller who asked for a PLAIN background does not want "visible detail" in
// it. RW-DEEP is "deep dark complexion, plain background" and the layer was
// appending exactly that contradiction — the same shape as appending "Bright
// natural daylight" to "make it night". A stated background wins.
const PLAIN_BACKGROUND = new RegExp(
  "\\b(plain|blank|solid|seamless|white|grey|gray|black|neutral|studio)\\s+" +
  "(background|backdrop|wall)\\b|\\bno\\s+background\\b|" +
  "\\bagainst\\s+a\\s+(plain|blank|white|grey|gray|solid)\\b", "i");

// ── House look ───────────────────────────────────────────────────────────────
//
// Beenga's commercial default: North Indian, sharp-featured, attractive, and
// for men clean-shaven. Attractive-by-default is what every image model does
// and what users of this medium expect.
//
// Complexion is deliberately NOT part of it. Defaulting fair would repeat the
// exact bias this project measured and fixed in other models, in a market where
// that is a live controversy, and it would remove the differentiator — nobody
// else renders requested Indian skin tones correctly. Requested tones are
// handled by the per-tone stacks below; unrequested complexion is left alone. One rule rather than four, because each addition dilutes every
// other instruction in the prompt.
//
// This deliberately departs from the project's original specification, which
// said not to hard-code one complexion or beauty level. It is a product choice,
// not a measurement, and it yields the moment the user states anything of their
// own — a complexion, an ethnicity, a beauty level, or facial hair.
const COMPLEXION_STATED = /\b(fair|wheatish|dusky|deep|dark|medium|light|olive|complexion|skin\s+tone|melanated)\b/i;
const LOOK_STATED = /\b(ordinary|average|plain|everyday|unremarkable|documentary|realistic\s+skin|natural\s+variation|glamorous|model-?like)\b/i;

// ── Minors: never apply the beauty default ───────────────────────────────────
//
// Audited 2026-08-16 against a content-policy checklist. The layer had no
// concept of a minor at all, and the result was bad: "indian child", "indian kid
// playing", "indian children in a park" and "indian student" all had
// "conventionally attractive" appended to them by the house look. A beauty
// descriptor attached to a prompt about a child is indefensible on a public
// endpoint, and it was there by omission rather than by choice.
//
// What protection existed was accidental. The age-reinforcement rule fires on
// "girl" and "teenager" and pushes them to "clearly a young adult in their early
// twenties" — genuinely useful, but it was written to fix age ADHERENCE, and it
// fires on the word rather than on any judgement about age. "a 12 year old
// indian girl" got the adult push because *girl* matched, and got "attractive"
// as well.
//
// So: when a prompt references a minor, the house look does not apply. No
// attractiveness, no glamour, no age reinforcement. The layer stops decorating
// and gets out of the way.
//
// This is a floor, not a safety system. It cannot detect intent, it only reads
// words, and Beenga adds no moderation layer — the platform's policies and the
// base model's terms are what actually govern use. Anything relying on this
// alone is relying on the wrong thing.
//
// "schoolgirl" and "schoolboy" are matched explicitly: \bgirl\b does not match
// inside them, so those prompts previously bypassed the person rules entirely.
// Deliberately does NOT include bare "girl" or "boy". In Indian English "girl"
// routinely means a young woman — it is the single most common word in real
// prompts here, and "beautiful delhi girl in sari" is a core case. Those are
// already handled, and handled well, by the age-reinforcement rule that forces
// "clearly a young adult in their early twenties". Adding them here would
// suppress the house look across most of the product to protect against an
// ambiguity that is already resolved in the safe direction.
//
// "teenager" IS included, and keeps the adult push as well: unambiguous by
// meaning, so it gets both the beauty suppression and the age disambiguation.
const MINOR = new RegExp(
  "\\b(child|children|childs|kid|kids|toddler|toddlers|infant|infants|baby|babies|" +
  "newborn|newborns|minor|minors|schoolgirl|schoolboy|schoolkid|schoolchild|" +
  "school\\s*(girl|boy|kid|child|children|student)|preteen|pre-teen|" +
  "teen|teens|teenager|teenagers|teenaged|teenage|adolescent|adolescents|" +
  "juvenile|juveniles|underage|under-age)\\b" +
  // or an explicitly stated age below 18
  "|\\b([0-9]|1[0-7])\\s*[- ]?\\s*(year|yr)s?[- ]?old\\b" +
  "|\\bage[d]?\\s*([0-9]|1[0-7])\\b", "i");
const MALE = /\b(man|men|male|guy|boy|gentleman|groom|father|dad|brother|son)\b/i;
const FEMALE_ONLY = /\b(woman|women|female|girl|lady|ladies|bride|mother|sister|daughter)\b/i;

// A named Indian place or region overrides the North India default — otherwise
// "a woman in Chennai" would be told she looks North Indian.
// Only NON-northern places override the default. Naming Delhi should reinforce a
// North Indian look, not suppress it — a Delhi-market prompt came back with
// clearly South Indian faces because this rule was skipping the descriptor.
const INDIAN_PLACE = /\b(chennai|madras|bengaluru|bangalore|hyderabad|kochi|cochin|trivandrum|kerala|tamil|telugu|kannada|malayalam|mysore|coimbatore|madurai|vizag|visakhapatnam|kolkata|calcutta|bengali|bangla|assam|odisha|orissa|bhubaneswar|goa|konkan|marathi|mumbai|bombay|pune|nagpur|gujarat|gujarati|ahmedabad|surat|manipur|naga|mizo|khasi|sikkim|north\s*east|northeast|south\s+india|south\s+indian|east\s+india|west\s+india|andhra|karnataka|maharashtra)\b/i;
const HOUSE_REGION = "North Indian appearance, ";
const HOUSE_LOOK = "sharp well-defined features, conventionally attractive, healthy glowing well-lit skin.";
const HOUSE_LOOK_MALE = " Clean-shaven with a smooth bare upper lip and jawline.";

// ── 3. Fragile attributes ────────────────────────────────────────────────────
//
// IND-MULTI-001 held five attributes correctly and dropped one: "soft loose
// salon curls" became tight ringlets. The same curl instruction passed on its
// own in IND-HAIR-004. So the concept is present — it just loses a competition
// against longer prompts.
//
// Restating the fragile attribute at the end costs nothing and gives it a
// second, uncontested mention. We only restate what the prompt actually asked
// for, and we never invent an attribute.
//
// ── Two rules these strings must follow, both learned by breaking them ───────
//
//  * NO NEGATIONS, and never name the unwanted thing. The first draft said
//    "definitely not tight ringlets or coils" and "no cap sleeves". FLUX cannot
//    negate, so those phrases contributed "ringlets", "coils" and "cap sleeves"
//    as positive tokens — actively arguing for the failure they meant to
//    prevent. The curls came back tighter, not looser. Describe only the wanted
//    state.
//
//  * DO NOT REPEAT BODY-PART NOUNS. "bare shoulders and bare upper arms" landed
//    on a prompt already saying "one hand raised", and the render grew a third
//    hand. Extra mentions of arms/hands/legs raise the odds of extra limbs.
//    Describe the GARMENT, not the body it exposes.
// One attribute earns more than a single restatement. Asked for "clean-shaven,
// no beard, no moustache, no stubble", Klein rendered stubble on 3 of 4 samples
// — and switching to the undistilled base changed nothing, so it was never a
// checkpoint problem.
//
// What fixed it was volume: FIVE separate positive descriptions of the same
// smooth face, stacked. That went 6/6 across the full complexion and age range.
// Attribute repetition beats attribute mention — one clear statement loses a
// competition that five identical ones win.
//
// Credit where due: this came from Biren testing his own phrasing, not from me.
// His original also carried "fashion model" and "commercial fashion photography",
// which do help — but they drag the output glamorous and fair, so only the
// repetition is kept here.
const SHAVE_STACK =
  "completely clean-shaven face, perfectly smooth freshly shaved cheeks, " +
  "smooth bare upper lip, smooth chin and jawline, zero facial hair";

// Guard: "light short stubble only, no full beard, no moustache styling" matched
// the clean-shaven trigger on `no moustache` and got the whole zero-facial-hair
// stack bolted on, overriding the stubble the user actually asked for. A rule
// that enforces an attribute has to check nobody asked for its opposite.
const WANTS_HAIR = /\bstubble\b|\bbeard\b|\bmoustache\b|\bmustache\b|\bgoatee\b/i;
const WANTS_NONE = /\bno\s+(full\s+)?(beard|moustache|mustache|stubble|facial\s+hair)\b|\bclean[-\s]?shave[dn]?\b|\bzero\s+facial\s+hair\b|\bshaved\s+face\b/i;

const FRAGILE = [
  // "beautiful modern delhi lady in 20s" returned a European face. The city name
  // places the scene but says nothing about the person, and Klein does not infer
  // it. Only fires when a person is present, India is implied by place rather
  // than stated, and no other ethnicity is named.
  { test: (raw) =>
      PERSON.test(raw) && !STATED_INDIAN.test(raw) && !FOREIGN.test(raw),
    say: "The person is Indian, with South Asian features and colouring." },
  // "beautiful delhi girl in sari" rendered a woman around thirty, on the raw
  // model as well as through this layer — Klein maps youth words to roughly 30
  // whatever you type. Same failure shape as clean-shaven and complexion, so the
  // same fix: stack several positive statements of the age instead of one.
  // NEVER on a prompt that states a minor. "girl" is deliberately absent from
  // MINOR because Indian English uses it for a young woman ("delhi girl"), and
  // that is what this rule is for — but without a MINOR guard the rule also
  // fired on "a 12 year old indian girl" and asserted "clearly a young adult in
  // their early twenties" over a stated age of 12. MINOR already matches a
  // stated age below 18; the rule simply never consulted it.
  { test: (raw) =>
      !MINOR.test(raw) &&
      /\b(girl|young(\s+\w+){0,2}\s+(woman|man|lady|guy|boy|girl)|teenager|college\s+student|in\s+(her|his)\s+(early\s+)?twenties)\b/i.test(raw),
    say: "Clearly a young adult in their early twenties, youthful unlined face, smooth taut young skin, visibly in their early 20s." },
  // "clean shave" — not "clean-shaven" — is the common Indian-English phrasing,
  // and the original pattern required "shaven", so a gym prompt asking for a
  // clean shave silently got no rule at all and came back with a beard.
  { test: (raw) =>
      /\bclean[-\s]?shave[dn]?\b|\bno\s+beard\b|\bno\s+moustache\b|\bno\s+stubble\b|\bno\s+facial\s+hair\b|\bshaved\s+face\b|\bsmooth\s+shaven\b/i.test(raw) &&
      // Every facial-hair mention must be a negated one. If any survives the
      // WANTS_NONE strip, the prompt wants some hair and we stay out of it.
      !WANTS_HAIR.test(raw.replace(new RegExp(WANTS_NONE.source, "gi"), "")),
    say: SHAVE_STACK },
  { test: /\b(soft|loose|salon|blowout|beauty-?parlou?r)\s+(curls?|waves?)\b/i,
    say: "The hair falls in wide relaxed S-shaped waves with long gentle bends and plenty of loose movement." },
  { test: /\b(two|2)\s+braids?\b|\btwo\s+plaits\b/i,
    say: "Exactly two separate braids, clearly distinct from each other." },
  { test: /\b(one|single)\s+(thick\s+)?braid\b/i,
    say: "Exactly one single braid." },
  // "long thick braided hair" — no number at all — matched NEITHER rule above,
  // so nothing constrained the count and the model returned two braids of
  // different lengths. Unnumbered "braided hair" means one braid in normal use;
  // an explicit plural or a pigtail word still wins. Stated as a count, never as
  // a negation, and it names no body part.
  { test: (raw) =>
      /\b(braid|braided|plait|plaited)\b/i.test(raw) &&
      !/\b(braids|plaits|pigtails?|twintails?|two|2|double|twin|both|pair)\b/i.test(raw),
    say: "The hair is worn in a single braid." },
  { test: /\bsleeveless\b/i,
    say: "The blouse ends at a narrow shoulder strap with the armhole cut high and clean." },
  { test: /\bfull[- ]sleeve/i,
    say: "The sleeve fabric continues unbroken all the way to the wrist cuff." },
  // Complexion needed the same stacking treatment as SHAVE_STACK, and finding
  // that out corrected a wrong conclusion. A single restatement left every
  // requested tone below wheatish rendering lighter than asked, which was read
  // as a weights-level bias that only real photography could fix. It was not.
  // Stacking five descriptions of the same tone — control vs stack on an
  // identical seed — produced a visibly deeper, correct complexion on 3 of 3.
  //
  // One stack PER TONE, deliberately. A single "make it darker" rule would push
  // every complexion toward the dark end, which is the same failure as the
  // lightening bias, just mirrored. Each entry has to land on its own target.
  { test: /\bvery\s+deep\b|\bvery\s+dark\s+brown\b/i,
    say: "Very deep dark brown skin, richly pigmented complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably dark brown complexion." },
  { test: /\bdeep\s+(dark\s+)?complexion\b|\bdeep\s+brown\s+skin\b|\bdark\s+skin(ned)?\b/i,
    say: "Deep brown skin, richly pigmented deep complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably deep brown complexion." },
  { test: /\bmedium\s+brown\b|\bmedium\s+complexion\b/i,
    say: "Medium brown skin, clearly mid-toned complexion, even medium brown skin across the face, neither pale nor dark." },
  { test: /\bwheatish\b/i,
    say: "Wheatish complexion, warm light-brown skin, golden wheat-toned skin across the face, a mid-light Indian complexion." },
  { test: /\bpin-?straight\b|\bstraight\s+(black\s+)?hair\b/i,
    say: "The hair is perfectly straight and smooth from root to tip." },
  { test: /\bwet\b.{0,20}\bhair\b|\bhair\b.{0,20}\bwet\b|\bdamp\s+hair\b/i,
    say: "The hair is visibly wet, strands darkened and clumped together, moisture clearly present." },
  { test: /\baverage[- ]looking\b|\bordinary\b.{0,30}\bappearance\b/i,
    say: "An ordinary unremarkable everyday face with real skin texture and natural asymmetry." },
];

/**
 * Apply the Beenga prompt layer.
 *
 * @param {string} raw            the user's prompt, untouched
 * @param {object} [opts]
 * @param {boolean} [opts.contemporary=true]  supply the present-day default
 * @param {boolean} [opts.reinforce=true]     restate fragile attributes
 * @param {string}  [opts.variant=""]         extra entropy for deterministic
 *   garment choice — pass the seed so re-rolling varies the cloth while the
 *   same prompt+seed still reproduces exactly.
 * @returns {{prompt: string, applied: string[]}}
 */
export function enhance(raw, { contemporary = true, reinforce = true, variant = "",
                               budget = false } = {}) {
  const applied = [];
  let out = raw;

  for (const [re, positive] of NEGATIONS) {
    if (re.test(out)) {
      out = out.replace(re, positive);
      applied.push(`negation:${re.source.slice(0, 28)}`);
    }
  }

  // Segments carry their rule id so the budget assembler can tier them. With
  // budget off this is exactly the old array of strings in the old order.
  const tail = [];
  const add = (id, text) => tail.push({ id, text });

  if (contemporary && INDIA.test(raw) && !TRADITIONAL_INTENT.test(raw)) {
    add("contemporary-default", CONTEMPORARY);
    applied.push("contemporary-default");
    // Only if there IS someone to dress. "indian office" and "office desk in
    // delhi" were both getting "Modern everyday clothing." appended — a garment
    // instruction on a prompt with no person in it, which at best wastes words
    // the length budget is trying to reclaim and at worst argues for a figure
    // the caller never asked for.
    //
    // Same shape as the still-life bug that NO_PEOPLE was added for: a rule that
    // fires on the presence of India rather than on the presence of a person.
    if (!GARMENT.test(raw) && PERSON.test(raw)) {
      add("modern-dress-default", MODERN_DRESS);
      applied.push("modern-dress-default");
    }
  }

  // SETTING_NAMED, not VENUE. VENUE is the narrow original list, so "dancing at
  // a mela" and "dancing at a concert" were getting "An ordinary domestic living
  // room" appended over the setting the caller gave. scene-variety was fixed to
  // use the widened list and this was left behind.
  if (PERSON.test(raw) && FULL_BODY_POSE.test(raw) && !FRAMING_STATED.test(raw)) {
    add("full-frame", FULL_FRAME);
    applied.push("full-frame");
  }

  if (CARTOON.test(raw) && !STYLE_STATED.test(raw)) {
    add("cartoon-3d", CARTOON_3D);
    applied.push("cartoon-3d");
  }

  if (DANCE.test(raw) && !SETTING_NAMED.test(raw)) {
    add("dance-venue-default", DANCE_VENUE);
    applied.push("dance-venue-default");
  }

  if (SARI.test(raw)) {
    if (!FABRIC_OR_COLOUR.test(raw)) {
      add("sari-variety", `The sari is ${pickLook(raw + variant)}.`);
      applied.push("sari-variety");
    }
    if (!WANTS_MIDRIFF.test(raw)) {
      add("modest-drape", MODEST_DRAPE);
      applied.push("modest-drape");
    }
  }

  // MINOR gate: a prompt referencing a child gets no beauty descriptor at all.
  if (PERSON.test(raw) && !FOREIGN.test(raw) && !TRADITIONAL_INTENT.test(raw) &&
      !COMPLEXION_STATED.test(raw) && !LOOK_STATED.test(raw) && !MINOR.test(raw)) {
    const male = MALE.test(raw) && !FEMALE_ONLY.test(raw);
    const region = INDIAN_PLACE.test(raw) ? "" : HOUSE_REGION;
    const maleTail = male && !WANTS_HAIR.test(raw) ? HOUSE_LOOK_MALE : "";
    if (faceIsSubject(raw)) {
      add("house-look", region + HOUSE_LOOK + maleTail);
      applied.push("house-look");
      // The clean-shaven default is grooming, not decoration — it survives
      // trimming even when the rest of the house look does not.
      tail[tail.length - 1].keep = region + (RULE_BUDGET["house-look"].terse) + maleTail;
    } else {
      // Scene prompt: keep the identity and grooming decisions, drop the beauty
      // description that would crop the scene away. Emitting nothing when both
      // halves are empty, rather than an empty sentence.
      const identity = (region ? HOUSE_REGION_ALONE : "") + maleTail;
      if (identity) {
        add("house-identity", identity);
        applied.push("house-identity");
        tail[tail.length - 1].keep = identity;
      }
    }
  }

  // Same gate. Hair strand detail is invisible at scene distance and is the
  // single most expensive rule in the layer, so spending it on a market scene
  // buys nothing and costs the framing.
  if (PERSON.test(raw) && !NON_PHOTO.test(raw) && faceIsSubject(raw)) {
    add("hair-realism", HAIR_REALISM);
    applied.push("hair-realism");
  }

  if (!LIGHTING.test(raw) && !PHOTO_STYLE_STATED.test(raw)) {
    add("daylight-default", DAYLIGHT);
    applied.push("daylight-default");
  }

  for (const [re, icon] of DEITY_ICONS) {
    if (re.test(raw)) { add("deity-icon", icon); applied.push("deity-icon"); break; }
  }

  if (PERSON.test(raw) && !SETTING_NAMED.test(raw)) {
    add("scene-variety", `The setting is ${SCENES[hash(raw + variant) % SCENES.length]}.`);
    applied.push("scene-variety");
  }

  if (!DOF.test(raw) && !PLAIN_BACKGROUND.test(raw) && !PHOTO_STYLE_STATED.test(raw)) {
    add("deep-focus", DEEP_FOCUS);
    applied.push("deep-focus");
  }

  if (reinforce) {
    // A rule's `test` is either a RegExp or a predicate over the raw prompt.
    const hit = (f) => (typeof f.test === "function" ? f.test(raw) : f.test.test(raw));
    const recap = FRAGILE.filter(hit).map((f) => f.say);
    if (recap.length) {
      for (const say of recap) add("reinforce", say);
      applied.push(`reinforce:${recap.length}`);
    }
  }

  if (tail.length) {
    // `budget === false` means off. 0 is a VALID budget meaning "Tier 1 only":
    // tier 1 is added unconditionally, then nothing else can fit. That is the
    // edit path, where the scene defaults must go regardless of how cheap they
    // are — a 5-word "Bright natural daylight" appended to "make it night"
    // contradicts the instruction just as hard as a 26-word one would.
    const segs = budget === false ? tail.map((t) => t.text)
                                  : spendBudget(tail, budget === true ? BUDGET_WORDS : budget);
    if (segs.length) out = `${out.trim().replace(/\.?$/, ".")} ${segs.join(" ")}`;
    // `applied` must describe the prompt that was actually built, not the rules
    // that were considered. It is the only visible record of what the layer did
    // — it is printed in the prediction logs and is what deploys are verified
    // against — so a rule the budget dropped must not appear in it.
    if (budget !== false) {
      const kept = new Set(segs);
      const survived = new Set(tail.filter((t) => kept.has(t.text) ||
        (t.keep && kept.has(t.keep)) ||
        (RULE_BUDGET[t.id]?.terse && kept.has(RULE_BUDGET[t.id].terse))).map((t) => t.id));
      for (let i = applied.length - 1; i >= 0; i--) {
        const id = applied[i].split(":")[0];
        if (RULE_BUDGET[id] && !survived.has(id)) applied.splice(i, 1);
      }
    }
  }
  return { prompt: out, applied };
}

/**
 * Spend a word budget across tail segments.
 *
 * Tier 1 — what the user actually asked for — is always kept at full strength
 * and takes the first claim. Tiers 2 and 3 then compete for what remains: full
 * form if it fits, terse form if that fits, dropped if neither does.
 *
 * Segments are emitted in their ORIGINAL order, not tier order. Reordering
 * would change the prompt's structure as well as its length, and this change is
 * hard enough to evaluate with one variable moving.
 */
function spendBudget(segs, limit) {
  const w = (s) => s.trim().split(/\s+/).length;
  const meta = (id) => RULE_BUDGET[id] ?? { tier: 2, terse: null };
  const chosen = new Map();
  let spent = 0;

  // Tier 1 first, unconditionally and at full strength.
  for (const s of segs) {
    if (meta(s.id).tier === 1) { chosen.set(s, s.text); spent += w(s.text); }
  }
  // Then anything flagged `always`, in terse form, also unconditionally.
  for (const s of segs) {
    const m = meta(s.id);
    if (m.always && !chosen.has(s)) {
      const t = m.terse ?? s.text;
      chosen.set(s, t); spent += w(t);
    }
  }
  // Then tiers 2 and 3 in that order, full form preferred, terse as fallback.
  for (const tier of [2, 3]) {
    for (const s of segs) {
      if (meta(s.id).tier !== tier || chosen.has(s)) continue;
      const terse = s.keep ?? meta(s.id).terse ?? s.text;
      if (spent + w(s.text) <= limit) { chosen.set(s, s.text); spent += w(s.text); }
      else if (spent + w(terse) <= limit) { chosen.set(s, terse); spent += w(terse); }
    }
  }
  return segs.filter((s) => chosen.has(s)).map((s) => chosen.get(s));
}

// ── Length budget: rule metadata ─────────────────────────────────────────────
//
// STEP 1 OF THE LENGTH BUDGET. This block is metadata only — nothing above
// reads it yet, and enhance() is byte-for-byte unchanged. It exists so the cost
// of each rule is visible in the source rather than only measurable after the
// fact, and so the assembler that replaces the unconditional appends in
// enhance() has something to spend against.
//
// Why this is needed, measured across both suites, 41 cases:
//
//   median user words     20
//   median words added    81
//   median words sent    101
//
// At the extreme "beautiful delhi girl in sari" — five words — reaches the
// model as 142, of which the user wrote 4%. The layer built to stop attribute
// dilution had become the largest single source of it.
//
// It is not theoretical. Identical complexion and hair attributes appended to a
// ~35-word prompt produce visibly different people; appended to the layer's
// ~120-word output they produce one face repeatedly. Same attributes, same
// seed. They were never weak — they were outnumbered.
//
// TIERS
//   1  what the user explicitly asked for. Full strength, first claim on the
//      budget, never trimmed. The complexion sweep and the grooming result both
//      come from stacking, and these are the only rules whose entire job is
//      adherence to a stated request.
//   2  conditional on something the user said. Terse unless budget remains.
//   3  house defaults. Always terse. They fire on every prompt, so every word
//      they spend is taxed on every generation — a default needing 26 words is
//      not a default, it is an opinion competing with the user.
//
// `terse` of null means the rule is already at or below its target and needs no
// short form. Word counts are computed, not hand-written, so they cannot drift.
const words = (s) => (s ? s.trim().split(/\s+/).length : 0);

export const RULE_BUDGET = {
  // ── Tier 3: house defaults, always terse ────────────────────────────────
  "hair-realism": {
    tier: 3, full: HAIR_REALISM,
    terse: "Fine hair strands, soft natural hairline.",
    // The single most expensive rule in the layer, and it is an anti-AI-tell
    // quality rule rather than an adherence one. It should never outweigh the
    // request it is decorating.
  },
  "contemporary-default": {
    // `always`: survives any budget, in terse form. Measured across six prompt
    // types, this is the ONE default that earns its keep — without it "indian
    // woman cooking" comes back in a sari and "couple on bed" in wedding dress,
    // because the model's own prior for India is ceremonial. Every other default
    // stripped scenes, cropped bodies or lightened complexions.
    tier: 3, always: true, full: CONTEMPORARY,
    terse: "Present-day India, modern surroundings, current-day clothing and styling.",
  },
  "house-look": {
    tier: 3, full: HOUSE_LOOK,
    terse: "Sharp features, attractive.",
    // HOUSE_REGION prefixes this and stays as-is; it is three words.
  },
  "deep-focus": { tier: 3, full: DEEP_FOCUS, terse: "Background in focus." },
  "daylight-default": { tier: 3, full: DAYLIGHT, terse: null },
  // `always` too, and it is only three words. Dropping it sent "indian woman
  // cooking" back into a sari — the ceremonial prior this project exists to
  // counter. Clothing is the single attribute the base model gets most wrong
  // about contemporary India, so it is worth the three words.
  // NOT `always`. Measured against the soft wording alone: identical clothing
  // outcomes on "woman cooking" and "couple on bed", so the hard command earned
  // nothing — while forcing "Modern everyday clothing" onto an indian bride, a
  // priest, a farmer and a woman at a mela, none of which name a garment. An
  // uninvited instruction that has to guess is the shape of every bug this week.
  "modern-dress-default": { tier: 3, full: MODERN_DRESS, terse: null },

  // ── Tier 2: conditional on what the user said ───────────────────────────
  "modest-drape": {
    tier: 2, full: MODEST_DRAPE,
    terse: "The pallu covers the shoulder and midriff.",
  },
  "sari-variety":  { tier: 2, full: null, terse: null, dynamic: "pickLook" },
  "scene-variety": { tier: 2, full: null, terse: null, dynamic: "SCENES" },
  "deity-icon":    { tier: 2, full: null, terse: null, dynamic: "DEITY_ICONS" },
  "dance-venue-default": { tier: 2, full: DANCE_VENUE, terse: null },
  "full-frame": {
    tier: 2, full: FULL_FRAME, terse: "Framed wide, whole subject in frame.",
  },
  "cartoon-3d": {
    tier: 2, full: CARTOON_3D,
    terse: "Modern 3D animated style, volumetric forms, soft lighting.",
  },

  // ── Tier 1: what the user explicitly asked for ──────────────────────────
  // Never trimmed. Sourced from FRAGILE, whose entries carry their own `say`.
  reinforce: { tier: 1, full: null, terse: null, dynamic: "FRAGILE" },
};

/** Current and target added-word cost per rule, for the budget assembler. */
export function ruleCosts() {
  return Object.entries(RULE_BUDGET).map(([id, r]) => ({
    id, tier: r.tier,
    full: words(r.full),
    terse: r.terse === null ? words(r.full) : words(r.terse),
    dynamic: Boolean(r.dynamic),
  }));
}

/** Target ceiling on words the layer may add. See docs — measured, not guessed. */
export const BUDGET_WORDS = 45;
