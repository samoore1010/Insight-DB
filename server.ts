import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || "treasury.db";
const db = new Database(dbPath);
console.log(`Using database at: ${dbPath}`);

// Initialize database with AI-ready structure
// We maintain a 'settings' table for current state and a 'history' table for temporal analysis.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Ensure updated_at exists if table was created previously
try {
  db.exec("ALTER TABLE settings ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
} catch (e) {
  // Column already exists or other error
}

// === Granular storage tables ===
db.exec(`
  CREATE TABLE IF NOT EXISTS estimates (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    label TEXT NOT NULL,
    base_amount REAL NOT NULL DEFAULT 0,
    adjustment REAL NOT NULL DEFAULT 0,
    period TEXT NOT NULL DEFAULT 'Monthly',
    start_date TEXT NOT NULL,
    end_date TEXT,
    comments TEXT,
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS disbursements (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'Unfunded',
    type TEXT DEFAULT 'manual',
    comments TEXT,
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS balances (
    region TEXT NOT NULL,
    account_key TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (region, account_key)
  );

  CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    region TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    diff TEXT,
    snapshot TEXT,
    batch_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// === Users table for authentication ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    allowed_regions TEXT NOT NULL DEFAULT '[]',
    location TEXT NOT NULL DEFAULT 'executive',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add location column if missing (migration for existing DBs)
try {
  db.exec("ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT 'executive'");
} catch (e) {
  // Column already exists
}

// === Departments table ===
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    regions TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default admin user if no users exist
const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as any;
if (userCount.cnt === 0) {
  const adminId = crypto.randomUUID();
  // Simple hash for default admin/admin credentials
  const adminHash = crypto.createHash("sha256").update("admin").digest("hex");
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, allowed_regions, location) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(adminId, "admin", adminHash, "Administrator", "admin", "[]", "executive");
  console.log("Seeded default admin user (admin/admin)");
}

// Create indexes (wrapped in try/catch since they may already exist)
try { db.exec("CREATE INDEX IF NOT EXISTS idx_disbursements_region_date ON disbursements(region, date)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_changelog_entity ON changelog(entity_type, entity_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_changelog_region ON changelog(region)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_changelog_time ON changelog(created_at DESC)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_changelog_batch ON changelog(batch_id)"); } catch(e) {}

// === Migration: move blob data into normalized tables ===
function migrateFromBlobs() {
  const estimateCount = (db.prepare("SELECT COUNT(*) as cnt FROM estimates").get() as any).cnt;
  const disbursementCount = (db.prepare("SELECT COUNT(*) as cnt FROM disbursements").get() as any).cnt;
  const balanceCount = (db.prepare("SELECT COUNT(*) as cnt FROM balances").get() as any).cnt;

  const settingsRow = (key: string) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
    return row ? JSON.parse(row.value) : null;
  };

  // Migrate estimates
  if (estimateCount === 0) {
    const entityEstimates = settingsRow("entityEstimates");
    if (entityEstimates) {
      const insertEst = db.prepare(`
        INSERT OR IGNORE INTO estimates (id, region, label, base_amount, adjustment, period, start_date, end_date, comments, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [region, categories] of Object.entries(entityEstimates)) {
        for (const cat of categories as any[]) {
          insertEst.run(
            cat.id, region, cat.label, cat.baseAmount || 0, cat.adjustment || 0,
            cat.period || "Monthly", cat.startDate || "", cat.endDate || null,
            cat.comments || null, cat.attachments ? JSON.stringify(cat.attachments) : null
          );
        }
      }
      console.log("Migrated estimates from blob to normalized table");
    }
  }

  // Migrate manual disbursements
  if (disbursementCount === 0) {
    const manualOverrides = settingsRow("manualOverrides");
    if (manualOverrides) {
      const insertDisb = db.prepare(`
        INSERT OR IGNORE INTO disbursements (id, region, date, label, amount, status, type, comments, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [region, days] of Object.entries(manualOverrides)) {
        for (const [date, dayData] of Object.entries(days as any)) {
          const disbursements = (dayData as any).disbursements;
          if (disbursements && Array.isArray(disbursements)) {
            for (const d of disbursements) {
              insertDisb.run(
                d.id, region, date, d.label || "", d.amount || 0,
                d.status || "Unfunded", d.type || "manual",
                d.comments || null, d.attachments ? JSON.stringify(d.attachments) : null
              );
            }
          }
        }
      }
      console.log("Migrated disbursements from blob to normalized table");
    }
  }

  // Migrate balances
  if (balanceCount === 0) {
    const manualBalances = settingsRow("manualBalances");
    if (manualBalances) {
      const insertBal = db.prepare(`
        INSERT OR IGNORE INTO balances (region, account_key, amount) VALUES (?, ?, ?)
      `);
      for (const [region, accounts] of Object.entries(manualBalances)) {
        for (const [key, amount] of Object.entries(accounts as any)) {
          insertBal.run(region, key, amount as number);
        }
      }
      console.log("Migrated balances from blob to normalized table");
    }
  }
}

migrateFromBlobs();

// === Helper: sync normalized tables back to settings blob ===
function syncEstimatesBlob() {
  const rows = db.prepare("SELECT * FROM estimates ORDER BY region, created_at").all() as any[];
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    if (!grouped[row.region]) grouped[row.region] = [];
    grouped[row.region].push({
      id: row.id, label: row.label, baseAmount: row.base_amount,
      adjustment: row.adjustment, period: row.period, startDate: row.start_date,
      endDate: row.end_date || undefined, comments: row.comments || undefined,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    });
  }
  // Ensure all regions exist
  for (const r of ["Flint", "ISH", "Coldwater", "Chicago"]) {
    if (!grouped[r]) grouped[r] = [];
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('entityEstimates', ?, CURRENT_TIMESTAMP)")
    .run(JSON.stringify(grouped));
}

function syncDisbursementsBlob() {
  const rows = db.prepare("SELECT * FROM disbursements ORDER BY region, date, created_at").all() as any[];
  const grouped: Record<string, Record<string, any>> = {};
  for (const r of ["Flint", "ISH", "Coldwater", "Chicago"]) {
    grouped[r] = {};
  }
  for (const row of rows) {
    if (!grouped[row.region]) grouped[row.region] = {};
    if (!grouped[row.region][row.date]) grouped[row.region][row.date] = { disbursements: [] };
    grouped[row.region][row.date].disbursements.push({
      id: row.id, label: row.label, amount: row.amount,
      status: row.status || undefined, type: row.type || undefined,
      comments: row.comments || undefined,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    });
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('manualOverrides', ?, CURRENT_TIMESTAMP)")
    .run(JSON.stringify(grouped));
}

function syncBalancesBlob() {
  const rows = db.prepare("SELECT * FROM balances").all() as any[];
  const grouped: Record<string, Record<string, number>> = {};
  for (const r of ["Flint", "ISH", "Coldwater", "Chicago"]) {
    grouped[r] = {};
  }
  for (const row of rows) {
    if (!grouped[row.region]) grouped[row.region] = {};
    grouped[row.region][row.account_key] = row.amount;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('manualBalances', ?, CURRENT_TIMESTAMP)")
    .run(JSON.stringify(grouped));
}

// === Helper: compute diff between old and new objects ===
function computeDiff(oldObj: Record<string, any>, newObj: Record<string, any>): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of allKeys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }
  return diff;
}

// === Helper: generate human-readable summary ===
function generateSummary(entityType: string, action: string, entity: any, diff?: Record<string, any>): string {
  const label = entity.label || entity.account_key || entity.id || "item";
  const region = entity.region || "";

  switch (action) {
    case "create":
      if (entityType === "estimate") return `Created recurring estimate "${label}" for ${region}`;
      if (entityType === "disbursement") return `Created disbursement "${label}" ($${(entity.amount || 0).toLocaleString()}) on ${entity.date} for ${region}`;
      if (entityType === "balance") return `Set ${entity.account_key} balance to $${(entity.amount || 0).toLocaleString()} for ${region}`;
      return `Created ${entityType} "${label}"`;
    case "update": {
      if (!diff || Object.keys(diff).length === 0) return `Updated ${entityType} "${label}" for ${region}`;
      const changes = Object.entries(diff).map(([field, vals]: [string, any]) => {
        if (field === "amount" || field === "base_amount") {
          return `${field}: $${(vals.old || 0).toLocaleString()} → $${(vals.new || 0).toLocaleString()}`;
        }
        return `${field}: ${vals.old} → ${vals.new}`;
      }).join(", ");
      return `Updated ${entityType} "${label}" — ${changes}`;
    }
    case "delete":
      if (entityType === "estimate") return `Deleted recurring estimate "${label}" for ${region}`;
      if (entityType === "disbursement") return `Deleted disbursement "${label}" ($${(entity.amount || 0).toLocaleString()}) for ${region}`;
      return `Deleted ${entityType} "${label}"`;
    case "move":
      return `Moved disbursement "${label}" from ${diff?.date?.old || "?"} to ${diff?.date?.new || "?"} for ${region}`;
    case "revert":
      return `Reverted change to ${entityType} "${label}" for ${region}`;
    default:
      return `${action} ${entityType} "${label}" for ${region}`;
  }
}

// === Helper: write a changelog entry ===
function writeChangelog(entityType: string, entityId: string, region: string, action: string, summary: string, diff?: any, snapshot?: any, batchId?: string) {
  db.prepare(`
    INSERT INTO changelog (entity_type, entity_id, region, action, summary, diff, snapshot, batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entityType, entityId, region, action, summary,
    diff ? JSON.stringify(diff) : null,
    snapshot ? JSON.stringify(snapshot) : null,
    batchId || null
  );
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '50mb' }));

  // ========== Legacy API routes (kept for backward compatibility) ==========
  app.get("/api/data", (req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM settings").all();
      const data = rows.reduce((acc: any, row: any) => {
        acc[row.key] = JSON.parse(row.value);
        return acc;
      }, {});
      res.json(data);
    } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

  app.get("/api/history/:key", (req, res) => {
    try {
      const { key } = req.params;
      const rows = db.prepare("SELECT value, created_at FROM history WHERE key = ? ORDER BY created_at DESC LIMIT 100").all(key);
      res.json(rows.map((r: any) => ({ ...JSON.parse(r.value), timestamp: r.created_at })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/save", (req, res) => {
    try {
      const { key, value } = req.body;
      const jsonValue = JSON.stringify(value);

      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
      stmt.run(key, jsonValue);

      const historyStmt = db.prepare("INSERT INTO history (key, value) VALUES (?, ?)");
      historyStmt.run(key, jsonValue);

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving data:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });

  app.post("/api/reset", (req, res) => {
    try {
      db.prepare("DELETE FROM settings").run();
      db.prepare("DELETE FROM history").run();
      db.prepare("DELETE FROM estimates").run();
      db.prepare("DELETE FROM disbursements").run();
      db.prepare("DELETE FROM balances").run();
      db.prepare("DELETE FROM changelog").run();
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting data:", error);
      res.status(500).json({ error: "Failed to reset data" });
    }
  });

  // ========== Estimates CRUD ==========
  app.get("/api/estimates/:region", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM estimates WHERE region = ? ORDER BY created_at").all(req.params.region);
      res.json(rows.map((r: any) => ({
        id: r.id, label: r.label, baseAmount: r.base_amount,
        adjustment: r.adjustment, period: r.period, startDate: r.start_date,
        endDate: r.end_date || undefined, comments: r.comments || undefined,
        attachments: r.attachments ? JSON.parse(r.attachments) : undefined,
        region: r.region,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimates" });
    }
  });

  app.post("/api/estimates", (req, res) => {
    try {
      const { region, id, label, baseAmount, adjustment, period, startDate, endDate, comments, attachments } = req.body;
      db.prepare(`
        INSERT INTO estimates (id, region, label, base_amount, adjustment, period, start_date, end_date, comments, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, region, label, baseAmount || 0, adjustment || 0, period || "Monthly", startDate || "", endDate || null, comments || null, attachments ? JSON.stringify(attachments) : null);

      const entity = { label, baseAmount, region, id };
      writeChangelog("estimate", id, region, "create", generateSummary("estimate", "create", entity), null, req.body);
      syncEstimatesBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating estimate:", error);
      res.status(500).json({ error: "Failed to create estimate" });
    }
  });

  app.put("/api/estimates/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM estimates WHERE id = ?").get(id) as any;
      if (!existing) return res.status(404).json({ error: "Estimate not found" });

      const updates = req.body;
      const oldObj = {
        label: existing.label, baseAmount: existing.base_amount, adjustment: existing.adjustment,
        period: existing.period, startDate: existing.start_date, endDate: existing.end_date,
        comments: existing.comments,
      };
      const newObj = {
        label: updates.label ?? existing.label,
        baseAmount: updates.baseAmount ?? existing.base_amount,
        adjustment: updates.adjustment ?? existing.adjustment,
        period: updates.period ?? existing.period,
        startDate: updates.startDate ?? existing.start_date,
        endDate: updates.endDate ?? existing.end_date,
        comments: updates.comments ?? existing.comments,
      };

      db.prepare(`
        UPDATE estimates SET label=?, base_amount=?, adjustment=?, period=?, start_date=?, end_date=?, comments=?, attachments=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        newObj.label, newObj.baseAmount, newObj.adjustment, newObj.period, newObj.startDate,
        newObj.endDate || null, newObj.comments || null,
        updates.attachments !== undefined ? JSON.stringify(updates.attachments) : existing.attachments,
        id
      );

      const diff = computeDiff(oldObj, newObj);
      const entity = { label: newObj.label, region: existing.region, id };
      writeChangelog("estimate", id, existing.region, "update",
        generateSummary("estimate", "update", entity, diff), diff,
        oldObj
      );
      syncEstimatesBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating estimate:", error);
      res.status(500).json({ error: "Failed to update estimate" });
    }
  });

  app.delete("/api/estimates/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM estimates WHERE id = ?").get(id) as any;
      if (!existing) return res.status(404).json({ error: "Estimate not found" });

      const snapshot = {
        id: existing.id, label: existing.label, baseAmount: existing.base_amount,
        adjustment: existing.adjustment, period: existing.period, startDate: existing.start_date,
        endDate: existing.end_date, comments: existing.comments,
        attachments: existing.attachments ? JSON.parse(existing.attachments) : undefined,
        region: existing.region,
      };

      db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
      writeChangelog("estimate", id, existing.region, "delete",
        generateSummary("estimate", "delete", snapshot), null, snapshot
      );
      syncEstimatesBlob();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete estimate" });
    }
  });

  // ========== Disbursements CRUD ==========
  app.get("/api/disbursements/:region", (req, res) => {
    try {
      const { date } = req.query;
      let rows;
      if (date) {
        rows = db.prepare("SELECT * FROM disbursements WHERE region = ? AND date = ? ORDER BY created_at").all(req.params.region, date);
      } else {
        rows = db.prepare("SELECT * FROM disbursements WHERE region = ? ORDER BY date, created_at").all(req.params.region);
      }
      res.json(rows.map((r: any) => ({
        id: r.id, label: r.label, amount: r.amount, status: r.status, type: r.type,
        date: r.date, region: r.region, comments: r.comments || undefined,
        attachments: r.attachments ? JSON.parse(r.attachments) : undefined,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch disbursements" });
    }
  });

  app.post("/api/disbursements", (req, res) => {
    try {
      const { region, date, id, label, amount, status, type, comments, attachments } = req.body;
      db.prepare(`
        INSERT INTO disbursements (id, region, date, label, amount, status, type, comments, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, region, date, label || "", amount || 0, status || "Unfunded", type || "manual", comments || null, attachments ? JSON.stringify(attachments) : null);

      const entity = { label, amount, date, region, id };
      writeChangelog("disbursement", id, region, "create", generateSummary("disbursement", "create", entity), null, req.body);
      syncDisbursementsBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating disbursement:", error);
      res.status(500).json({ error: "Failed to create disbursement" });
    }
  });

  app.put("/api/disbursements/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM disbursements WHERE id = ?").get(id) as any;
      if (!existing) return res.status(404).json({ error: "Disbursement not found" });

      const updates = req.body;
      const oldObj = {
        label: existing.label, amount: existing.amount, status: existing.status,
        type: existing.type, date: existing.date, comments: existing.comments,
      };
      const newObj = {
        label: updates.label ?? existing.label,
        amount: updates.amount ?? existing.amount,
        status: updates.status ?? existing.status,
        type: updates.type ?? existing.type,
        date: updates.date ?? existing.date,
        comments: updates.comments ?? existing.comments,
      };

      db.prepare(`
        UPDATE disbursements SET label=?, amount=?, status=?, type=?, date=?, comments=?, attachments=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        newObj.label, newObj.amount, newObj.status, newObj.type, newObj.date,
        newObj.comments || null,
        updates.attachments !== undefined ? JSON.stringify(updates.attachments) : existing.attachments,
        id
      );

      const diff = computeDiff(oldObj, newObj);
      const entity = { label: newObj.label, amount: newObj.amount, date: newObj.date, region: existing.region, id };
      writeChangelog("disbursement", id, existing.region, "update",
        generateSummary("disbursement", "update", entity, diff), diff, oldObj
      );
      syncDisbursementsBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating disbursement:", error);
      res.status(500).json({ error: "Failed to update disbursement" });
    }
  });

  app.delete("/api/disbursements/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM disbursements WHERE id = ?").get(id) as any;
      if (!existing) return res.status(404).json({ error: "Disbursement not found" });

      const snapshot = {
        id: existing.id, label: existing.label, amount: existing.amount,
        status: existing.status, type: existing.type, date: existing.date,
        region: existing.region, comments: existing.comments,
        attachments: existing.attachments ? JSON.parse(existing.attachments) : undefined,
      };

      db.prepare("DELETE FROM disbursements WHERE id = ?").run(id);
      writeChangelog("disbursement", id, existing.region, "delete",
        generateSummary("disbursement", "delete", snapshot), null, snapshot
      );
      syncDisbursementsBlob();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete disbursement" });
    }
  });

  app.post("/api/disbursements/move", (req, res) => {
    try {
      const { id, toDate } = req.body;
      const existing = db.prepare("SELECT * FROM disbursements WHERE id = ?").get(id) as any;
      if (!existing) return res.status(404).json({ error: "Disbursement not found" });

      const oldDate = existing.date;
      const batchId = crypto.randomUUID();

      db.prepare("UPDATE disbursements SET date=?, type='manual', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(toDate, id);

      const diff = { date: { old: oldDate, new: toDate } };
      const entity = { label: existing.label, amount: existing.amount, region: existing.region, id };
      writeChangelog("disbursement", id, existing.region, "move",
        generateSummary("disbursement", "move", entity, diff), diff,
        { ...existing, attachments: existing.attachments ? JSON.parse(existing.attachments) : undefined },
        batchId
      );
      syncDisbursementsBlob();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to move disbursement" });
    }
  });

  // ========== Balances ==========
  app.get("/api/balances/:region", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM balances WHERE region = ?").all(req.params.region) as any[];
      const result: Record<string, number> = {};
      for (const r of rows) { result[r.account_key] = r.amount; }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch balances" });
    }
  });

  app.put("/api/balances/:region/:accountKey", (req, res) => {
    try {
      const { region, accountKey } = req.params;
      const { amount } = req.body;

      const existing = db.prepare("SELECT * FROM balances WHERE region = ? AND account_key = ?").get(region, accountKey) as any;
      const oldAmount = existing ? existing.amount : 0;

      db.prepare("INSERT OR REPLACE INTO balances (region, account_key, amount, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
        .run(region, accountKey, amount);

      if (oldAmount !== amount) {
        const diff = { amount: { old: oldAmount, new: amount } };
        const entity = { account_key: accountKey, amount, region };
        writeChangelog("balance", `${region}-${accountKey}`, region, "update",
          generateSummary("balance", "update", entity, diff), diff,
          { region, account_key: accountKey, amount: oldAmount }
        );
      }
      syncBalancesBlob();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update balance" });
    }
  });

  // ========== Changelog ==========
  app.get("/api/changelog", (req, res) => {
    try {
      const { region, entityType, limit: limitStr, offset: offsetStr } = req.query;
      let query = "SELECT * FROM changelog WHERE 1=1";
      const params: any[] = [];

      if (region && region !== "all") {
        query += " AND region = ?";
        params.push(region);
      }
      if (entityType && entityType !== "all") {
        query += " AND entity_type = ?";
        params.push(entityType);
      }

      query += " ORDER BY created_at DESC";

      const limit = parseInt(limitStr as string) || 50;
      const offset = parseInt(offsetStr as string) || 0;
      query += " LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = db.prepare(query).all(...params) as any[];
      const total = db.prepare(
        query.replace(/SELECT \*/, "SELECT COUNT(*) as cnt").replace(/ ORDER BY.*$/, "")
      ).get(...params.slice(0, -2)) as any;

      res.json({
        entries: rows.map((r: any) => ({
          id: r.id, entityType: r.entity_type, entityId: r.entity_id,
          region: r.region, action: r.action, summary: r.summary,
          diff: r.diff ? JSON.parse(r.diff) : undefined,
          snapshot: r.snapshot ? JSON.parse(r.snapshot) : undefined,
          batchId: r.batch_id || undefined,
          createdAt: r.created_at,
        })),
        total: total?.cnt || 0,
      });
    } catch (error) {
      console.error("Error fetching changelog:", error);
      res.status(500).json({ error: "Failed to fetch changelog" });
    }
  });

  app.post("/api/changelog/revert/:id", (req, res) => {
    try {
      const entry = db.prepare("SELECT * FROM changelog WHERE id = ?").get(req.params.id) as any;
      if (!entry) return res.status(404).json({ error: "Changelog entry not found" });
      if (!entry.snapshot) return res.status(400).json({ error: "No snapshot available for this change" });

      const snapshot = JSON.parse(entry.snapshot);
      const entityType = entry.entity_type;
      const entityId = entry.entity_id;
      const region = entry.region;
      const action = entry.action;

      if (entityType === "estimate") {
        if (action === "delete") {
          // Re-create the deleted estimate
          db.prepare(`
            INSERT OR REPLACE INTO estimates (id, region, label, base_amount, adjustment, period, start_date, end_date, comments, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            snapshot.id, snapshot.region, snapshot.label, snapshot.baseAmount || 0,
            snapshot.adjustment || 0, snapshot.period || "Monthly", snapshot.startDate || "",
            snapshot.endDate || null, snapshot.comments || null,
            snapshot.attachments ? JSON.stringify(snapshot.attachments) : null
          );
        } else if (action === "create") {
          // Undo creation = delete
          db.prepare("DELETE FROM estimates WHERE id = ?").run(entityId);
        } else if (action === "update") {
          // Restore previous values
          db.prepare(`
            UPDATE estimates SET label=?, base_amount=?, adjustment=?, period=?, start_date=?, end_date=?, comments=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).run(
            snapshot.label, snapshot.baseAmount || snapshot.base_amount || 0,
            snapshot.adjustment || 0, snapshot.period || "Monthly",
            snapshot.startDate || snapshot.start_date || "", snapshot.endDate || snapshot.end_date || null,
            snapshot.comments || null, entityId
          );
        }
        syncEstimatesBlob();
      } else if (entityType === "disbursement") {
        if (action === "delete") {
          db.prepare(`
            INSERT OR REPLACE INTO disbursements (id, region, date, label, amount, status, type, comments, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            snapshot.id, snapshot.region, snapshot.date, snapshot.label || "",
            snapshot.amount || 0, snapshot.status || "Unfunded", snapshot.type || "manual",
            snapshot.comments || null, snapshot.attachments ? JSON.stringify(snapshot.attachments) : null
          );
        } else if (action === "create") {
          db.prepare("DELETE FROM disbursements WHERE id = ?").run(entityId);
        } else if (action === "update" || action === "move") {
          db.prepare(`
            UPDATE disbursements SET label=?, amount=?, status=?, type=?, date=?, comments=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).run(
            snapshot.label, snapshot.amount || 0, snapshot.status || "Unfunded",
            snapshot.type || "manual", snapshot.date, snapshot.comments || null, entityId
          );
        }
        syncDisbursementsBlob();
      } else if (entityType === "balance") {
        if (snapshot.amount !== undefined) {
          db.prepare("INSERT OR REPLACE INTO balances (region, account_key, amount, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
            .run(snapshot.region || region, snapshot.account_key, snapshot.amount);
        }
        syncBalancesBlob();
      }

      // Record the revert itself in changelog
      writeChangelog(entityType, entityId, region, "revert",
        `Reverted: ${entry.summary}`, null,
        { revertedChangeId: entry.id }
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error reverting change:", error);
      res.status(500).json({ error: "Failed to revert change" });
    }
  });

  // ========== Bulk sync endpoint (for granular saves from frontend) ==========
  app.post("/api/sync/estimates", (req, res) => {
    try {
      const { region, estimates: newEstimates } = req.body;
      if (!region || !Array.isArray(newEstimates)) {
        return res.status(400).json({ error: "region and estimates[] required" });
      }

      const existing = db.prepare("SELECT * FROM estimates WHERE region = ?").all(region) as any[];
      const existingMap = new Map(existing.map((e: any) => [e.id, e]));
      const newMap = new Map(newEstimates.map((e: any) => [e.id, e]));

      // Deletions
      for (const [id, old] of existingMap) {
        if (!newMap.has(id)) {
          const snapshot = {
            id: old.id, label: old.label, baseAmount: old.base_amount,
            adjustment: old.adjustment, period: old.period, startDate: old.start_date,
            endDate: old.end_date, region: old.region, comments: old.comments,
            attachments: old.attachments ? JSON.parse(old.attachments) : undefined,
          };
          db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
          writeChangelog("estimate", id, region, "delete", generateSummary("estimate", "delete", snapshot), null, snapshot);
        }
      }

      // Creates and updates
      for (const [id, est] of newMap) {
        const old = existingMap.get(id);
        if (!old) {
          // Create
          db.prepare(`
            INSERT INTO estimates (id, region, label, base_amount, adjustment, period, start_date, end_date, comments, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, region, est.label, est.baseAmount || 0, est.adjustment || 0, est.period || "Monthly", est.startDate || "", est.endDate || null, est.comments || null, est.attachments ? JSON.stringify(est.attachments) : null);
          writeChangelog("estimate", id, region, "create", generateSummary("estimate", "create", { ...est, region }), null, est);
        } else {
          // Check for changes
          const oldObj = { label: old.label, baseAmount: old.base_amount, adjustment: old.adjustment, period: old.period, startDate: old.start_date, endDate: old.end_date, comments: old.comments };
          const newObj = { label: est.label, baseAmount: est.baseAmount, adjustment: est.adjustment, period: est.period, startDate: est.startDate, endDate: est.endDate, comments: est.comments };
          const diff = computeDiff(oldObj, newObj);
          if (Object.keys(diff).length > 0) {
            db.prepare(`
              UPDATE estimates SET label=?, base_amount=?, adjustment=?, period=?, start_date=?, end_date=?, comments=?, attachments=?, updated_at=CURRENT_TIMESTAMP
              WHERE id=?
            `).run(est.label, est.baseAmount || 0, est.adjustment || 0, est.period || "Monthly", est.startDate || "", est.endDate || null, est.comments || null, est.attachments ? JSON.stringify(est.attachments) : null, id);
            writeChangelog("estimate", id, region, "update", generateSummary("estimate", "update", { ...est, region }, diff), diff, oldObj);
          }
        }
      }

      syncEstimatesBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error syncing estimates:", error);
      res.status(500).json({ error: "Failed to sync estimates" });
    }
  });

  app.post("/api/sync/disbursements", (req, res) => {
    try {
      const { region, overrides } = req.body;
      if (!region || !overrides) {
        return res.status(400).json({ error: "region and overrides required" });
      }

      const existing = db.prepare("SELECT * FROM disbursements WHERE region = ?").all(region) as any[];
      const existingMap = new Map(existing.map((e: any) => [e.id, e]));
      const newIds = new Set<string>();

      // Process all dates in overrides
      for (const [date, dayData] of Object.entries(overrides)) {
        const disbursements = (dayData as any).disbursements;
        if (!disbursements || !Array.isArray(disbursements)) continue;

        for (const d of disbursements) {
          newIds.add(d.id);
          const old = existingMap.get(d.id);
          if (!old) {
            // Create
            db.prepare(`
              INSERT OR REPLACE INTO disbursements (id, region, date, label, amount, status, type, comments, attachments)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(d.id, region, date, d.label || "", d.amount || 0, d.status || "Unfunded", d.type || "manual", d.comments || null, d.attachments ? JSON.stringify(d.attachments) : null);
            writeChangelog("disbursement", d.id, region, "create", generateSummary("disbursement", "create", { ...d, date, region }), null, { ...d, date, region });
          } else {
            // Check for changes
            const oldObj = { label: old.label, amount: old.amount, status: old.status, type: old.type, date: old.date, comments: old.comments };
            const newObj = { label: d.label, amount: d.amount, status: d.status, type: d.type, date, comments: d.comments };
            const diff = computeDiff(oldObj, newObj);
            if (Object.keys(diff).length > 0) {
              const isMove = diff.date && Object.keys(diff).length === 1;
              db.prepare(`
                UPDATE disbursements SET label=?, amount=?, status=?, type=?, date=?, comments=?, attachments=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
              `).run(d.label || "", d.amount || 0, d.status || "Unfunded", d.type || "manual", date, d.comments || null, d.attachments ? JSON.stringify(d.attachments) : null, d.id);
              writeChangelog("disbursement", d.id, region, isMove ? "move" : "update",
                generateSummary("disbursement", isMove ? "move" : "update", { ...d, date, region }, diff), diff, oldObj
              );
            }
          }
        }
      }

      // Deletions: items in DB but not in new overrides
      for (const [id, old] of existingMap) {
        if (!newIds.has(id)) {
          const snapshot = {
            id: old.id, label: old.label, amount: old.amount, status: old.status,
            type: old.type, date: old.date, region: old.region, comments: old.comments,
            attachments: old.attachments ? JSON.parse(old.attachments) : undefined,
          };
          db.prepare("DELETE FROM disbursements WHERE id = ?").run(id);
          writeChangelog("disbursement", id, region, "delete", generateSummary("disbursement", "delete", snapshot), null, snapshot);
        }
      }

      syncDisbursementsBlob();
      res.json({ success: true });
    } catch (error) {
      console.error("Error syncing disbursements:", error);
      res.status(500).json({ error: "Failed to sync disbursements" });
    }
  });

  app.post("/api/sync/balances", (req, res) => {
    try {
      const { region, balances: newBalances } = req.body;
      if (!region || !newBalances) {
        return res.status(400).json({ error: "region and balances required" });
      }

      for (const [key, amount] of Object.entries(newBalances)) {
        const existing = db.prepare("SELECT * FROM balances WHERE region = ? AND account_key = ?").get(region, key) as any;
        const oldAmount = existing ? existing.amount : 0;
        const newAmount = amount as number;

        db.prepare("INSERT OR REPLACE INTO balances (region, account_key, amount, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
          .run(region, key, newAmount);

        if (oldAmount !== newAmount) {
          const diff = { amount: { old: oldAmount, new: newAmount } };
          writeChangelog("balance", `${region}-${key}`, region, "update",
            generateSummary("balance", "update", { account_key: key, amount: newAmount, region }, diff), diff,
            { region, account_key: key, amount: oldAmount }
          );
        }
      }

      syncBalancesBlob();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync balances" });
    }
  });

  // === Auth API ===
  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password, location: requestedLocation } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      const user = db.prepare(
        "SELECT id, username, display_name, role, allowed_regions, location FROM users WHERE username = ? AND password_hash = ?"
      ).get(username, hash) as any;
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const assignedLocation = user.location || "executive";
      let effectiveLocation = assignedLocation;

      if (user.role === "admin") {
        // Admins can log in to any location
        effectiveLocation = requestedLocation || assignedLocation;
      } else {
        // Non-admins are restricted to their assigned location
        if (requestedLocation && requestedLocation !== assignedLocation) {
          return res.status(403).json({
            error: `You are not authorized for the ${requestedLocation} dashboard. Your assigned location is ${assignedLocation}.`
          });
        }
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          allowedRegions: JSON.parse(user.allowed_regions || "[]"),
          location: effectiveLocation
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Returns allowed locations for a given username (for login page filtering)
  app.get("/api/auth/locations/:username", (req, res) => {
    try {
      const { username } = req.params;
      const user = db.prepare(
        "SELECT role, location FROM users WHERE username = ?"
      ).get(username) as any;
      if (!user) {
        // Don't reveal whether user exists — return all locations
        const depts = db.prepare("SELECT name FROM departments ORDER BY name").all() as any[];
        return res.json({ locations: ["executive", ...depts.map((d: any) => d.name)], defaultLocation: "executive" });
      }
      if (user.role === "admin") {
        // Admins can access all locations
        const depts = db.prepare("SELECT name FROM departments ORDER BY name").all() as any[];
        return res.json({ locations: ["executive", ...depts.map((d: any) => d.name)], defaultLocation: user.location || "executive" });
      }
      // Non-admin: only their assigned location
      const assignedLocation = user.location || "executive";
      res.json({ locations: [assignedLocation], defaultLocation: assignedLocation });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.get("/api/auth/users", (req, res) => {
    try {
      const rows = db.prepare(
        "SELECT id, username, display_name, role, allowed_regions, location, created_at FROM users ORDER BY created_at"
      ).all() as any[];
      res.json(rows.map(r => ({
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        role: r.role,
        allowedRegions: JSON.parse(r.allowed_regions || "[]"),
        location: r.location || "executive",
        createdAt: r.created_at
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/auth/users", (req, res) => {
    try {
      const { username, password, displayName, role, allowedRegions, location } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ error: "Username, password, and display name required" });
      }
      const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existing) {
        return res.status(409).json({ error: "Username already exists" });
      }
      const id = crypto.randomUUID();
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      db.prepare(
        "INSERT INTO users (id, username, password_hash, display_name, role, allowed_regions, location) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, username, hash, displayName, role || "viewer", JSON.stringify(allowedRegions || []), location || "executive");
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/auth/users/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, role, allowedRegions, password, location } = req.body;
      const user = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (displayName !== undefined) {
        db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, id);
      }
      if (role !== undefined) {
        db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      }
      if (allowedRegions !== undefined) {
        db.prepare("UPDATE users SET allowed_regions = ? WHERE id = ?").run(JSON.stringify(allowedRegions), id);
      }
      if (password) {
        const hash = crypto.createHash("sha256").update(password).digest("hex");
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
      }
      if (location !== undefined) {
        db.prepare("UPDATE users SET location = ? WHERE id = ?").run(location, id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/auth/users/:id", (req, res) => {
    try {
      const { id } = req.params;
      // Prevent deleting the last admin
      const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as any;
      const targetUser = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
      if (targetUser?.role === "admin" && adminCount.cnt <= 1) {
        return res.status(400).json({ error: "Cannot delete the last admin user" });
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ========== Department API ==========
  app.get("/api/departments", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM departments ORDER BY name").all() as any[];
      res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        regions: JSON.parse(r.regions || "[]"),
        createdAt: r.created_at
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/departments", (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Department name required" });
      }
      const existing = db.prepare("SELECT id FROM departments WHERE name = ?").get(name.trim());
      if (existing) {
        return res.status(409).json({ error: "Department already exists" });
      }
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO departments (id, name, regions) VALUES (?, ?, ?)").run(id, name.trim(), "[]");
      res.json({ success: true, id, name: name.trim() });
    } catch (error) {
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.put("/api/departments/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { regions } = req.body;
      const dept = db.prepare("SELECT id FROM departments WHERE id = ?").get(id);
      if (!dept) return res.status(404).json({ error: "Department not found" });
      if (regions !== undefined) {
        db.prepare("UPDATE departments SET regions = ? WHERE id = ?").run(JSON.stringify(regions), id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/departments/:id", (req, res) => {
    try {
      const { id } = req.params;
      const dept = db.prepare("SELECT name FROM departments WHERE id = ?").get(id) as any;
      if (!dept) return res.status(404).json({ error: "Department not found" });

      // Clean up department-scoped data (regions prefixed with dept::name::)
      const prefix = `dept::${dept.name}::`;
      db.prepare("DELETE FROM estimates WHERE region LIKE ?").run(prefix + "%");
      db.prepare("DELETE FROM disbursements WHERE region LIKE ?").run(prefix + "%");
      db.prepare("DELETE FROM balances WHERE region LIKE ?").run(prefix + "%");
      db.prepare("DELETE FROM changelog WHERE region LIKE ?").run(prefix + "%");

      db.prepare("DELETE FROM departments WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
