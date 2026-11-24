using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using salehiMaps.Core.Formats;
using salehiMaps.Core.Geo;

namespace salehiMaps.UI.Controls;

/// <summary>
/// Draws offline DAT tiles as a Web Mercator grid.
/// </summary>
public sealed class MapCanvas : Control
{
    private const int TileSize = 256;
    private bool _dragging;
    private Point _lastPointer;
    private readonly Dictionary<string, Bitmap> _cache = new(StringComparer.Ordinal);

    public event Action<int>? ZoomChanged;
    public event Action<double, double>? CenterChanged;

    public DatTileProvider? Provider { get; set; }
    public int Zoom { get; set; } = 4;
    public double CenterLon { get; set; } = 5.90;
    public double CenterLat { get; set; } = 44.80;

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        Rect bounds = Bounds;
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return;

        var local = new Rect(0, 0, bounds.Width, bounds.Height);
        context.FillRectangle(new SolidColorBrush(Color.FromRgb(220, 234, 246)), local);
        if (Provider == null)
            return;

        TileXY center = Coordinates.LonLatToTile(CenterLon, CenterLat, Zoom);
        int cols = (int)Math.Ceiling(bounds.Width / TileSize) + 2;
        int rows = (int)Math.Ceiling(bounds.Height / TileSize) + 2;
        int startX = center.X - cols / 2;
        int startY = center.Y - rows / 2;

        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < cols; col++)
            {
                int x = startX + col;
                int y = startY + row;
                if (x < 0 || y < 0 || x >= (1 << Zoom) || y >= (1 << Zoom))
                    continue;

                string key = $"{Zoom}/{x}/{y}";
                Bitmap bitmap;
                if (_cache.TryGetValue(key, out var cached))
                {
                    bitmap = cached;
                }
                else
                {
                    if (!Provider.TryGetTile(x, y, Zoom, out byte[] bytes))
                        continue;
                    bitmap = GetBitmap(key, bytes);
                }
                double px = col * TileSize;
                double py = row * TileSize;
                context.DrawImage(bitmap, new Rect(px, py, TileSize, TileSize));
            }
        }
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        _dragging = true;
        _lastPointer = e.GetPosition(this);
        e.Pointer.Capture(this);
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        if (!_dragging)
            return;

        Point current = e.GetPosition(this);
        double dx = current.X - _lastPointer.X;
        double dy = current.Y - _lastPointer.Y;
        _lastPointer = current;

        double degreesPerPixel = 360.0 / (TileSize * (1 << Zoom));
        CenterLon -= dx * degreesPerPixel;
        CenterLat += dy * degreesPerPixel * Math.Cos(CenterLat * Math.PI / 180.0);
        CenterLon = Math.Clamp(CenterLon, -180.0, 180.0);
        CenterLat = Math.Clamp(CenterLat, -85.0, 85.0);
        CenterChanged?.Invoke(CenterLon, CenterLat);
        InvalidateVisual();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        _dragging = false;
        e.Pointer.Capture(null);
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        Zoom = Math.Clamp(Zoom + (e.Delta.Y > 0 ? 1 : -1), 1, 20);
        ZoomChanged?.Invoke(Zoom);
        InvalidateVisual();
        e.Handled = true;
    }

    private Bitmap GetBitmap(string key, byte[] bytes)
    {
        if (_cache.TryGetValue(key, out var cached))
            return cached;

        using var stream = new MemoryStream(bytes);
        var bitmap = new Bitmap(stream);
        _cache[key] = bitmap;
        return bitmap;
    }
}
