using System.ComponentModel.DataAnnotations;

namespace LedgerApi.Models;

/// <summary>One line item as submitted by a client creating or updating an invoice.</summary>
public record InvoiceLineRequest(
    [property: Required, MinLength(1)] string Description,
    [property: Range(1, int.MaxValue)] int Quantity,
    [property: Range(typeof(decimal), "0", "79228162514264337593543950335")] decimal UnitPrice);

/// <summary>Request body for <c>POST /api/invoices</c>.</summary>
public record CreateInvoiceRequest(
    [property: Required] string CustomerId,
    [property: Required] DateOnly IssuedOn,
    [property: Required] DateOnly DueOn,
    string? Notes,
    [property: Required, MinLength(1)] List<InvoiceLineRequest> Lines);
