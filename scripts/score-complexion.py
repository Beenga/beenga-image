#!/usr/bin/env python3
"""Score the complexion sweep by measuring skin luminance, not by eye.

    python3 scripts/score-complexion.py [out/complexion-sweep]

The central claim of this project is a measurement, so the scoring should be one
too. Every other result here was judged by a human looking at pictures, which is
subjective, unreproducible, and does not scale past a few dozen images. This is
the one axis where an instrument is easy, so it gets one.

Method: crop the upper-centre of each portrait, which on a waist-up shot against
a plain background is reliably face and neck. Take the MEDIAN Rec.709 luma of
that region — median rather than mean so that hair, background and specular
highlights cannot drag the figure around.

The absolute numbers are not calibrated against any skin-tone scale and should
not be quoted as if they were. What matters is the ORDERING: if the prompt layer
works, luminance must fall monotonically from very_fair to very_deep. A single
inversion means a tone is not landing where it was asked to.

Caveat worth keeping in view: at the light end the spread across seeds is wider
than the gap between adjacent tones, so very_fair / fair / light_medium are not
cleanly separated relative to noise. Those tones never failed and carry no
prompt-layer stack, so this is a limit of the measurement rather than a defect —
but do not claim precision there that the data does not support.
"""
import collections
import glob
import os
import statistics
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow:  pip install Pillow")

ORDER = ["very_fair", "fair", "light_medium", "wheatish", "medium", "deep", "very_deep"]
STACKED = {"wheatish", "medium", "deep", "very_deep"}


def skin_luma(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    box = im.crop((int(w * 0.38), int(h * 0.18), int(w * 0.62), int(h * 0.42)))
    lum = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in box.getdata())
    return lum[len(lum) // 2]


def main(directory):
    files = glob.glob(os.path.join(directory, "*.png"))
    if not files:
        sys.exit(f"no images in {directory} — run scripts/sweep-complexion.mjs first")

    vals = collections.defaultdict(list)
    for f in files:
        # filenames are <tone>-<subject>-s<seed index>.png
        tone = os.path.basename(f).rsplit("-", 2)[0]
        vals[tone].append(skin_luma(f))

    print(f"{'tone':<14}{'stack':<7}{'median':>9}{'spread':>9}{'n':>4}")
    prev, monotonic = None, True
    for tone in ORDER:
        v = vals.get(tone)
        if not v:
            continue
        med, spread = statistics.median(v), max(v) - min(v)
        note = ""
        if prev is not None and med > prev:
            note, monotonic = "   <-- LIGHTER THAN PREVIOUS TONE", False
        print(f"{tone:<14}{'yes' if tone in STACKED else '-':<7}"
              f"{med:>9.1f}{spread:>9.1f}{len(v):>4}{note}")
        prev = med

    print(f"\nmonotonic light->dark: {'YES' if monotonic else 'NO'}")
    return 0 if monotonic else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "out/complexion-sweep"))
