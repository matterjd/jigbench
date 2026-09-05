using System.Net;
using System.Net.Http.Json;
using LedgerApi.Models;
using Microsoft.AspNetCore.Mvc.Testing;

namespace LedgerApi.Tests;

public class CustomerEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public CustomerEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task List_returns_all_four_seeded_customers()
    {
        var customers = await _client.GetFromJsonAsync<List<CustomerDto>>("/api/customers");

        Assert.NotNull(customers);
        Assert.Equal(4, customers!.Count);
    }

    [Fact]
    public async Task Get_by_id_returns_404_for_an_unknown_customer()
    {
        var response = await _client.GetAsync("/api/customers/cust-does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_by_id_returns_the_matching_customer()
    {
        var customer = await _client.GetFromJsonAsync<CustomerDto>("/api/customers/cust-001");

        Assert.NotNull(customer);
        Assert.Equal("Acme Robotics", customer!.Name);
    }
}
