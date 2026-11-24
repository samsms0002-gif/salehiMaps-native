using System.Globalization;
using salehiMaps.Core.Models;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Reads simple landmark CSV files with optional headers.
/// Supported columns: lat/latitude/y, lon/lng/longitude/x, name/title, desc/description.
/// </summary>
public static class CsvParser
{
    public static IReadOnlyList<Waypoint> Parse(Stream stream)
    {
        using var reader = new StreamReader(stream);
        string? first = reader.ReadLine();
        if (first == null)
            return Array.Empty<Waypoint>();

        var firstFields = SplitLine(first);
        int latIndex = IndexOf(firstFields, "lat", "latitude", "y");
        int lonIndex = IndexOf(firstFields, "lon", "lng", "longitude", "x");
        int nameIndex = IndexOf(firstFields, "name", "title");
        int descIndex = IndexOf(firstFields, "desc", "description");

        bool hasHeader = latIndex >= 0 && lonIndex >= 0;
        if (!hasHeader)
        {
            latIndex = 0;
            lonIndex = firstFields.Count > 1 ? 1 : -1;
            nameIndex = firstFields.Count > 2 ? 2 : -1;
            descIndex = firstFields.Count > 3 ? 3 : -1;
        }

        var result = new List<Waypoint>();
        void Add(IReadOnlyList<string> fields)
        {
            if (lonIndex < 0 || latIndex < 0 || lonIndex >= fields.Count || latIndex >= fields.Count)
                return;
            if (!TryDouble(fields[latIndex], out double lat) || !TryDouble(fields[lonIndex], out double lon))
                return;

            string name = nameIndex >= 0 && nameIndex < fields.Count ? fields[nameIndex] : string.Empty;
            string desc = descIndex >= 0 && descIndex < fields.Count ? fields[descIndex] : string.Empty;
            result.Add(new Waypoint(lon, lat, name, desc));
        }

        if (hasHeader)
        {
            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                if (line.Trim().Length == 0)
                    continue;
                Add(SplitLine(line));
            }
        }
        else
        {
            Add(firstFields);
            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                if (line.Trim().Length == 0)
                    continue;
                Add(SplitLine(line));
            }
        }

        return result;
    }

    private static int IndexOf(IReadOnlyList<string> fields, params string[] names)
    {
        for (int i = 0; i < fields.Count; i++)
        {
            string value = fields[i].Trim().Trim('"');
            foreach (string name in names)
                if (value.Equals(name, StringComparison.OrdinalIgnoreCase))
                    return i;
        }
        return -1;
    }

    private static bool TryDouble(string value, out double result)
        => double.TryParse(value.Trim().Trim('"'), NumberStyles.Float, CultureInfo.InvariantCulture, out result);

    private static IReadOnlyList<string> SplitLine(string line)
    {
        var fields = new List<string>();
        var current = new System.Text.StringBuilder();
        bool quoted = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (quoted && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    quoted = !quoted;
                }
            }
            else if (c == ',' && !quoted)
            {
                fields.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        fields.Add(current.ToString());
        return fields;
    }
}
