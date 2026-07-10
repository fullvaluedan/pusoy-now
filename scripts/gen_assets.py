# Generate the 4 visual assets for the redesign (plan U2).
# Style: simple classic playing cards. Palette locked to lib/theme.ts tokens:
#   felt #0e4a3a, cream #f4f1e8, card red #c0392b, ink #1a1a1a, gold #f1c40f
#
# Budget rule: exactly 4 generations per approved batch. Do not add retries.
# OPENAI_API_KEY is read from the Windows registry (HKCU\Environment), not
# the process env, per the machine's setup.

import base64
import json
import os
import sys
import urllib.request
import winreg

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "art")

PALETTE = (
    "Palette: deep forest green #0e4a3a, warm cream #f4f1e8, "
    "classic card red #c0392b, near-black ink #1a1a1a, muted gold #f1c40f."
)

ASSETS = [
    {
        "name": "card-back",
        "size": "1024x1536",
        "background": "opaque",
        "prompt": (
            "Back design of a classic playing card. Symmetrical ornamental "
            "lattice of interlocking diamonds and fine filigree, centered "
            "medallion, thin double-line border with rounded corners. Flat "
            "vector print style, crisp lines, no gradients, no text, no "
            "figures. Deep forest green background with cream linework and a "
            "small red accent in the medallion. " + PALETTE
        ),
    },
    {
        "name": "felt",
        "size": "1024x1536",
        "background": "opaque",
        "prompt": (
            "Card table surface texture, top-down. Deep forest green felt "
            "with very subtle woven grain and a soft dark vignette toward "
            "the edges. Calm, even, unobtrusive. No objects, no cards, no "
            "text, no logos. Flat and matte. " + PALETTE
        ),
    },
    {
        "name": "logo",
        "size": "1024x1024",
        "background": "transparent",
        "prompt": (
            "Minimal emblem logo for a Filipino card game called PUSOY NOW. "
            "Three fanned playing cards (red heart ace, black spade ace, "
            "green-backed card) above the wordmark 'PUSOY NOW' in a bold "
            "clean slab typeface, ink color. Flat vector, crisp edges, no "
            "gradients, transparent background. " + PALETTE
        ),
    },
    {
        "name": "hero",
        "size": "1536x1024",
        "background": "opaque",
        "prompt": (
            "Wide illustration of a hand of classic playing cards fanned on "
            "a cream paper background, with a few red and black suit pips "
            "(spade, heart, club, diamond) scattered sparsely as flat "
            "graphic shapes. Simple, elegant, flat vector print style, lots "
            "of negative space, no text, no people, no gradients. " + PALETTE
        ),
    },
]


def api_key() -> str:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        return winreg.QueryValueEx(k, "OPENAI_API_KEY")[0]


def generate(key: str, spec: dict) -> None:
    body = {
        "model": "gpt-image-2",
        "prompt": spec["prompt"],
        "size": spec["size"],
        "n": 1,
    }
    if spec["background"] == "transparent":
        body["background"] = "transparent"
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read())
    png = base64.b64decode(data["data"][0]["b64_json"])
    path = os.path.join(OUT_DIR, spec["name"] + ".png")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({len(png)//1024} KB)")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    key = api_key()
    only = sys.argv[1:]  # optional asset names to (re)generate
    for spec in ASSETS:
        if only and spec["name"] not in only:
            continue
        print(f"generating {spec['name']} ...")
        generate(key, spec)


if __name__ == "__main__":
    main()
