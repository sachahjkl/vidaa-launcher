#!/usr/bin/env python3
"""Wii-style channel tile as a CRT glass screen: image pieces for the launcher.

The owner's brief: "there isn't really an edge. It's an inner shadow inside the
frame, plus scanlines. The tile is a cathode-ray TV screen, made of glass."
So the artwork fills the whole rounded tile; on top of it:

  screen.png      9-slice overlay (CSS border-image, no fill): the inner
                  vignette of curved glass -- dark at the four edges, darkest
                  at the corners and along the top -- plus a 1-2 px light line
                  at the very edge (brighter on top) and a faint grey hairline
                  outside it. It falls ON the artwork; the middle is clear.
                  CSS: border-image: url(/icons/screen.png) 132 / 4.4rem stretch
  wii-shadow.png  the tile's short contact shadow, drawn outside the tile with
                  border-image-outset.
  scan.png        1 x 4 px scanlines at low alpha, repeated over the artwork.

The diagonal glass sheen is a plain CSS linear-gradient (no image needed).
Sizes are in design px (1080p CSS px, = 0.1rem). Pure Pillow, no numpy.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = r"S:\alvidaa\launcher\pub\tv\www\icons"

R_OUT = 26.0      # tile corner radius (~12 % of the 226 px tile) = CSS --r-ch
R_VIG = 66.0      # rounder shape for the vignette: makes the corners darkest
SL = 44           # slice width
MID = 8           # stretchable middle of the source image
SCALE = 3         # image px per design px (crisp at 4K, downscaled at 1080p)
SS = 2            # supersampling per image px
SIZE = 2 * SL + MID

VIG_EDGE = 0.27   # vignette alpha at the edge (the corners reach more, see R_VIG)
VIG_DEPTH = 15.0  # how far it reaches into the picture (narrow: glass, not a bevel)
TOP_EXTRA = 0.10  # extra darkness along the top (glass curving away)
TOP_DEPTH = 20.0
SHADOW_RGB = (6, 12, 24)


def sdf_rrect(px, py, x0, y0, x1, y1, r):
    """Signed distance to a rounded rectangle (negative inside)."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bx, by = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    qx, qy = abs(px - cx) - bx, abs(py - cy) - by
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - r


def smooth(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def over(dst, rgb, a):
    """Source-over of (rgb, a) onto dst = (r, g, b, a); straight alpha."""
    r, g, b, da = dst
    oa = a + da * (1 - a)
    if oa <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    mix = lambda s, d: (s * a + d * da * (1 - a)) / oa
    return (mix(rgb[0], r), mix(rgb[1], g), mix(rgb[2], b), oa)


def screen_point(x, y):
    d_tile = -sdf_rrect(x, y, 0, 0, SIZE, SIZE, R_OUT)       # depth inside the tile
    if d_tile < 0:
        return (0.0, 0.0, 0.0, 0.0)
    d_vig = max(0.0, -sdf_rrect(x, y, 0, 0, SIZE, SIZE, R_VIG))
    a_edge = VIG_EDGE * (1 - smooth(0.0, VIG_DEPTH, d_vig)) ** 1.8
    a_top = TOP_EXTRA * (1 - smooth(0.0, TOP_DEPTH, y))
    a = 1 - (1 - a_edge) * (1 - a_top)
    col = (SHADOW_RGB[0], SHADOW_RGB[1], SHADOW_RGB[2], a)
    # 1-2 px light line at the very edge, brighter on top; faint grey hairline outside it
    top_bias = 1 - min(1.0, y / SIZE)
    light = (0.38 + 0.42 * top_bias) * (1 - smooth(1.0, 2.2, d_tile)) * smooth(0.5, 1.0, d_tile)
    col = over(col, (255, 255, 255), light)
    col = over(col, (130, 136, 148), 0.45 * (1 - smooth(0.4, 0.9, d_tile)))
    return col


def render(fn, n_design, extra=0.0):
    n = int(n_design * SCALE)
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    step = 1.0 / (SCALE * SS)
    for iy in range(n):
        for ix in range(n):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    r, g, b, a = fn((ix * SS + sx + 0.5) * step - extra, (iy * SS + sy + 0.5) * step - extra)
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
            a = acc[3] / (SS * SS)
            if a > 0.002:
                px[ix, iy] = (round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a * 255))
    return img


def render_shadow():
    """Short contact shadow under the tile, offset downwards."""
    m = 14                                   # margin around the tile (= outset)
    n = (SIZE + 2 * m) * SCALE
    def layer(dy, grow, value, blur):
        lay = Image.new("L", (n, n), 0)
        ImageDraw.Draw(lay).rounded_rectangle(
            [(m - grow) * SCALE, (m - grow + dy) * SCALE, (m + SIZE + grow) * SCALE, (m + SIZE + grow + dy) * SCALE],
            radius=(R_OUT + grow) * SCALE, fill=value)
        return lay.filter(ImageFilter.GaussianBlur(blur * SCALE)).load()
    soft, tight = layer(3.5, -1.0, 110, 4.5), layer(1.2, 0.0, 95, 1.3)
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    po = out.load()
    for y in range(n):
        for x in range(n):
            a = 255 - (255 - soft[x, y]) * (255 - tight[x, y]) // 255
            if a:
                po[x, y] = (22, 30, 44, a)
    return out, m


def render_scan():
    """1 x 4 px: a dark row, a clear row, a faint light row, a clear row."""
    img = Image.new("RGBA", (1, 4), (0, 0, 0, 0))
    img.putpixel((0, 0), (0, 0, 0, 22))        # ~9 % dark
    img.putpixel((0, 2), (255, 255, 255, 22))  # ~9 % light
    return img


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    render(screen_point, SIZE).save(os.path.join(OUT_DIR, "screen.png"), optimize=True)
    shadow, m = render_shadow()
    shadow.save(os.path.join(OUT_DIR, "wii-shadow.png"), optimize=True)
    render_scan().save(os.path.join(OUT_DIR, "scan.png"), optimize=True)
    old = os.path.join(OUT_DIR, "wii-frame.png")      # the earlier bezel attempt, superseded
    if os.path.exists(old):
        os.remove(old)
    for f in ("screen.png", "wii-shadow.png", "scan.png"):
        p = os.path.join(OUT_DIR, f)
        print(f, Image.open(p).size, os.path.getsize(p), "bytes")
    print("screen: slice %d px (= %.1frem); shadow: slice %d px (= %.1frem), outset %.1frem"
          % (SL * SCALE, SL / 10, (m + SL) * SCALE, (m + SL) / 10, m / 10))
