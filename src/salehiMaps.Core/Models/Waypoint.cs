namespace salehiMaps.Core.Models;

public sealed record Waypoint(
    double Lon,
    double Lat,
    string Name,
    string Description = "",
    double? Elevation = null,
    DateTimeOffset? Time = null);

public sealed record Track(
    string Name,
    IReadOnlyList<Waypoint> Points);
