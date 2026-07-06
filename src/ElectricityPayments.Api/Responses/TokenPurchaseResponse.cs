namespace ElectricityPayments.Api.Responses;

public sealed record TokenPurchaseResponse(
    int Id,
    int PurchasedByTenantId,
    string PurchasedByTenantName,
    string PurchasedByUnit,
    int BeneficiaryTenantId,
    string BeneficiaryTenantName,
    string BeneficiaryUnit,
    decimal Amount,
    DateOnly PurchasedOn,
    string? TokenNumber,
    string? Note);
