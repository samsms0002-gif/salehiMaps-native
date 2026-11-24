using System.Text.Json;
using System.Text.Json.Serialization;

namespace salehiMaps.Core;

/// <summary>
/// Persisted map view state, equivalent in purpose to a workspace file.
/// </summary>
public sealed class WorkspaceState
{
    public double CenterLon { get; set; } = 5.90;
    public double CenterLat { get; set; } = 44.80;
    public int Zoom { get; set; } = 4;
    public double Rotation { get; set; }
    public double Opacity { get; set; } = 1.0;
    public string CoordinateSystem { get; set; } = "WGS84";
    public IList<string> ActiveLayers { get; } = new List<string>();
    public IDictionary<string, string> Settings { get; } = new Dictionary<string, string>();

    public static WorkspaceState Load(string path)
    {
        if (!File.Exists(path))
            return new WorkspaceState();

        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            };
            return JsonSerializer.Deserialize<WorkspaceState>(File.ReadAllText(path), options) ?? new WorkspaceState();
        }
        catch
        {
            return new WorkspaceState();
        }
    }

    public void Save(string path)
    {
        string? dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var options = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(path, JsonSerializer.Serialize(this, options));
    }
}
