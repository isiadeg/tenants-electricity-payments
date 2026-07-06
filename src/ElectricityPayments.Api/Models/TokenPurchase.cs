namespace ElectricityPayments.Api.Models;

public sealed class TokenPurchase
{
    public int Id { get; set; }

    public int PurchasedByTenantId { get; set; }

    public Tenant PurchasedByTenant { get; set; } = null!;

    public int BeneficiaryTenantId { get; set; }

    public Tenant BeneficiaryTenant { get; set; } = null!;

    public decimal Amount { get; set; }

    public DateOnly PurchasedOn { get; set; }

    public string? TokenNumber { get; set; }

    public string? Note { get; set; }
}
