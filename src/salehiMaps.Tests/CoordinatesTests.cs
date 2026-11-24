using salehiMaps.Core.Geo;
using Xunit;

namespace salehiMaps.Tests;

public class CoordinatesTests
{
    [Fact]
    public void WebMercator_RoundTrips()
    {
        var point = new GeoPoint(5.90, 44.80);
        const int zoom = 14;

        TileXY tile = Coordinates.LonLatToTile(point.Lon, point.Lat, zoom);
        GeoPoint back = Coordinates.TileToLonLat(tile.X, tile.Y, zoom);

        Assert.InRange(back.Lon, point.Lon - 0.03, point.Lon + 0.03);
        Assert.InRange(back.Lat, point.Lat - 0.03, point.Lat + 0.03);
    }

    [Fact]
    public void Utm_RoundTrips()
    {
        var point = new GeoPoint(5.90, 44.80);
        UtmPoint utm = Coordinates.LonLatToUtm(point.Lon, point.Lat);
        GeoPoint back = Coordinates.UtmToLonLat(utm);

        Assert.Equal(31, utm.Zone);
        Assert.InRange(back.Lon, point.Lon - 1e-6, point.Lon + 1e-6);
        Assert.InRange(back.Lat, point.Lat - 1e-6, point.Lat + 1e-6);
    }

    [Fact]
    public void Mgrs_HasExpectedShape()
    {
        string mgrs = Coordinates.ToMgrs(5.90, 44.80, 5);
        Assert.Matches(@"^\d{1,2}[C-HJ-NP-X][A-Z][A-Z]\d{10}$", mgrs);
    }
}
