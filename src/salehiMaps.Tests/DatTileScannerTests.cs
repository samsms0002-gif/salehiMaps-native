using System.Buffers.Binary;
using salehiMaps.Core.Formats;
using salehiMaps.Core.Models;
using Xunit;

namespace salehiMaps.Tests;

public class DatTileScannerTests
{
    [Fact]
    public void Scan_ParsesSyntheticDatTiles()
    {
        // Arrange
        string path = Path.Combine(Path.GetTempPath(), $"salehimaps-{Guid.NewGuid():N}.DAT");
        try
        {
            var expected = new[]
            {
                new TileRef(8, 6, 4, 65, 80, TileFormat.Jpeg),
                new TileRef(8, 7, 4, 206, 80, TileFormat.Jpeg)
            };
            File.WriteAllBytes(path, BuildDat(expected));

            // Act
            var tiles = DatTileScanner.Scan(path);

            // Assert
            Assert.Equal(2, tiles.Count);
            Assert.Equal(expected[0].Key, tiles[0].Key);
            Assert.Equal(expected[0].Offset, tiles[0].Offset);
            Assert.Equal(expected[0].Length, tiles[0].Length);
            Assert.Equal(TileFormat.Jpeg, tiles[0].Format);
            Assert.Equal(expected[1].Key, tiles[1].Key);
            Assert.Equal(expected[1].Offset, tiles[1].Offset);
            Assert.Equal(expected[1].Length, tiles[1].Length);
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }

    private static byte[] BuildDat(IReadOnlyList<TileRef> tiles)
    {
        // First tile image starts at 65, leaving 4 zero bytes + 61-byte header.
        using var ms = new MemoryStream();
        ms.Write(new byte[4]);

        foreach (var tile in tiles)
        {
            var header = new byte[61];
            header[0] = 0x01;
            WriteUInt24BE(header, 2, tile.X);
            WriteUInt24BE(header, 6, tile.Y);
            WriteUInt24BE(header, 10, tile.Z);
            WriteUInt32BE(header, 17, (uint)(tile.Length - 64));
            WriteUInt24BE(header, 21, 0x000001);
            header[24] = 0xA1;

            var payload = new byte[tile.Length];
            payload[0] = 0xFF;
            payload[1] = 0xD8;
            payload[2] = 0xFF;
            payload[^2] = 0xFF;
            payload[^1] = 0xD9;

            ms.Write(header);
            ms.Write(payload);
        }

        return ms.ToArray();
    }

    private static void WriteUInt24BE(byte[] b, int offset, int value)
    {
        b[offset] = (byte)(value >> 16);
        b[offset + 1] = (byte)(value >> 8);
        b[offset + 2] = (byte)value;
    }

    private static void WriteUInt32BE(byte[] b, int offset, uint value)
        => BinaryPrimitives.WriteUInt32BigEndian(b.AsSpan(offset, 4), value);
}
