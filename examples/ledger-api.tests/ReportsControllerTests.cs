using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace LedgerApi.Tests;

public class ReportsControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ReportsControllerTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Aging_report_is_served_by_the_controller_route()
    {
        var response = await _client.GetAsync("/api/reports/aging");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
