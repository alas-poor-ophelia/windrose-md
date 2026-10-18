"""crop.py <out> <x0> <y0> <x1> <y1> <scale> <dst> frame files... : crop frames side by side into one PNG."""
import sys
from PIL import Image
x0, y0, x1, y1 = map(int, sys.argv[1:5]); scale = float(sys.argv[5]); dst = sys.argv[6]; files = sys.argv[7:]
crops = [Image.open(f).crop((x0, y0, x1, y1)) for f in files]
w, h = crops[0].size; w2, h2 = int(w * scale), int(h * scale)
sheet = Image.new("RGB", (w2 * len(crops) + 6 * (len(crops) - 1), h2), "white")
for i, c in enumerate(crops):
    sheet.paste(c.resize((w2, h2), Image.LANCZOS), (i * (w2 + 6), 0))
sheet.save(dst)
print(dst, sheet.size)
