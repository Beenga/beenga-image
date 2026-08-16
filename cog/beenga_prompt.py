"""Beenga prompt layer — Python port of lib/prompt.mjs.

Kept in step with the JS original by hand. Every rule here exists because a
specific benchmark case failed; see the JS file for the full reasoning and the
measurements behind each one. The short version:

  1. FLUX cannot negate. "no moustache" contributes the token *moustache* and
     nothing else, so every negation is rewritten as a positive description.
  2. A generic Indian prompt draws a strongly ceremonial prior, so the present
     day is stated explicitly unless the prompt asks for something traditional.
  3. Single mentions of fragile attributes get diluted in long prompts. Stacking
     several positive restatements is what makes them hold — this is the single
     most load-bearing finding in the project, and it is what fixed both
     clean-shaven and complexion.

Two rules the strings themselves must follow, both learned by breaking them:

  * No negations, and never name the unwanted thing. A reinforcement reading
    "definitely not tight ringlets" contributes "ringlets" as a positive token
    and argues for the failure it meant to prevent.
  * Do not repeat body-part nouns. "bare shoulders and bare upper arms" on a
    prompt already saying "one hand raised" rendered a third hand. Describe the
    garment, not the body it exposes.
"""

import re

# --- 1. negations -----------------------------------------------------------
# Longest first, and no right-hand side may contain a phrase a later rule
# matches, or the replacements cascade into nonsense.
NEGATIONS = [
    (r"\bno\s+facial\s+hair\b", "a completely smooth clean-shaven face"),
    (r"\bwithout\s+a\s+moustache\b", "with a bare smooth upper lip"),
    (r"\bno\s+moustache\b", "a bare smooth upper lip"),
    (r"\bno\s+beard\b", "a smooth bare jawline and chin"),
    (r"\bno\s+stubble\b", "freshly shaved smooth skin"),
    (r"\bno\s+makeup\s+at\s+all\b", "a completely bare unmade-up face"),
    (r"\bno\s+makeup\b", "a bare unmade-up face"),
    (r"\bno\s+kajal\b", "completely undecorated bare eyes"),
    (r"\bno\s+eyeliner\b", "bare clean eyelids"),
    (r"\bno\s+heavy\s+embroidery\b", "plain unadorned fabric"),
    (r"\bno\s+glamou?r\b", "a plain everyday unglamorous appearance"),
    (r"\bno\s+styling\s+products\b", "hair left in its natural untreated state"),
    (r"\bnot\s+cropped\b", "the whole subject inside the frame"),
]

# --- 2. contemporary default ------------------------------------------------
INDIA = re.compile(
    r"\b(indian?|delhi|mumbai|bombay|bengaluru|bangalore|chennai|kolkata|"
    r"hyderabad|pune|jaipur|ahmedabad|kochi|lucknow)\b", re.I)

TRADITIONAL_INTENT = re.compile(
    r"\b(traditional|classical|bharatanatyam|kathak|kuchipudi|odissi|bhangra|"
    r"garba|temple|ritual|ceremon|wedding|bridal|festival|puja|pooja|diwali|"
    r"navratri|historical|period|ancient|mytholog|village|rural|folk|hanuman|krishna|krishn|radha|\brama\b|\bram\b|shiva|shiv\b|vishnu|ganesh|ganpati|lakshmi|laxmi|durga|kali\b|saraswati|brahma|parvati|murugan|ayyappa|venkatesw|balaji|jagannath|nataraj|buddha|mahavir|nanak|sai baba|deity|goddess|\bgod\b|\blord\b|avatar|ramayana|mahabharata|bhagavad|bhakti|devotional|aarti|mandir|idol|murti|shrine|pilgrim|sadhu|saint|yogi|ascetic|epic\b|scripture|vedic|sanskrit)\w*\b", re.I)

CONTEMPORARY = ("Present-day contemporary India, modern well-maintained surroundings, "
                "clean and tidy environment, current-day styling.")

GARMENT = re.compile(
    r"\b(sari|saree|lehenga|salwar|kurti|kurta|dupatta|sherwani|dhoti|blouse|"
    r"dress|shirt|t-?shirt|jeans|suit|top|gown|uniform)\b", re.I)
MODERN_DRESS = "Modern everyday clothing."

# --- 2b. venue for dance prompts -------------------------------------------
# Fixing the classical-dance prior exposed a second failure: "dancing to music"
# started rendering drum kits and mic stands, because the word *music* was the
# only thing furnishing the scene. Stated positively — naming the unwanted props
# would summon them.
DANCE = re.compile(r"\bdanc(e|es|ing|er)\b", re.I)
VENUE = re.compile(
    r"\b(rooftop|terrace|balcony|room|home|house|apartment|flat|hall|stage|"
    r"studio|club|bar|party|cafe|café|restaurant|kitchen|garden|park|beach|"
    r"street|road|campus|college|school|office|mall|metro|station|temple|"
    r"wedding|venue|floor|courtyard|lawn|field|outdoors|indoors)\w*\b", re.I)
