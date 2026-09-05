namespace LedgerApi.Models;

/// <summary>One line item on an invoice.</summary>
public record InvoiceLineDto(string Id, string Description, int Quantity, decimal UnitPrice);
