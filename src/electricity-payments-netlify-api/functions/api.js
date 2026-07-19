const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@libsql/client');
const { PrismaLibSQL } = require('@prisma/adapter-libsql');
const dotenv = require('dotenv');

dotenv.config();

const libsql = createClient({
  url: process.env.DATABASE_URL.replace('libsql://', 'https://'),
  authToken: process.env.TURSO_AUTH_TOKEN
});
const adapter = new PrismaLibSQL(libsql);
const prisma = new PrismaClient({ adapter });

const app = express();

app.use(cors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200']
}));
app.use(express.json());

// Admin Middleware
const adminFilter = (req, res, next) => {
    const configuredPasscode = process.env.ADMIN_PASSCODE || "0Ae:2pWPPP";
    const headerPasscode = req.headers['x-admin-passcode'];

    if (headerPasscode !== configuredPasscode) {
        return res.status(401).send();
    }
    next();
};

const api = express.Router();

// --- Auth ---
api.post('/auth/verify', (req, res) => {
    const configuredPasscode = process.env.ADMIN_PASSCODE || "0Ae:2pWPPP";
    if (req.body.passcode === configuredPasscode) {
        return res.status(200).send();
    }
    return res.status(401).send();
});

// --- Tenants ---
api.get('/tenants', async (req, res) => {
    const tenants = await prisma.tenant.findMany({
        orderBy: { Unit: 'asc' }
    });
    const response = tenants.map(t => ({ id: t.Id, name: t.Name, unit: t.Unit }));
    res.json(response);
});

api.post('/tenants', adminFilter, async (req, res) => {
    const { name, unit } = req.body;
    if (!name || !name.trim() || !unit || !unit.trim()) {
        return res.status(400).send("Tenant name and unit are required.");
    }

    const tenant = await prisma.tenant.create({
        data: {
            Name: name.trim(),
            Unit: unit.trim()
        }
    });

    res.status(201).json({ id: tenant.Id, name: tenant.Name, unit: tenant.Unit });
});

api.put('/tenants/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, unit } = req.body;
    if (!name || !name.trim() || !unit || !unit.trim()) {
        return res.status(400).send("Tenant name and unit are required.");
    }

    const existing = await prisma.tenant.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Tenant not found.");

    const tenant = await prisma.tenant.update({
        where: { Id: id },
        data: { Name: name.trim(), Unit: unit.trim() }
    });

    res.json({ id: tenant.Id, name: tenant.Name, unit: tenant.Unit });
});

api.delete('/tenants/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.tenant.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Tenant not found.");

    const hasPayments = await prisma.tenantPayment.findFirst({
        where: { OR: [{ PaidByTenantId: id }, { ReceivedByTenantId: id }] }
    });
    const hasTokens = await prisma.tokenPurchase.findFirst({
        where: { OR: [{ PurchasedByTenantId: id }, { BeneficiaryTenantId: id }] }
    });

    if (hasPayments || hasTokens) {
        return res.status(400).send("Cannot delete tenant because they have associated payments or token purchases. Delete those records first.");
    }

    await prisma.tenant.delete({ where: { Id: id } });
    res.status(204).send();
});

// Helper for Date Filtering
const applyDateFilter = (year, month) => {
    if (!year && !month) return {};
    const selectedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const selectedMonth = month ? parseInt(month, 10) : 1;
    
    // YYYY-MM-DD formatting
    const startStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    let endYear = selectedYear;
    let endMonth = month ? selectedMonth + 1 : 13;
    if (endMonth > 12) {
        endMonth = 1;
        endYear++;
    }
    const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    
    return { gte: startStr, lt: endStr };
};

const tenantsExist = async (firstId, secondId) => {
    const ids = Array.from(new Set([firstId, secondId]));
    const count = await prisma.tenant.count({
        where: { Id: { in: ids } }
    });
    return count === ids.length;
};

// --- Tenant Payments ---
api.get('/tenant-payments', async (req, res) => {
    const { paidByTenantId, receivedByTenantId, year, month } = req.query;
    
    const whereClause = {};
    if (paidByTenantId) whereClause.PaidByTenantId = parseInt(paidByTenantId, 10);
    if (receivedByTenantId) whereClause.ReceivedByTenantId = parseInt(receivedByTenantId, 10);
    
    const dateFilter = applyDateFilter(year, month);
    if (Object.keys(dateFilter).length > 0) {
        whereClause.PaidOn = dateFilter;
    }

    const payments = await prisma.tenantPayment.findMany({
        where: whereClause,
        include: { PaidByTenant: true, ReceivedByTenant: true },
        orderBy: [{ PaidOn: 'desc' }, { Id: 'desc' }]
    });

    res.json(payments.map(p => ({
        id: p.Id,
        paidByTenantId: p.PaidByTenantId,
        paidByTenantName: p.PaidByTenant.Name,
        paidByTenantUnit: p.PaidByTenant.Unit,
        receivedByTenantId: p.ReceivedByTenantId,
        receivedByTenantName: p.ReceivedByTenant.Name,
        receivedByTenantUnit: p.ReceivedByTenant.Unit,
        amount: parseFloat(p.Amount),
        paidOn: p.PaidOn,
        note: p.Note,
        confirmedCount: p.ConfirmedCount,
        rejectedCount: p.RejectedCount
    })));
});

