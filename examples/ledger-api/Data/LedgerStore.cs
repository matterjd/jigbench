using System.Collections.Concurrent;
using LedgerApi.Models;

namespace LedgerApi.Data;

/// <summary>
/// An in-memory, seeded, thread-safe store for the fictitious "Ledger" business. All data is
/// fake and reset every time the process starts — there is no persistence.
/// </summary>
public class LedgerStore
{
    private readonly ConcurrentDictionary<string, CustomerDto> _customers = new();
    private readonly ConcurrentDictionary<string, InvoiceDto> _invoices = new();
    private int _nextInvoiceSeq;

    public LedgerStore()
    {
        Seed();
    }

    public IReadOnlyList<CustomerDto> ListCustomers() =>
        _customers.Values.OrderBy(c => c.Id, StringComparer.Ordinal).ToList();

    public CustomerDto? GetCustomer(string id) =>
        _customers.TryGetValue(id, out var customer) ? customer : null;

    public IReadOnlyList<InvoiceDto> ListInvoices() =>
        _invoices.Values.OrderBy(i => i.Number, StringComparer.Ordinal).ToList();

    public InvoiceDto? GetInvoice(string id) =>
        _invoices.TryGetValue(id, out var invoice) ? invoice : null;

    public InvoiceDto CreateInvoice(CreateInvoiceRequest request)
    {
        var customer = GetCustomer(request.CustomerId);
        var seq = Interlocked.Increment(ref _nextInvoiceSeq);
        var id = $"inv-{1000 + seq}";
        var lines = request.Lines
            .Select((line, index) => new InvoiceLineDto($"line-{index + 1}", line.Description, line.Quantity, line.UnitPrice))
            .ToList();

        var invoice = new InvoiceDto(
            Id: id,
            Number: $"INV-{1000 + seq}",
            CustomerId: request.CustomerId,
            CustomerName: customer?.Name ?? "Unknown customer",
            IssuedOn: request.IssuedOn,
            DueOn: request.DueOn,
            Status: "draft",
            Lines: lines,
            Notes: request.Notes ?? "",
            Total: lines.Sum(l => l.Quantity * l.UnitPrice));

        _invoices[id] = invoice;
        return invoice;
    }

    public InvoiceDto? UpdateInvoice(string id, UpdateInvoiceRequest request)
    {
        if (!_invoices.TryGetValue(id, out var existing))
        {
            return null;
        }

        var customer = GetCustomer(request.CustomerId);
        var lines = request.Lines
            .Select((line, index) => new InvoiceLineDto($"line-{index + 1}", line.Description, line.Quantity, line.UnitPrice))
            .ToList();

        var updated = existing with
        {
            CustomerId = request.CustomerId,
            CustomerName = customer?.Name ?? existing.CustomerName,
            IssuedOn = request.IssuedOn,
            DueOn = request.DueOn,
            Status = request.Status,
            Lines = lines,
            Notes = request.Notes ?? "",
            Total = lines.Sum(l => l.Quantity * l.UnitPrice),
        };

        _invoices[id] = updated;
        return updated;
    }

    private void Seed()
    {
        var customers = new[]
        {
            new CustomerDto("cust-001", "Acme Robotics", "ap@acme.test", "Reno"),
            new CustomerDto("cust-002", "Blue Harbor Cafe", "billing@blueharbor.test", "Duluth"),
            new CustomerDto("cust-003", "Cedar Ridge Landscaping", "office@cedarridge.test", "Boise"),
            new CustomerDto("cust-004", "Dune & Co. Design Studio", "hello@duneandco.test", "Tucson"),
        };
        foreach (var customer in customers)
        {
            _customers[customer.Id] = customer;
        }

        InvoiceDto Invoice(
            int seq,
            string customerId,
            string customerName,
            DateOnly issuedOn,
            DateOnly dueOn,
            string status,
            string notes,
            params (string description, int quantity, decimal unitPrice)[] lines)
        {
            var lineDtos = lines
                .Select((l, i) => new InvoiceLineDto($"line-{i + 1}", l.description, l.quantity, l.unitPrice))
                .ToList();
            return new InvoiceDto(
                Id: $"inv-{1000 + seq}",
                Number: $"INV-{1000 + seq}",
                CustomerId: customerId,
                CustomerName: customerName,
                IssuedOn: issuedOn,
                DueOn: dueOn,
                Status: status,
                Lines: lineDtos,
                Notes: notes,
                Total: lineDtos.Sum(l => l.Quantity * l.UnitPrice));
        }

        var invoices = new[]
        {
            Invoice(1, "cust-001", "Acme Robotics", new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), "paid", "",
                ("Consulting — Q3 planning", 5, 250m)),
            Invoice(2, "cust-002", "Blue Harbor Cafe", new DateOnly(2026, 7, 5), new DateOnly(2026, 8, 4), "paid", "",
                ("POS integration", 1, 340.5m)),
            Invoice(3, "cust-001", "Acme Robotics", new DateOnly(2026, 7, 10), new DateOnly(2026, 8, 9), "sent", "",
                ("Firmware review", 4, 245m)),
            Invoice(4, "cust-003", "Cedar Ridge Landscaping", new DateOnly(2026, 7, 12), new DateOnly(2026, 8, 11), "overdue",
                "Second notice sent 2026-08-20.",
                ("Irrigation design", 3, 700.25m)),
            Invoice(5, "cust-004", "Dune & Co. Design Studio", new DateOnly(2026, 7, 18), new DateOnly(2026, 8, 17), "sent", "",
                ("Brand refresh — phase 1", 1, 560m)),
            Invoice(6, "cust-002", "Blue Harbor Cafe", new DateOnly(2026, 7, 20), new DateOnly(2026, 8, 19), "draft", "",
                ("Menu QR redesign", 1, 125.25m)),
            Invoice(7, "cust-003", "Cedar Ridge Landscaping", new DateOnly(2026, 7, 22), new DateOnly(2026, 8, 21), "paid", "",
                ("Spring install", 8, 400m)),
            Invoice(8, "cust-001", "Acme Robotics", new DateOnly(2026, 7, 28), new DateOnly(2026, 8, 27), "void",
                "Duplicate of INV-1003, voided.",
                ("Firmware review (duplicate)", 1, 75m)),
        };
        foreach (var invoice in invoices)
        {
            _invoices[invoice.Id] = invoice;
        }
        _nextInvoiceSeq = invoices.Length;
    }
}
