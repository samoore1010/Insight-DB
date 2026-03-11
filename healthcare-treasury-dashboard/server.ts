import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("treasury.db");

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes
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

  // Endpoint for future AI bot to fetch historical trends
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

      // Update current state
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
      stmt.run(key, jsonValue);

      // Record history for AI trend analysis
      // We only record if the value is significantly different or periodically to save space
      // For treasury, we'll record every save to capture the user's "thinking process"
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
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting data:", error);
      res.status(500).json({ error: "Failed to reset data" });
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
