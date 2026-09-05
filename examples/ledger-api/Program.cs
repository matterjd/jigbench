using LedgerApi.Data;
using LedgerApi.Endpoints;

const string LedgerAngularOrigin = "http://localhost:4200";
const string CorsPolicy = "LedgerAngular";

var builder = WebApplication.CreateBuilder(args);

// Fixed so the Angular dev-server proxy (examples/ledger-angular/proxy.conf.json) always finds
// this API in the same place, whether launched via `dotnet run` or a bare `dotnet run --urls`.
builder.WebHost.UseUrls("http://localhost:5210");

builder.Services.AddOpenApi();
builder.Services.AddSingleton<LedgerStore>();
builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.WithOrigins(LedgerAngularOrigin).AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors(CorsPolicy);

app.MapOpenApi(); // serves /openapi/v1.json
app.MapControllers(); // ReportsController
app.MapInvoiceEndpoints();
app.MapCustomerEndpoints();

app.Run();

// Exposed for WebApplicationFactory<Program> in examples/ledger-api.tests.
public partial class Program;
