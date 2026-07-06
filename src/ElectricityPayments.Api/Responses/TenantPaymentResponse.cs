namespace ElectricityPayments.Api.Responses;

public sealed record TenantPaymentResponse(
    int Id,
    int PaidByTenantId,
    string PaidByTenantName,
    string PaidByUnit,
    int ReceivedByTenantId,
    string ReceivedByTenantName,
    string ReceivedByUnit,
    decimal Amount,
    DateOnly PaidOn,
    string? Note);
