#!/usr/bin/env python3
"""Regenerate every logo + icon raster from the two brand masters.

    python3 scripts/gen-brand-assets.py            # write the assets
    python3 scripts/gen-brand-assets.py --check    # verify, write nothing

Why this script exists
----------------------
The original `public/logo.png` was a 3827x2533 canvas holding 2503x1008 of
artwork -- 30% of its height was transparent padding. Rendered at `h-10`
(40px) that meant ~21px of visible ink in a 40px box, i.e. the logo looked
half-size everywhere. The icons had the same disease: the mountain mark was
24% of the 512 tile height, so a 16px browser tab showed a ~4px smudge.

Nothing was resized by hand to fix that -- every output below is derived from
the masters in `assets/brand/`, so the geometry is exact and the whole set can
be rebuilt reproducibly.

Outputs (8 files):
    public/logo.png                     1240x500  trimmed, zero padding
    public/logo-dark.png                1240x500  same geometry, dark variant
    src/app/icon.png                     512x512  browser / PWA icon
    public/android-chrome-512x512.png    512x512  (byte-identical to icon.png)
    public/android-chrome-192x192.png    192x192
    public/android-chrome-maskable-512x512.png  512x512  full-bleed, maskable
    src/app/apple-icon.png               180x180  OPAQUE, full-bleed (see below)
    src/app/favicon.ico              16 + 32 + 48  multi-entry, PNG-compressed

The logo's declared size in JSX is width={124} height={50} -- exactly 1/10th
of the master, so the declared aspect matches the file's aspect exactly and
Next's srcset lands on the 128w/256w `imageSizes` rungs instead of the 640w
`deviceSizes` rung (this app's optimizer runs on a single-vCPU box where cold
transforms cost 1.1-2.3s, so the rung actually matters).
"""

from __future__ import annotations

import struct
import sys
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ModuleNotFoundError:  # not a JS dependency, so nothing in package.json pins it
    sys.exit("this script needs Pillow:  python3 -m pip install --user Pillow")

ROOT = Path(__file__).resolve().parent.parent

MASTER_LIGHT = ROOT / "assets/brand/logo-master.png"
MASTER_DARK = ROOT / "assets/brand/logo-dark-master.png"

# --- logo -------------------------------------------------------------------
# 1240x500 is 10x the declared JSX size, so declared aspect == file aspect
# exactly. The artwork's true aspect is 2503/1008 = 2.48313; 1240/500 = 2.48,
# a 0.13% resample -- 0.6px on a 500px master, well below the original's own
# edge antialiasing, and worth it to keep declared and actual ratios identical.
LOGO_W, LOGO_H = 1240, 500

# --- icon chip --------------------------------------------------------------
# Solid brand blue (already `theme_color` in src/app/manifest.ts) with the
# mountain knocked out in white. Chosen over a transparent icon because the
# mark is 3.6:1 -- at a 16px tab that is ~4px of vertical space, so scaling the
# bare mark up yields a wider blur, not a clearer icon. A filled tile reads as
# a solid shape at 16px and holds contrast on light AND dark tab strips.
CHIP_RGB = (37, 99, 235)  # #2563EB
MARK_RGB = (255, 255, 255)

SUPERSAMPLE = 8  # render large, LANCZOS down -- clean edges on the rounded rect


def load_master(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"missing brand master: {path.relative_to(ROOT)}")
    return Image.open(path).convert("RGBA")


def trim(im: Image.Image) -> Image.Image:
    """Crop to the non-transparent bounding box."""
    bbox = im.getchannel("A").getbbox()
    if bbox is None:
        sys.exit("master image is fully transparent")
    return im.crop(bbox)


