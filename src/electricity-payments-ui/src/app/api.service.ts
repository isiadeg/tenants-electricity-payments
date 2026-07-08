import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { MonthlyTenantSummary, Tenant, TenantPayment, TokenPurchase } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  private getHeaders() {
    const passcode = localStorage.getItem('admin_passcode') ?? '';
    return {
      headers: {
        'X-Admin-Passcode': passcode
      }
    };
  }

  verifyPasscode(passcode: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/verify`, { passcode });
  }

  getTenants(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(`${this.base}/tenants`);
  }

  addTenant(name: string, unit: string): Observable<Tenant> {
    return this.http.post<Tenant>(`${this.base}/tenants`, { name, unit }, this.getHeaders());
  }

  updateTenant(id: number, name: string, unit: string): Observable<Tenant> {
    return this.http.put<Tenant>(`${this.base}/tenants/${id}`, { name, unit }, this.getHeaders());
  }

  deleteTenant(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/tenants/${id}`, this.getHeaders());
  }

  getPayments(year: number, month: number): Observable<TenantPayment[]> {
    return this.http.get<TenantPayment[]>(
      `${this.base}/tenant-payments?year=${year}&month=${month}`,
    );
  }

  addPayment(payload: {
    paidByTenantId: number;
    receivedByTenantId: number;
    amount: number;
    paidOn: string;
    note: string;
  }): Observable<number> {
    return this.http.post<number>(`${this.base}/tenant-payments`, payload, this.getHeaders());
  }

  updatePayment(id: number, payload: {
    paidByTenantId: number;
    receivedByTenantId: number;
    amount: number;
    paidOn: string;
    note: string;
  }): Observable<void> {
    return this.http.put<void>(`${this.base}/tenant-payments/${id}`, payload, this.getHeaders());
  }

  deletePayment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/tenant-payments/${id}`, this.getHeaders());
  }

  reactToPayment(id: number, payload: { reactionType: string | null; previousReactionType: string | null }): Observable<{ confirmedCount: number; rejectedCount: number }> {
    return this.http.post<{ confirmedCount: number; rejectedCount: number }>(`${this.base}/tenant-payments/${id}/react`, payload);
  }

  getTokenPurchases(year: number, month: number): Observable<TokenPurchase[]> {
    return this.http.get<TokenPurchase[]>(
      `${this.base}/token-purchases?year=${year}&month=${month}`,
    );
  }

  addTokenPurchase(payload: {
    purchasedByTenantId: number;
    beneficiaryTenantId: number;
    amount: number;
    purchasedOn: string;
    tokenNumber: string;
    note: string;
  }): Observable<number> {
    return this.http.post<number>(`${this.base}/token-purchases`, payload, this.getHeaders());
  }

  updateTokenPurchase(id: number, payload: {
    purchasedByTenantId: number;
    beneficiaryTenantId: number;
    amount: number;
    purchasedOn: string;
    tokenNumber: string;
    note: string;
  }): Observable<void> {
    return this.http.put<void>(`${this.base}/token-purchases/${id}`, payload, this.getHeaders());
  }

  deleteTokenPurchase(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/token-purchases/${id}`, this.getHeaders());
  }

  reactToToken(id: number, payload: { reactionType: string | null; previousReactionType: string | null }): Observable<{ confirmedCount: number; rejectedCount: number }> {
    return this.http.post<{ confirmedCount: number; rejectedCount: number }>(`${this.base}/token-purchases/${id}/react`, payload);
  }

  getMonthlySummary(year: number, month: number): Observable<MonthlyTenantSummary[]> {
    return this.http.get<MonthlyTenantSummary[]>(
      `${this.base}/summary/monthly?year=${year}&month=${month}`,
    );
  }

  /** Fetch payments for a week that may span two months. */
  getPaymentsForWeek(
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
  ): Observable<TenantPayment[]> {
    if (startMonth === endMonth && startYear === endYear) {
      return this.getPayments(startYear, startMonth);
    }
    return new Observable((observer) => {
      forkJoin([
        this.getPayments(startYear, startMonth),
        this.getPayments(endYear, endMonth),
      ]).subscribe({
        next: ([a, b]) => observer.next([...a, ...b]),
        error: (e) => observer.error(e),
        complete: () => observer.complete(),
      });
    });
  }

  /** Fetch token purchases for a week that may span two months. */
  getTokensForWeek(
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
  ): Observable<TokenPurchase[]> {
    if (startMonth === endMonth && startYear === endYear) {
      return this.getTokenPurchases(startYear, startMonth);
    }
    return new Observable((observer) => {
      forkJoin([
        this.getTokenPurchases(startYear, startMonth),
        this.getTokenPurchases(endYear, endMonth),
      ]).subscribe({
        next: ([a, b]) => observer.next([...a, ...b]),
        error: (e) => observer.error(e),
        complete: () => observer.complete(),
      });
    });
  }
}
