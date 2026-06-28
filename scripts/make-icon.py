"""生成 1024×1024 蓝色水滴占位 PNG（#4A9EFF）。

后续: npx @tauri-apps/cli icon icons/source.png 自动生成 32/128/128@2x/.icns/.ico
"""

import struct
import zlib
import os
import math

SIZE = 1024
COLOR = (0x4A, 0x9E, 0xFF, 0xFF)  # RGBA #4A9EFF


def make_png(path: str, size: int):
    cx, cy = size / 2, size / 2
    r = size * 0.42  # 圆半径
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter byte (None)
        for x in range(size):
            dx, dy = x - cx + 0.5, y - cy + 0.5
            d = math.hypot(dx, dy)
            if d < r - 1:
                raw.extend(COLOR)
            elif d < r:
                a = int(max(0, min(255, (r - d) * 255)))
                raw.extend((COLOR[0], COLOR[1], COLOR[2], a))
            else:
                raw.extend((0, 0, 0, 0))
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    iend = chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(sig + ihdr + idat + iend)
    print(f"  wrote {path} ({size}x{size}, {os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "src-tauri", "icons", "source.png")
    out = os.path.normpath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    print(f"Generating {out} ...")
    make_png(out, SIZE)
    print("Done.")
