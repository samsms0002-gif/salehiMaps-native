using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Indexes DAT tiles and serves tile bytes, with parent-level fallback when a
/// requested zoom level is not covered by the local file.
/// </summary>
public sealed class DatTileProvider
{
    private readonly string _datPath;
    private readonly Dictionary<string, TileRef> _tiles;

    public DatTileProvider(string datPath, IReadOnlyList<TileRef> tiles)
    {
        _datPath = datPath;
        _tiles = new Dictionary<string, TileRef>(StringComparer.Ordinal);
        foreach (var tile in tiles)
            _tiles[tile.Key] = tile;
    }

    public int TileCount => _tiles.Count;

    public IEnumerable<int> ZoomLevels => _tiles.Values.Select(t => t.Z).Distinct().OrderBy(z => z);

    public bool TryGetTile(int x, int y, int z, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        TileRef? tile = FindTileWithFallback(x, y, z);
        if (tile == null)
            return false;

        bytes = DatTileScanner.ReadTile(_datPath, tile);
        return true;
    }

    public TileRef? FindTileWithFallback(int x, int y, int z)
    {
        int cx = x;
        int cy = y;
        int cz = z;

        while (cz >= 0)
        {
            string key = $"{cz}/{cx}/{cy}";
            if (_tiles.TryGetValue(key, out var found))
                return found;

            if (cz == 0)
                break;

            cx >>= 1;
            cy >>= 1;
            cz--;
        }

        return null;
    }
}
