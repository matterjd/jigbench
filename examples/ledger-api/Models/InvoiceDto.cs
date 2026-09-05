namespace LedgerApi.Models;

/// <summary>An invoice for the fictitious "Ledger" business. Fake data only.</summary>
public record InvoiceDto(
    string Id,
    string Number,
    string CustomerId,
    string CustomerName,
    DateOnly IssuedOn,
    DateOnly DueOn,
    string Status,
    IReadOnlyList<InvoiceLineDto> Lines,
    string Notes,
    decimal Total);
