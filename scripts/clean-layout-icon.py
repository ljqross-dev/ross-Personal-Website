from PIL import Image, ImageFilter, ImageDraw, ImageChops
from collections import deque

src = r"C:\Users\66\WorkBuddy\2026-07-27-14-44-52\ross-site\images\ai-icon-layout.png"
bak = r"C:\Users\66\WorkBuddy\2026-07-27-14-44-52\ross-site\images\ai-icon-layout.bak.png"

# always start from original backup
im = Image.open(bak).convert("RGBA")
w, h = im.size
px = im.load()

CORE_T = 100
core = Image.new("L", (w, h), 0)
cp = core.load()
for y in range(h):
    for x in range(w):
        if px[x, y][3] >= CORE_T:
            cp[x, y] = 255

visited = [[False] * w for _ in range(h)]
best = []
for y in range(h):
    for x in range(w):
        if cp[x, y] and not visited[y][x]:
            q = deque([(x, y)])
            visited[y][x] = True
            comp = [(x, y)]
            while q:
                cx, cy = q.popleft()
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and cp[nx, ny]:
                        visited[ny][nx] = True
                        q.append((nx, ny))
                        comp.append((nx, ny))
            if len(comp) > len(best):
                best = comp

mask = Image.new("L", (w, h), 0)
mp = mask.load()
xs = [p[0] for p in best]
ys = [p[1] for p in best]
for x, y in best:
    mp[x, y] = 255

# tight keep-zone: rounded rect around core + small pad (preserves glass rim, cuts box haze)
pad = 6
x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
radius = int(0.22 * min(x1 - x0, y1 - y0))
keep = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(keep)
draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)

# slightly dilate core for glass edge glow inside keep zone
dilated = mask
for _ in range(5):
    dilated = dilated.filter(ImageFilter.MaxFilter(3))

# final soft allow = intersection(keep, dilated) with light blur
allow = ImageChops.multiply(keep, dilated)
soft = allow.filter(ImageFilter.GaussianBlur(radius=1.2))

out = im.copy()
op = out.load()
sp = soft.load()
killed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = op[x, y]
        m = sp[x, y]
        if m < 8:
            if a:
                killed += 1
            op[x, y] = (0, 0, 0, 0)
            continue
        na = int(round(a * (m / 255.0)))
        # crush faint grain
        if na < 14:
            op[x, y] = (0, 0, 0, 0)
            killed += 1
            continue
        # dark speck fringe outside hard core
        if mp[x, y] == 0 and na < 70 and (r + g + b) < 110:
            op[x, y] = (0, 0, 0, 0)
            killed += 1
            continue
        op[x, y] = (r, g, b, na)

out.save(src, optimize=True)
px2 = out.load()
low = sum(1 for y in range(h) for x in range(w) if 0 < px2[x, y][3] < 40)
hi = sum(1 for y in range(h) for x in range(w) if px2[x, y][3] >= 180)
print("bbox", x0, y0, x1, y1, "radius", radius, "killed", killed, "low", low, "hi", hi)
