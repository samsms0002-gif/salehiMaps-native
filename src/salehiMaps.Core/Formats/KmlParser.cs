using System.Globalization;
using System.Xml.Linq;
using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Minimal KML reader for Point and LineString placemarks.
/// </summary>
public static class KmlParser
{
    public static IReadOnlyList<Waypoint> ParseWaypoints(Stream stream)
    {
        XDocument doc = XDocument.Load(stream);
        XElement? root = doc.Root;
        if (root == null || root.Name.LocalName != "kml")
            throw new InvalidDataException("Not a KML document.");

        var result = new List<Waypoint>();
        foreach (XElement placemark in root.Descendants().Where(e => e.Name.LocalName == "Placemark"))
        {
            string name = Text(placemark, "name");
            string desc = Text(placemark, "description");

            foreach (XElement point in placemark.Descendants().Where(e => e.Name.LocalName == "Point"))
            {
                string? coords = Text(point, "coordinates");
                if (TryFirstCoordinate(coords, out double lon, out double lat))
                    result.Add(new Waypoint(lon, lat, name, desc));
            }
        }
        return result;
    }

    public static IReadOnlyList<Track> ParseTracks(Stream stream)
    {
        XDocument doc = XDocument.Load(stream);
        XElement? root = doc.Root;
        if (root == null || root.Name.LocalName != "kml")
            throw new InvalidDataException("Not a KML document.");

        var result = new List<Track>();
        foreach (XElement placemark in root.Descendants().Where(e => e.Name.LocalName == "Placemark"))
        {
            foreach (XElement line in placemark.Descendants().Where(e => e.Name.LocalName == "LineString"))
            {
                string coords = Text(line, "coordinates");
                var points = new List<Waypoint>();
                foreach (string tuple in coords.Split(new[] { ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    string[] parts = tuple.Split(',');
                    if (parts.Length < 2
                        || !double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out double lon)
                        || !double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out double lat))
                        continue;

                    double? ele = parts.Length >= 3
                                  && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out double z)
                        ? z
                        : null;
                    points.Add(new Waypoint(lon, lat, Text(placemark, "name"), Text(placemark, "description"), ele));
                }

                if (points.Count > 0)
                    result.Add(new Track(Text(placemark, "name"), points));
            }
        }
        return result;
    }

    private static bool TryFirstCoordinate(string? coords, out double lon, out double lat)
    {
        lon = lat = 0;
        if (string.IsNullOrWhiteSpace(coords))
            return false;

        string first = coords.Split(new[] { ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
        string[] parts = first.Split(',');
        return parts.Length >= 2
               && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out lon)
               && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out lat);
    }

    private static string Text(XElement parent, string localName)
        => parent.Elements().FirstOrDefault(e => e.Name.LocalName == localName)?.Value?.Trim() ?? string.Empty;
}
