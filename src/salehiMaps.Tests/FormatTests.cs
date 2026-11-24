using System.Buffers.Binary;
using salehiMaps.Core;
using salehiMaps.Core.Formats;
using salehiMaps.Core.Models;
using Xunit;

namespace salehiMaps.Tests;

public class FormatTests
{
    [Fact]
    public void DatTileProvider_FallsBackToParentZoom()
    {
        string path = Path.Combine(Path.GetTempPath(), $"salehimaps-provider-{Guid.NewGuid():N}.DAT");
        try
        {
            var tiles = new[] { new TileRef(2, 3, 2, 65, 80, TileFormat.Jpeg) };
            File.WriteAllBytes(path, BuildSingleTile(2, 3, 2));
            var provider = new DatTileProvider(path, tiles);

            Assert.True(provider.TryGetTile(5, 7, 3, out var bytes));
            Assert.Equal(80, bytes.Length);
            Assert.False(provider.TryGetTile(9, 9, 3, out _));
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Fact]
    public void GpxParser_ReadsWaypoints()
    {
        const string xml = """
        <gpx version="1.1">
          <wpt lat="44.8" lon="5.9"><name>Test</name><ele>123</ele></wpt>
        </gpx>
        """;
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(xml));
        var points = GpxParser.ParseWaypoints(stream);

        var point = Assert.Single(points);
        Assert.Equal(5.9, point.Lon, 6);
        Assert.Equal(44.8, point.Lat, 6);
        Assert.Equal("Test", point.Name);
        Assert.Equal(123.0, point.Elevation);
    }

    [Fact]
    public void KmlParser_ReadsPlacemarkPoint()
    {
        const string xml = """
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark><name>Home</name><Point><coordinates>5.9,44.8,10</coordinates></Point></Placemark>
        </kml>
        """;
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(xml));
        var points = KmlParser.ParseWaypoints(stream);

        var point = Assert.Single(points);
        Assert.Equal(5.9, point.Lon, 6);
        Assert.Equal(44.8, point.Lat, 6);
        Assert.Equal("Home", point.Name);
    }

    [Fact]
    public void CsvParser_ReadsHeaderedLandmarks()
    {
        const string csv = "lat,lon,name,description\n44.8,5.9,\"Test Point\",A description\n";
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));
        var points = CsvParser.Parse(stream);

        var point = Assert.Single(points);
        Assert.Equal(5.9, point.Lon, 6);
        Assert.Equal(44.8, point.Lat, 6);
        Assert.Equal("Test Point", point.Name);
        Assert.Equal("A description", point.Description);
    }

    [Fact]
    public void Backup_RoundTripsWorkspaceAndWaypoints()
    {
        string root = Path.Combine(Path.GetTempPath(), $"salehimaps-backup-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        string zip = Path.Combine(root, "backup.zip");
        try
        {
            File.WriteAllText(Path.Combine(root, "user_settings.conf"), "theme=dark");

            var workspace = new WorkspaceState { CenterLon = 7.1, CenterLat = 43.2, Zoom = 9 };
            var waypoints = new[] { new salehiMaps.Core.Models.Waypoint(5.9, 44.8, "Home") };

            new BackupService().Export(root, zip, workspace, waypoints);
            var restored = new BackupService().Import(zip);

            Assert.Equal(7.1, restored.Workspace.CenterLon, 6);
            Assert.Equal(43.2, restored.Workspace.CenterLat, 6);
            Assert.Equal(9, restored.Workspace.Zoom);
            Assert.Single(restored.Waypoints);
            Assert.Equal("Home", restored.Waypoints[0].Name);
            Assert.True(restored.Settings.ContainsKey("user_settings.conf"));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static byte[] BuildSingleTile(int x, int y, int z)
    {
        using var ms = new MemoryStream();
        ms.Write(new byte[4]);
        var header = new byte[61];
        header[0] = 0x01;
        header[2] = (byte)(x >> 16); header[3] = (byte)(x >> 8); header[4] = (byte)x;
        header[6] = (byte)(y >> 16); header[7] = (byte)(y >> 8); header[8] = (byte)y;
        header[10] = (byte)(z >> 16); header[11] = (byte)(z >> 8); header[12] = (byte)z;
        BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(17, 4), 16);
        header[21] = 0; header[22] = 0; header[23] = 1; header[24] = 0xA1;
        var payload = new byte[80];
        payload[0] = 0xFF; payload[1] = 0xD8; payload[2] = 0xFF;
        ms.Write(header);
        ms.Write(payload);
        return ms.ToArray();
    }
}
