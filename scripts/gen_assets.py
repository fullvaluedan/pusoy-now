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
    # --- Round 4 monetization art ---
    {
        "name": "paywall-hero",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Friendly premium upgrade illustration for a card game: a fanned "
            "hand of classic playing cards with a gold crown resting on top, "
            "a small burst of sparkle accents around it, on a warm cream "
            "background. Celebratory but tasteful, flat vector print style, "
            "no text, no gradients, generous negative space. " + PALETTE
        ),
    },
    {
        "name": "premium-badge",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "A single gold crown emblem badge, simple and bold, centered on "
            "a plain warm cream background, thin ink outline, small red gem "
            "accent. Flat vector, crisp, no text, no gradients, readable at "
            "small size. " + PALETTE
        ),
    },
    {
        "name": "ad-placeholder",
        "size": "1536x1024",
        "background": "opaque",
        "prompt": (
            "Wide house-ad banner placeholder for a card game: a subtle "
            "pattern of small suit pips (spade, heart, club, diamond) on a "
            "deep forest green field with a thin gold inner border, leaving "
            "a clear empty center band. Calm, unobtrusive, flat vector, no "
            "text, no gradients. " + PALETTE
        ),
    },
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
        "background": "opaque",  # gpt-image-2 rejects transparent; rembg later if needed
        "prompt": (
            "Minimal emblem logo for a Filipino card game called PRENDS. "
            "Three fanned playing cards (red heart ace, black spade ace, "
            "green-backed card) above the wordmark 'PRENDS' in a bold "
            "clean slab typeface, ink color. Flat vector, crisp edges, no "
            "gradients, plain solid warm cream #f4f1e8 background. " + PALETTE
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
    {
        "name": "app-icon",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "App icon, square, centered composition. Three fanned playing "
            "cards (red heart ace, black spade ace, green-backed card) as a "
            "bold simple emblem, filling most of the frame. No text. Deep "
            "forest green background, cream and gold accents, thick clean "
            "shapes readable at small size. Flat vector, no gradients. "
            + PALETTE
        ),
    },
    {
        "name": "bot-avatar",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Friendly mascot avatar for a card-game opponent, centered bust "
            "portrait for a circular frame. A cheerful stylized card dealer "
            "character wearing a green visor, holding a fanned playing card, "
            "warm and approachable. Flat vector illustration, bold clean "
            "shapes, simple face, cream background. No text, no gradients. "
            + PALETTE
        ),
    },
    {
        "name": "splash",
        "size": "1024x1536",
        "background": "opaque",
        "prompt": (
            "Portrait mobile splash screen. Centered emblem of three fanned "
            "playing cards (red heart ace, black spade ace, green-backed "
            "card) on a deep forest green background with a subtle radial "
            "vignette and small gold Philippine-sun accents in the corners. "
            "Calm, elegant, flat vector, generous empty space around the "
            "emblem, no text, no gradients. " + PALETTE
        ),
    },
    # --- Round 2 Phase A candidates (5-image budget) ---
    {
        "name": "felt-tile",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Seamless tileable casino card-table felt texture, top-down, "
            "deep forest green. Fine even woven grain, very subtle, no seams "
            "at the edges so it repeats cleanly. Matte, calm, no vignette, no "
            "objects, no text, no logos. Flat and uniform. " + PALETTE
        ),
    },
    {
        "name": "table-inlay",
        "size": "1536x1024",
        "background": "opaque",
        "prompt": (
            "Elegant oval card-table inlay border, top-down, centered on "
            "deep forest green felt. A thin double gold pinstripe forming a "
            "rounded rectangle play area with small ornamental corner "
            "flourishes, lots of empty green in the middle. Flat vector, "
            "crisp thin lines, no gradients, no text. " + PALETTE
        ),
    },
    {
        "name": "seat-frame",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Circular avatar seat frame for a card game, centered on a plain "
            "deep forest green background. An ornamental gold ring with a "
            "small fleur accent at the top, empty cream center where a photo "
            "will sit. Flat vector, crisp, no gradients, no text. " + PALETTE
        ),
    },
    {
        "name": "turn-glow",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Soft radial gold glow halo on a deep forest green background, "
            "centered, fading smoothly to transparent-looking green at the "
            "edges. Warm muted gold, subtle, meant to sit behind an active "
            "player's hand as a highlight. No objects, no text. " + PALETTE
        ),
    },
    {
        "name": "empty-state",
        "size": "1024x1024",
        "background": "opaque",
        "prompt": (
            "Friendly empty-state illustration for a card app: a single "
            "playing-card back and a small stack of chips arranged simply on "
            "a warm cream background, lots of negative space. Flat vector, "
            "calm, no text, no gradients. " + PALETTE
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
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print("API error:", e.code, e.read().decode()[:500])
        raise
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