def split_mark(im: Image.Image) -> Image.Image:
    """Return just the mountain mark, above the wordmark.

    Found by locating the widest fully-transparent horizontal band inside the
    trimmed artwork rather than by hardcoded coordinates, so this keeps working
    if the master is ever re-exported at a different resolution.
    """
    art = trim(im)
    alpha = art.getchannel("A")
    w, h = art.size
    ink = [any(alpha.getpixel((x, y)) > 8 for x in range(0, w, 3)) for y in range(h)]

    runs, start = [], None
    for y, has_ink in enumerate(ink):
        if not has_ink and start is None:
            start = y
        elif has_ink and start is not None:
            runs.append((start, y))
            start = None
    if start is not None:
        runs.append((start, h))

    interior = [r for r in runs if r[0] > 0 and r[1] < h]
    if not interior:
        sys.exit("could not find the gap between the mark and the wordmark")
    gap = max(interior, key=lambda r: r[1] - r[0])
    mark = trim(art.crop((0, 0, w, gap[0])))

    # Fail loudly rather than silently shipping the wrong half. The band above
    # the widest gap is the mark only while the master keeps its current
    # stacked layout; re-export it with the wordmark on top (aspect ~6.2) and
    # this would otherwise return the wordmark as the favicon with no error.
    aspect = mark.width / mark.height
    if not 3.0 <= aspect <= 4.3:
        sys.exit(
            f"extracted mark has aspect {aspect:.2f}, expected ~3.60 -- the "
            "master's layout changed; check assets/brand/ before regenerating"
        )
    return mark


def whiten(mark: Image.Image) -> Image.Image:
    """Flatten the two-tone mark to solid white, keeping its alpha edges.

    Both tones must go white: the mark's own blue is the same #2563EB as the
    chip, so leaving it would make that peak vanish into the background.
    """
    out = Image.new("RGBA", mark.size, MARK_RGB + (255,))
    out.putalpha(mark.getchannel("A"))
    return out


