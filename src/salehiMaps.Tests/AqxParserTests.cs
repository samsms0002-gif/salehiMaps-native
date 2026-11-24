using salehiMaps.Core.Formats;
using Xunit;

namespace salehiMaps.Tests;

public class AqxParserTests
{
    [Fact]
    public void Parse_ReadsSourcesZoomLevelsAndPreviewLocation()
    {
        const string xml = """
        <?xml version="1.0" encoding="utf-8"?>
        <aqx version="12" revision="5">
          <name>Test Maps</name>
          <description>Test</description>
          <param name="google-m">800000000</param>
          <source id="TEST" type="roads" region="world" opacity="180" visible="true">
            <name>Test Road</name>
            <preview-location>5.90,44.80,12</preview-location>
            <zoom-levels z="1-4,8">
              <server><![CDATA[http://example.com/{$x}/{$y}/{$z}/{$param:google-m}]]></server>
            </zoom-levels>
          </source>
          <composite-source id="HYBRID" type="hybrid">
            <name>Test Hybrid</name>
            <layer id="TEST"/>
          </composite-source>
        </aqx>
        """;

        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(xml));
        var doc = AqxParser.Parse(stream);

        Assert.Equal(12, doc.Version);
        Assert.Equal(5, doc.Revision);
        Assert.Equal("Test Maps", doc.Name);
        Assert.Equal("800000000", doc.Parameters["google-m"]);

        var source = Assert.Single(doc.Sources);
        Assert.Equal("TEST", source.Id);
        Assert.Equal(180, source.Opacity);
        Assert.True(source.HasPreviewLocation);
        Assert.Equal(5.90, source.PreviewLon, 6);
        Assert.Equal(44.80, source.PreviewLat, 6);
        Assert.Equal(12, source.PreviewZoom);
        Assert.Equal(new[] { 1, 2, 3, 4, 8 }, source.ZoomLevels);
        Assert.Single(source.ServerTemplates);
        Assert.Contains("800000000", source.ServerTemplates[0]);

        var composite = Assert.Single(doc.Composites);
        Assert.Equal("HYBRID", composite.Id);
        Assert.Equal("TEST", Assert.Single(composite.LayerIds));
    }
}
