using ElectricityPayments.Api.Data;
using ElectricityPayments.Api.Models;
using ElectricityPayments.Api.Requests;
using ElectricityPayments.Api.Responses;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddDbContext<ElectricityPaymentsDbContext>(options =>
{
    var localDataDirectory = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
    Directory.CreateDirectory(localDataDirectory);

    var connectionString = builder.Configuration.GetConnectionString("ElectricityPayments")
        ?? $"Data Source={Path.Combine(localDataDirectory, "electricity-payments-v2.db")}";

    options.UseSqlite(connectionString);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularDevClient", policy =>
    {
        policy
            .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAngularDevClient");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ElectricityPaymentsDbContext>();
    await db.Database.EnsureCreatedAsync();

    if (!await db.Tenants.AnyAsync())
    {
        db.Tenants.AddRange(
            new Tenant { Name = "Amina Yusuf", Unit = "Flat 1" },
            new Tenant { Name = "Chinedu Okafor", Unit = "Flat 2" },
            new Tenant { Name = "Tola Adeyemi", Unit = "Boys Quarter" });

        await db.SaveChangesAsync();
    }
}

var api = app.MapGroup("/api");

api.MapGet("/tenants", async (ElectricityPaymentsDbContext db) =>
{
    var tenants = await db.Tenants
        .OrderBy(tenant => tenant.Unit)
        .Select(tenant => new TenantResponse(tenant.Id, tenant.Name, tenant.Unit))
        .ToListAsync();

    return Results.Ok(tenants);
});

api.MapPost("/tenants", async (CreateTenantRequest request, ElectricityPaymentsDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Unit))
    {
        return Results.BadRequest("Tenant name and unit are required.");
    }

    var tenant = new Tenant
    {
        Name = request.Name.Trim(),
        Unit = request.Unit.Trim()
    };

    db.Tenants.Add(tenant);
    await db.SaveChangesAsync();

    return Results.Created($"/api/tenants/{tenant.Id}", new TenantResponse(tenant.Id, tenant.Name, tenant.Unit));
});

api.MapGet("/tenant-payments", async (
    ElectricityPaymentsDbContext db,
    int? paidByTenantId,
    int? receivedByTenantId,
    int? year,
    int? month) =>
{
    var query = db.TenantPayments
        .Include(payment => payment.PaidByTenant)
        .Include(payment => payment.ReceivedByTenant)
        .AsQueryable();

    if (paidByTenantId is not null)
    {
        query = query.Where(payment => payment.PaidByTenantId == paidByTenantId);
    }

    if (receivedByTenantId is not null)
    {
        query = query.Where(payment => payment.ReceivedByTenantId == receivedByTenantId);
    }

    query = ApplyDateFilter(query, payment => payment.PaidOn, year, month);

    var payments = await query
        .OrderByDescending(payment => payment.PaidOn)
        .ThenByDescending(payment => payment.Id)
        .Select(payment => new TenantPaymentResponse(
            payment.Id,
            payment.PaidByTenantId,
            payment.PaidByTenant.Name,
            payment.PaidByTenant.Unit,
            payment.ReceivedByTenantId,
            payment.ReceivedByTenant.Name,
            payment.ReceivedByTenant.Unit,
            payment.Amount,
            payment.PaidOn,
            payment.Note))
        .ToListAsync();

    return Results.Ok(payments);
});

api.MapPost("/tenant-payments", async (CreateTenantPaymentRequest request, ElectricityPaymentsDbContext db) =>
{
    if (request.Amount <= 0)
    {
        return Results.BadRequest("Payment amount must be greater than zero.");
    }

    if (request.PaidByTenantId == request.ReceivedByTenantId)
    {
        return Results.BadRequest("A tenant payment must move money from one tenant to another tenant.");
    }

    if (!await TenantsExist(db, request.PaidByTenantId, request.ReceivedByTenantId))
    {
        return Results.NotFound("One or both tenants were not found.");
    }

    var payment = new TenantPayment
    {
        PaidByTenantId = request.PaidByTenantId,
        ReceivedByTenantId = request.ReceivedByTenantId,
        Amount = request.Amount,
        PaidOn = request.PaidOn,
        Note = CleanOptionalText(request.Note)
    };

    db.TenantPayments.Add(payment);
    await db.SaveChangesAsync();

    return Results.Created($"/api/tenant-payments/{payment.Id}", payment.Id);
});

api.MapGet("/token-purchases", async (
    ElectricityPaymentsDbContext db,
    int? purchasedByTenantId,
    int? beneficiaryTenantId,
    int? year,
    int? month) =>
{
    var query = db.TokenPurchases
        .Include(purchase => purchase.PurchasedByTenant)
        .Include(purchase => purchase.BeneficiaryTenant)
        .AsQueryable();

    if (purchasedByTenantId is not null)
    {
        query = query.Where(purchase => purchase.PurchasedByTenantId == purchasedByTenantId);
    }

    if (beneficiaryTenantId is not null)
    {
        query = query.Where(purchase => purchase.BeneficiaryTenantId == beneficiaryTenantId);
    }

    query = ApplyDateFilter(query, purchase => purchase.PurchasedOn, year, month);

    var purchases = await query
        .OrderByDescending(purchase => purchase.PurchasedOn)
        .ThenByDescending(purchase => purchase.Id)
        .Select(purchase => new TokenPurchaseResponse(
            purchase.Id,
            purchase.PurchasedByTenantId,
            purchase.PurchasedByTenant.Name,
            purchase.PurchasedByTenant.Unit,
            purchase.BeneficiaryTenantId,
            purchase.BeneficiaryTenant.Name,
            purchase.BeneficiaryTenant.Unit,
            purchase.Amount,
            purchase.PurchasedOn,
            purchase.TokenNumber,
            purchase.Note))
        .ToListAsync();

    return Results.Ok(purchases);
});

