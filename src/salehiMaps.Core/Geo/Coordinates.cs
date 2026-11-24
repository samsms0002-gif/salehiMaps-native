using System.Globalization;
using System.Text;

namespace salehiMaps.Core.Geo;

public readonly record struct GeoPoint(double Lon, double Lat);
public readonly record struct UtmPoint(int Zone, char Band, double Easting, double Northing);
public readonly record struct TileXY(int X, int Y, int Zoom);

/// <summary>
/// Web Mercator and WGS84 UTM/MGRS conversions used by the map views.
/// </summary>
public static class Coordinates
{
    private const double A = 6378137.0;
    private const double F = 1.0 / 298.257223563;
    private const double E2 = F * (2.0 - F);
    private const double E4 = E2 * E2;
    private const double E6 = E4 * E2;
    private const double Ep2 = E2 / (1.0 - E2);
    private const double K0 = 0.9996;
    private const double FalseEasting = 500000.0;
    private const double FalseNorthing = 10000000.0;

    private const string BandLetters = "CDEFGHJKLMNPQRSTUVWX";
    private const string ColLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string RowLetters = "ABCDEFGHJKLMNPQRSTUV";

    // ---------- Web Mercator ----------

    public static TileXY LonLatToTile(double lon, double lat, int zoom)
    {
        int n = 1 << zoom;
        double x = (lon + 180.0) / 360.0 * n;
        double latRad = Clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180.0;
        double y = (1.0 - Math.Log(Math.Tan(latRad) + 1.0 / Math.Cos(latRad)) / Math.PI) / 2.0 * n;
        return new TileXY(Clamp((int)Math.Floor(x), 0, n - 1), Clamp((int)Math.Floor(y), 0, n - 1), zoom);
    }

    public static GeoPoint TileToLonLat(int x, int y, int zoom)
    {
        int n = 1 << zoom;
        double lon = x / (double)n * 360.0 - 180.0;
        double a = Math.PI * (1.0 - 2.0 * y / n);
        double lat = Math.Atan(Math.Sinh(a)) * 180.0 / Math.PI;
        return new GeoPoint(lon, lat);
    }

    public static double GroundResolution(double lat, int zoom)
        => Math.Cos(lat * Math.PI / 180.0) * 2.0 * Math.PI * A / (1 << zoom);

    // ---------- UTM ----------

    public static UtmPoint LonLatToUtm(double lon, double lat)
    {
        int zone = Clamp((int)Math.Floor((lon + 180.0) / 6.0) + 1, 1, 60);
        double lon0 = (zone - 1) * 6.0 - 180.0 + 3.0;
        double phi = lat * Math.PI / 180.0;
        double lambda = (lon - lon0) * Math.PI / 180.0;

        double sinPhi = Math.Sin(phi);
        double cosPhi = Math.Cos(phi);
        double tanPhi = Math.Tan(phi);
        double n = A / Math.Sqrt(1.0 - E2 * sinPhi * sinPhi);
        double t = tanPhi * tanPhi;
        double c = Ep2 * cosPhi * cosPhi;
        double a1 = Math.Cos(phi) * lambda;

        double m = MeridianArc(phi);
        double easting = FalseEasting + K0 * n * (
            a1
            + (1.0 - t + c) * Math.Pow(a1, 3) / 6.0
            + (5.0 - 18.0 * t + t * t + 72.0 * c - 58.0 * Ep2) * Math.Pow(a1, 5) / 120.0);

        double northing = K0 * (m + n * tanPhi * (
            0.5 * a1 * a1
            + (5.0 - t + 9.0 * c + 4.0 * c * c) * Math.Pow(a1, 4) / 24.0
            + (61.0 - 58.0 * t + t * t + 600.0 * c - 330.0 * Ep2) * Math.Pow(a1, 6) / 720.0));

        if (lat < 0)
            northing += FalseNorthing;

        return new UtmPoint(zone, BandLetter(lat), easting, northing);
    }

