import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should render the tenant cash and token log', () => {
    const fixture = TestBed.createComponent(App);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    http.expectOne('http://localhost:5080/api/tenants').flush([
      { id: 1, name: 'Amina Yusuf', unit: 'Flat 1' },
      { id: 2, name: 'Chinedu Okafor', unit: 'Flat 2' },
    ]);
    http.expectOne(`http://localhost:5080/api/tenant-payments?year=${year}&month=${month}`).flush([]);
    http.expectOne(`http://localhost:5080/api/token-purchases?year=${year}&month=${month}`).flush([]);
    http.expectOne(`http://localhost:5080/api/summary/monthly?year=${year}&month=${month}`).flush([
      {
        tenantId: 1,
        tenantName: 'Amina Yusuf',
        unit: 'Flat 1',
        cashPaidToOthers: 0,
        cashReceivedFromOthers: 0,
        tokenValueBoughtByTenant: 0,
        tokenValueBoughtForTenant: 0,
        tokenValueBoughtForOthers: 0,
        heldCashBalance: 0,
      },
    ]);

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Tenant cash and token log');
  });
});
