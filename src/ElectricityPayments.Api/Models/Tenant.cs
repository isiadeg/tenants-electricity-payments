namespace ElectricityPayments.Api.Models;

public sealed class Tenant
{
    public int Id { get; set; }

    public required string Name { get; set; }

    public required string Unit { get; set; }

    public List<TenantPayment> PaymentsMade { get; set; } = [];

    public List<TenantPayment> PaymentsReceived { get; set; } = [];

    public List<TokenPurchase> TokenPurchasesMade { get; set; } = [];

    public List<TokenPurchase> TokenPurchasesBenefitedFrom { get; set; } = [];
}
