namespace ElectricityPayments.Api.Models;

public sealed class TenantPayment
{
    public int Id { get; set; }

    public int PaidByTenantId { get; set; }

    public Tenant PaidByTenant { get; set; } = null!;

    public int ReceivedByTenantId { get; set; }

    public Tenant ReceivedByTenant { get; set; } = null!;

    public decimal Amount { get; set; }

    public DateOnly PaidOn { get; set; }

    public string? Note { get; set; }
}
