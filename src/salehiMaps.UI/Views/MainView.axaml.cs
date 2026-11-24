using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using salehiMaps.Core;
using salehiMaps.Core.Formats;
using salehiMaps.Core.Geo;
using salehiMaps.Core.Models;
using salehiMaps.UI.Controls;

namespace salehiMaps.UI.Views;

public partial class MainView : UserControl
{
    private int _zoom = 4;
    private readonly List<Waypoint> _waypoints = new();
    private WorkspaceState _workspace = new();
    private string _coordFormat = "WGS84";

    public MainView()
    {
        InitializeComponent();

        RefreshButton.Click += RefreshButton_Click;
        AddLayerButton.Click += AddLayerButton_Click;
        ZoomInButton.Click += (_, _) => SetZoom(_zoom + 1);
        ZoomOutButton.Click += (_, _) => SetZoom(_zoom - 1);

        Loaded += (_, _) =>
        {
            RefreshDatasets();
            LoadWorkspace();
        };
        MapCanvas.Zoom = _zoom;
        MapCanvas.ZoomChanged += z =>
        {
            _zoom = z;
            ZoomText.Text = $"زووم: {_zoom}";
            SaveWorkspace();
        };
        MapCanvas.CenterChanged += (lon, lat) =>
        {
            UpdateCoordinateText(lat, lon);
        };
    }

    private void RefreshButton_Click(object? sender, RoutedEventArgs e) => RefreshDatasets();

    private void AddLayerButton_Click(object? sender, RoutedEventArgs e)
    {
        StatusText.Text = "اختر خريطة من القائمة ثم استخدم «إضافة كطبقة».";
    }

    private void BrowseMaps_Click(object? sender, RoutedEventArgs e) => RefreshDatasets();

    private void About_Click(object? sender, RoutedEventArgs e)
    {
        StatusText.Text = "salehiMaps — مبني بـ .NET 8 و Avalonia.";
    }

    private void CoordWgs84_Click(object? sender, RoutedEventArgs e) { _coordFormat = "WGS84"; UpdateCoordinateText(MapCanvas.CenterLat, MapCanvas.CenterLon); }
    private void CoordUtm_Click(object? sender, RoutedEventArgs e) { _coordFormat = "UTM"; UpdateCoordinateText(MapCanvas.CenterLat, MapCanvas.CenterLon); }
    private void CoordMgrs_Click(object? sender, RoutedEventArgs e) { _coordFormat = "MGRS"; UpdateCoordinateText(MapCanvas.CenterLat, MapCanvas.CenterLon); }
    private void SaveWorkspace_Click(object? sender, RoutedEventArgs e) { SaveWorkspace(); StatusText.Text = "تم حفظ مساحة العمل."; }

    private void UpdateCoordinateText(double lat, double lon)
    {
        CoordinateText.Text = _coordFormat switch
        {
            "UTM" => FormatUtm(lat, lon),
            "MGRS" => $"MGRS: {Coordinates.ToMgrs(lon, lat)}",
            _ => $"WGS84: {lat:F4}, {lon:F4}"
        };
    }

    private static string FormatUtm(double lat, double lon)
    {
        var utm = Coordinates.LonLatToUtm(lon, lat);
        return $"UTM: {utm.Zone}{utm.Band} {utm.Easting:0} {utm.Northing:0}";
    }

