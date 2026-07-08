import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'view', pathMatch: 'full' },
  {
    path: 'view',
    loadComponent: () =>
      import('./calendar-view/calendar-view.component').then((m) => m.CalendarViewComponent),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin/admin.component').then((m) => m.AdminComponent),
  },
  { path: '**', redirectTo: 'view' },
];
