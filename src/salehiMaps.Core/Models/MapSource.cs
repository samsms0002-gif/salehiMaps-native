namespace salehiMaps.Core.Models;

/// <summary>
/// One source or composite layer declared by an AQX document.
/// </summary>
public sealed class MapSource
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string Copyright { get; set; } = string.Empty;
    public string DataSource { get; set; } = string.Empty;

    public bool IsLayer { get; set; }
    public bool IsHd { get; set; }
    public bool IsVisible { get; set; } = true;
    public bool IsDeprecated { get; set; }
    public bool AllowExport { get; set; }
    public bool AllowBulkDownload { get; set; }
    public bool FillWithPreviousLevels { get; set; }

    public int Opacity { get; set; } = 255;
    public string Blending { get; set; } = string.Empty;
    public string Logo { get; set; } = string.Empty;
    public int Underscales { get; set; } = -1;
    public int Overscales { get; set; } = -1;
    public long CacheExpiration { get; set; }

    public double PreviewLon { get; set; }
    public double PreviewLat { get; set; }
    public int PreviewZoom { get; set; }
    public bool HasPreviewLocation { get; set; }

    public IList<int> ZoomLevels { get; } = new List<int>();
    public IList<string> ServerTemplates { get; } = new List<string>();
    public IList<string> LayerIds { get; } = new List<string>();
    public IDictionary<string, string> Attributes { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}
