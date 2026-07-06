namespace ElectricityPayments.Api.Responses;

public sealed record MonthlyTenantSummaryResponse(
    int TenantId,
    string TenantName,
    string Unit,
    decimal CashPaidToOthers,
    decimal CashReceivedFromOthers,
    decimal TokenValueBoughtByTenant,
    decimal TokenValueBoughtForTenant,
    decimal TokenValueBoughtForOthers,
    decimal HeldCashBalance);
