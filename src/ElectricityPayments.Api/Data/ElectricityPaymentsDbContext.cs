using ElectricityPayments.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ElectricityPayments.Api.Data;

public sealed class ElectricityPaymentsDbContext(DbContextOptions<ElectricityPaymentsDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();

    public DbSet<TenantPayment> TenantPayments => Set<TenantPayment>();

    public DbSet<TokenPurchase> TokenPurchases => Set<TokenPurchase>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(tenant =>
        {
            tenant.Property(t => t.Name).HasMaxLength(120).IsRequired();
            tenant.Property(t => t.Unit).HasMaxLength(80).IsRequired();
        });

        modelBuilder.Entity<TenantPayment>(payment =>
        {
            payment.Property(p => p.Amount).HasPrecision(18, 2);
            payment.Property(p => p.Note).HasMaxLength(300);
            payment.HasOne(p => p.PaidByTenant)
                .WithMany(t => t.PaymentsMade)
                .HasForeignKey(p => p.PaidByTenantId)
                .OnDelete(DeleteBehavior.Restrict);
            payment.HasOne(p => p.ReceivedByTenant)
                .WithMany(t => t.PaymentsReceived)
                .HasForeignKey(p => p.ReceivedByTenantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TokenPurchase>(purchase =>
        {
            purchase.Property(p => p.Amount).HasPrecision(18, 2);
            purchase.Property(p => p.TokenNumber).HasMaxLength(120);
            purchase.Property(p => p.Note).HasMaxLength(300);
            purchase.HasOne(p => p.PurchasedByTenant)
                .WithMany(t => t.TokenPurchasesMade)
                .HasForeignKey(p => p.PurchasedByTenantId)
                .OnDelete(DeleteBehavior.Restrict);
            purchase.HasOne(p => p.BeneficiaryTenant)
                .WithMany(t => t.TokenPurchasesBenefitedFrom)
                .HasForeignKey(p => p.BeneficiaryTenantId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
