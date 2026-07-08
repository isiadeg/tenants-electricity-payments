import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { ApiService } from '../api.service';
import { MonthlyTenantSummary, Tenant, TenantPayment, TokenPurchase } from '../models';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TODAY_STR = toDateStr(new Date());
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

@Component({
  selector: 'app-calendar-view',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './calendar-view.component.html',
  styleUrl: './calendar-view.component.scss',
})
export class CalendarViewComponent implements OnInit {
  private readonly api = inject(ApiService);

  // Core view state
  protected readonly subView = signal<'calendar' | 'summary'>('calendar');
  protected readonly mode = signal<'payments' | 'tokens'>('tokens');
  protected readonly summaryTab = signal<'payments' | 'tokens'>('tokens');
  protected readonly isLoading = signal(true);
  protected readonly isSummaryLoading = signal(false);
  protected readonly errorMessage = signal('');

  // Filtering state
  protected readonly tenants = signal<Tenant[]>([]);
  protected readonly selectedTenantId = signal<number | null>(null);
  protected readonly selectedYear = signal<number>(new Date().getFullYear());
  protected readonly selectedMonth = signal<number>(new Date().getMonth() + 1);
  protected readonly weekStart = signal<Date>(getMondayOfWeek(new Date()));

  // Data signals
  private readonly allPayments = signal<TenantPayment[]>([]);
  private readonly allTokens = signal<TokenPurchase[]>([]);
  protected readonly monthlySummary = signal<MonthlyTenantSummary[]>([]);

