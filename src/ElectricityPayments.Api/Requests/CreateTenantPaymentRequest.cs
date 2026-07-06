namespace ElectricityPayments.Api.Requests;

public sealed record CreateTenantPaymentRequest(
    int PaidByTenantId,
    int ReceivedByTenantId,
    decimal Amount,
    DateOnly PaidOn,
    string? Note);
