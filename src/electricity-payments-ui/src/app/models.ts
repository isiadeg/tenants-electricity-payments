export interface Tenant {
  id: number;
  name: string;
  unit: string;
}

export interface TenantPayment {
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
  confirmedCount: number;
  rejectedCount: number;
}

export interface TokenPurchase {
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
  confirmedCount: number;
  rejectedCount: number;
}

export interface MonthlyTenantSummary {
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
