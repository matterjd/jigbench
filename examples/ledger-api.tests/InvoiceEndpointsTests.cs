using System.Net;
using System.Net.Http.Json;
using LedgerApi.Models;
using Microsoft.AspNetCore.Mvc.Testing;

namespace LedgerApi.Tests;

public class InvoiceEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public InvoiceEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task List_returns_all_eight_seeded_invoices()
    {
        var invoices = await _client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices");

        Assert.NotNull(invoices);
        Assert.Equal(8, invoices!.Count);
    }

    [Fact]
    public async Task Get_by_id_returns_404_for_an_unknown_invoice()
    {
        var response = await _client.GetAsync("/api/invoices/inv-does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_by_id_returns_the_matching_invoice()
    {
        var invoice = await _client.GetFromJsonAsync<InvoiceDto>("/api/invoices/inv-1001");

        Assert.NotNull(invoice);
        Assert.Equal("INV-1001", invoice!.Number);
        Assert.Equal("cust-001", invoice.CustomerId);
    }

    [Fact]
    public async Task Post_creates_a_new_invoice_and_it_is_then_listed()
    {
        var request = new CreateInvoiceRequest(
            CustomerId: "cust-002",
            IssuedOn: new DateOnly(2026, 9, 1),
            DueOn: new DateOnly(2026, 10, 1),
            Notes: "created by a test",
            Lines: [new InvoiceLineRequest("Widget install", 2, 50m)]);

        var response = await _client.PostAsJsonAsync("/api/invoices", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<InvoiceDto>();
        Assert.NotNull(created);
        Assert.Equal("cust-002", created!.CustomerId);
        Assert.Equal(100m, created.Total);
        Assert.Equal("draft", created.Status);

        var afterCreate = await _client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices");
        Assert.Equal(9, afterCreate!.Count);
    }

    [Fact]
    public async Task Post_with_no_lines_returns_400()
    {
        var request = new CreateInvoiceRequest(
            CustomerId: "cust-002",
            IssuedOn: new DateOnly(2026, 9, 1),
            DueOn: new DateOnly(2026, 10, 1),
            Notes: null,
            Lines: []);

        var response = await _client.PostAsJsonAsync("/api/invoices", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Put_updates_an_existing_invoice()
    {
        var request = new UpdateInvoiceRequest(
            CustomerId: "cust-001",
            IssuedOn: new DateOnly(2026, 7, 1),
            DueOn: new DateOnly(2026, 7, 31),
            Status: "paid",
            Notes: "updated by a test",
            Lines: [new InvoiceLineRequest("Consulting — Q3 planning", 5, 250m)]);

        var response = await _client.PutAsJsonAsync("/api/invoices/inv-1003", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<InvoiceDto>();
        Assert.Equal("paid", updated!.Status);
        Assert.Equal("updated by a test", updated.Notes);
    }

    [Fact]
    public async Task Put_returns_404_for_an_unknown_invoice()
    {
        var request = new UpdateInvoiceRequest(
            CustomerId: "cust-001",
            IssuedOn: new DateOnly(2026, 7, 1),
            DueOn: new DateOnly(2026, 7, 31),
            Status: "paid",
            Notes: null,
            Lines: [new InvoiceLineRequest("x", 1, 1m)]);

        var response = await _client.PutAsJsonAsync("/api/invoices/inv-does-not-exist", request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
