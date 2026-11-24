#!/usr/bin/env python3
"""Generate salehiMaps PNG icons with the Python standard library only."""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "icons")


def png(size, path):
    px = bytearray()
    cx = cy = size / 2
    r = size * 0.42
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < r * 0.16:
                c = (255, 235, 110)
            elif abs(abs(x - cx) - abs(y - cy)) < size * 0.035 and d < r:
                c = (240, 250, 255)
            elif d < r:
                c = (79, 195, 247)
            elif d < r * 1.08:
                c = (230, 245, 255)
            else:
                c = (27, 58, 92)
            px += bytes(c)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(px[y * size * 3:(y + 1) * size * 3]) for y in range(size))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        png(s, os.path.join(OUT, f"icon-{s}.png"))
    print("Icons written to", OUT)