DANCE_VENUE = "An ordinary domestic living room."


# --- 2c. hair realism -------------------------------------------------------
# Klein renders hair as a solid moulded mass with a hard, high hairline — one of
# the strongest tells that an image is generated. Naming the fine detail pushes
# back: measured on one seed, this restored flyaway strands, a soft hairline with
# baby hairs, and real scalp detail. Skipped for non-photographic styles.
NON_PHOTO = re.compile(r"\b(cartoon|anime|illustration|illustrated|painting|painted|"
                       r"sketch|drawing|3d\s+render|cgi|pixar|vector|comic)\b", re.I)
PERSON = re.compile(r"\b(woman|women|man|men|girl|boy|lady|ladies|person|people|"
                    r"couple|friends?|family|group|crowd|child|children|kid|student|"
                    r"model|portrait|face|hair|male|female|guy|gentleman|bride|groom)\b", re.I)
HAIR_REALISM = ("Fine individual hair strands visible, wispy flyaway hairs catching the "
                "light, soft natural hairline with baby hairs at the temples, realistic "
                "scalp and hair root detail.")

# --- 2d. garment variety ----------------------------------------------------
# Every unqualified "sari" came back as the same teal-blue silk with a gold zari
# border, so a batch of generations looks like one photoshoot. When no fabric or
# colour is named, pick one deterministically from the prompt text — the same
# prompt and seed must still reproduce, so this cannot use a random source.

# Klein's default exposure for an unlit prompt is flat and grey. Naming daylight
# lifts it. Only when the prompt says nothing about light.
LIGHTING = re.compile(r"\b(light|lighting|lit|sunset|sunrise|golden\s+hour|night|dusk|"
                      r"dawn|shade|shadow|backlit|neon|candle|lamp|studio|overcast|"
                      r"cloudy|moody|dark|silhouette)\w*\b", re.I)
DAYLIGHT = "Bright natural daylight, clear colour."


# Beenga is India-first: a prompt naming a person but not who they are should
# produce an Indian subject. Only while nothing contradicts it.
FOREIGN = re.compile(
    r"\b(paris|london|new\s+york|tokyo|beijing|shanghai|dubai|sydney|moscow|berlin|"
    r"rome|madrid|bangkok|singapore|seoul|cairo|lagos|nairobi|toronto|chicago|"
    r"los\s+angeles|san\s+francisco|europe|european|america|american|african|chinese|"
    r"japanese|korean|thai|arab|arabic|latina?|hispanic|russian|british|french|german|"
    r"italian|spanish|mexican|brazilian|nigerian|kenyan|caucasian|white|"
    r"black\s+(man|woman|person)|scandinavian|nordic)\b", re.I)
STATED_INDIAN = re.compile(r"\bindian\b|\bsouth\s+asian\b|\bdesi\b", re.I)

SARI = re.compile(r"\b(sari|saree)\b", re.I)
FABRIC_OR_COLOUR = re.compile(
    r"\b(silk|cotton|chiffon|georgette|linen|handloom|khadi|organza|banarasi|"
    r"kanjivaram|red|blue|green|yellow|pink|purple|orange|black|white|cream|"
    r"maroon|teal|mustard|ivory|beige|grey|gray|navy|coral|lavender|turquoise|"
    r"magenta)\b", re.I)

# Midriff coverage. A sari exposes the midsection by default in Klein's prior,
# and the spec treats visible midriff as opt-in. Stated as drape, not absence.
WANTS_MIDRIFF = re.compile(r"\b(midriff|bare\s+waist|exposed\s+waist|navel|crop|"
                           r"bare\s+midsection|low\s+drape)\b", re.I)
MODEST_DRAPE = ("The pallu passes over the shoulder and falls straight down the back, "
                "with the sari covering the midsection.")

SARI_LOOKS = [
    "a soft cotton handloom sari in a warm mustard tone with a thin contrasting border",
    "a light chiffon sari in dusty rose with a narrow silver edge",
    "a crisp cotton sari in off-white with a fine indigo stripe",
    "a georgette sari in deep green with a plain matte finish",
    "a linen sari in terracotta with an unadorned selvedge",
    "a printed cotton sari in faded coral with small block-print motifs",
    "a handwoven khadi sari in slate grey with a plain border",
    "a soft silk sari in aubergine with a restrained narrow border",
]


def _pick_look(s):
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return SARI_LOOKS[h % len(SARI_LOOKS)]


