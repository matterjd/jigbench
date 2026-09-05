using System.ComponentModel.DataAnnotations;

namespace LedgerApi.Models;

/// <summary>Request body for <c>PUT /api/invoices/{id}</c>.</summary>
public record UpdateInvoiceRequest(
    [property: Required] string CustomerId,
    [property: Required] DateOnly IssuedOn,
    [property: Required] DateOnly DueOn,
    [property: Required] string Status,
    string? Notes,
    [property: Required, MinLength(1)] List<InvoiceLineRequest> Lines);
