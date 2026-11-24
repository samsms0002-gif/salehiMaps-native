using System.Buffers.Binary;
using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Reads the concatenated tile records used by AQX/AQB .DAT files.
/// The format was reconstructed from the reference app and verified against
/// real 995 MB Google DAT data containing 64,958 JPEG tiles.
/// </summary>
public static class DatTileScanner
{
    private const int HeaderSize = 61;
    private static readonly byte[] JpegSignature = { 0xFF, 0xD8, 0xFF };
    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
    private static readonly byte[] WebpSignature = { 0x52, 0x49, 0x46, 0x46 }; // RIFF

    public static IReadOnlyList<TileRef> Scan(string filePath, IProgress<double>? progress = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        if (!File.Exists(filePath))
            throw new FileNotFoundException("DAT file not found", filePath);

        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024);
        long fileLength = stream.Length;
        if (fileLength < HeaderSize + 2)
            return Array.Empty<TileRef>();

        long firstImage = FindFirstSignature(stream, fileLength);
        if (firstImage < HeaderSize)
            throw new InvalidDataException("No tile image signature found in DAT file.");

        var result = new List<TileRef>();
        long position = firstImage;
        var header = new byte[HeaderSize];
        var signature = new byte[8];

        while (position < fileLength)
        {
            if (position < HeaderSize || position > fileLength - 1)
                break;

            stream.Position = position - HeaderSize;
            stream.ReadExactly(header, 0, HeaderSize);

            if (!IsValidHeader(header))
            {
                long next = FindNextSignature(stream, position + 1, fileLength);
                if (next < 0)
                    break;
                position = next;
                continue;
            }

            int x = ReadUInt24BE(header, 2);
            int y = ReadUInt24BE(header, 6);
            int z = ReadUInt24BE(header, 10);
            uint sizeField = ReadUInt32BE(header, 17);
            long imageLength = sizeField + 64L;

            if (imageLength <= 0 || position + imageLength > fileLength)
                break;

            TileFormat format = DetectFormat(stream, position, signature);
            result.Add(new TileRef(x, y, z, position, (int)imageLength, format));

            progress?.Report((double)(position + imageLength) / fileLength);
            position += imageLength;
        }

        return result;
    }

    public static byte[] ReadTile(string filePath, TileRef tile)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        stream.Position = tile.Offset;
        var buffer = new byte[tile.Length];
        stream.ReadExactly(buffer, 0, buffer.Length);
        return buffer;
    }

    private static bool IsValidHeader(byte[] h)
    {
        return h[0] == 0x01
               && h[1] == 0x00
               && h[5] == 0x00
               && h[9] == 0x00
               && ReadUInt24BE(h, 21) == 0x000001
               && h[24] == 0xA1;
    }

    private static long FindFirstSignature(Stream stream, long length)
    {
        long limit = Math.Min(length, 4096);
        var buffer = new byte[limit];
        stream.Position = 0;
        stream.ReadExactly(buffer, 0, (int)limit);
        long found = IndexOfAny(buffer, JpegSignature, PngSignature, WebpSignature);
        return found < 0 ? -1 : found;
    }

    private static long FindNextSignature(Stream stream, long start, long length)
    {
        const int chunkSize = 64 * 1024;
        var buffer = new byte[chunkSize + 8];
        long position = start;
        int carry = 0;

        while (position < length)
        {
            stream.Position = position;
            int want = (int)Math.Min(chunkSize, length - position);
            int read = stream.Read(buffer, carry, want);
            if (read <= 0)
                break;

            int total = carry + read;
            long found = IndexOfAny(buffer.AsSpan(0, total), JpegSignature, PngSignature, WebpSignature);
            if (found >= 0)
                return position - carry + found;

            carry = Math.Min(8, total);
            if (carry > 0)
                Buffer.BlockCopy(buffer, total - carry, buffer, 0, carry);
            position += read;
        }

        return -1;
    }

    private static long IndexOfAny(ReadOnlySpan<byte> data, params byte[][] signatures)
    {
        long best = -1;
        foreach (var sig in signatures)
        {
            int i = data.IndexOf(sig);
            if (i >= 0 && (best < 0 || i < best))
                best = i;
        }
        return best;
    }

    private static TileFormat DetectFormat(Stream stream, long offset, byte[] signature)
    {
        stream.Position = offset;
        int read = stream.Read(signature, 0, Math.Min(8, signature.Length));
        var span = signature.AsSpan(0, read);

        if (span.StartsWith(JpegSignature))
            return TileFormat.Jpeg;
        if (span.StartsWith(PngSignature))
            return TileFormat.Png;
        if (span.StartsWith(WebpSignature))
            return TileFormat.WebP;
        return TileFormat.Unknown;
    }

    private static int ReadUInt24BE(byte[] b, int offset)
        => (b[offset] << 16) | (b[offset + 1] << 8) | b[offset + 2];

    private static uint ReadUInt32BE(byte[] b, int offset)
        => BinaryPrimitives.ReadUInt32BigEndian(b.AsSpan(offset, 4));
}