# --- house look -------------------------------------------------------------
# Beenga's commercial default: North Indian, fair, sharp-featured, and for men
# clean-shaven. One rule rather than four — each addition dilutes the rest.
# Departs from the original spec's anti-default stance by choice, and yields the
# moment the user states a complexion, ethnicity, beauty level or facial hair.
COMPLEXION_STATED = re.compile(r"\b(fair|wheatish|dusky|deep|dark|medium|light|olive|"
                               r"complexion|skin\s+tone|melanated)\b", re.I)
LOOK_STATED = re.compile(r"\b(ordinary|average|plain|everyday|unremarkable|documentary|"
                         r"realistic\s+skin|natural\s+variation|glamorous|model-?like)\b", re.I)
MALE = re.compile(r"\b(man|men|male|guy|boy|gentleman|groom|father|dad|brother|son)\b", re.I)
FEMALE_ONLY = re.compile(r"\b(woman|women|female|girl|lady|ladies|bride|mother|sister|"
                         r"daughter)\b", re.I)
# A named Indian place or region overrides the North India default.
# Only NON-northern places override the default; naming Delhi should reinforce a
# North Indian look, not suppress it.
INDIAN_PLACE = re.compile(r"\b(chennai|madras|bengaluru|bangalore|hyderabad|kochi|cochin|trivandrum|kerala|tamil|telugu|kannada|malayalam|mysore|coimbatore|madurai|vizag|visakhapatnam|kolkata|calcutta|bengali|bangla|assam|odisha|orissa|bhubaneswar|goa|konkan|marathi|mumbai|bombay|pune|nagpur|gujarat|gujarati|ahmedabad|surat|manipur|naga|mizo|khasi|sikkim|north\s*east|northeast|south\s+india|south\s+indian|east\s+india|west\s+india|andhra|karnataka|maharashtra)\b", re.I)
HOUSE_REGION = "North Indian appearance, "
# Complexion is deliberately NOT defaulted. Defaulting fair would repeat the bias
# this project measured and fixed in other models, in a market where it is a live
# controversy, and would remove the differentiator. Requested tones are handled by
# the per-tone stacks; unrequested complexion is left alone.
HOUSE_LOOK = ("sharp well-defined features, conventionally attractive, "
              "healthy glowing well-lit skin.")
HOUSE_LOOK_MALE = " Clean-shaven with a smooth bare upper lip and jawline."

# --- 3. fragile attributes --------------------------------------------------
SHAVE_STACK = ("completely clean-shaven face, perfectly smooth freshly shaved cheeks, "
               "smooth bare upper lip, smooth chin and jawline, zero facial hair")

WANTS_HAIR = re.compile(r"\bstubble\b|\bbeard\b|\bmoustache\b|\bmustache\b|\bgoatee\b", re.I)
WANTS_NONE = re.compile(
    r"\bno\s+(full\s+)?(beard|moustache|mustache|stubble|facial\s+hair)\b|"
    r"\bclean[-\s]?shave[dn]?\b|\bzero\s+facial\s+hair\b|\bshaved\s+face\b", re.I)
CLEAN_TRIGGER = re.compile(
    r"\bclean[-\s]?shave[dn]?\b|\bno\s+beard\b|\bno\s+moustache\b|"
    r"\bno\s+stubble\b|\bno\s+facial\s+hair\b|\bshaved\s+face\b|"
    r"\bsmooth\s+shaven\b", re.I)


def _wants_clean_shaven(raw):
    """True only if the prompt asks for no facial hair AND none is wanted.

    Guard exists because "light stubble only, no full beard, no moustache
    styling" matched the trigger on `no moustache` and got the whole
    zero-facial-hair stack bolted on, overriding the stubble that was asked for.
    """
    if not CLEAN_TRIGGER.search(raw):
        return False
    return not WANTS_HAIR.search(WANTS_NONE.sub("", raw))


