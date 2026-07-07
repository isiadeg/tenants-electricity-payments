import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Tenant {
  id: number;
  name: string;
  unit: string;
}

interface TenantPayment {
  id: number;
  paidByTenantId: number;
  paidByTenantName: string;
  paidByUnit: string;
  receivedByTenantId: number;
  receivedByTenantName: string;
  receivedByUnit: string;
  amount: number;
  paidOn: string;
  note: string | null;
}

interface TokenPurchase {
  id: number;
  purchasedByTenantId: number;
  purchasedByTenantName: string;
  purchasedByUnit: string;
  beneficiaryTenantId: number;
  beneficiaryTenantName: string;
  beneficiaryUnit: string;
  amount: number;
  purchasedOn: string;
  tokenNumber: string | null;
  note: string | null;
}

interface MonthlyTenantSummary {
  tenantId: number;
  tenantName: string;
  unit: string;
  cashPaidToOthers: number;
  cashReceivedFromOthers: number;
  tokenValueBoughtByTenant: number;
  tokenValueBoughtForTenant: number;
  tokenValueBoughtForOthers: number;
  heldCashBalance: number;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api';

  protected readonly tenants = signal<Tenant[]>([]);
  protected readonly tenantPayments = signal<TenantPayment[]>([]);
  protected readonly tokenPurchases = signal<TokenPurchase[]>([]);
  protected readonly monthlySummary = signal<MonthlyTenantSummary[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');

  protected readonly selectedYear = signal(new Date().getFullYear());
  protected readonly selectedMonth = signal(new Date().getMonth() + 1);

  protected readonly tenantForm = signal({
    name: '',
    unit: '',
  });

  protected readonly paymentForm = signal({
    paidByTenantId: 0,
    receivedByTenantId: 0,
    amount: 0,
    paidOn: this.toInputDate(new Date()),
    note: '',
  });

  protected readonly tokenForm = signal({
    purchasedByTenantId: 0,
    beneficiaryTenantId: 0,
    amount: 0,
    purchasedOn: this.toInputDate(new Date()),
    tokenNumber: '',
    note: '',
  });

  protected readonly monthName = computed(() => {
    const date = new Date(this.selectedYear(), this.selectedMonth() - 1, 1);
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
  });

  protected readonly totalCashMovedThisMonth = computed(() =>
    this.monthlySummary().reduce((total, tenant) => total + tenant.cashPaidToOthers, 0),
  );

  protected readonly totalTokenValueThisMonth = computed(() =>
    this.monthlySummary().reduce((total, tenant) => total + tenant.tokenValueBoughtForTenant, 0),
  );

  protected readonly totalHeldCashBalance = computed(() =>
    this.monthlySummary().reduce((total, tenant) => total + tenant.heldCashBalance, 0),
  );

  constructor() {
    this.loadDashboard();
  }

  protected addTenant(): void {
    const form = this.tenantForm();
    if (!form.name.trim() || !form.unit.trim()) {
      this.errorMessage.set('Enter both the tenant name and the unit.');
      return;
    }

    this.http
      .post<Tenant>(`${this.apiBaseUrl}/tenants`, {
        name: form.name,
        unit: form.unit,
      })
      .subscribe({
        next: () => {
          this.tenantForm.set({ name: '', unit: '' });
          this.loadDashboard();
        },
        error: () => this.errorMessage.set('Could not add tenant. Check that the API is running.'),
      });
  }

  protected addTenantPayment(): void {
    const form = this.paymentForm();
    if (!form.paidByTenantId || !form.receivedByTenantId || form.amount <= 0 || !form.paidOn) {
      this.errorMessage.set('Choose who paid, who received, amount, and payment date.');
      return;
    }

    if (form.paidByTenantId === form.receivedByTenantId) {
      this.errorMessage.set('For a tenant payment, payer and receiver must be different tenants.');
      return;
    }

    this.http
      .post<number>(`${this.apiBaseUrl}/tenant-payments`, {
        paidByTenantId: Number(form.paidByTenantId),
        receivedByTenantId: Number(form.receivedByTenantId),
        amount: Number(form.amount),
        paidOn: form.paidOn,
        note: form.note,
      })
      .subscribe({
        next: () => {
          this.paymentForm.update((current) => ({ ...current, amount: 0, note: '' }));
          this.loadDashboard();
        },
        error: () => this.errorMessage.set('Could not record tenant payment.'),
      });
  }

  protected addTokenPurchase(): void {
    const form = this.tokenForm();
    if (!form.purchasedByTenantId || !form.beneficiaryTenantId || form.amount <= 0 || !form.purchasedOn) {
      this.errorMessage.set('Choose who bought token, who it was for, amount, and purchase date.');
      return;
    }

    this.http
      .post<number>(`${this.apiBaseUrl}/token-purchases`, {
        purchasedByTenantId: Number(form.purchasedByTenantId),
        beneficiaryTenantId: Number(form.beneficiaryTenantId),
        amount: Number(form.amount),
        purchasedOn: form.purchasedOn,
        tokenNumber: form.tokenNumber,
        note: form.note,
      })
      .subscribe({
        next: () => {
          this.tokenForm.update((current) => ({ ...current, amount: 0, tokenNumber: '', note: '' }));
          this.loadDashboard();
        },
        error: () => this.errorMessage.set('Could not record token purchase.'),
      });
  }

  protected changeMonth(offset: number): void {
    const date = new Date(this.selectedYear(), this.selectedMonth() - 1 + offset, 1);
    this.selectedYear.set(date.getFullYear());
    this.selectedMonth.set(date.getMonth() + 1);
    this.loadMonthData();
  }

  protected updateTenantForm(field: 'name' | 'unit', value: string): void {
    this.tenantForm.update((form) => ({ ...form, [field]: value }));
  }

  protected updatePaymentForm(
    field: 'paidByTenantId' | 'receivedByTenantId' | 'amount' | 'paidOn' | 'note',
    value: string,
  ): void {
    this.paymentForm.update((form) => ({
      ...form,
      [field]: field.endsWith('TenantId') || field === 'amount' ? Number(value) : value,
    }));
  }

  protected updateTokenForm(
    field: 'purchasedByTenantId' | 'beneficiaryTenantId' | 'amount' | 'purchasedOn' | 'tokenNumber' | 'note',
    value: string,
  ): void {
    this.tokenForm.update((form) => ({
      ...form,
      [field]: field.endsWith('TenantId') || field === 'amount' ? Number(value) : value,
    }));
  }

  protected formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private loadDashboard(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.http.get<Tenant[]>(`${this.apiBaseUrl}/tenants`).subscribe({
      next: (tenants) => {
        this.tenants.set(tenants);
        this.setDefaultTenantSelections(tenants);
        this.loadMonthData();
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Could not load tenants. Start the API and try again.');
      },
    });
  }

  private loadMonthData(): void {
    const year = this.selectedYear();
    const month = this.selectedMonth();

    this.http.get<TenantPayment[]>(`${this.apiBaseUrl}/tenant-payments?year=${year}&month=${month}`).subscribe({
      next: (payments) => this.tenantPayments.set(payments),
      error: () => this.errorMessage.set('Could not load tenant payments for this month.'),
    });

    this.http.get<TokenPurchase[]>(`${this.apiBaseUrl}/token-purchases?year=${year}&month=${month}`).subscribe({
      next: (purchases) => this.tokenPurchases.set(purchases),
      error: () => this.errorMessage.set('Could not load token purchases for this month.'),
    });

    this.http
      .get<MonthlyTenantSummary[]>(`${this.apiBaseUrl}/summary/monthly?year=${year}&month=${month}`)
      .subscribe({
        next: (summary) => {
          this.monthlySummary.set(summary);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Could not load monthly summary.');
        },
      });
  }

  private setDefaultTenantSelections(tenants: Tenant[]): void {
    if (tenants.length === 0) {
      return;
    }

    const firstTenantId = tenants[0].id;
    const secondTenantId = tenants[1]?.id ?? tenants[0].id;

    this.paymentForm.update((form) => ({
      ...form,
      paidByTenantId: form.paidByTenantId || firstTenantId,
      receivedByTenantId: form.receivedByTenantId || secondTenantId,
    }));

    this.tokenForm.update((form) => ({
      ...form,
      purchasedByTenantId: form.purchasedByTenantId || firstTenantId,
      beneficiaryTenantId: form.beneficiaryTenantId || firstTenantId,
    }));
  }

  private toInputDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