    public static GeoPoint UtmToLonLat(UtmPoint utm)
    {
        double north = utm.Northing;
        if (utm.Band < 'N')
            north -= FalseNorthing;

        double m = north / K0;
        double mu = m / (A * (1.0 - E2 / 4.0 - 3.0 * E4 / 64.0 - 5.0 * E6 / 256.0));
        double e1 = (1.0 - Math.Sqrt(1.0 - E2)) / (1.0 + Math.Sqrt(1.0 - E2));

        double phi1 = mu
            + (3.0 * e1 / 2.0 - 27.0 * Math.Pow(e1, 3) / 32.0) * Math.Sin(2.0 * mu)
            + (21.0 * e1 * e1 / 16.0 - 55.0 * Math.Pow(e1, 4) / 32.0) * Math.Sin(4.0 * mu)
            + (151.0 * Math.Pow(e1, 3) / 96.0) * Math.Sin(6.0 * mu)
            + (1097.0 * Math.Pow(e1, 4) / 512.0) * Math.Sin(8.0 * mu);

        double sinPhi1 = Math.Sin(phi1);
        double n1 = A / Math.Sqrt(1.0 - E2 * sinPhi1 * sinPhi1);
        double t1 = Math.Tan(phi1) * Math.Tan(phi1);
        double c1 = Ep2 * Math.Cos(phi1) * Math.Cos(phi1);
        double r1 = A * (1.0 - E2) / Math.Pow(1.0 - E2 * sinPhi1 * sinPhi1, 1.5);
        double d = (utm.Easting - FalseEasting) / (n1 * K0);

        double lat = phi1 - (n1 * Math.Tan(phi1) / r1) * (
            0.5 * d * d
            - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1 * c1 - 9.0 * Ep2) * Math.Pow(d, 4) / 24.0
            + (61.0 + 90.0 * t1 + 25.0 * t1 * t1 + 288.0 * c1 - 60.0 * c1 * c1 - 192.0 * Ep2) * Math.Pow(d, 6) / 720.0);

        double lon0 = (utm.Zone - 1) * 6.0 - 180.0 + 3.0;
        double lon = lon0 + (
            d - (1.0 + 2.0 * t1 + c1) * Math.Pow(d, 3) / 6.0
            + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1 * c1 + 8.0 * Ep2 + 24.0 * t1 * t1) * Math.Pow(d, 5) / 120.0
        ) / Math.Cos(phi1) * 180.0 / Math.PI;

        return new GeoPoint(lon, lat * 180.0 / Math.PI);
    }

    // ---------- MGRS ----------

    public static string ToMgrs(double lon, double lat, int precision = 5)
    {
        UtmPoint u = LonLatToUtm(lon, lat);
        precision = Clamp(precision, 1, 5);

        int col = (int)Math.Floor(u.Easting / 100000.0) + 1;
        int set = u.Zone % 3 switch { 1 => 0, 2 => 7, _ => 14 };
        char colLetter = ColLetters[set + (col - 1) % 8];

        int row = ((int)Math.Floor(u.Northing / 100000.0) + (u.Zone % 2 == 0 ? 5 : 0)) % RowLetters.Length;
        char rowLetter = RowLetters[row];

        int easting = (int)Math.Floor(u.Easting % 100000.0);
        int northing = (int)Math.Floor(u.Northing % 100000.0);
        int factor = (int)Math.Pow(10, 5 - precision);
        string e = (easting / factor).ToString("D" + precision, CultureInfo.InvariantCulture);
        string n = (northing / factor).ToString("D" + precision, CultureInfo.InvariantCulture);

        return $"{u.Zone}{u.Band}{colLetter}{rowLetter}{e}{n}";
    }

    private static double MeridianArc(double phi)
        => A * (
            (1.0 - E2 / 4.0 - 3.0 * E4 / 64.0 - 5.0 * E6 / 256.0) * phi
            - (3.0 * E2 / 8.0 + 3.0 * E4 / 32.0 + 45.0 * E6 / 1024.0) * Math.Sin(2.0 * phi)
            + (15.0 * E4 / 256.0 + 45.0 * E6 / 1024.0) * Math.Sin(4.0 * phi)
            - (35.0 * E6 / 3072.0) * Math.Sin(6.0 * phi));

    private static char BandLetter(double lat)
    {
        int index = Clamp((int)Math.Floor((lat + 80.0) / 8.0), 0, BandLetters.Length - 1);
        return BandLetters[index];
    }

    private static int Clamp(int value, int min, int max) => Math.Min(Math.Max(value, min), max);
    private static double Clamp(double value, double min, double max) => Math.Min(Math.Max(value, min), max);
}