# One stack PER complexion, deliberately. A blanket darkening rule would push
# every tone dark, which is the lightening bias mirrored — wheatish and medium
# must still land mid-range.
FRAGILE = [
    (_wants_clean_shaven, SHAVE_STACK),
    # "beautiful modern delhi lady in 20s" returned a European face. A city name
    # places the scene but says nothing about the person, and Klein does not
    # infer it. Only when a person is present, India is implied by place rather
    # than stated, and no other ethnicity is named.
    (lambda raw: bool(PERSON.search(raw)) and not STATED_INDIAN.search(raw)
                 and not FOREIGN.search(raw),
     "The person is Indian, with South Asian features and colouring."),
    # "beautiful delhi girl in sari" rendered a woman around thirty, on the raw
    # model as well as through this layer — Klein maps youth words to roughly 30
    # whatever you type. Same fix as clean-shaven and complexion: stack it.
    (re.compile(r"\b(girl|young(\s+\w+){0,2}\s+(woman|man|lady|guy|boy|girl)|teenager|college\s+student|in\s+(her|his)\s+(early\s+)?twenties)\b", re.I),
     "Clearly a young adult in their early twenties, youthful unlined face, smooth taut young skin, visibly in their early 20s."),
    (re.compile(r"\b(soft|loose|salon|blowout|beauty-?parlou?r)\s+(curls?|waves?)\b", re.I),
     "The hair falls in wide relaxed S-shaped waves with long gentle bends and plenty of loose movement."),
    (re.compile(r"\b(two|2)\s+braids?\b|\btwo\s+plaits\b", re.I),
     "Exactly two separate braids, clearly distinct from each other."),
    (re.compile(r"\b(one|single)\s+(thick\s+)?braid\b", re.I),
     "Exactly one single braid."),
    (re.compile(r"\bsleeveless\b", re.I),
     "The blouse ends at a narrow shoulder strap with the armhole cut high and clean."),
    (re.compile(r"\bfull[- ]sleeve", re.I),
     "The sleeve fabric continues unbroken all the way to the wrist cuff."),
    (re.compile(r"\bvery\s+deep\b|\bvery\s+dark\s+brown\b", re.I),
     "Very deep dark brown skin, richly pigmented complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably dark brown complexion."),
    (re.compile(r"\bdeep\s+(dark\s+)?complexion\b|\bdeep\s+brown\s+skin\b|\bdark\s+skin(ned)?\b", re.I),
     "Deep brown skin, richly pigmented deep complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably deep brown complexion."),
    (re.compile(r"\bmedium\s+brown\b|\bmedium\s+complexion\b", re.I),
     "Medium brown skin, clearly mid-toned complexion, even medium brown skin across the face, neither pale nor dark."),
    (re.compile(r"\bwheatish\b", re.I),
     "Wheatish complexion, warm light-brown skin, golden wheat-toned skin across the face, a mid-light Indian complexion."),
    (re.compile(r"\bpin-?straight\b|\bstraight\s+(black\s+)?hair\b", re.I),
     "The hair is perfectly straight and smooth from root to tip."),
    (re.compile(r"\bwet\b.{0,20}\bhair\b|\bhair\b.{0,20}\bwet\b|\bdamp\s+hair\b", re.I),
     "The hair is visibly wet, strands darkened and clumped together, moisture clearly present."),
    (re.compile(r"\baverage[- ]looking\b|\bordinary\b.{0,30}\bappearance\b", re.I),
     "An ordinary unremarkable everyday face with real skin texture and natural asymmetry."),
]


def enhance(raw, contemporary=True, reinforce=True, variant=""):
    """Apply the Beenga prompt layer. Returns (prompt, applied_rule_names)."""
    applied = []
    out = raw

    for pattern, positive in NEGATIONS:
        if re.search(pattern, out, re.I):
            out = re.sub(pattern, positive, out, flags=re.I)
            applied.append("negation")

    tail = []

    if contemporary and INDIA.search(raw) and not TRADITIONAL_INTENT.search(raw):
        tail.append(CONTEMPORARY)
        applied.append("contemporary-default")
        if not GARMENT.search(raw):
            tail.append(MODERN_DRESS)
            applied.append("modern-dress-default")

    if DANCE.search(raw) and not VENUE.search(raw):
        tail.append(DANCE_VENUE)
        applied.append("dance-venue-default")

    if SARI.search(raw):
        if not FABRIC_OR_COLOUR.search(raw):
            tail.append(f"The sari is {_pick_look(raw + variant)}.")
            applied.append("sari-variety")
        if not WANTS_MIDRIFF.search(raw):
            tail.append(MODEST_DRAPE)
            applied.append("modest-drape")

    if (PERSON.search(raw) and not FOREIGN.search(raw)
            and not TRADITIONAL_INTENT.search(raw)
            and not COMPLEXION_STATED.search(raw) and not LOOK_STATED.search(raw)):
        male = bool(MALE.search(raw)) and not FEMALE_ONLY.search(raw)
        region = "" if INDIAN_PLACE.search(raw) else HOUSE_REGION
        tail.append(region + HOUSE_LOOK
                    + (HOUSE_LOOK_MALE if male and not WANTS_HAIR.search(raw) else ""))
        applied.append("house-look")

    if PERSON.search(raw) and not NON_PHOTO.search(raw):
        tail.append(HAIR_REALISM)
        applied.append("hair-realism")

    if not LIGHTING.search(raw):
        tail.append(DAYLIGHT)
        applied.append("daylight-default")

    if reinforce:
        recap = []
        for test, say in FRAGILE:
            hit = test(raw) if callable(test) else bool(test.search(raw))
            if hit:
                recap.append(say)
        if recap:
            tail.extend(recap)
            applied.append(f"reinforce:{len(recap)}")

    if tail:
        out = out.strip()
        if not out.endswith("."):
            out += "."
        out = out + " " + " ".join(tail)

    return out, applied