api.MapPost("/token-purchases", async (CreateTokenPurchaseRequest request, ElectricityPaymentsDbContext db) =>
{
    if (request.Amount <= 0)
    {
        return Results.BadRequest("Token purchase amount must be greater than zero.");
    }

    if (!await TenantsExist(db, request.PurchasedByTenantId, request.BeneficiaryTenantId))
    {
        return Results.NotFound("One or both tenants were not found.");
    }

    var purchase = new TokenPurchase
    {
        PurchasedByTenantId = request.PurchasedByTenantId,
        BeneficiaryTenantId = request.BeneficiaryTenantId,
        Amount = request.Amount,
        PurchasedOn = request.PurchasedOn,
        TokenNumber = CleanOptionalText(request.TokenNumber),
        Note = CleanOptionalText(request.Note)
    };

    db.TokenPurchases.Add(purchase);
    await db.SaveChangesAsync();

    return Results.Created($"/api/token-purchases/{purchase.Id}", purchase.Id);
});

api.MapGet("/summary/monthly", async (ElectricityPaymentsDbContext db, int year, int month) =>
{
    if (month is < 1 or > 12)
    {
        return Results.BadRequest("Month must be between 1 and 12.");
    }

    var monthStart = new DateOnly(year, month, 1);
    var nextMonthStart = monthStart.AddMonths(1);

    var summaries = await db.Tenants
        .OrderBy(tenant => tenant.Unit)
        .Select(tenant => new
        {
            tenant.Id,
            tenant.Name,
            tenant.Unit,
            CashPaidToOthers = tenant.PaymentsMade
                .Where(payment => payment.PaidOn >= monthStart && payment.PaidOn < nextMonthStart)
                .Sum(payment => payment.Amount),
            CashReceivedFromOthers = tenant.PaymentsReceived
                .Where(payment => payment.PaidOn >= monthStart && payment.PaidOn < nextMonthStart)
                .Sum(payment => payment.Amount),
            TokenValueBoughtByTenant = tenant.TokenPurchasesMade
                .Where(purchase => purchase.PurchasedOn >= monthStart && purchase.PurchasedOn < nextMonthStart)
                .Sum(purchase => purchase.Amount),
            TokenValueBoughtForTenant = tenant.TokenPurchasesBenefitedFrom
                .Where(purchase => purchase.PurchasedOn >= monthStart && purchase.PurchasedOn < nextMonthStart)
                .Sum(purchase => purchase.Amount),
            TokenValueBoughtForOthers = tenant.TokenPurchasesMade
                .Where(purchase =>
                    purchase.PurchasedOn >= monthStart
                    && purchase.PurchasedOn < nextMonthStart
                    && purchase.BeneficiaryTenantId != tenant.Id)
                .Sum(purchase => purchase.Amount)
        })
        .Select(tenant => new MonthlyTenantSummaryResponse(
            tenant.Id,
            tenant.Name,
            tenant.Unit,
            tenant.CashPaidToOthers,
            tenant.CashReceivedFromOthers,
            tenant.TokenValueBoughtByTenant,
            tenant.TokenValueBoughtForTenant,
            tenant.TokenValueBoughtForOthers,
            tenant.CashReceivedFromOthers - tenant.TokenValueBoughtForOthers))
        .ToListAsync();

    return Results.Ok(summaries);
});

app.Run();

static IQueryable<T> ApplyDateFilter<T>(
    IQueryable<T> query,
    System.Linq.Expressions.Expression<Func<T, DateOnly>> dateSelector,
    int? year,
    int? month)
{
    if (year is null && month is null)
    {
        return query;
    }

    var selectedYear = year ?? DateTime.Today.Year;
    var selectedMonth = month ?? 1;
    var start = new DateOnly(selectedYear, selectedMonth, 1);
    var end = month is null ? start.AddYears(1) : start.AddMonths(1);

    return query.Where(BuildDateRangeExpression(dateSelector, start, end));
}

static System.Linq.Expressions.Expression<Func<T, bool>> BuildDateRangeExpression<T>(
    System.Linq.Expressions.Expression<Func<T, DateOnly>> dateSelector,
    DateOnly start,
    DateOnly end)
{
    var parameter = dateSelector.Parameters[0];
    var greaterThanOrEqual = System.Linq.Expressions.Expression.GreaterThanOrEqual(
        dateSelector.Body,
        System.Linq.Expressions.Expression.Constant(start));
    var lessThan = System.Linq.Expressions.Expression.LessThan(
        dateSelector.Body,
        System.Linq.Expressions.Expression.Constant(end));
    var body = System.Linq.Expressions.Expression.AndAlso(greaterThanOrEqual, lessThan);

    return System.Linq.Expressions.Expression.Lambda<Func<T, bool>>(body, parameter);
}

static async Task<bool> TenantsExist(ElectricityPaymentsDbContext db, int firstTenantId, int secondTenantId)
{
    var ids = new[] { firstTenantId, secondTenantId }.Distinct().ToArray();
    var tenantCount = await db.Tenants.CountAsync(tenant => ids.Contains(tenant.Id));

    return tenantCount == ids.Length;
}

static string? CleanOptionalText(string? value)
{
    return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
