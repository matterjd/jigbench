using LedgerApi.Data;
using LedgerApi.Models;
using LedgerApi.Validation;

namespace LedgerApi.Endpoints;

public static class InvoiceEndpoints
{
    public static IEndpointRouteBuilder MapInvoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/invoices").WithTags("Invoices");

        group.MapGet("", (LedgerStore store) => Results.Ok(store.ListInvoices()))
            .WithName("ListInvoices")
            .Produces<IReadOnlyList<InvoiceDto>>();

        group.MapGet("/{id}", (string id, LedgerStore store) =>
        {
            var invoice = store.GetInvoice(id);
            return invoice is null ? Results.NotFound() : Results.Ok(invoice);
        })
            .WithName("GetInvoice")
            .Produces<InvoiceDto>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("", (CreateInvoiceRequest request, LedgerStore store) =>
        {
            var errors = ModelValidation.Validate(request, request.Lines);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var created = store.CreateInvoice(request);
            return Results.Created($"/api/invoices/{created.Id}", created);
        })
            .WithName("CreateInvoice")
            .Produces<InvoiceDto>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        group.MapPut("/{id}", (string id, UpdateInvoiceRequest request, LedgerStore store) =>
        {
            var errors = ModelValidation.Validate(request, request.Lines);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var updated = store.UpdateInvoice(id, request);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        })
            .WithName("UpdateInvoice")
            .Produces<InvoiceDto>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        return app;
    }
}