api.post('/tenant-payments', adminFilter, async (req, res) => {
    const { paidByTenantId, receivedByTenantId, amount, paidOn, note } = req.body;
    if (amount <= 0) return res.status(400).send("Payment amount must be greater than zero.");
    if (paidByTenantId === receivedByTenantId) return res.status(400).send("A tenant payment must move money from one tenant to another tenant.");
    
    if (!(await tenantsExist(paidByTenantId, receivedByTenantId))) {
        return res.status(404).send("One or both tenants were not found.");
    }

    const payment = await prisma.tenantPayment.create({
        data: {
            PaidByTenantId: paidByTenantId,
            ReceivedByTenantId: receivedByTenantId,
            Amount: amount,
            PaidOn: paidOn,
            Note: note?.trim() || null
        }
    });

    res.status(201).json(payment.Id);
});

api.put('/tenant-payments/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { paidByTenantId, receivedByTenantId, amount, paidOn, note } = req.body;
    if (amount <= 0) return res.status(400).send("Payment amount must be greater than zero.");
    if (paidByTenantId === receivedByTenantId) return res.status(400).send("A tenant payment must move money from one tenant to another tenant.");
    
    if (!(await tenantsExist(paidByTenantId, receivedByTenantId))) {
        return res.status(404).send("One or both tenants were not found.");
    }

    const existing = await prisma.tenantPayment.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Payment record not found.");

    await prisma.tenantPayment.update({
        where: { Id: id },
        data: {
            PaidByTenantId: paidByTenantId,
            ReceivedByTenantId: receivedByTenantId,
            Amount: amount,
            PaidOn: paidOn,
            Note: note?.trim() || null
        }
    });

    res.status(204).send();
});

api.delete('/tenant-payments/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.tenantPayment.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Payment record not found.");

    await prisma.tenantPayment.delete({ where: { Id: id } });
    res.status(204).send();
});

api.post('/tenant-payments/:id/react', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { previousReactionType, reactionType } = req.body;
    
    const payment = await prisma.tenantPayment.findUnique({ where: { Id: id } });
    if (!payment) return res.status(404).send("Payment record not found.");

    let confCount = payment.ConfirmedCount;
    let rejCount = payment.RejectedCount;

    if (previousReactionType === "confirm") confCount = Math.max(0, confCount - 1);
    else if (previousReactionType === "reject") rejCount = Math.max(0, rejCount - 1);

    if (reactionType === "confirm") confCount++;
    else if (reactionType === "reject") rejCount++;

    await prisma.tenantPayment.update({
        where: { Id: id },
        data: { ConfirmedCount: confCount, RejectedCount: rejCount }
    });

    res.json({ confirmedCount: confCount, rejectedCount: rejCount });
});

// --- Token Purchases ---
api.get('/token-purchases', async (req, res) => {
    const { purchasedByTenantId, beneficiaryTenantId, year, month } = req.query;
    
    const whereClause = {};
    if (purchasedByTenantId) whereClause.PurchasedByTenantId = parseInt(purchasedByTenantId, 10);
    if (beneficiaryTenantId) whereClause.BeneficiaryTenantId = parseInt(beneficiaryTenantId, 10);
    
    const dateFilter = applyDateFilter(year, month);
    if (Object.keys(dateFilter).length > 0) {
        whereClause.PurchasedOn = dateFilter;
    }

    const purchases = await prisma.tokenPurchase.findMany({
        where: whereClause,
        include: { PurchasedByTenant: true, BeneficiaryTenant: true },
        orderBy: [{ PurchasedOn: 'desc' }, { Id: 'desc' }]
    });

    res.json(purchases.map(p => ({
        id: p.Id,
        purchasedByTenantId: p.PurchasedByTenantId,
        purchasedByTenantName: p.PurchasedByTenant.Name,
        purchasedByTenantUnit: p.PurchasedByTenant.Unit,
        beneficiaryTenantId: p.BeneficiaryTenantId,
        beneficiaryTenantName: p.BeneficiaryTenant.Name,
        beneficiaryTenantUnit: p.BeneficiaryTenant.Unit,
        amount: parseFloat(p.Amount),
        purchasedOn: p.PurchasedOn,
        tokenNumber: p.TokenNumber,
        note: p.Note,
        confirmedCount: p.ConfirmedCount,
        rejectedCount: p.RejectedCount
    })));
});

