#!/usr/bin/env python3
"""Generate source artwork (4:3) for the launcher: TV, Google TV, HDMI 1-4,
soundbar, AV, music sharing."""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = r"S:\alvidaa\launcher\pub\tv\www\icons"
W, H = 512, 384


def bg(top, bottom):
    img = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.convert("RGBA")


def gloss(img):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse([-W * 0.2, -H * 0.8, W * 1.2, H * 0.45], fill=(255, 255, 255, 44))
    return Image.alpha_composite(img, ov.filter(ImageFilter.GaussianBlur(16)))


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".png")
    img.convert("RGB").save(p, "PNG")
    print("wrote", p)


def screen(d, x, y, w, h, fill, rim=(255, 255, 255)):
    d.rounded_rectangle([x, y, x + w, y + h], 18, fill=fill)
    d.rounded_rectangle([x, y, x + w, y + h], 18, outline=rim, width=6)


def tv():
    img = gloss(bg((208, 224, 240), (240, 246, 251)))
    d = ImageDraw.Draw(img)
    screen(d, 96, 90, 320, 200, (70, 96, 130))
    d.line([(256, 90), (210, 40)], fill=(120, 140, 165), width=6)
    d.line([(256, 90), (302, 40)], fill=(120, 140, 165), width=6)
    d.rounded_rectangle([210, 296, 302, 320], 8, fill=(120, 140, 165))
    d.ellipse([150, 140, 200, 190], fill=(255, 255, 255))
    save(img, "src-tv")


def google():
    img = gloss(bg((232, 238, 248), (250, 252, 255)))
    d = ImageDraw.Draw(img)
    # TV screen with the four Google colours as soft dots and a play mark
    d.rounded_rectangle([110, 80, 402, 300], 22, fill=(255, 255, 255), outline=(210, 220, 232), width=6)
    for i, c in enumerate([(66, 133, 244), (219, 68, 55), (244, 180, 0), (15, 157, 88)]):
        a = i * math.pi / 2 + math.pi / 4
        cx, cy = 256 + 46 * math.cos(a), 190 + 46 * math.sin(a)
        d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=c)
    d.polygon([(232, 150), (300, 190), (232, 230)], fill=(40, 60, 90))
    d.rounded_rectangle([190, 302, 322, 322], 8, fill=(210, 220, 232))
    save(img, "src-google")


def hdmi(n):
    img = gloss(bg((214, 232, 214), (244, 252, 244)))
    d = ImageDraw.Draw(img)
    # plug body
    d.rounded_rectangle([120, 150, 392, 250], 16, fill=(240, 244, 248), outline=(120, 150, 130), width=6)
    d.polygon([(150, 150), (200, 108), (312, 108), (362, 150)], fill=(230, 236, 242), outline=(120, 150, 130))
    for i in range(6):
        x = 150 + i * 36
        d.rectangle([x, 168, x + 22, 196], fill=(90, 120, 100))
    d.ellipse([336, 262, 420, 352], fill=(90, 190, 140))
    f = ImageDraw.Draw(img)
    f.text((378, 307), str(n), fill=(255, 255, 255), anchor="mm")
    save(img, "src-hdmi%d" % n)


def soundbar():
    img = gloss(bg((240, 226, 214), (252, 246, 240)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([70, 170, 442, 250], 26, fill=(60, 66, 78))
    for i in range(7):
        x = 110 + i * 44
        d.ellipse([x, 196, x + 22, 218], fill=(120, 130, 145))
    for i in range(3):
        d.arc([170 + i * 60, 100, 230 + i * 60, 160], 200, 340, fill=(120, 130, 145), width=6)
    save(img, "src-soundbar")


def av():
    img = gloss(bg((248, 226, 232), (253, 244, 247)))
    d = ImageDraw.Draw(img)
    for i, c in enumerate([(230, 70, 70), (250, 250, 250), (240, 200, 60)]):
        x = 150 + i * 80
        d.ellipse([x, 160, x + 60, 220], fill=c, outline=(150, 110, 120), width=4)
    d.rounded_rectangle([120, 130, 392, 250], 18, outline=(150, 110, 120), width=6)
    save(img, "src-av")


def music():
    img = gloss(bg((224, 226, 248), (246, 247, 255)))
    d = ImageDraw.Draw(img)
    d.ellipse([150, 220, 230, 300], fill=(110, 120, 210))
    d.rectangle([212, 110, 232, 260], fill=(110, 120, 210))
    d.polygon([(232, 110), (330, 140), (330, 190), (232, 160)], fill=(110, 120, 210))
    save(img, "src-music")


if __name__ == "__main__":
    tv()
    google()
    for n in (1, 2, 3, 4):
        hdmi(n)
    soundbar()
    av()
    music()
