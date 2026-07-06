# Electricity Payments

A learning project for recording irregular electricity cash movements and electricity token purchases among tenants.

The important domain idea is that cash movement and token purchase are different events:

- A tenant can pay another tenant any amount at any time.
- A tenant can buy an electricity token for himself or herself.
- A tenant can buy an electricity token on behalf of another tenant.
- Monthly totals are calculated from tenant payment and token purchase records instead of being stored as a fixed bill cycle.

## Run With Docker

```powershell
docker compose up --build
```

Then open:

- Angular UI: <http://localhost:4200>
- .NET API OpenAPI document: <http://localhost:5080/openapi/v1.json>

The API uses SQLite and stores the database in a Docker volume named `api-data`.

## Run Locally

Start the API:

```powershell
dotnet run --project src\ElectricityPayments.Api
```

Start the Angular app:

```powershell
cd src\electricity-payments-ui
npm.cmd start
```

PowerShell script execution may block `npm` or `ng` on this machine, so use `npm.cmd` and `ng.cmd`.

## First API Concepts To Notice

- `Program.cs` defines the minimal API endpoints.
- `ElectricityPaymentsDbContext` is the EF Core database context.
- `Tenant`, `TenantPayment`, and `TokenPurchase` are the main domain entities.
- Request and response records keep API input/output separate from database entities.

## First Angular Concepts To Notice

- `signal()` stores component state.
- `computed()` derives totals from state.
- `@if` and `@for` render conditional and repeated UI.
- `FormsModule` powers the simple form bindings.
