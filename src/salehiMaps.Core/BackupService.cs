using System.IO.Compression;
using System.Text.Json;
using salehiMaps.Core.Models;

namespace salehiMaps.Core;

/// <summary>
/// Exports and restores a portable backup containing the workspace,
/// landmarks and plain-text settings files.
/// </summary>
public sealed class BackupService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public void Export(string sourceFolder, string outputZipPath,
        WorkspaceState? workspace = null, IEnumerable<Waypoint>? waypoints = null)
    {
        string? dir = Path.GetDirectoryName(outputZipPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        using var zip = ZipFile.Open(outputZipPath, ZipArchiveMode.Create);
        WriteJson(zip, "workspace.json", workspace ?? new WorkspaceState());
        WriteJson(zip, "waypoints.json", (waypoints ?? Array.Empty<Waypoint>()).ToList());

        if (!Directory.Exists(sourceFolder))
            return;

        foreach (string file in Directory.EnumerateFiles(sourceFolder))
        {
            string ext = Path.GetExtension(file);
            if (!ext.Equals(".conf", StringComparison.OrdinalIgnoreCase)
                && !ext.Equals(".json", StringComparison.OrdinalIgnoreCase)
                && !ext.Equals(".txt", StringComparison.OrdinalIgnoreCase))
                continue;

            zip.CreateEntryFromFile(file, "settings/" + Path.GetFileName(file));
        }
    }

    public ImportedBackup Import(string zipPath)
    {
        var workspace = new WorkspaceState();
        var waypoints = new List<Waypoint>();
        var settings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        using var zip = ZipFile.OpenRead(zipPath);
        foreach (var entry in zip.Entries)
        {
            if (entry.FullName == "workspace.json")
            {
                using var reader = new StreamReader(entry.Open());
                workspace = JsonSerializer.Deserialize<WorkspaceState>(reader.ReadToEnd(), JsonOptions) ?? workspace;
            }
            else if (entry.FullName == "waypoints.json")
            {
                using var reader = new StreamReader(entry.Open());
                waypoints = JsonSerializer.Deserialize<List<Waypoint>>(reader.ReadToEnd(), JsonOptions) ?? waypoints;
            }
            else if (entry.FullName.StartsWith("settings/", StringComparison.OrdinalIgnoreCase))
            {
                using var reader = new StreamReader(entry.Open());
                settings[Path.GetFileName(entry.FullName)] = reader.ReadToEnd();
            }
        }

        return new ImportedBackup(workspace, waypoints, settings);
    }

    private static void WriteJson<T>(ZipArchive zip, string name, T value)
    {
        var entry = zip.CreateEntry(name);
        using var writer = new StreamWriter(entry.Open());
        writer.Write(JsonSerializer.Serialize(value, JsonOptions));
    }
}

public sealed record ImportedBackup(
    WorkspaceState Workspace,
    IReadOnlyList<Waypoint> Waypoints,
    IReadOnlyDictionary<string, string> Settings);
