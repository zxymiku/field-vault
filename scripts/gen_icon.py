"""Generate the original FIELD VAULT app icon (1024x1024).

Endfield-style geometry: charcoal field, signal-yellow clipped wedge,
a white calibration crosshair reading as a keyhole. Pure geometric —
no copied game art.
"""
from PIL import Image, ImageDraw

INK = (25, 25, 25, 255)        # #191919
PAPER = (242, 242, 240, 255)   # #f2f2f0
SIGNAL = (255, 250, 0, 255)    # #fffa00

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Charcoal field with small margin so the glyph reads on any background
pad = 64
d.rectangle([pad, pad, S - pad, S - pad], fill=INK)

# Signal-yellow wedge: 45-degree cut block rising from the lower-left,
# clipped by a diagonal (endfield directional cue)
wedge = [
    (pad, S - pad),                      # bottom-left
    (pad, 470),                          # up the left edge
    (560, 470),                          # across
    (560, S - pad - 120),                # step down-right (45deg cut corner)
]
d.polygon(wedge, fill=SIGNAL)

# Calibration crosshair upper-right, in paper white
cx, cy, r = 720, 330, 150
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=PAPER, width=22)
for ang in ((0, -1), (0, 1), (-1, 0), (1, 0)):
    dx, dy = ang
    x1 = cx + dx * (r + 10)
    y1 = cy + dy * (r + 10)
    x2 = cx + dx * (r + 78)
    y2 = cy + dy * (r + 78)
    d.line([x1, y1, x2, y2], fill=PAPER, width=22)
d.ellipse([cx - 34, cy - 34, cx + 34, cy + 34], fill=SIGNAL)

img.save("scripts/app-icon.png")
print("written scripts/app-icon.png")
