from PIL import Image, ImageDraw

BG = (13, 15, 20, 255)  # #0D0F14 — must match app.json splash backgroundColor
CANVAS = 2048
TILE_RATIO = 0.38       # icon tile size relative to canvas (LoadingScreen mirrors this)
RADIUS_RATIO = 0.2237   # iOS squircle-ish corner ratio (LoadingScreen mirrors this)
SS = 4                  # supersampling factor for smooth corners

icon = Image.open("assets/icon.png").convert("RGBA")

tile = int(CANVAS * TILE_RATIO)
tile_ss = tile * SS
icon_ss = icon.resize((tile_ss, tile_ss), Image.LANCZOS)

mask = Image.new("L", (tile_ss, tile_ss), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle(
    [0, 0, tile_ss - 1, tile_ss - 1],
    radius=int(tile_ss * RADIUS_RATIO),
    fill=255,
)

rounded = Image.new("RGBA", (tile_ss, tile_ss), (0, 0, 0, 0))
rounded.paste(icon_ss, (0, 0), mask)
rounded = rounded.resize((tile, tile), Image.LANCZOS)

canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
offset = (CANVAS - tile) // 2
canvas.alpha_composite(rounded, (offset, offset))
canvas.convert("RGB").save("assets/splash-icon.png", "PNG")

# Sanity: corners must be exactly BG
px = canvas.getpixel((0, 0))
print("corner pixel:", px, "| tile:", tile, "px at", offset)
