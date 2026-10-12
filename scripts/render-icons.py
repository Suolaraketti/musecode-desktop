"""Render our original SVG mark to Windows icons. Requires Pillow."""
from pathlib import Path
import re
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
source = (root / 'build/icon.svg').read_text(encoding='utf-8')
curve = re.search(r'<path d="([^"]+)"', source).group(1)
tokens = iter(re.findall(r'[MC]|-?\d+(?:\.\d+)?', curve))
points = []
position = (0, 0)
for command in tokens:
    if command == 'M':
        position = (float(next(tokens)), float(next(tokens)))
        points.append(position)
    elif command == 'C':
        controls = [(float(next(tokens)), float(next(tokens))) for _ in range(3)]
        start = position
        for step in range(1, 101):
            t = step / 100
            u = 1 - t
            points.append(tuple(u**3 * start[i] + 3*u*u*t * controls[0][i]
                                + 3*u*t*t * controls[1][i] + t**3 * controls[2][i]
                                for i in range(2)))
        position = controls[2]
    else:
        raise ValueError(f'Unsupported SVG path command: {command}')

scale = 4
image = Image.new('RGBA', (256*scale, 256*scale))
draw = ImageDraw.Draw(image)
background = re.search(r'<rect[^>]+fill="([^"]+)"', source).group(1)
color = re.search(r'stroke="([^"]+)"', source).group(1)
draw.rounded_rectangle((0, 0, 256*scale-1, 256*scale-1), radius=56*scale, fill=background)
pixels = [((40 + x*1.76)*scale, (50 + y*1.76)*scale) for x, y in points]
width = 9*1.76*scale
draw.line(pixels, fill=color, width=round(width), joint='curve')
for x, y in pixels:
    draw.ellipse((x-width/2, y-width/2, x+width/2, y+width/2), fill=color)
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(root / 'build/icon.png')
image.save(root / 'build/icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
