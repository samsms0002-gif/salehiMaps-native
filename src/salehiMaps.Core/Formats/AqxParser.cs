using System.Globalization;
using System.Xml.Linq;
using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Reads AQX map definition XML. Behavior follows the documented structure
/// observed in the reference application, but the implementation is original.
/// </summary>
public static class AqxParser
{
    public static AqxDocument Parse(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        return Parse(stream);
    }

    public static AqxDocument Parse(Stream stream)
    {
        var doc = XDocument.Load(stream, LoadOptions.PreserveWhitespace);
        var root = doc.Root;
        if (root == null || !string.Equals(root.Name.LocalName, "aqx", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Not an AQX document.");

        int version = ParseInt(root.Attribute("version")?.Value, 0);
        if (version > 13)
            throw new InvalidDataException($"Unsupported AQX version {version}; maximum supported is 13.");

        var result = new AqxDocument
        {
            Version = version,
            Revision = ParseInt(root.Attribute("revision")?.Value, 0),
            Name = ElementText(root, "name"),
            Description = ElementText(root, "description"),
            Region = ElementText(root, "region"),
            Copyright = ElementText(root, "copyright")
        };

        foreach (var param in root.Elements().Where(e => e.Name.LocalName == "param"))
        {
            string? name = param.Attribute("name")?.Value;
            if (!string.IsNullOrWhiteSpace(name))
                result.Parameters[name] = param.Value.Trim();
        }

        foreach (var source in root.Elements().Where(e => e.Name.LocalName == "source"))
            result.Sources.Add(ParseSource(source, result.Parameters));

        foreach (var composite in root.Elements().Where(e => e.Name.LocalName == "composite-source"))
            result.Composites.Add(ParseComposite(composite));

        return result;
    }

    private static MapSource ParseSource(XElement element, IDictionary<string, string> parameters)
    {
        var source = new MapSource
        {
            Id = Attr(element, "id"),
            IsLayer = ParseBool(Attr(element, "layer"), ParseBool(Attr(element, "islayer"))),
            IsHd = ParseBool(Attr(element, "hd")),
            IsVisible = ParseBool(Attr(element, "visible"), true),
            IsDeprecated = ParseBool(Attr(element, "deprecated")),
            AllowExport = ParseBool(Attr(element, "allow-export")),
            AllowBulkDownload = ParseBool(Attr(element, "allow-bulk-download")),
            FillWithPreviousLevels = ParseBool(Attr(element, "fill-with-previous-levels")),
            Opacity = ParseInt(Attr(element, "opacity"), 255),
            Blending = Attr(element, "blending"),
            Logo = Attr(element, "logo"),
            Type = Attr(element, "type"),
            Region = Attr(element, "region"),
            Underscales = ParseInt(Attr(element, "underscales"), -1),
            Overscales = ParseInt(Attr(element, "overscales"), -1),
            CacheExpiration = ParseLong(Attr(element, "cache-expiration"), 0),
            Name = ElementText(element, "name"),
            Description = ElementText(element, "description"),
            Copyright = ElementText(element, "copyright"),
            DataSource = ElementText(element, "data-source")
        };

        foreach (var attr in element.Attributes())
            source.Attributes[attr.Name.LocalName] = attr.Value;

        string preview = ElementText(element, "preview-location");
        if (!string.IsNullOrWhiteSpace(preview))
        {
            var parts = preview.Split(',', StringSplitOptions.TrimEntries);
            if (parts.Length >= 3
                && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out double lon)
                && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out double lat)
                && int.TryParse(parts[2], out int zoom))
            {
                source.PreviewLon = lon;
                source.PreviewLat = lat;
                source.PreviewZoom = zoom;
                source.HasPreviewLocation = true;
            }
        }

        foreach (var level in element.Elements().Where(IsZoomElement))
        {
            foreach (int z in ParseZoomList(Attr(level, "z")))
                if (!source.ZoomLevels.Contains(z))
                    source.ZoomLevels.Add(z);

            foreach (var server in level.Elements().Where(e => e.Name.LocalName == "server"))
            {
                string template = server.Value.Trim();
                if (template.Length > 0)
                    source.ServerTemplates.Add(ExpandStaticVariables(template, parameters));
            }
        }

        ((List<int>)source.ZoomLevels).Sort();
        return source;
    }

    private static MapSource ParseComposite(XElement element)
    {
        var source = new MapSource
        {
            Id = Attr(element, "id"),
            Name = ElementText(element, "name"),
            Type = Attr(element, "type"),
            Region = Attr(element, "region"),
            IsLayer = ParseBool(Attr(element, "layer"), ParseBool(Attr(element, "islayer"))),
            IsVisible = !ParseBool(Attr(element, "visible"), true) ? false : true
        };

        foreach (var layer in element.Elements().Where(e => e.Name.LocalName == "layer"))
        {
            string id = Attr(layer, "id");
            if (id.Length > 0)
                source.LayerIds.Add(id);
        }

        return source;
    }

    private static bool IsZoomElement(XElement e)
    {
        string n = e.Name.LocalName;
        return n is "level" or "zoom-level" or "zoom-levels" or "zoom-values";
    }

    public static IEnumerable<int> ParseZoomList(string? spec)
    {
        if (string.IsNullOrWhiteSpace(spec))
            yield break;

        var seen = new HashSet<int>();
        foreach (string rawPart in spec.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            string part = rawPart.Trim();
            if (part.Length == 0)
                continue;

            int dash = part.IndexOf('-');
            if (dash > 0 && dash < part.Length - 1)
            {
                if (int.TryParse(part[..dash], out int from) && int.TryParse(part[(dash + 1)..], out int to))
                {
                    if (from > to)
                        (from, to) = (to, from);
                    for (int z = from; z <= to; z++)
                        if (seen.Add(z))
                            yield return z;
                    continue;
                }
            }

            if (int.TryParse(part, out int single) && seen.Add(single))
                yield return single;
        }
    }

    private static string ExpandStaticVariables(string template, IDictionary<string, string> parameters)
    {
        foreach (var pair in parameters)
            template = template.Replace("{$param:" + pair.Key + "}", pair.Value, StringComparison.OrdinalIgnoreCase);

        // Variables that depend on a concrete tile are expanded by UrlTemplate.Expand.
        return template;
    }

    private static string Attr(XElement e, string name)
        => e.Attribute(name)?.Value?.Trim() ?? string.Empty;

    private static string ElementText(XElement parent, string name)
        => parent.Elements().FirstOrDefault(e => e.Name.LocalName == name)?.Value?.Trim() ?? string.Empty;

    private static bool ParseBool(string? value, bool defaultValue = false)
    {
        if (string.IsNullOrWhiteSpace(value))
            return defaultValue;
        if (value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1")
            return true;
        if (value.Equals("false", StringComparison.OrdinalIgnoreCase) || value == "0")
            return false;
        return defaultValue;
    }

    private static int ParseInt(string? value, int defaultValue)
        => int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int result) ? result : defaultValue;

    private static long ParseLong(string? value, long defaultValue)
        => long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out long result) ? result : defaultValue;
}
