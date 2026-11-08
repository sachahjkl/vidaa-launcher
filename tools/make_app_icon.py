#!/usr/bin/env python3
"""Icon for our own app in the TV's stock app list."""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = r"S:\alvidaa\launcher\pub\tv\www\icons"
S = 512


def grad(top, bottom):
    img = Image.new("RGB", (S, S), top)
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.convert("RGBA")


img = grad((120, 190, 240), (58, 120, 190))
ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
d.ellipse([-S * 0.3, -S * 0.8, S * 1.3, S * 0.5], fill=(255, 255, 255, 60))
img = Image.alpha_composite(img, ov.filter(ImageFilter.GaussianBlur(20)))

d = ImageDraw.Draw(img)
# a soft screen holding the star
d.rounded_rectangle([120, 130, 392, 360], 26, fill=(255, 255, 255, 235), outline=(255, 255, 255), width=6)
d.rounded_rectangle([216, 372, 296, 396], 10, fill=(255, 255, 255, 235))

pts = []
for i in range(10):
    a = -math.pi / 2 + i * math.pi / 5
    r = 74 if i % 2 == 0 else 32
    pts.append((256 + r * math.cos(a), 258 + r * math.sin(a)))
d.polygon(pts, fill=(255, 178, 46))

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], 96, fill=255)
img.putalpha(mask)
os.makedirs(OUT, exist_ok=True)
p = os.path.join(OUT, "app-alvidaa.png")
img.convert("RGB").save(p, "PNG")
print("wrote", p)
