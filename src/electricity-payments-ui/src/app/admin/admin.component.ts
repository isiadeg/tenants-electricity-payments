import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
import { MonthlyTenantSummary, Tenant, TenantPayment, TokenPurchase } from '../models';

@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  private readonly apiService = inject(ApiService);

  protected readonly isLoggedIn = signal<boolean>(!!localStorage.getItem('admin_passcode'));
  protected readonly loginPasscode = signal<string>('');
  protected readonly loginError = signal<string>('');

  protected readonly tenants = signal<Tenant[]>([]);
  protected readonly tenantPayments = signal<TenantPayment[]>([]);
  protected readonly tokenPurchases = signal<TokenPurchase[]>([]);
  protected readonly monthlySummary = signal<MonthlyTenantSummary[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');

  protected readonly selectedYear = signal(new Date().getFullYear());
  protected readonly selectedMonth = signal(new Date().getMonth() + 1);

  protected readonly tenantForm = signal({ name: '', unit: '' });

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

  // Edit states
  protected readonly editingTenant = signal<Tenant | null>(null);
  protected editTenantForm = { name: '', unit: '' };

  protected readonly editingPayment = signal<TenantPayment | null>(null);
  protected editPaymentForm = {
    id: 0,
    paidByTenantId: 0,
    receivedByTenantId: 0,
    amount: 0,
    paidOn: '',
    note: '',
  };

  protected readonly editingToken = signal<TokenPurchase | null>(null);
  protected editTokenForm = {
    id: 0,
    purchasedByTenantId: 0,
    beneficiaryTenantId: 0,
    amount: 0,
    purchasedOn: '',
    tokenNumber: '',
    note: '',
  };

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
    if (this.isLoggedIn()) {
      this.loadDashboard();
    }
  }

  protected login(): void {
    const code = this.loginPasscode().trim();
    if (!code) {
      this.loginError.set('Please enter a passcode.');
      return;
    }
    this.apiService.verifyPasscode(code).subscribe({
      next: () => {
        localStorage.setItem('admin_passcode', code);
        this.isLoggedIn.set(true);
        this.loginError.set('');
        this.loadDashboard();
      },
      error: () => {
        this.loginError.set('Invalid passcode.');
      }
    });
  }

  protected logout(): void {
    localStorage.removeItem('admin_passcode');
    this.isLoggedIn.set(false);
    this.loginPasscode.set('');
  }

  protected addTenant(): void {
    const form = this.tenantForm();
    if (!form.name.trim() || !form.unit.trim()) {
      this.errorMessage.set('Enter both the tenant name and the unit.');
      return;
    }

    this.apiService
      .addTenant(form.name, form.unit)
      .subscribe({
        next: () => {
          this.tenantForm.set({ name: '', unit: '' });
          this.loadDashboard();
        },
        error: (err) => this.errorMessage.set(err.error || 'Could not add tenant.'),
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

    this.apiService
      .addPayment({
        paidByTenantId: Number(form.paidByTenantId),
        receivedByTenantId: Number(form.receivedByTenantId),
        amount: Number(form.amount),
        paidOn: form.paidOn,
        note: form.note,
      })
      .subscribe({
        next: () => {
          this.paymentForm.update((c) => ({ ...c, amount: 0, note: '' }));
          this.loadDashboard();
        },
        error: (err) => this.errorMessage.set(err.error || 'Could not record tenant payment.'),
      });
  }

  protected addTokenPurchase(): void {
    const form = this.tokenForm();
    if (
      !form.purchasedByTenantId ||
      !form.beneficiaryTenantId ||
      form.amount <= 0 ||
      !form.purchasedOn
    ) {
      this.errorMessage.set(
        'Choose who bought token, who it was for, amount, and purchase date.',
      );
      return;
    }

    this.apiService
      .addTokenPurchase({
        purchasedByTenantId: Number(form.purchasedByTenantId),
        beneficiaryTenantId: Number(form.beneficiaryTenantId),
        amount: Number(form.amount),
        purchasedOn: form.purchasedOn,
        tokenNumber: form.tokenNumber,
        note: form.note,
      })
      .subscribe({
        next: () => {
          this.tokenForm.update((c) => ({ ...c, amount: 0, tokenNumber: '', note: '' }));
          this.loadDashboard();
        },
        error: (err) => this.errorMessage.set(err.error || 'Could not record token purchase.'),
      });
  }

  // Tenant Edit & Delete
  protected startEditTenant(tenant: any): void {
    this.editingTenant.set({ id: tenant.tenantId, name: tenant.tenantName, unit: tenant.unit });
    this.editTenantForm = { name: tenant.tenantName, unit: tenant.unit };
  }

  protected closeEditTenant(): void {
    this.editingTenant.set(null);
  }

  protected saveTenant(): void {
    const tenant = this.editingTenant();
    if (!tenant) return;

    const name = this.editTenantForm.name.trim();
    const unit = this.editTenantForm.unit.trim();
    if (!name || !unit) {
      alert('Enter both tenant name and unit.');
      return;
    }

    this.apiService.updateTenant(tenant.id, name, unit).subscribe({
      next: () => {
        this.closeEditTenant();
        this.loadDashboard();
      },
      error: (err) => alert(err.error || 'Could not update tenant.')
    });
  }

  protected deleteTenant(id: number, name: string): void {
    if (!confirm(`Are you sure you want to delete tenant "${name}"?`)) return;

    this.apiService.deleteTenant(id).subscribe({
      next: () => {
        this.loadDashboard();
      },
      error: (err) => {
        alert(err.error || 'Could not delete tenant.');
      }
    });
  }

  // Payment Edit & Delete
  protected startEditPayment(payment: TenantPayment): void {
    this.editingPayment.set(payment);
    this.editPaymentForm = {
      id: payment.id,
      paidByTenantId: payment.paidByTenantId,
      receivedByTenantId: payment.receivedByTenantId,
      amount: payment.amount,
      paidOn: payment.paidOn,
      note: payment.note ?? '',
    };
  }

  protected closeEditPayment(): void {
    this.editingPayment.set(null);
  }

  protected savePayment(): void {
    const payment = this.editingPayment();
    if (!payment) return;

    const form = this.editPaymentForm;
    if (!form.paidByTenantId || !form.receivedByTenantId || form.amount <= 0 || !form.paidOn) {
      alert('Choose who paid, who received, amount, and payment date.');
      return;
    }
    if (form.paidByTenantId === form.receivedByTenantId) {
      alert('For a tenant payment, payer and receiver must be different tenants.');
      return;
    }

    this.apiService.updatePayment(payment.id, {
      paidByTenantId: Number(form.paidByTenantId),
      receivedByTenantId: Number(form.receivedByTenantId),
      amount: Number(form.amount),
      paidOn: form.paidOn,
      note: form.note,
    }).subscribe({
      next: () => {
        this.closeEditPayment();
        this.loadDashboard();
      },
      error: (err) => alert(err.error || 'Could not update payment.')
    });
  }

  protected deletePayment(id: number): void {
    if (!confirm('Are you sure you want to delete this payment record?')) return;

    this.apiService.deletePayment(id).subscribe({
      next: () => {
        this.loadDashboard();
      },
      error: (err) => alert(err.error || 'Could not delete payment.')
    });
  }

  // Token Edit & Delete
  protected startEditToken(purchase: TokenPurchase): void {
    this.editingToken.set(purchase);
    this.editTokenForm = {
      id: purchase.id,
      purchasedByTenantId: purchase.purchasedByTenantId,
      beneficiaryTenantId: purchase.beneficiaryTenantId,
      amount: purchase.amount,
      purchasedOn: purchase.purchasedOn,
      tokenNumber: purchase.tokenNumber ?? '',
      note: purchase.note ?? '',
    };
  }

  protected closeEditToken(): void {
    this.editingToken.set(null);
  }

  protected saveToken(): void {
    const purchase = this.editingToken();
    if (!purchase) return;

    const form = this.editTokenForm;
    if (!form.purchasedByTenantId || !form.beneficiaryTenantId || form.amount <= 0 || !form.purchasedOn) {
      alert('Choose who bought token, who it was for, amount, and purchase date.');
      return;
    }

    this.apiService.updateTokenPurchase(purchase.id, {
      purchasedByTenantId: Number(form.purchasedByTenantId),
      beneficiaryTenantId: Number(form.beneficiaryTenantId),
      amount: Number(form.amount),
      purchasedOn: form.purchasedOn,
      tokenNumber: form.tokenNumber,
      note: form.note,
    }).subscribe({
      next: () => {
        this.closeEditToken();
        this.loadDashboard();
      },
      error: (err) => alert(err.error || 'Could not update token purchase.')
    });
  }

  protected deleteToken(id: number): void {
    if (!confirm('Are you sure you want to delete this token purchase record?')) return;

    this.apiService.deleteTokenPurchase(id).subscribe({
      next: () => {
        this.loadDashboard();
      },
      error: (err) => alert(err.error || 'Could not delete token purchase.')
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
    field:
      | 'purchasedByTenantId'
      | 'beneficiaryTenantId'
      | 'amount'
      | 'purchasedOn'
      | 'tokenNumber'
      | 'note',
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

  protected updateLoginPasscode(value: string): void {
    this.loginPasscode.set(value);
  }

  private loadDashboard(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.apiService.getTenants().subscribe({
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

    this.apiService
      .getPayments(year, month)
      .subscribe({
        next: (payments) => this.tenantPayments.set(payments),
        error: () => this.errorMessage.set('Could not load tenant payments for this month.'),
      });

    this.apiService
      .getTokenPurchases(year, month)
      .subscribe({
        next: (purchases) => this.tokenPurchases.set(purchases),
        error: () => this.errorMessage.set('Could not load token purchases for this month.'),
      });

    this.apiService
      .getMonthlySummary(year, month)
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
    if (tenants.length === 0) return;

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
