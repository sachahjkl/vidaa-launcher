#!/usr/bin/env python3
"""Channel scenes: small illustrated tableaux instead of flat pictograms."""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = r"S:\alvidaa\launcher\pub\tv\www\icons"
W, H = 512, 384


def grad(a, b, w=W, h=H):
    img = Image.new("RGB", (w, h), a)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return img.convert("RGBA")


def soft(img, box, fill, blur=12):
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse(box, fill=fill)
    return Image.alpha_composite(img, ov.filter(ImageFilter.GaussianBlur(blur)))


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], 18, fill=255)
    img.putalpha(m)
    p = os.path.join(OUT, name + ".png")
    img.convert("RGB").save(p)
    print("wrote", p)


def star(d, cx, cy, r, fill, rot=-math.pi / 2):
    pts = []
    for i in range(10):
        a = rot + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)


def robot(d, x, y, s=1.0, body=(120, 200, 235)):
    d.rounded_rectangle([x - 34 * s, y - 90 * s, x + 34 * s, y], 18 * s, fill=body)
    d.ellipse([x - 30 * s, y - 150 * s, x + 30 * s, y - 90 * s], fill=(235, 245, 252))
    d.ellipse([x - 16 * s, y - 130 * s, x - 4 * s, y - 118 * s], fill=(40, 60, 80))
    d.ellipse([x + 4 * s, y - 130 * s, x + 16 * s, y - 118 * s], fill=(40, 60, 80))
    d.arc([x - 12 * s, y - 116 * s, x + 12 * s, y - 100 * s], 15, 165, fill=(40, 60, 80), width=max(2, int(3 * s)))


def fox(d, x, y, s=1.0):
    d.polygon([(x - 40 * s, y - 60 * s), (x - 18 * s, y - 20 * s), (x - 44 * s, y - 16 * s)], fill=(238, 138, 78))
    d.polygon([(x + 40 * s, y - 60 * s), (x + 44 * s, y - 16 * s), (x + 18 * s, y - 20 * s)], fill=(238, 138, 78))
    d.ellipse([x - 40 * s, y - 64 * s, x + 40 * s, y + 16 * s], fill=(245, 158, 92))
    d.ellipse([x - 24 * s, y - 12 * s, x + 24 * s, y + 22 * s], fill=(255, 250, 244))
    d.ellipse([x - 18 * s, y - 44 * s, x - 8 * s, y - 34 * s], fill=(45, 35, 32))
    d.ellipse([x + 8 * s, y - 44 * s, x + 18 * s, y - 34 * s], fill=(45, 35, 32))
    d.ellipse([x - 5 * s, y - 20 * s, x + 5 * s, y - 10 * s], fill=(50, 40, 38))


def etoiles():
    img = grad((58, 86, 140), (150, 190, 225))
    img = soft(img, [60, 40, 190, 170], (255, 240, 200, 70), 26)
    d = ImageDraw.Draw(img)
    for i in range(26):
        x = (i * 97) % W
        y = (i * 53) % 220
        d.ellipse([x, y, x + 4, y + 4], fill=(255, 255, 255, 190))
    d.ellipse([-80, 250, 300, 470], fill=(70, 120, 90))
    d.ellipse([180, 265, 620, 470], fill=(58, 104, 80))
    star(d, 330, 120, 52, (255, 205, 90))
    star(d, 400, 190, 26, (255, 220, 140))
    robot(d, 170, 330, 1.15)
    save(img, "jeu-remote")


def paires():
    img = grad((236, 228, 250), (205, 195, 235))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 250, 472, 384], 10, fill=(176, 142, 104))
    for i, (x, y) in enumerate([(120, 130), (300, 100)]):
        d.rounded_rectangle([x - 8, y - 8, x + 128, y + 158], 16, fill=(255, 255, 255))
        d.rounded_rectangle([x, y, x + 120, y + 150], 12, fill=(250, 248, 244), outline=(220, 214, 205), width=3)
    fox(d, 180, 260, 0.95)
    star(d, 360, 190, 34, (255, 190, 80))
    save(img, "jeu-memory")