  // Filter dropdown assets
  protected readonly yearsList = [2025, 2026, 2027, 2028];
  protected readonly monthsList = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];

  // Calendar view aggregates
  protected readonly weekDays = computed(() => {
    const start = this.weekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const dateStr = toDateStr(date);
      return {
        date,
        dateStr,
        dayName: DAY_NAMES[i],
        dayNum: date.getDate(),
        isToday: dateStr === TODAY_STR,
      };
    });
  });

  protected readonly weekLabel = computed(() => {
    const start = this.weekStart();
    const end = addDays(start, 6);
    const startFmt = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(start);
    const endFmt = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(end);
    return `${startFmt} – ${endFmt}`;
  });

  private readonly paymentsByDate = computed(() => {
    const map = new Map<string, TenantPayment[]>();
    for (const p of this.allPayments()) {
      const list = map.get(p.paidOn) ?? [];
      list.push(p);
      map.set(p.paidOn, list);
    }
    return map;
  });

  private readonly tokensByDate = computed(() => {
    const map = new Map<string, TokenPurchase[]>();
    for (const t of this.allTokens()) {
      const list = map.get(t.purchasedOn) ?? [];
      list.push(t);
      map.set(t.purchasedOn, list);
    }
    return map;
  });

  // Summary view aggregates
  protected readonly totalCashSentSum = computed(() =>
    this.monthlySummary().reduce((sum, item) => sum + item.cashPaidToOthers, 0)
  );

  protected readonly totalCashReceivedSum = computed(() =>
    this.monthlySummary().reduce((sum, item) => sum + item.cashReceivedFromOthers, 0)
  );

  protected readonly totalTokensBoughtSum = computed(() =>
    this.monthlySummary().reduce((sum, item) => sum + item.tokenValueBoughtByTenant, 0)
  );

  protected readonly totalTokensBenefitedSum = computed(() =>
    this.monthlySummary().reduce((sum, item) => sum + item.tokenValueBoughtForTenant, 0)
  );

  protected readonly totalHeldBalanceSum = computed(() =>
    this.monthlySummary().reduce((sum, item) => sum + item.heldCashBalance, 0)
  );

  protected readonly totalOutflowSum = computed(() =>
    this.monthlySummary().reduce((sum, tenant) => sum + this.getTenantOutflow(tenant), 0)
  );

  protected readonly cashTokensComparisonPct = computed(() => {
    const cash = this.totalCashSentSum();
    const tokens = this.totalTokensBoughtSum();
    if (cash === 0 && tokens === 0) return 50;
    return (tokens / (cash + tokens)) * 100;
  });

  ngOnInit(): void {
    this.loadTenants();
    this.loadWeekData();
    this.loadSummaryData();
  }

  protected loadTenants(): void {
    this.api.getTenants().subscribe({
      next: (data) => this.tenants.set(data),
      error: () => this.errorMessage.set('Could not load tenants.')
    });
  }

  protected loadSummaryData(): void {
    this.isSummaryLoading.set(true);
    this.api.getMonthlySummary(this.selectedYear(), this.selectedMonth()).subscribe({
      next: (data) => {
        this.monthlySummary.set(data);
        this.isSummaryLoading.set(false);
      },
      error: () => {
        this.isSummaryLoading.set(false);
        this.errorMessage.set('Could not load monthly summary.');
      }
    });
  }

  protected onMonthYearChange(): void {
    const year = this.selectedYear();
    const month = this.selectedMonth();
    const firstOfMonth = new Date(year, month - 1, 1);
    this.weekStart.set(getMondayOfWeek(firstOfMonth));
    this.loadWeekData();
    this.loadSummaryData();
  }

  protected onMonthChange(value: any): void {
    this.selectedMonth.set(Number(value));
    this.onMonthYearChange();
  }

  protected onYearChange(value: any): void {
    this.selectedYear.set(Number(value));
    this.onMonthYearChange();
  }

  protected onTenantChange(value: any): void {
    this.selectedTenantId.set(value && value !== 'null' ? Number(value) : null);
  }

  protected resetFilters(): void {
    this.selectedTenantId.set(null);
    this.selectedYear.set(new Date().getFullYear());
    this.selectedMonth.set(new Date().getMonth() + 1);
    this.weekStart.set(getMondayOfWeek(new Date()));
    this.loadWeekData();
    this.loadSummaryData();
  }

  protected hasActiveFilters(): boolean {
    const isCurrentWeek = toDateStr(this.weekStart()) === toDateStr(getMondayOfWeek(new Date()));
    return this.selectedTenantId() !== null ||
           this.selectedYear() !== new Date().getFullYear() ||
           this.selectedMonth() !== (new Date().getMonth() + 1) ||
           !isCurrentWeek;
  }

  protected getTenantOutflow(tenant: MonthlyTenantSummary): number {
    const tokensBoughtForSelf = tenant.tokenValueBoughtByTenant - tenant.tokenValueBoughtForOthers;
    return tenant.cashPaidToOthers + tokensBoughtForSelf;
  }

  protected getTokensBoughtForSelf(tenant: MonthlyTenantSummary): number {
    return tenant.tokenValueBoughtByTenant - tenant.tokenValueBoughtForOthers;
  }

  protected paymentsForDay(dateStr: string): TenantPayment[] {
    const list = this.paymentsByDate().get(dateStr) ?? [];
    const tenantId = this.selectedTenantId();
    if (tenantId !== null) {
      return list.filter(p => p.paidByTenantId === tenantId || p.receivedByTenantId === tenantId);
    }
    return list;
  }

  protected tokensForDay(dateStr: string): TokenPurchase[] {
    const list = this.tokensByDate().get(dateStr) ?? [];
    const tenantId = this.selectedTenantId();
    if (tenantId !== null) {
      return list.filter(t => t.purchasedByTenantId === tenantId || t.beneficiaryTenantId === tenantId);
    }
    return list;
  }

  protected prevWeek(): void {
    this.weekStart.update((d) => addDays(d, -7));
    this.loadWeekData();
  }

  protected nextWeek(): void {
    this.weekStart.update((d) => addDays(d, 7));
    this.loadWeekData();
  }

  protected goToToday(): void {
    this.weekStart.set(getMondayOfWeek(new Date()));
    this.loadWeekData();
  }

  protected setMode(m: 'payments' | 'tokens'): void {
    this.mode.set(m);
  }

  protected setSubView(v: 'calendar' | 'summary'): void {
    this.subView.set(v);
  }

  protected setSummaryTab(t: 'payments' | 'tokens'): void {
    this.summaryTab.set(t);
  }

  protected formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  protected isCurrentWeek(): boolean {
    return toDateStr(this.weekStart()) === toDateStr(getMondayOfWeek(new Date()));
  }

  protected hasReacted(id: number, type: 'payment' | 'token', reaction: 'confirm' | 'reject'): boolean {
    return localStorage.getItem(`react_${type}_${id}`) === reaction;
  }

  protected react(id: number, type: 'payment' | 'token', reaction: 'confirm' | 'reject'): void {
    const storageKey = `react_${type}_${id}`;
    const currentReaction = localStorage.getItem(storageKey);

    let newReaction: string | null = null;
    if (currentReaction !== reaction) {
      newReaction = reaction;
    }

    const payload = {
      reactionType: newReaction,
      previousReactionType: currentReaction
    };

    const obs = type === 'payment'
      ? this.api.reactToPayment(id, payload)
      : this.api.reactToToken(id, payload);

    obs.subscribe({
      next: (res) => {
        if (newReaction) {
          localStorage.setItem(storageKey, newReaction);
        } else {
          localStorage.removeItem(storageKey);
        }

        if (type === 'payment') {
          this.allPayments.update(list => list.map(item => {
            if (item.id === id) {
              return { ...item, confirmedCount: res.confirmedCount, rejectedCount: res.rejectedCount };
            }
            return item;
          }));
        } else {
          this.allTokens.update(list => list.map(item => {
            if (item.id === id) {
              return { ...item, confirmedCount: res.confirmedCount, rejectedCount: res.rejectedCount };
            }
            return item;
          }));
        }
      },
      error: () => {
        this.errorMessage.set('Could not save reaction.');
      }
    });
  }

  private loadWeekData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    const start = this.weekStart();
    const end = addDays(start, 6);

    const startYear = start.getFullYear();
    const startMonth = start.getMonth() + 1;
    const endYear = end.getFullYear();
    const endMonth = end.getMonth() + 1;

    const weekDates = new Set(
      Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i))),
    );

    forkJoin({
      payments: this.api.getPaymentsForWeek(startYear, startMonth, endYear, endMonth),
      tokens: this.api.getTokensForWeek(startYear, startMonth, endYear, endMonth),
    }).subscribe({
      next: ({ payments, tokens }) => {
        this.allPayments.set(payments.filter((p) => weekDates.has(p.paidOn)));
        this.allTokens.set(tokens.filter((t) => weekDates.has(t.purchasedOn)));
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Could not load data. Check that the API is running.');
      },
    });
  }
}
