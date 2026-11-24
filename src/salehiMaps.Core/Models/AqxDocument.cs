namespace salehiMaps.Core.Models;

public sealed class AqxDocument
{
    public int Version { get; set; }
    public int Revision { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string Copyright { get; set; } = string.Empty;

    public IDictionary<string, string> Parameters { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    public IList<MapSource> Sources { get; } = new List<MapSource>();
    public IList<MapSource> Composites { get; } = new List<MapSource>();

    public IEnumerable<MapSource> AllSources => Sources.Concat(Composites);
}