def tambours():
    img = grad((240, 214, 200), (206, 168, 150))
    img = soft(img, [40, -40, 210, 200], (255, 250, 220, 120), 30)
    img = soft(img, [300, -40, 470, 200], (255, 250, 220, 120), 30)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 300, W, H], fill=(150, 108, 92))
    for cx, r, col in [(150, 58, (232, 138, 104)), (256, 74, (240, 150, 110)), (370, 50, (222, 124, 96))]:
        d.ellipse([cx - r, 210 - r // 2, cx + r, 210 + r // 2], fill=(250, 240, 232))
        d.rectangle([cx - r, 210, cx + r, 300], fill=col)
        d.ellipse([cx - r, 280, cx + r, 320], fill=col)
        d.ellipse([cx - 26, 276, cx + 26, 312], fill=(255, 236, 226))
    for i in range(14):
        x = (i * 71) % W
        y = 60 + (i * 37) % 120
        d.rectangle([x, y, x + 8, y + 14], fill=[(255, 210, 90), (120, 200, 160), (240, 140, 160)][i % 3])
    save(img, "jeu-music")


def formes():
    img = grad((222, 244, 230), (190, 226, 205))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 300, W, H], fill=(158, 200, 176))
    d.rounded_rectangle([60, 250, 452, 300], 10, fill=(120, 172, 146))
    d.ellipse([90, 180, 170, 260], fill=(250, 200, 90))
    d.rounded_rectangle([190, 190, 270, 262], 12, fill=(110, 160, 235))
    d.polygon([(330, 180), (400, 262), (260, 262)], fill=(240, 130, 120))
    d.ellipse([120, 60, 210, 150], fill=(255, 255, 255, 120))
    robot(d, 400, 300, 0.7)
    save(img, "jeu-sort")


def renard():
    img = grad((196, 232, 206), (128, 178, 148))
    img = soft(img, [300, 20, 500, 140], (255, 250, 200, 110), 34)
    d = ImageDraw.Draw(img)
    d.polygon([(0, 384), (110, 250), (220, 384)], fill=(96, 150, 118))
    d.polygon([(300, 384), (420, 240), (540, 384)], fill=(84, 138, 108))
    for x in (90, 240, 400):
        d.rectangle([x, 200, x + 14, 330], fill=(96, 78, 62))
        d.ellipse([x - 46, 150, x + 60, 250], fill=(86, 160, 116))
    d.rectangle([0, 330, W, H], fill=(150, 190, 150))
    fox(d, 256, 340, 1.15)
    save(img, "jeu-clavier")


def labo():
    img = grad((214, 232, 246), (180, 206, 232))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 296, W, H], fill=(150, 170, 190))
    d.rounded_rectangle([60, 260, 452, 300], 8, fill=(120, 145, 170))
    for cx, h, col in [(160, 60, (110, 200, 170)), (256, 90, (140, 170, 240)), (350, 50, (240, 170, 200))]:
        d.polygon([(cx - 18, 150), (cx + 18, 150), (cx + 34, 260), (cx - 34, 260)], fill=(232, 242, 250), outline=(120, 150, 180))
        d.polygon([(cx - 26, 220), (cx + 26, 220), (cx + 34, 260), (cx - 34, 260)], fill=col)
        for i in range(3):
            d.ellipse([cx - 12 + i * 10, 200 - h - i * 12, cx - 4 + i * 10, 208 - h - i * 12], fill=(255, 255, 255, 200))
    d.ellipse([330, 60, 400, 130], fill=(255, 245, 180))
    save(img, "labo")


if __name__ == "__main__":
    etoiles()
    paires()
    tambours()
    formes()
    renard()
    labo()
