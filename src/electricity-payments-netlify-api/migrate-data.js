const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const tursoHost = process.env.DATABASE_URL.replace('libsql://', '');
const tursoToken = process.env.TURSO_AUTH_TOKEN;

async function tursoExecute(statements) {
    const requests = statements.map(sql => ({
        type: "execute",
        stmt: { sql }
    }));
    requests.push({ type: "close" });

    const res = await fetch(`https://${tursoHost}/v2/pipeline`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${tursoToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Turso HTTP error ${res.status}: ${text}`);
    }

    return res.json();
}

const runQuery = (db, query) => new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

async function migrate() {
    console.log("Connecting to Turso via HTTP...");

    console.log("Creating tables...");
    await tursoExecute([
        `CREATE TABLE IF NOT EXISTS "Tenants" ("Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "Name" TEXT NOT NULL, "Unit" TEXT NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "TenantPayments" ("Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "PaidByTenantId" INTEGER NOT NULL, "ReceivedByTenantId" INTEGER NOT NULL, "Amount" DECIMAL NOT NULL, "PaidOn" TEXT NOT NULL, "Note" TEXT, "ConfirmedCount" INTEGER NOT NULL DEFAULT 0, "RejectedCount" INTEGER NOT NULL DEFAULT 0);`,
        `CREATE TABLE IF NOT EXISTS "TokenPurchases" ("Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "PurchasedByTenantId" INTEGER NOT NULL, "BeneficiaryTenantId" INTEGER NOT NULL, "Amount" DECIMAL NOT NULL, "PurchasedOn" TEXT NOT NULL, "TokenNumber" TEXT, "Note" TEXT, "ConfirmedCount" INTEGER NOT NULL DEFAULT 0, "RejectedCount" INTEGER NOT NULL DEFAULT 0);`
    ]);
    console.log("Tables ready!");

    const localDbPath = path.resolve(__dirname, '../../electricity-payments-v2.db');
    console.log("Reading local database from:", localDbPath);

    const db = new sqlite3.Database(localDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) { console.error("Error opening local database:", err.message); process.exit(1); }
    });

    try {
        const tenants = await runQuery(db, "SELECT * FROM Tenants");
        const payments = await runQuery(db, "SELECT * FROM TenantPayments");
        const tokens = await runQuery(db, "SELECT * FROM TokenPurchases");
        console.log(`Found ${tenants.length} Tenants, ${payments.length} Payments, ${tokens.length} Token Purchases.`);

        console.log("Inserting Tenants...");
        const tenantSqls = tenants.map(t =>
            `INSERT OR REPLACE INTO "Tenants" ("Id", "Name", "Unit") VALUES (${t.Id}, '${t.Name.replace(/'/g, "''")}', '${t.Unit.replace(/'/g, "''")}');`
        );
        if (tenantSqls.length > 0) await tursoExecute(tenantSqls);

        console.log("Inserting Tenant Payments...");
        const paymentSqls = payments.map(p =>
            `INSERT OR REPLACE INTO "TenantPayments" ("Id","PaidByTenantId","ReceivedByTenantId","Amount","PaidOn","Note","ConfirmedCount","RejectedCount") VALUES (${p.Id},${p.PaidByTenantId},${p.ReceivedByTenantId},${p.Amount},'${p.PaidOn}',${p.Note ? `'${p.Note.replace(/'/g, "''")}'` : 'NULL'},${p.ConfirmedCount},${p.RejectedCount});`
        );
        if (paymentSqls.length > 0) await tursoExecute(paymentSqls);

        console.log("Inserting Token Purchases...");
        const tokenSqls = tokens.map(tp =>
            `INSERT OR REPLACE INTO "TokenPurchases" ("Id","PurchasedByTenantId","BeneficiaryTenantId","Amount","PurchasedOn","TokenNumber","Note","ConfirmedCount","RejectedCount") VALUES (${tp.Id},${tp.PurchasedByTenantId},${tp.BeneficiaryTenantId},${tp.Amount},'${tp.PurchasedOn}',${tp.TokenNumber ? `'${tp.TokenNumber.replace(/'/g, "''")}'` : 'NULL'},${tp.Note ? `'${tp.Note.replace(/'/g, "''")}'` : 'NULL'},${tp.ConfirmedCount},${tp.RejectedCount});`
        );
        if (tokenSqls.length > 0) await tursoExecute(tokenSqls);

        console.log("✅ Migration complete!");
    } catch (e) {
        console.error("Migration failed:", e.message);
    } finally {
        db.close();
    }
}

migrate();
