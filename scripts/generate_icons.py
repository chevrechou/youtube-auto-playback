from PIL import Image, ImageDraw

SIZES = (16, 48, 128)
BG_COLOR = (204, 0, 0, 255)      # YouTube-red circle
FG_COLOR = (255, 255, 255, 255)  # white play triangle

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, size - 1, size - 1], fill=BG_COLOR)

    tri_w = size * 0.4
    tri_h = size * 0.5
    cx, cy = size / 2, size / 2
    points = [
        (cx - tri_w / 2 + size * 0.05, cy - tri_h / 2),
        (cx - tri_w / 2 + size * 0.05, cy + tri_h / 2),
        (cx + tri_w / 2, cy),
    ]
    draw.polygon(points, fill=FG_COLOR)
    return img

if __name__ == "__main__":
    for size in SIZES:
        icon = make_icon(size)
        path = f"icons/icon{size}.png"
        icon.save(path)
        print(f"Wrote {path}")
