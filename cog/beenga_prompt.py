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
# Cities AND states. The first version listed only cities, so "kerala man in
# 20s" or "punjab man in 20s" did not register as India at all and silently got
# no contemporary default — the headline feature, skipped, for any prompt that
# named a state instead of a city. INDIAN_PLACE below already listed those
# states, so the layer knew Kerala was Indian when suppressing the North Indian
# look but not when applying contemporary defaults. Two lists that must agree
# and did not; scripts/check-place-lists.mjs now asserts INDIAN_PLACE subset of
# INDIA.
#
# Same failure shape as `clean shave` vs `clean-shaven`: the benchmark cases
# were written with city names, so the state-name path was never exercised.
INDIA = re.compile(
    r"\b(indian?|desi|delhi|new\s+delhi|noida|gurgaon|gurugram|punjab|punjabi|"
    r"haryana|rajasthan|jaipur|udaipur|jodhpur|lucknow|kanpur|varanasi|banaras|"
    r"agra|uttar\s+pradesh|bihar|patna|jharkhand|chandigarh|amritsar|ludhiana|"
    r"dehradun|uttarakhand|himachal|shimla|kashmir|srinagar|jammu|"
    r"madhya\s+pradesh|indore|bhopal|chhattisgarh|raipur|mumbai|bombay|"
    r"bengaluru|bangalore|chennai|madras|kolkata|calcutta|hyderabad|pune|"
    r"ahmedabad|surat|kochi|cochin|trivandrum|kerala|tamil|telugu|kannada|"
    r"malayalam|mysore|coimbatore|madurai|vizag|visakhapatnam|bengali|bangla|"
    r"assam|odisha|orissa|bhubaneswar|goa|konkan|marathi|nagpur|gujarat|"
    r"gujarati|manipur|naga|mizo|khasi|sikkim|north\s*east|northeast|"
    r"south\s+india|south\s+indian|east\s+india|west\s+india|andhra|karnataka|"
    r"maharashtra)\b", re.I)

