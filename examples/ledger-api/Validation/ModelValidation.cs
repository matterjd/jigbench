using System.ComponentModel.DataAnnotations;

namespace LedgerApi.Validation;

/// <summary>
/// Thin wrapper over <see cref="Validator"/> that also walks a request's line items, since
/// minimal APIs do not run data-annotation validation automatically. Not a general-purpose
/// validator — just enough for this fixture's two request shapes.
/// </summary>
internal static class ModelValidation
{
    public static Dictionary<string, string[]> Validate(object request, IEnumerable<object> lineItems)
    {
        var errors = new List<string>();
        CollectErrors(request, errors);

        var index = 0;
        foreach (var line in lineItems)
        {
            var lineErrors = new List<string>();
            CollectErrors(line, lineErrors);
            errors.AddRange(lineErrors.Select(e => $"lines[{index}]: {e}"));
            index++;
        }

        return errors.Count == 0
            ? []
            : new Dictionary<string, string[]> { ["request"] = [.. errors] };
    }

    private static void CollectErrors(object model, List<string> errors)
    {
        var context = new ValidationContext(model);
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(model, context, results, validateAllProperties: true);
        errors.AddRange(results.Select(r => r.ErrorMessage ?? "Invalid value."));
    }
}
