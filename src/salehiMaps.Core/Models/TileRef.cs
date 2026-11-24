namespace salehiMaps.Core.Models;

public enum TileFormat
{
    Unknown,
    Jpeg,
    Png,
    WebP
}

public sealed record TileRef(
    int X,
    int Y,
    int Z,
    long Offset,
    int Length,
    TileFormat Format)
{
    public string Key => $"{Z}/{X}/{Y}";
}
