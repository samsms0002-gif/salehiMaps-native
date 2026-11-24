using System.Globalization;
using System.Xml.Linq;
using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Minimal GPX 1.0/1.1 reader for waypoints, routes and tracks.
/// </summary>
public static class GpxParser
{
    public static IReadOnlyList<Waypoint> ParseWaypoints(Stream stream)
    {
        XDocument doc = XDocument.Load(stream);
        XElement? root = doc.Root;
        if (root == null || root.Name.LocalName != "gpx")
            throw new InvalidDataException("Not a GPX document.");

        var result = new List<Waypoint>();
        foreach (XElement element in root.Descendants().Where(IsPointElement))
        {
            if (!TryReadPoint(element, out var point))
                continue;
            result.Add(point);
        }
        return result;
    }

    public static IReadOnlyList<Track> ParseTracks(Stream stream)
    {
        XDocument doc = XDocument.Load(stream);
        XElement? root = doc.Root;
        if (root == null || root.Name.LocalName != "gpx")
            throw new InvalidDataException("Not a GPX document.");

        var result = new List<Track>();
        foreach (XElement element in root.Descendants().Where(e => e.Name.LocalName is "trk" or "rte"))
        {
            var points = element.Descendants()
                .Where(IsPointElement)
                .Select(e => TryReadPoint(e, out var p) ? p : null)
                .Where(p => p != null)
                .Cast<Waypoint>()
                .ToList();

            if (points.Count > 0)
                result.Add(new Track(Text(element, "name"), points));
        }
        return result;
    }

    private static bool IsPointElement(XElement e)
        => e.Name.LocalName is "wpt" or "trkpt" or "rtept";

    private static bool TryReadPoint(XElement e, out Waypoint point)
    {
        point = null!;
        if (!TryDouble(e.Attribute("lat")?.Value, out double lat)
            || !TryDouble(e.Attribute("lon")?.Value, out double lon))
            return false;

        double? ele = TryDouble(Text(e, "ele"), out double elevation) ? elevation : null;
        DateTimeOffset? time = DateTimeOffset.TryParse(
            Text(e, "time"), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var t) ? t : null;

        point = new Waypoint(lon, lat, Text(e, "name"), Text(e, "desc"), ele, time);
        return true;
    }

    private static string Text(XElement parent, string localName)
        => parent.Elements().FirstOrDefault(e => e.Name.LocalName == localName)?.Value?.Trim() ?? string.Empty;

    private static bool TryDouble(string? value, out double result)
        => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out result);
}
