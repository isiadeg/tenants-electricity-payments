namespace ElectricityPayments.Api.Requests;

public sealed record CreateTokenPurchaseRequest(
    int PurchasedByTenantId,
    int BeneficiaryTenantId,
    decimal Amount,
    DateOnly PurchasedOn,
    string? TokenNumber,
    string? Note);
