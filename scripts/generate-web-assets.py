# Generates the static web assets served from public/ (favicons, touch
# icon, manifest icons, og-image). Run with the system Python (has Pillow):
#   /usr/bin/python3 scripts/generate-web-assets.py
# Outputs are committed; re-run only when assets/icon.png changes.
import os

from PIL import Image, ImageDraw, ImageFont

BG = (13, 15, 20, 255)  # #0D0F14 — app background
TEXT_PRIMARY = (241, 243, 247, 255)  # #F1F3F7
TEXT_SECONDARY = (155, 161, 176, 255)  # #9BA1B0
RADIUS_RATIO = 0.2237  # matches the native splash tile rounding
SS = 4

os.makedirs("public", exist_ok=True)
icon = Image.open("assets/icon.png").convert("RGBA")


def rounded_tile(size: int) -> Image.Image:
    size_ss = size * SS
    icon_ss = icon.resize((size_ss, size_ss), Image.LANCZOS)
    mask = Image.new("L", (size_ss, size_ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size_ss - 1, size_ss - 1],
        radius=int(size_ss * RADIUS_RATIO),
        fill=255,
    )
    out = Image.new("RGBA", (size_ss, size_ss), (0, 0, 0, 0))
    out.paste(icon_ss, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


# favicon.ico — 16/32/48 rounded frames (48+ keeps Google Search happy).
rounded_tile(48).save(
    "public/favicon.ico",
    sizes=[(16, 16), (32, 32), (48, 48)],
)

# apple-touch-icon — square, opaque; iOS applies its own corner mask.
touch = Image.new("RGBA", (180, 180), BG)
touch.alpha_composite(icon.resize((180, 180), Image.LANCZOS))
touch.convert("RGB").save("public/apple-touch-icon.png", "PNG")

# Manifest icons — square, opaque background.
for size in (192, 512):
    tile = Image.new("RGBA", (size, size), BG)
    tile.alpha_composite(icon.resize((size, size), Image.LANCZOS))
    tile.convert("RGB").save(f"public/icon-{size}.png", "PNG")

# Maskable variants — artwork inside the 80% safe zone so Android's
# adaptive-icon mask never crops it.
for size in (192, 512):
    safe = int(size * 0.72)
    tile = Image.new("RGBA", (size, size), BG)
    tile.alpha_composite(
        icon.resize((safe, safe), Image.LANCZOS), ((size - safe) // 2, (size - safe) // 2)
    )
    tile.convert("RGB").save(f"public/icon-maskable-{size}.png", "PNG")


def load_font(size: int, bold: bool) -> ImageFont.FreeTypeFont:
    candidates = [
        ("/System/Library/Fonts/HelveticaNeue.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Helvetica.ttc", 1 if bold else 0),
    ]
    for path, index in candidates:
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    return ImageFont.load_default()


# og-image — 1200x630 link-preview card: icon tile over wordmark + tagline.
W, H = 1200, 630
og = Image.new("RGBA", (W, H), BG)
tile = rounded_tile(200)
og.alpha_composite(tile, ((W - 200) // 2, 118))
draw = ImageDraw.Draw(og)
wordmark_font = load_font(84, bold=True)
tagline_font = load_font(34, bold=False)


def draw_centered(text: str, y: int, font: ImageFont.FreeTypeFont, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((W - (box[2] - box[0])) // 2 - box[0], y), text, font=font, fill=fill)


draw_centered("Plotlist", 356, wordmark_font, TEXT_PRIMARY)
draw_centered("Never lose the plot.", 476, tagline_font, TEXT_SECONDARY)
og.convert("RGB").save("public/og-image.png", "PNG")

print("wrote public/: favicon.ico, apple-touch-icon.png, icon-192/512.png, og-image.png")
