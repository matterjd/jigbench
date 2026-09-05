using LedgerApi.Data;
using Microsoft.AspNetCore.Mvc;

namespace LedgerApi.Controllers;

/// <summary>
/// A single MVC-style controller kept alongside the minimal-API endpoint maps in
/// <see cref="LedgerApi.Endpoints"/> on purpose: this is a Jig survey fixture, and Jig's .NET
/// adapter's regex-lite fallback needs both a controller and minimal-API route maps to find.
/// </summary>
[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    // Fixed "as of" date so the aging report is deterministic for tests and for the recorded
    // OpenAPI snapshot — this is fake data, not a live business, so "now" is meaningless.
    private static readonly DateOnly AsOf = new(2026, 9, 5);

    private readonly LedgerStore _store;

    public ReportsController(LedgerStore store)
    {
        _store = store;
    }

    public record AgingBucket(string Label, int InvoiceCount, decimal Total);

    [HttpGet("aging")]
    public ActionResult<IReadOnlyList<AgingBucket>> Aging()
    {
        var outstanding = _store.ListInvoices().Where(i => i.Status is "sent" or "overdue");

        var buckets = new (string Label, Func<int, bool> InRange)[]
        {
            ("Current", days => days <= 0),
            ("1-30", days => days is > 0 and <= 30),
            ("31-60", days => days is > 30 and <= 60),
            ("61-90", days => days is > 60 and <= 90),
            ("90+", days => days > 90),
        };

        var result = buckets.Select(bucket =>
        {
            var matches = outstanding
                .Where(invoice => bucket.InRange(AsOf.DayNumber - invoice.DueOn.DayNumber))
                .ToList();
            return new AgingBucket(bucket.Label, matches.Count, matches.Sum(i => i.Total));
        }).ToList();

        return Ok(result);
    }
}