api.post('/token-purchases', adminFilter, async (req, res) => {
    const { purchasedByTenantId, beneficiaryTenantId, amount, purchasedOn, tokenNumber, note } = req.body;
    if (amount <= 0) return res.status(400).send("Token purchase amount must be greater than zero.");
    
    if (!(await tenantsExist(purchasedByTenantId, beneficiaryTenantId))) {
        return res.status(404).send("One or both tenants were not found.");
    }

    const purchase = await prisma.tokenPurchase.create({
        data: {
            PurchasedByTenantId: purchasedByTenantId,
            BeneficiaryTenantId: beneficiaryTenantId,
            Amount: amount,
            PurchasedOn: purchasedOn,
            TokenNumber: tokenNumber?.trim() || null,
            Note: note?.trim() || null
        }
    });

    res.status(201).json(purchase.Id);
});

api.put('/token-purchases/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { purchasedByTenantId, beneficiaryTenantId, amount, purchasedOn, tokenNumber, note } = req.body;
    if (amount <= 0) return res.status(400).send("Token purchase amount must be greater than zero.");
    
    if (!(await tenantsExist(purchasedByTenantId, beneficiaryTenantId))) {
        return res.status(404).send("One or both tenants were not found.");
    }

    const existing = await prisma.tokenPurchase.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Token purchase record not found.");

    await prisma.tokenPurchase.update({
        where: { Id: id },
        data: {
            PurchasedByTenantId: purchasedByTenantId,
            BeneficiaryTenantId: beneficiaryTenantId,
            Amount: amount,
            PurchasedOn: purchasedOn,
            TokenNumber: tokenNumber?.trim() || null,
            Note: note?.trim() || null
        }
    });

    res.status(204).send();
});

api.delete('/token-purchases/:id', adminFilter, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.tokenPurchase.findUnique({ where: { Id: id } });
    if (!existing) return res.status(404).send("Token purchase record not found.");

    await prisma.tokenPurchase.delete({ where: { Id: id } });
    res.status(204).send();
});

api.post('/token-purchases/:id/react', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { previousReactionType, reactionType } = req.body;
    
    const purchase = await prisma.tokenPurchase.findUnique({ where: { Id: id } });
    if (!purchase) return res.status(404).send("Token purchase record not found.");

    let confCount = purchase.ConfirmedCount;
    let rejCount = purchase.RejectedCount;

    if (previousReactionType === "confirm") confCount = Math.max(0, confCount - 1);
    else if (previousReactionType === "reject") rejCount = Math.max(0, rejCount - 1);

    if (reactionType === "confirm") confCount++;
    else if (reactionType === "reject") rejCount++;

    await prisma.tokenPurchase.update({
        where: { Id: id },
        data: { ConfirmedCount: confCount, RejectedCount: rejCount }
    });

    res.json({ confirmedCount: confCount, rejectedCount: rejCount });
});

// --- Monthly Summary ---
api.get('/summary/monthly', async (req, res) => {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!year || !month || month < 1 || month > 12) {
        return res.status(400).send("Year and valid month (1-12) are required.");
    }

    const { gte: startStr, lt: endStr } = applyDateFilter(year, month);

    const tenants = await prisma.tenant.findMany({
        orderBy: { Unit: 'asc' },
        include: {
            PaymentsMade: { where: { PaidOn: { gte: startStr, lt: endStr } } },
            PaymentsReceived: { where: { PaidOn: { gte: startStr, lt: endStr } } },
            TokenPurchasesMade: { where: { PurchasedOn: { gte: startStr, lt: endStr } } },
            TokenPurchasesBenefitedFrom: { where: { PurchasedOn: { gte: startStr, lt: endStr } } }
        }
    });

    const summaries = tenants.map(tenant => {
        const sum = (arr) => arr.reduce((acc, curr) => acc + parseFloat(curr.Amount), 0);
        
        const cashPaidToOthers = sum(tenant.PaymentsMade);
        const cashReceivedFromOthers = sum(tenant.PaymentsReceived);
        const tokenValueBoughtByTenant = sum(tenant.TokenPurchasesMade);
        const tokenValueBoughtForTenant = sum(tenant.TokenPurchasesBenefitedFrom);
        
        const tokenValueBoughtForOthers = sum(tenant.TokenPurchasesMade.filter(p => p.BeneficiaryTenantId !== tenant.Id));

        return {
            tenantId: tenant.Id,
            tenantName: tenant.Name,
            tenantUnit: tenant.Unit,
            cashPaidToOthers,
            cashReceivedFromOthers,
            tokenValueBoughtByTenant,
            tokenValueBoughtForTenant,
            tokenValueBoughtForOthers,
            expectedCashPosition: cashReceivedFromOthers - tokenValueBoughtForOthers
        };
    });

    res.json(summaries);
});


app.use('/api', api);

module.exports.handler = serverless(app);
