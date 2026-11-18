#!/usr/bin/env python3
"""salehiMaps map converter (Python 3, standard library only).

Converts the original application's offline tile store (*.DAT) into a plain
XYZ folder that salehiMaps (and most other offline map apps) can read, and
converts MBTiles / GeoPackage databases into XYZ folders.

Examples
--------
  python3 tools/import_maps.py --inspect files/datastore/maps
  python3 tools/import_maps.py --dat files/datastore/maps/GOOGLE.AQX.GROADS.DAT \
                               --out maps/GOOGLE-GROADS
  python3 tools/import_maps.py --sql mymap.mbtiles --out maps/MYMAP --tms
"""
import argparse
import os
import struct
import sqlite3
import sys

PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPG_SIG = b"\xff\xd8\xff"


def iter_dat_tiles(path, progress_every=5000):
    """Yield (z, x, y, image_bytes) from an original All-In-One OfflineMaps .DAT.

    Record layout discovered from the supplied sample files:
      header (61 bytes before the image): 01 00 00 XX | x(24-bit BE) | y(24-bit BE)
                                          | z(byte @ +12) ... a1 c2 .. @ +24
      image: PNG (or JPEG), followed by zero padding until the next record.
    """
    size = os.path.getsize(path)
    chunk, overlap = 16 * 1024 * 1024, 128
    carry, base, positions = b"", 0, []
    with open(path, "rb") as fh:
        while True:
            data = fh.read(chunk)
            if not data:
                break
            buf = carry + data
            start = base - len(carry)
            pos = buf.find(PNG_SIG)
            while pos >= 0:
                positions.append(start + pos)
                pos = buf.find(PNG_SIG, pos + 1)
            carry = buf[-overlap:]
            base += len(data)
    positions.sort()
    with open(path, "rb") as fh:
        for i, p in enumerate(positions):
            fh.seek(p - 61)
            h = fh.read(32)
            if len(h) < 28 or h[0] != 1 or h[24] != 0xA1:
                continue
            x = (h[2] << 16) | (h[3] << 8) | h[4]
            y = (h[6] << 16) | (h[7] << 8) | h[8]
            z = h[12]
            if not (1 <= z <= 22):
                continue
            end = positions[i + 1] if i + 1 < len(positions) else size
            fh.seek(p)
            blob = fh.read(min(end - p, 4 * 1024 * 1024))
            # trim at IEND so trailing record padding is removed
            iend = blob.find(b"IEND")
            if iend >= 0:
                blob = blob[:iend + 8]
            yield z, x, y, blob
            if progress_every and (i + 1) % progress_every == 0:
                print(f"  … {i + 1}/{len(positions)}", flush=True)


def dat_to_xyz(dat, out, limit=None):
    os.makedirs(out, exist_ok=True)
    n = 0
    for z, x, y, blob in iter_dat_tiles(dat):
        d = os.path.join(out, str(z), str(x))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{y}.png"), "wb") as f:
            f.write(blob)
        n += 1
        if limit and n >= limit:
            break
    return n


def sql_to_xyz(db, out, tms=False, limit=None):
    con = sqlite3.connect(db)
    cur = con.cursor()
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    if "tiles" in tables:
        q = "SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles"
    elif "gpkg_tiles" in tables:
        q = "SELECT zoom_level, tile_column, tile_row, tile_data FROM gpkg_tiles"
    elif "tiles" not in tables and "gpkg_tiles" not in tables:
        raise SystemExit("No tiles/gpkg_tiles table found in " + db)
    os.makedirs(out, exist_ok=True)
    n = 0
    for z, x, row, blob in cur.execute(q):
        y = (1 << z) - 1 - row if tms else row
        d = os.path.join(out, str(z), str(x))
        os.makedirs(d, exist_ok=True)
        ext = "jpg" if blob[:2] == b"\xff\xd8" else ("webp" if blob[:4] == b"RIFF" else "png")
        with open(os.path.join(d, f"{y}.{ext}"), "wb") as f:
            f.write(blob)
        n += 1
        if limit and n >= limit:
            break
    con.close()
    return n


def inspect(folder):
    for root, _dirs, files in os.walk(folder):
        for name in sorted(files):
            p = os.path.join(root, name)
            try:
                size = os.path.getsize(p)
            except OSError:
                continue
            kind = name.split(".")[-1].upper()
            if kind == "DAT" and size:
                with open(p, "rb") as fh:
                    fh.seek(0)
                    h = fh.read(32)
                z = h[12] if len(h) > 12 else 0
                x = (h[2] << 16) | (h[3] << 8) | h[4]
                y = (h[6] << 16) | (h[7] << 8) | h[8]
                print(f"DAT  {kind:9s} {size/1048576:10.1f} MB  first tile z{z}/x{x}/y{y}  {p}")
            else:
                print(f"     {kind:9s} {size/1048576:10.1f} MB  {p}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dat", help="original .DAT tile store to convert")
    ap.add_argument("--sql", help="MBTiles / GeoPackage database to convert")
    ap.add_argument("--out", help="output XYZ folder")
    ap.add_argument("--inspect", metavar="FOLDER", help="list files in the original data folder")
    ap.add_argument("--tms", action="store_true", help="source row numbers are TMS (flip Y)")
    ap.add_argument("--limit", type=int, help="maximum number of tiles (for testing)")
    a = ap.parse_args()
    if a.inspect:
        inspect(a.inspect)
        return
    if not ((a.dat or a.sql) and a.out):
        ap.error("provide --dat or --sql together with --out")
    n = dat_to_xyz(a.dat, a.out, a.limit) if a.dat else sql_to_xyz(a.sql, a.out, a.tms, a.limit)
    print(f"Done: {n} tiles written to {a.out}")


if __name__ == "__main__":
    sys.exit(main())