def chip(
    mark: Image.Image, size: int, *, full_bleed: bool = False, frac: float | None = None
) -> Image.Image:
    """Render one square icon at `size` px."""
    # Small tiles get a slightly larger mark and tighter corners -- at 16px a
    # 22% radius eats the usable area and the mark has nowhere to go.
    #
    # Measured limit, so nobody re-litigates it: the mark is 3.6:1, so at 16px
    # it is ~4px tall and its strokes land below one pixel. The white never
    # fully resolves there (peak luminance 193/255 at frac 0.80; raising frac
    # to 0.92 only reaches 210 and costs the tile its margin). At 16px the
    # solid blue chip is what carries recognition, not the mountain -- which is
    # the whole reason this is a filled tile instead of a bare mark.
    if size <= 16:
        default_frac, radius = 0.80, 0.18
    elif size <= 32:
        default_frac, radius = 0.76, 0.20
    else:
        default_frac, radius = 0.72, 0.22
    frac = default_frac if frac is None else frac

    n = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    if full_bleed:
        # iOS applies its own squircle mask to apple-touch-icon and composites
        # any transparency onto black, so this one must be an opaque square
        # with no corner rounding of its own -- otherwise you get a rounded
        # rect inside a squircle, or a black home-screen tile.
        canvas.paste(CHIP_RGB + (255,), (0, 0, n, n))
    else:
        ImageDraw.Draw(canvas).rounded_rectangle(
            [0, 0, n - 1, n - 1], radius=round(n * radius), fill=CHIP_RGB + (255,)
        )

    mw = round(n * frac)
    mh = round(mw * mark.height / mark.width)
    canvas.alpha_composite(
        mark.resize((mw, mh), Image.LANCZOS), ((n - mw) // 2, (n - mh) // 2)
    )
    return canvas.resize((size, size), Image.LANCZOS)


def png_bytes(im: Image.Image) -> bytes:
    buf = BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build_ico(images: list[Image.Image]) -> bytes:
    """Assemble a multi-entry .ico from already-rendered exact-size PNGs.

    Written by hand rather than via PIL's `sizes=` because that resamples one
    source image for every entry; each entry here is rendered independently at
    its target size (with its own mark fraction and corner radius above), which
    is the whole point of a multi-entry icon.
    """
    blobs = [png_bytes(im) for im in images]
    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = len(header) + 16 * len(blobs)
    entries, payload = b"", b""
    for im, blob in zip(images, blobs):
        entries += struct.pack(
            "<BBBBHHII",
            im.width if im.width < 256 else 0,
            im.height if im.height < 256 else 0,
            0, 0, 1, 32,
            len(blob),
            offset,
        )
        payload += blob
        offset += len(blob)
    return header + entries + payload


def decoded_frames(data: bytes) -> list[tuple[tuple[int, int], str, bytes]]:
    """Decode an asset to comparable pixel content.

    `--check` must not compare raw file bytes: PNG output depends on the Pillow
    and zlib versions doing the encoding, so a byte comparison reports STALE on
    a machine whose encoder merely differs, while the pixels are identical.
    Comparing decoded frames answers the question actually being asked -- "do
    the committed assets still match what the masters produce?"
    """
    if data[:4] == b"\x00\x00\x01\x00":  # ICO: compare every entry
        count = struct.unpack("<H", data[4:6])[0]
        frames = []
        for i in range(count):
            off = 6 + i * 16
            length = struct.unpack("<I", data[off + 8 : off + 12])[0]
            start = struct.unpack("<I", data[off + 12 : off + 16])[0]
            sub = Image.open(BytesIO(data[start : start + length]))
            frames.append((sub.size, sub.mode, sub.convert("RGBA").tobytes()))
        return frames
    im = Image.open(BytesIO(data))
    return [(im.size, im.mode, im.convert("RGBA").tobytes())]


def main() -> None:
    check = "--check" in sys.argv

    light = load_master(MASTER_LIGHT)
    dark = load_master(MASTER_DARK)

    logo_l = trim(light).resize((LOGO_W, LOGO_H), Image.LANCZOS)
    logo_d = trim(dark).resize((LOGO_W, LOGO_H), Image.LANCZOS)
    if logo_l.size != logo_d.size:
        sys.exit("light and dark logos must share identical dimensions")

    # The icon mark comes from the dark master: its two tones are blue + white,
    # so whitening it keeps the mountain silhouette intact. The light master's
    # navy peak would whiten to the same flat shape, but the dark one is the
    # variant actually drawn for a coloured background.
    mark = whiten(split_mark(dark))

    icon512 = chip(mark, 512)
    outputs: list[tuple[Path, bytes, str]] = [
        (ROOT / "public/logo.png", png_bytes(logo_l), f"{LOGO_W}x{LOGO_H}"),
        (ROOT / "public/logo-dark.png", png_bytes(logo_d), f"{LOGO_W}x{LOGO_H}"),
        (ROOT / "src/app/icon.png", png_bytes(icon512), "512x512"),
        (ROOT / "public/android-chrome-512x512.png", png_bytes(icon512), "512x512"),
        (ROOT / "public/android-chrome-192x192.png", png_bytes(chip(mark, 192)), "192x192"),
        # Maskable: Android crops this to the launcher's own shape, so it must
        # be full-bleed with the mark inside the central 80% safe circle. For a
        # 3.6:1 mark the widest fraction that still fits that circle is 0.77;
        # 0.66 leaves optical margin. Without a maskable entry Android treats
        # the "any" icon as a sticker and drops the rounded blue tile onto a
        # white circle.
        (ROOT / "public/android-chrome-maskable-512x512.png",
         png_bytes(chip(mark, 512, full_bleed=True, frac=0.66)), "512x512 maskable"),
        (ROOT / "src/app/apple-icon.png",
         png_bytes(chip(mark, 180, full_bleed=True).convert("RGB")), "180x180 opaque"),
        (ROOT / "src/app/favicon.ico",
         build_ico([chip(mark, s) for s in (16, 32, 48)]), "16+32+48"),
    ]

    failed = False
    for path, data, label in outputs:
        rel = path.relative_to(ROOT)
        if check:
            try:
                ok = path.exists() and decoded_frames(path.read_bytes()) == decoded_frames(data)
            except Exception:
                ok = False  # unreadable/corrupt on disk counts as stale
            failed |= not ok
            print(f"{'ok   ' if ok else 'STALE'} {rel}  {label}")
        else:
            path.write_bytes(data)
            print(f"wrote {rel}  {label}  {len(data)} bytes")

    if check and failed:
        sys.exit("brand assets are stale -- run: python3 scripts/gen-brand-assets.py")


if __name__ == "__main__":
    main()
