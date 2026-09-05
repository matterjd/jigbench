using LedgerApi.Data;
using LedgerApi.Models;

namespace LedgerApi.Endpoints;

public static class CustomerEndpoints
{
    public static IEndpointRouteBuilder MapCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/customers").WithTags("Customers");

        group.MapGet("", (LedgerStore store) => Results.Ok(store.ListCustomers()))
            .WithName("ListCustomers")
            .Produces<IReadOnlyList<CustomerDto>>();

        group.MapGet("/{id}", (string id, LedgerStore store) =>
        {
            var customer = store.GetCustomer(id);
            return customer is null ? Results.NotFound() : Results.Ok(customer);
        })
            .WithName("GetCustomer")
            .Produces<CustomerDto>()
            .Produces(StatusCodes.Status404NotFound);

        return app;
    }
}
