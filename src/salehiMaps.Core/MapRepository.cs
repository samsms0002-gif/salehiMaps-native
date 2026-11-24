using salehiMaps.Core.Formats;
using salehiMaps.Core.Models;

namespace salehiMaps.Core;

public sealed class MapDataSet
{
    public required string Id { get; init; }
    public string Name { get; set; } = string.Empty;
    public string AqxPath { get; set; } = string.Empty;
    public string AqbPath { get; set; } = string.Empty;
    public string PreviewPath { get; set; } = string.Empty;
    public IList<string> DatPaths { get; } = new List<string>();
    public IList<string> IdxPaths { get; } = new List<string>();
    public IList<MapSource> Sources { get; } = new List<MapSource>();
}

/// <summary>
/// Discovers map files and pairs DAT/IDX/PREVIEW files with their AQX/AQB
/// definition using the longest matching filename prefix.
/// </summary>
public sealed class MapRepository
{
    private readonly string _root;

    public MapRepository(string root)
    {
        _root = root;
    }

    public IReadOnlyList<MapDataSet> Discover()
    {
        if (!Directory.Exists(_root))
            return Array.Empty<MapDataSet>();

        string[] files = Directory.EnumerateFiles(_root, "*", SearchOption.AllDirectories).ToArray();
        var byId = new Dictionary<string, MapDataSet>(StringComparer.OrdinalIgnoreCase);

        MapDataSet Get(string id)
        {
            if (!byId.TryGetValue(id, out var set))
            {
                set = new MapDataSet { Id = id, Name = id };
                byId[id] = set;
            }
            return set;
        }

        // First pass: definitions.
        foreach (string file in files)
        {
            string name = Path.GetFileName(file);
            string ext = Path.GetExtension(file);

            if (ext.Equals(".aqx", StringComparison.OrdinalIgnoreCase))
            {
                var set = Get(name[..^ext.Length]);
                set.AqxPath = file;
                try
                {
                    var doc = AqxParser.Parse(file);
                    set.Name = doc.Name;
                    foreach (var source in doc.Sources)
                        set.Sources.Add(source);
                    foreach (var composite in doc.Composites)
                        set.Sources.Add(composite);
                }
                catch
                {
                    // Keep the dataset visible even if its XML is damaged.
                }
            }
            else if (ext.Equals(".aqb", StringComparison.OrdinalIgnoreCase))
            {
                Get(name[..^ext.Length]).AqbPath = file;
            }
        }

        // Second pass: data files, matched against known definition ids.
        foreach (string file in files)
        {
            string name = Path.GetFileName(file);
            string ext = Path.GetExtension(file);
            bool isData = ext.Equals(".dat", StringComparison.OrdinalIgnoreCase)
                          || ext.Equals(".idx", StringComparison.OrdinalIgnoreCase)
                          || ext.Equals(".preview", StringComparison.OrdinalIgnoreCase);
            if (!isData)
                continue;

            string stem = name[..^ext.Length];
            string id = FindBestId(stem, byId.Keys) ?? StripDataSuffix(stem);
            var set = Get(id);

            if (ext.Equals(".dat", StringComparison.OrdinalIgnoreCase))
                set.DatPaths.Add(file);
            else if (ext.Equals(".idx", StringComparison.OrdinalIgnoreCase))
                set.IdxPaths.Add(file);
            else
                set.PreviewPath = file;
        }

        return byId.Values
            .OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? FindBestId(string stem, IEnumerable<string> ids)
    {
        string? best = null;
        foreach (string id in ids)
        {
            if (stem.StartsWith(id + ".", StringComparison.OrdinalIgnoreCase)
                && (best == null || id.Length > best.Length))
                best = id;
        }
        return best;
    }

    private static string StripDataSuffix(string name)
    {
        int lastDot = name.LastIndexOf('.');
        if (lastDot <= 0)
            return name;

        string tail = name[(lastDot + 1)..];
        bool looksLikeHash = tail.Length >= 6 && tail.All(char.IsLetterOrDigit);
        return looksLikeHash ? name[..lastDot] : name;
    }
}