    private async void ImportLandmarks_Click(object? sender, RoutedEventArgs e)
    {
        var top = TopLevel.GetTopLevel(this);
        if (top?.StorageProvider is not { } storage) return;

        var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "استيراد معالم",
            AllowMultiple = true,
            FileTypeFilter =
            [
                new FilePickerFileType("Landmarks") { Patterns = ["*.gpx", "*.kml", "*.csv"] },
                new FilePickerFileType("GPX") { Patterns = ["*.gpx"] },
                new FilePickerFileType("KML") { Patterns = ["*.kml"] },
                new FilePickerFileType("CSV") { Patterns = ["*.csv"] },
                FilePickerFileTypes.All
            ]
        });
        if (files.Count == 0) return;

        int imported = 0;
        var errors = new List<string>();
        foreach (var file in files)
        {
            try
            {
                await using var stream = await file.OpenReadAsync();
                string ext = Path.GetExtension(file.Name).ToLowerInvariant();
                IReadOnlyList<Waypoint> points = ext switch
                {
                    ".gpx" => GpxParser.ParseWaypoints(stream),
                    ".kml" => KmlParser.ParseWaypoints(stream),
                    ".csv" => CsvParser.Parse(stream),
                    _ => Array.Empty<Waypoint>()
                };
                foreach (var wp in points)
                    _waypoints.Add(wp);
                imported += points.Count;
            }
            catch (Exception ex)
            {
                errors.Add($"{file.Name}: {ex.Message}");
            }
        }

        SaveWorkspace();
        StatusText.Text = errors.Count == 0
            ? $"تم استيراد {imported} معلم."
            : $"تم استيراد {imported} معلم، مع {errors.Count} خطأ: {errors[0]}";
    }

    private void ClearLandmarks_Click(object? sender, RoutedEventArgs e)
    {
        _waypoints.Clear();
        SaveWorkspace();
        StatusText.Text = "تم مسح المعالم.";
    }

    private async void ExportBackup_Click(object? sender, RoutedEventArgs e)
    {
        var top = TopLevel.GetTopLevel(this);
        if (top?.StorageProvider is not { } storage) return;

        var file = await storage.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = "تصدير نسخة احتياطية",
            SuggestedFileName = "salehiMaps-backup.zip",
            DefaultExtension = "zip",
            FileTypeChoices = [new FilePickerFileType("ZIP") { Patterns = ["*.zip"] }]
        });
        if (file == null) return;

        try
        {
            string localPath = file.TryGetLocalPath() ?? Path.Combine(GetAppDataDir(), "salehiMaps-backup.zip");
            var backup = new BackupService();
            backup.Export(GetAppDataDir(), localPath, CaptureWorkspace(), _waypoints);
            StatusText.Text = $"تم تصدير النسخة الاحتياطية: {Path.GetFileName(localPath)}";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"فشل التصدير: {ex.Message}";
        }
    }

    private async void ImportBackup_Click(object? sender, RoutedEventArgs e)
    {
        var top = TopLevel.GetTopLevel(this);
        if (top?.StorageProvider is not { } storage) return;

        var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "استعادة نسخة احتياطية",
            AllowMultiple = false,
            FileTypeFilter = [new FilePickerFileType("ZIP") { Patterns = ["*.zip"] }, FilePickerFileTypes.All]
        });
        if (files.Count == 0) return;

        try
        {
            await using var stream = await files[0].OpenReadAsync();
            string temp = Path.Combine(Path.GetTempPath(), $"salehimaps-restore-{Guid.NewGuid():N}.zip");
            await using (var fs = File.Create(temp))
                await stream.CopyToAsync(fs);
            var backup = new BackupService().Import(temp);
            File.Delete(temp);

            _workspace = backup.Workspace ?? new WorkspaceState();
            _waypoints.Clear();
            _waypoints.AddRange(backup.Waypoints);
            ApplyWorkspace();
            SaveWorkspace();
            StatusText.Text = $"تمت الاستعادة: {_waypoints.Count} معلم.";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"فشلت الاستعادة: {ex.Message}";
        }
    }

    private void RefreshDatasets()
    {
        string? envRoot = Environment.GetEnvironmentVariable("SALEHIMAPS_DATA");
        string[] candidates =
        {
            envRoot ?? string.Empty,
            Path.Combine(AppContext.BaseDirectory, "data"),
            Path.Combine(Directory.GetCurrentDirectory(), "files", "datastore", "maps"),
            Path.Combine(Directory.GetCurrentDirectory(), "data"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "files", "datastore", "maps"))
        };

        string root = candidates.FirstOrDefault(d => !string.IsNullOrWhiteSpace(d) && Directory.Exists(d))
                      ?? candidates[1];

        var sets = new MapRepository(root).Discover();
        DatasetsList.ItemsSource = sets;
        StatusText.Text = sets.Count == 0
            ? $"لا توجد خرائط في: {root}"
            : $"تم العثور على {sets.Count} مجموعة خرائط.";
    }

    private void SetZoom(int zoom)
    {
        _zoom = Math.Clamp(zoom, 1, 20);
        ZoomText.Text = $"زووم: {_zoom}";
        MapCanvas.Zoom = _zoom;
        MapCanvas.InvalidateVisual();
        SaveWorkspace();
    }

    private string GetAppDataDir()
    {
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "salehiMaps");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private string WorkspacePath => Path.Combine(GetAppDataDir(), "workspace.json");

    private WorkspaceState CaptureWorkspace()
    {
        _workspace.CenterLon = MapCanvas.CenterLon;
        _workspace.CenterLat = MapCanvas.CenterLat;
        _workspace.Zoom = _zoom;
        _workspace.ActiveLayers.Clear();
        if (DatasetsList.SelectedItem is MapDataSet ds)
            _workspace.ActiveLayers.Add(ds.Id);
        return _workspace;
    }

    private void SaveWorkspace()
    {
        try { CaptureWorkspace().Save(WorkspacePath); }
        catch { /* best effort */ }
    }

    private void LoadWorkspace()
    {
        try
        {
            _workspace = WorkspaceState.Load(WorkspacePath);
            ApplyWorkspace();
        }
        catch { /* ignore corrupted workspace */ }
    }

    private void ApplyWorkspace()
    {
        _zoom = Math.Clamp(_workspace.Zoom <= 0 ? 4 : _workspace.Zoom, 1, 20);
        MapCanvas.CenterLon = _workspace.CenterLon;
        MapCanvas.CenterLat = _workspace.CenterLat;
        MapCanvas.Zoom = _zoom;
        ZoomText.Text = $"زووم: {_zoom}";
        CoordinateText.Text = $"WGS84: {_workspace.CenterLat:F4}, {_workspace.CenterLon:F4}";
        MapCanvas.InvalidateVisual();
    }

    private void DatasetsList_SelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DatasetsList.SelectedItem is not MapDataSet dataset || dataset.DatPaths.Count == 0)
            return;

        string datPath = dataset.DatPaths[0];
        StatusText.Text = "جارٍ فهرسة البلاطات...";

        _ = Task.Run(() =>
        {
            try
            {
                var tiles = DatTileScanner.Scan(datPath);
                var provider = new DatTileProvider(datPath, tiles);
                Dispatcher.UIThread.Post(() =>
                {
                    MapCanvas.Provider = provider;
                    MapCanvas.Zoom = _zoom;
                    MapCanvas.InvalidateVisual();
                    StatusText.Text = $"تم تحميل {tiles.Count} بلاطة من {Path.GetFileName(datPath)}";
                });
            }
            catch (Exception ex)
            {
                Dispatcher.UIThread.Post(() => StatusText.Text = $"تعذّر تحميل الخريطة: {ex.Message}");
            }
        });
    }
}