TRADITIONAL_INTENT = re.compile(
    r"\b(traditional|classical|bride|groom|priest|pandit|purohit|sadhu|sant|monk|nun|lehenga|sherwani|ghagra|ghaghra|achkan|jodhpuri|mundu|veshti|dhoti|angavastram|pattu|langa|bharatanatyam|kathak|kuchipudi|odissi|bhangra|"
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




# --- framing -----------------------------------------------------------------
# Klein frames almost everything as a head-and-shoulders portrait. Asked for a
# couple lying on a bed it returned their upper halves and cropped the rest.
# When the pose only makes sense with the whole figure visible, say so —
# positively, never "not cropped", since naming the crop argues for it.
FULL_BODY_POSE = re.compile(
    r"\b(lying|lie|lies|laying|reclining|reclined|sprawled|stretched\s+out|"
    r"sitting|seated|squatting|kneeling|crouching|crossed[-\s]?legs|"
    r"standing|walking|running|jogging|jumping|leaping|dancing|stretching|"
    r"yoga|asana|exercising|working\s+out|cycling|riding|climbing|"
    r"full[-\s]?body|full[-\s]?length|head[-\s]?to[-\s]?toe|whole\s+body)\b", re.I)
FRAMING_STATED = re.compile(
    r"\b(close[-\s]?up|closeup|headshot|head\s+shot|portrait|bust|face\s+only|"
    r"waist[-\s]?up|half[-\s]?body|shoulders\s+up|crop|cropped|macro|"
    r"full[-\s]?body|full[-\s]?length|head[-\s]?to[-\s]?toe|wide\s+shot)\b", re.I)
# No body-part nouns. The first version read "from head to feet", naming two of
# them on exactly the prompts where anatomy fails hardest. Describe the FRAMING,
# never the body inside it — see the header note about the third hand.
FULL_FRAME = "Framed wide, with the entire subject inside the frame."

# --- is the face actually the subject? ---------------------------------------
# house-look and hair-realism are ~30 words describing a face and hair, and that
# description mass MOVES THE CAMERA: measured on "an indian girl with two
# pigtails at a delhi market", adding them cropped a full market scene to a
# headshot, and adding FULL_FRAME on top did not pull it back — 9 words of
# framing cannot out-vote 30 words of face.
#
# That is the crop bug. It was previously "fixed" by dropping both rules from
# every prompt, which also dropped the hair and skin detail they buy on the
# prompts where that detail is the only thing in frame.
FRAMING_CLOSE = re.compile(
    r"\b(close[-\s]?up|closeup|headshot|head\s+shot|portrait|bust|face\s+only|"
    r"shoulders\s+up|waist[-\s]?up|half[-\s]?body|macro)\b", re.I)
FRAMING_WIDE = re.compile(
    r"\b(full[-\s]?body|full[-\s]?length|head[-\s]?to[-\s]?toe|whole\s+body|"
    r"wide\s+shot)\b", re.I)

# Region and grooming are identity decisions, not decoration, and are short
# enough not to drag the camera. They survive on scene prompts; the long beauty
# description does not.
HOUSE_REGION_ALONE = "North Indian appearance."


def face_is_subject(raw):
    """Explicit close framing wins, then explicit wide, then a body-in-frame
    pose, then the fallback: a prompt with no setting is effectively a portrait.
    """
    if FRAMING_CLOSE.search(raw):
        return True
    if FRAMING_WIDE.search(raw):
        return False
    if FULL_BODY_POSE.search(raw):
        return False
    return not SETTING_NAMED.search(raw)

# --- cartoon style default ---------------------------------------------------
# "cartoon" left to itself lands on flat 2D illustration, which is not what
# people mean by it now — the modern default reading is a 3D animated feature.
# State 3D unless the caller has chosen a style themselves.
#
# Stated positively and without naming what we do not want: writing "not flat 2D"
# would contribute "flat" and "2D" as tokens and argue for the failure.
CARTOON = re.compile(r"\b(cartoon|cartoons|cartoonish|toon|animated|animation)\b", re.I)

# Any of these means the caller chose their own style, including a 3D one they
# already described — restating it would only spend budget.
STYLE_STATED = re.compile(
    r"\b(2d|two[-\s]?dimensional|flat|hand[-\s]?drawn|line[-\s]?art|lineart|"
    r"sketch|sketched|doodle|anime|manga|comic|cel[-\s]?shaded|cel|vector|"
    r"watercolou?r|gouache|ink|woodcut|linocut|storybook|picture[-\s]?book|"
    r"paper[-\s]?cut|collage|pixel[-\s]?art|8[-\s]?bit|sticker|clip[-\s]?art|"
    r"3d|three[-\s]?dimensional|cgi|render|rendered|pixar|claymation|"
    r"stop[-\s]?motion|low[-\s]?poly|voxel)\b", re.I)

CARTOON_3D = ("Modern 3D animated film style, rounded volumetric forms, soft global "
              "illumination, subtle subsurface scattering in the skin.")

# --- 2c. hair realism -------------------------------------------------------
# Klein renders hair as a solid moulded mass with a hard, high hairline — one of
# the strongest tells that an image is generated. Naming the fine detail pushes
# back: measured on one seed, this restored flyaway strands, a soft hairline with
# baby hairs, and real scalp detail. Skipped for non-photographic styles.
NON_PHOTO = re.compile(r"\b(cartoon|anime|illustration|illustrated|painting|painted|"
                       r"sketch|drawing|3d\s+render|cgi|pixar|vector|comic)\b", re.I)
# Occupations, kinship and age words as well as the bare nouns. "an indian
# farmer", "an indian shopkeeper", "an indian teenager", "an indian uncle" and
# "an elderly indian" were ALL invisible to the layer — no house look, no hair
# realism, no scene variety, no clothing default. HANDOFF names "farmer" as a
# worked example of overriding the attractive default, and it never worked.
PERSON_WORD = re.compile(
    r"\b(woman|women|man|men|girl|boy|lady|ladies|person|people|couple|friends?|"
    r"family|group|crowd|child|children|kid|student|model|portrait|face|hair|male|"
    r"female|guy|gentleman|bride|groom|"
    r"teen|teens|teenager|teenagers|adult|adults|elder|elderly|senior|seniors|"
    r"youth|toddler|infant|grandmother|grandfather|granny|"
    r"mother|father|sister|brother|daughter|son|aunt|aunty|auntie|uncle|cousin|"
    r"wife|husband|bhai|didi|bhabhi|beta|beti|amma|appa|maa|papa|dada|dadi|nani|nana|"
    r"farmer|shopkeeper|vendor|hawker|driver|teacher|doctor|nurse|engineer|"
    r"entrepreneur|founder|professional|worker|labourer|tailor|barber|"
    r"chef|cook|waiter|officer|policeman|soldier|priest|artist|musician|"
    r"dancer|singer|athlete|actor|actress|influencer|blogger|"
    r"customer|passenger|commuter|shopper|pedestrian|villager)\b", re.I)
# Deliberately NOT included: figure, subject, character, human, someone,
# somebody, individual, player, guard, baby — each is more often a thing than
# a person ("a chess figure", "a player piano", "a guard rail", "baby corn").

# A prompt can say there is nobody in the picture, and until 2026-08-16 this layer
# could not hear it: PERSON matched the word "people" INSIDE "no people in frame",
# so an empty-room still life came back with a house look, hair realism, a randomly
# chosen setting and the line "The person is Indian, with South Asian features and
# colouring" — an instruction to draw a person into a scene that asked for none.
#
# Found by using the product (demo/romantichive renders still lifes almost
# exclusively) and invisible to both benchmark suites, where all 41 cases have a
# person in them.
#
# "empty" is qualified rather than matched bare — "a woman holding an empty cup"
# has a person in it. "still life" is included because it is the genre name.
NO_PEOPLE = re.compile(
    r"\b(no|without)\s+(people|persons?|humans?|figures?|models?|subjects?)\b"
    r"|\bnobody\b|\bno\s+one\b|\bunoccupied\b|\bdeserted\b|\bstill\s+life\b"
    r"|\bempty\s+(room|street|scene|chair|table|bed|house|office|platform)\b", re.I)


class _Person:
    """Every person rule goes through this, never PERSON_WORD directly."""

    @staticmethod
    def search(raw):
        return PERSON_WORD.search(raw) and not NO_PEOPLE.search(raw)


PERSON = _Person()
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
#
# Times of day that CONTRADICT bright daylight are listed so the default does not
# fire against them: "a living room sofa in the evening" was coming back with
# "Bright natural daylight, clear colour." appended.
#
# "morning", "afternoon", "noon" are deliberately NOT here. They imply light without
# contradicting it, and Klein's unlit exposure is flat and grey — a morning prompt
# still wants the daylight line. Only words that fight it belong in this list.
LIGHTING = re.compile(r"\b(light|lighting|lit|sunset|sunrise|golden\s+hour|night|dusk|"
                      r"dawn|evening|twilight|midnight|moonlit|moonlight|firelight|"
                      r"lantern|candlelit|shade|shadow|backlit|neon|candle|lamp|studio|"
                      r"overcast|cloudy|moody|dim|gloom|dark|silhouette)\w*\b", re.I)
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
    return SARI_LOOKS[_hash(s) % len(SARI_LOOKS)]



# --- deity iconography ------------------------------------------------------
# "Lord Hanuman lifting a mountain" produced a crowned human figure on both Klein
# and Z-Image — neither renders the vanara face that defines him. Deities have
# fixed iconography and the models only half-know it.
DEITY_ICONS = [
    (re.compile(r"\bhanuman\b", re.I),
     "Hanuman has the face of a vanara monkey, orange-red fur, a golden crown and mace, and a long tail."),
    (re.compile(r"\bganesh|ganpati\b", re.I),
     "Ganesha has an elephant head with one broken tusk, a large belly, and four arms."),
    (re.compile(r"\bshiva\b", re.I),
     "Shiva has a blue throat, matted jata hair with a crescent moon, a third eye, and a trident."),
    (re.compile(r"\bkrishna\b", re.I),
     "Krishna has blue skin, a peacock feather in his hair, and a bamboo flute."),
    (re.compile(r"\bdurga\b", re.I), "Durga has many arms holding weapons and rides a lion."),
    (re.compile(r"\bsaraswati\b", re.I), "Saraswati wears white, holds a veena, and sits with a swan."),
    (re.compile(r"\blakshmi|laxmi\b", re.I), "Lakshmi sits on a lotus with gold coins flowing from her palms."),
]

# --- scene variety ----------------------------------------------------------
# The contemporary default said only "modern clean surroundings", so Klein reached
# for the same apartment walkway every time. Deterministic pick from prompt+seed.
# VENUE has "room", but `\broom\w*\b` cannot match the room people actually name:
# there is no word boundary inside "bedroom". So "a quiet bedroom at night" counted
# as setting-less and this rule appended "The setting is a metro station platform."
# — overriding a setting the prompt had already stated. Compound rooms and the rest
# of a house are matched explicitly; named furniture counts too, since "on the
# bedside table" locates a scene as surely as naming the room does.
# Plurals only, NOT \w*. The wildcard made `car` match "cartoon", `port` match
# "portrait", `bus` match "business", `farm` match "farmer", `study` match
# "studying" and `ground` match "groundwater" — twelve measured false
# positives, each silently telling the layer a scene-less prompt had a named
# setting. Compound settings still wanted are listed explicitly, not reached
# by wildcard.
SETTING_NAMED = re.compile(VENUE.pattern +
                           # Indian venue vocabulary the first VENUE list
                           # missed. Without these the layer treats the prompt as
                           # scene-less and OVERRIDES it with one of SCENES,
                           # which produced absurd output: "at a mela" came back
                           # with "a modern apartment balcony overlooking the
                           # city" appended, "at a ghat" with "a leafy
                           # residential lane", "at a factory" with "a small
                           # local cafe interior". Thirteen of twenty-six common
                           # scene words were being overridden.
                           #
                           # Same shape as `clean shave` and the city-only INDIA
                           # list: the benchmarks used a narrow vocabulary, so
                           # everything outside it went untested.
                           r"|\b(concert|gig|festival|mela|fair|procession|parade|rally|"
                           r"tea\s*stall|dhaba|canteen|railway|platform|bus\s*stand|"
                           r"bus\s*stop|depot|auto\s*stand|rickshaw|taxi\s*stand|junction|"
                           r"crossing|chowk|bazaar|bazar|haat|mandi|ghat|riverbank|"
                           r"riverside|river|lake|pond|backwater|canal|coast|shore|"
                           r"harbour|port|jetty|desert|dune|hill|hills|mountain|valley|"
                           r"forest|jungle|plantation|orchard|farm|farmland|paddy|field|"
                           r"fields|village|hamlet|town|construction|factory|workshop|"
                           r"godown|warehouse|shop|store|showroom|salon|parlour|gym|"
                           r"clinic|hospital|pharmacy|library|museum|gallery|airport|"
                           r"terminal|stadium|ground|maidan|playground|court|pool|hotel|"
                           r"lobby|lounge|rooftop\s*bar|terrace\s*garden|verandah|veranda|"
                           r"courtyard|balcony|staircase|corridor|alley|gully|lane|bylane|"
                           # Furniture and surfaces. "indian couple on bed" was
                           # getting "a busy neighbourhood street" appended over
                           # it — a bed outdoors. "bedroom" and "sofa" were
                           # recognised; "bed" and "chair" were not.
                           r"bed|beds|bedside|cot|charpai|charpoy|mattress|couch|"
                           r"sofa|settee|divan|chair|chairs|stool|bench|swing|"
                           r"jhula|hammock|table|desk|counter|carpet|rug|mat|"
                           r"floor|steps|stairs|ladder|windowsill|sill|car|auto|"
                           r"bike|scooter|motorcycle|cycle|bicycle|bus|train|"
                           r"boat|pool|poolside|bathtub|shower|mirror|window)(?:s|es)?\b"
                           # Spelled out rather than \w*room\w*, which would also
                           # match "groom", "bridegroom", "broom" and "mushroom"
                           # and silently suppress scene-variety on a wedding shot.
                           r"|\b(bedroom|bathroom|washroom|restroom|classroom|storeroom|"
                           r"showroom|ballroom|guestroom|playroom|boardroom|living\s+room|"
                           r"drawing\s+room|dining\s+room|sitting\s+room|waiting\s+room|"
                           r"kitchen)(?:s|es)?\b"
                           r"|\b(hallway|corridor|landing|porch|doorway|staircase|stairwell|"
                           r"basement|attic|study|nursery|balcony|verandah|veranda|patio|"
                           r"driveway|pavement|sidewalk|bedside|sofa|couch|armchair|worktop|"
                           r"countertop|counter|dresser|nightstand)(?:s|es)?\b"
                           r"|\b(market|bazaar|temple|gym|shop|beach|hill|"
                           r"mountain|village|farm|airport|hospital|library|museum|stadium|"
                           r"terrace)(?:s|es)?\b"
                           # Compound settings the old \w* reached by accident.
                           # Listed, not wildcarded: marketplace, hillside and
                           # hilltop regressed when the wildcard went, seaside
                           # never matched. A missed setting means scene-variety
                           # overrides the scene the user named — the "bed in
                           # front of a building" failure.
                           # A stated BACKGROUND is a stated setting. Without
                           # these, "deep dark complexion, plain background" had
                           # scene-variety append a market over the plain
                           # background asked for — same failure as "couple on a
                           # bed in front of a building".
                           r"|\b(background|backdrop|seamless|plain\s+wall|"
                           r"blank\s+wall|against\s+a\s+wall|against\s+the\s+wall|"
                           r"studio\s*setup|no\s+background)\b"
                           r"|\b(marketplace|hillside|hilltop|hillock|seaside|"
                           r"seashore|seafront|roadside|wayside|lakeside|"
                           r"mountainside|countryside|waterfront|dockside|"
                           r"streetside|kerbside|curbside)\b", re.I)
SCENES = [
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
]

# --- focus ------------------------------------------------------------------
# Klein blurs portrait backgrounds heavily by default, which reads as washed out.
DOF = re.compile(r"\b(depth\s+of\s+field|bokeh|blurred?\s+background|shallow\s+focus|"
                 r"f/1|f1\.|portrait\s+lens|cinematic)\b", re.I)
DEEP_FOCUS = "Background in clear focus with visible detail."
# A caller who named a photographic TREATMENT has already decided the lighting
# and the depth of field. "bride ... luxury wedding venue, editorial photography"
# came back in flat outdoor daylight with everything in focus, because neither
# daylight-default nor deep-focus recognised "editorial" — the same override
# shape as appending daylight to "make it night".
PHOTO_STYLE_STATED = re.compile(
    r"\b(editorial|lookbook|campaign|fashion\s+(shoot|photography)|glamour|"
    r"studio\s+(lit|light|lighting)|golden\s+hour|backlit|rim\s+light|"
    r"soft\s+focus|dreamy|moody|candle\s*lit|fairy\s+lights)\b", re.I)
# A caller who asked for a PLAIN background does not want "visible detail" in
# it. RW-DEEP is "deep dark complexion, plain background" and the layer was
# appending exactly that contradiction — same shape as appending "Bright
# natural daylight" to "make it night". A stated background wins.
PLAIN_BACKGROUND = re.compile(
    r"\b(plain|blank|solid|seamless|white|grey|gray|black|neutral|studio)\s+"
    r"(background|backdrop|wall)\b|\bno\s+background\b|"
    r"\bagainst\s+a\s+(plain|blank|white|grey|gray|solid)\b", re.I)


def _hash(s):
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h

# --- house look -------------------------------------------------------------
# Beenga's commercial default: North Indian, sharp-featured, attractive, and for
# men clean-shaven. One rule rather than four — each addition dilutes the rest.
#
# Complexion is deliberately NOT part of it. This comment used to say "fair",
# describing behaviour removed in d2f94b1; HOUSE_LOOK below has carried no
# complexion term since. Defaulting fair would repeat the exact bias this
# project measures and corrects in other models. Left uncorrected the stale
# wording invites someone to "restore" it.
# Departs from the original spec's anti-default stance by choice, and yields the
# moment the user states a complexion, ethnicity, beauty level or facial hair.
COMPLEXION_STATED = re.compile(r"\b(fair|wheatish|dusky|deep|dark|medium|light|olive|"
                               r"complexion|skin\s+tone|melanated)\b", re.I)
LOOK_STATED = re.compile(r"\b(ordinary|average|plain|everyday|unremarkable|documentary|"
                         r"realistic\s+skin|natural\s+variation|glamorous|model-?like)\b", re.I)


# --- minors: never apply the beauty default ----------------------------------
#
# Audited 2026-08-16 against a content-policy checklist. The layer had no concept
# of a minor at all: "indian child", "indian kid playing", "indian children in a
# park" all had "conventionally attractive" appended by the house look. A beauty
# descriptor on a prompt about a child is indefensible on a public endpoint, and
# it was there by omission rather than by choice.
#
# Deliberately does NOT include bare "girl" or "boy". In Indian English "girl"
# routinely means a young woman and is the most common word in real prompts here.
# Those are already handled by the age-reinforcement rule, which forces "clearly a
# young adult in their early twenties" — the safe direction. "teenager" IS
# included and keeps that push as well, so it gets both protections.
#
# A floor, not a safety system: it reads words, not intent. Beenga adds no
# moderation layer; platform policies and the base model's terms govern use.
MINOR = re.compile(
    r"\b(child|children|childs|kid|kids|toddler|toddlers|infant|infants|baby|"
    r"babies|newborn|newborns|minor|minors|schoolgirl|schoolboy|schoolkid|"
    r"schoolchild|school\s*(girl|boy|kid|child|children|student)|preteen|pre-teen|"
    r"teen|teens|teenager|teenagers|teenaged|teenage|adolescent|adolescents|"
    r"juvenile|juveniles|underage|under-age)\b"
    r"|\b([0-9]|1[0-7])\s*[- ]?\s*(year|yr)s?[- ]?old\b"
    r"|\bage[d]?\s*([0-9]|1[0-7])\b", re.I)
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
_YOUNG_ADULT = re.compile(
    r"\b(girl|young(\s+\w+){0,2}\s+(woman|man|lady|guy|boy|girl)|teenager|"
    r"college\s+student|in\s+(her|his)\s+(early\s+)?twenties)\b", re.I)

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
    # NEVER on a prompt that states a minor. "girl" is deliberately absent from
    # MINOR because Indian English uses it for a young woman ("delhi girl"), and
    # that is what this rule is for — but with no MINOR guard the rule also fired
    # on "a 12 year old indian girl" and asserted "clearly a young adult in their
    # early twenties" over a stated age of 12. MINOR already matches a stated age
    # below 18; this rule simply never consulted it.
    (lambda raw: (not MINOR.search(raw)) and bool(_YOUNG_ADULT.search(raw)),
     "Clearly a young adult in their early twenties, youthful unlined face, smooth taut young skin, visibly in their early 20s."),
    (re.compile(r"\b(soft|loose|salon|blowout|beauty-?parlou?r)\s+(curls?|waves?)\b", re.I),
     "The hair falls in wide relaxed S-shaped waves with long gentle bends and plenty of loose movement."),
    (re.compile(r"\b(two|2)\s+braids?\b|\btwo\s+plaits\b", re.I),
     "Exactly two separate braids, clearly distinct from each other."),
    (re.compile(r"\b(one|single)\s+(thick\s+)?braid\b", re.I),
     "Exactly one single braid."),
    # "long thick braided hair" — no number at all — matched NEITHER rule above,
    # so nothing constrained the count and the model returned two braids of
    # different lengths. Unnumbered "braided hair" means one braid in normal use;
    # an explicit plural or a pigtail word still wins.
    (lambda raw: bool(re.search(r"\b(braid|braided|plait|plaited)\b", raw, re.I))
                 and not re.search(r"\b(braids|plaits|pigtails?|twintails?|two|2|"
                                   r"double|twin|both|pair)\b", raw, re.I),
     "The hair is worn in a single braid."),
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


def enhance(raw, contemporary=True, reinforce=True, variant="", budget=False):
    """Apply the Beenga prompt layer. Returns (prompt, applied_rule_names)."""
    applied = []
    out = raw

    for pattern, positive in NEGATIONS:
        if re.search(pattern, out, re.I):
            out = re.sub(pattern, positive, out, flags=re.I)
            applied.append("negation")

    # Segments carry their rule id so the budget assembler can tier them. With
    # budget off this is exactly the old list of strings in the old order.
    tail = []

    def add(rid, text, keep=None):
        tail.append({"id": rid, "text": text, "keep": keep})

    if contemporary and INDIA.search(raw) and not TRADITIONAL_INTENT.search(raw):
        add("contemporary-default", CONTEMPORARY)
        applied.append("contemporary-default")
        # Only if there IS someone to dress. "indian office" and "office desk in
        # delhi" were both getting "Modern everyday clothing." appended — a
        # garment instruction on a prompt with no person in it. Same shape as the
        # still-life bug NO_PEOPLE was added for: a rule firing on the presence
        # of India rather than the presence of a person.
        if not GARMENT.search(raw) and PERSON.search(raw):
            add("modern-dress-default", MODERN_DRESS)
            applied.append("modern-dress-default")

    # SETTING_NAMED, not VENUE. VENUE is the narrow original list, so "dancing
    # at a mela" got "An ordinary domestic living room" over the named setting.
    if (PERSON.search(raw) and FULL_BODY_POSE.search(raw)
            and not FRAMING_STATED.search(raw)):
        add("full-frame", FULL_FRAME)
        applied.append("full-frame")

    if CARTOON.search(raw) and not STYLE_STATED.search(raw):
        add("cartoon-3d", CARTOON_3D)
        applied.append("cartoon-3d")

    if DANCE.search(raw) and not SETTING_NAMED.search(raw):
        add("dance-venue-default", DANCE_VENUE)
        applied.append("dance-venue-default")

    if SARI.search(raw):
        if not FABRIC_OR_COLOUR.search(raw):
            add("sari-variety", f"The sari is {_pick_look(raw + variant)}.")
            applied.append("sari-variety")
        if not WANTS_MIDRIFF.search(raw):
            add("modest-drape", MODEST_DRAPE)
            applied.append("modest-drape")

    # MINOR gate: a prompt referencing a child gets no beauty descriptor at all.
    if (PERSON.search(raw) and not FOREIGN.search(raw)
            and not TRADITIONAL_INTENT.search(raw)
            and not COMPLEXION_STATED.search(raw) and not LOOK_STATED.search(raw)
            and not MINOR.search(raw)):
        male = bool(MALE.search(raw)) and not FEMALE_ONLY.search(raw)
        region = "" if INDIAN_PLACE.search(raw) else HOUSE_REGION
        male_tail = HOUSE_LOOK_MALE if male and not WANTS_HAIR.search(raw) else ""
        # The clean-shaven default is grooming, not decoration — it survives
        # trimming even when the rest of the house look does not.
        if face_is_subject(raw):
            add("house-look", region + HOUSE_LOOK + male_tail,
                keep=region + RULE_BUDGET["house-look"]["terse"] + male_tail)
            applied.append("house-look")
        else:
            # Scene prompt: keep identity and grooming, drop the beauty
            # description that would crop the scene away. Emit nothing when
            # both halves are empty rather than an empty sentence.
            identity = (HOUSE_REGION_ALONE if region else "") + male_tail
            if identity:
                add("house-identity", identity, keep=identity)
                applied.append("house-identity")

    # Same gate. Hair strand detail is invisible at scene distance and is the
    # single most expensive rule in the layer, so spending it on a market scene
    # buys nothing and costs the framing.
    if PERSON.search(raw) and not NON_PHOTO.search(raw) and face_is_subject(raw):
        add("hair-realism", HAIR_REALISM)
        applied.append("hair-realism")

    if not LIGHTING.search(raw) and not PHOTO_STYLE_STATED.search(raw):
        add("daylight-default", DAYLIGHT)
        applied.append("daylight-default")

    for pat, icon in DEITY_ICONS:
        if pat.search(raw):
            add("deity-icon", icon)
            applied.append("deity-icon")
            break

    if PERSON.search(raw) and not SETTING_NAMED.search(raw):
        add("scene-variety", f"The setting is {SCENES[_hash(raw + variant) % len(SCENES)]}.")
        applied.append("scene-variety")

    if (not DOF.search(raw) and not PLAIN_BACKGROUND.search(raw)
            and not PHOTO_STYLE_STATED.search(raw)):
        add("deep-focus", DEEP_FOCUS)
        applied.append("deep-focus")

    if reinforce:
        recap = []
        for test, say in FRAGILE:
            hit = test(raw) if callable(test) else bool(test.search(raw))
            if hit:
                recap.append(say)
        if recap:
            for say in recap:
                add("reinforce", say)
            applied.append(f"reinforce:{len(recap)}")

    if tail:
        # `budget is False` means off. 0 is a VALID budget meaning "Tier 1 only":
        # tier 1 is added unconditionally, then nothing else can fit. That is the
        # edit path, where the scene defaults must go regardless of how cheap
        # they are — a 5-word "Bright natural daylight" appended to "make it
        # night" contradicts the instruction just as hard as a 26-word one.
        if budget is False:
            segs = [t["text"] for t in tail]
        else:
            limit = BUDGET_WORDS if budget is True else budget
            segs = _spend_budget(tail, limit)
        if segs:
            out = out.strip()
            if not out.endswith("."):
                out += "."
            out = out + " " + " ".join(segs)

        # `applied` must describe the prompt that was actually built, not the
        # rules that were considered. It is the only visible record of what the
        # layer did — printed in the prediction logs, and what deploys are
        # verified against — so a rule the budget dropped must not appear.
        if budget is not False:
            kept = set(segs)
            survived = set()
            for t in tail:
                terse = RULE_BUDGET.get(t["id"], {}).get("terse")
                if t["text"] in kept or (t.get("keep") and t["keep"] in kept) \
                        or (terse and terse in kept):
                    survived.add(t["id"])
            applied[:] = [a for a in applied
                          if a.split(":")[0] not in RULE_BUDGET
                          or a.split(":")[0] in survived]

    return out, applied


# --- length budget: rule metadata --------------------------------------------
#
# STEP 1 OF THE LENGTH BUDGET. Metadata only — nothing above reads it yet and
# enhance() is byte-for-byte unchanged. It exists so the cost of each rule is
# visible in the source rather than only measurable after the fact, and so the
# assembler that replaces the unconditional appends has something to spend
# against.
#
# Why, measured across both suites, 41 cases:
#
#   median user words     20
#   median words added    81
#   median words sent    101
#
# At the extreme "beautiful delhi girl in sari" — five words — reaches the model
# as 142, of which the user wrote 4%. The layer built to stop attribute dilution
# had become the largest single source of it.
#
# Not theoretical: identical complexion and hair attributes appended to a
# ~35-word prompt produce visibly different people; appended to the layer's
# ~120-word output they produce one face repeatedly. Same attributes, same seed.
# They were never weak — they were outnumbered.
#
# TIERS
#   1  what the user explicitly asked for. Full strength, first claim on the
#      budget, never trimmed.
#   2  conditional on something the user said. Terse unless budget remains.
#   3  house defaults. Always terse — they fire on every prompt, so every word
#      is taxed on every generation.
#
# `terse` of None means the rule is already at or below target. Word counts are
# computed, not hand-written, so they cannot drift.

def _words(s):
    return len(s.strip().split()) if s else 0


RULE_BUDGET = {
    # Tier 3: house defaults, always terse
    "hair-realism": {
        "tier": 3, "full": HAIR_REALISM,
        "terse": "Fine hair strands, soft natural hairline.",
        # Most expensive rule in the layer, and an anti-AI-tell quality rule
        # rather than an adherence one. It should never outweigh the request.
    },
    "contemporary-default": {
        # always: survives any budget, in terse form. Measured across six prompt
        # types this is the ONE default that earns its keep — without it "indian
        # woman cooking" comes back in a sari, because the model's own prior for
        # India is ceremonial. Every other default stripped scenes, cropped
        # bodies or lightened complexions.
        "tier": 3, "always": True, "full": CONTEMPORARY,
        "terse": "Present-day India, modern surroundings, current-day clothing and styling.",
    },
    "house-look": {
        "tier": 3, "full": HOUSE_LOOK,
        "terse": "Sharp features, attractive.",
    },
    "deep-focus": {"tier": 3, "full": DEEP_FOCUS, "terse": "Background in focus."},
    "daylight-default": {"tier": 3, "full": DAYLIGHT, "terse": None},
    # always too, and only three words. Dropping it sent "indian woman cooking"
    # back into a sari — the ceremonial prior this project exists to counter.
    # NOT always. Measured against the soft wording alone: identical clothing
    # outcomes, so the hard command earned nothing — while forcing "Modern
    # everyday clothing" onto a bride, a priest and a farmer.
    "modern-dress-default": {"tier": 3, "full": MODERN_DRESS, "terse": None},

    # Tier 2: conditional on what the user said
    "modest-drape": {
        "tier": 2, "full": MODEST_DRAPE,
        "terse": "The pallu covers the shoulder and midriff.",
    },
    "sari-variety": {"tier": 2, "full": None, "terse": None, "dynamic": "pick_look"},
    "scene-variety": {"tier": 2, "full": None, "terse": None, "dynamic": "SCENES"},
    "deity-icon": {"tier": 2, "full": None, "terse": None, "dynamic": "DEITY_ICONS"},
    "dance-venue-default": {"tier": 2, "full": DANCE_VENUE, "terse": None},
    "full-frame": {
        "tier": 2, "full": FULL_FRAME, "terse": "Framed wide, whole subject in frame.",
    },
    "cartoon-3d": {
        "tier": 2, "full": CARTOON_3D,
        "terse": "Modern 3D animated style, volumetric forms, soft lighting.",
    },

    # Tier 1: what the user explicitly asked for. Never trimmed.
    "reinforce": {"tier": 1, "full": None, "terse": None, "dynamic": "FRAGILE"},
}

# Target ceiling on words the layer may add. Measured, not guessed.
BUDGET_WORDS = 45


def rule_costs():
    """Current and target added-word cost per rule, for the budget assembler."""
    out = []
    for rid, r in RULE_BUDGET.items():
        out.append({
            "id": rid,
            "tier": r["tier"],
            "full": _words(r["full"]),
            "terse": _words(r["full"]) if r["terse"] is None else _words(r["terse"]),
            "dynamic": bool(r.get("dynamic")),
        })
    return out


def _spend_budget(segs, limit):
    """Spend a word budget across tail segments.

    Tier 1 — what the user actually asked for — is always kept at full strength
    and takes the first claim. Tiers 2 and 3 then compete for what remains: full
    form if it fits, terse form if that fits, dropped if neither does.

    Segments are emitted in their ORIGINAL order, not tier order. Reordering
    would change the prompt's structure as well as its length, and this change
    is hard enough to evaluate with one variable moving.
    """
    def w(s):
        return len(s.strip().split())

    def meta(rid):
        return RULE_BUDGET.get(rid, {"tier": 2, "terse": None})

    chosen = {}
    spent = 0

    for i, s in enumerate(segs):
        if meta(s["id"])["tier"] == 1:
            chosen[i] = s["text"]
            spent += w(s["text"])

    # Then anything flagged `always`, in terse form, also unconditionally.
    for i, s in enumerate(segs):
        m = meta(s["id"])
        if m.get("always") and i not in chosen:
            t = m.get("terse") or s["text"]
            chosen[i] = t
            spent += w(t)

    for tier in (2, 3):
        for i, s in enumerate(segs):
            if meta(s["id"])["tier"] != tier or i in chosen:
                continue
            terse = s.get("keep") or meta(s["id"])["terse"] or s["text"]
            if spent + w(s["text"]) <= limit:
                chosen[i] = s["text"]
                spent += w(s["text"])
            elif spent + w(terse) <= limit:
                chosen[i] = terse
                spent += w(terse)

    return [chosen[i] for i in sorted(chosen)]
