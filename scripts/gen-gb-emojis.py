# -*- coding: utf-8 -*-
"""Build guestbook emoji pack from Unicode emoji-test.txt (fully-qualified only)."""
import json
import re
from pathlib import Path

SRC = Path(r"C:\Users\66\WorkBuddy\2026-07-27-14-44-52\ross-site\scripts\emoji-test.txt")
OUT = Path(r"C:\Users\66\WorkBuddy\2026-07-27-14-44-52\ross-site\js\gb-emojis.js")

SKIN = {0x1F3FB, 0x1F3FC, 0x1F3FD, 0x1F3FE, 0x1F3FF}
HAIR = {0x1F9B0, 0x1F9B1, 0x1F9B2, 0x1F9B3}

line_re = re.compile(
    r"^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(.+?)(?:\s+E\d|\s*$)"
)


def twemoji_key(codepoints):
    # Twemoji asset names drop FE0F
    cps = [c for c in codepoints if c != 0xFE0F]
    return "-".join("%x" % c for c in cps)


emojis = []
seen = set()
for line in SRC.read_text(encoding="utf-8").splitlines():
    if "; fully-qualified" not in line or line.startswith("#"):
        continue
    m = line_re.match(line)
    if not m:
        # fallback parse
        left, _, rest = line.partition(";")
        if "fully-qualified" not in rest:
            continue
        hexes = left.strip().split()
    else:
        hexes = m.group(1).strip().split()
    cps = [int(h, 16) for h in hexes]
    # skip skin-tone / hair variants to keep grid dense & consistent
    if any(c in SKIN or c in HAIR for c in cps):
        continue
    # skip lone regional indicators
    if len(cps) == 1 and 0x1F1E6 <= cps[0] <= 0x1F1FF:
        continue
    ch = "".join(chr(c) for c in cps)
    if ch in seen:
        continue
    seen.add(ch)
    emojis.append({"c": ch, "t": twemoji_key(cps)})

OUT.write_text(
    "/* Unicode Emoji 15.1 fully-qualified (no skin/hair variants) + Twemoji keys */\n"
    "window.GB_EMOJIS = "
    + json.dumps(emojis, ensure_ascii=False, separators=(",", ":"))
    + ";\n",
    encoding="utf-8",
)
print("count", len(emojis), "bytes", OUT.stat().st_size)
print("sample", emojis[:5])
