const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("Set JWT_SECRET before starting.");
  process.exit(1);
}

const db = new Database(
  process.env.DB_PATH || path.join(__dirname, "turnforge.sqlite")
);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solves (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL DEFAULT '3x3',
  event TEXT NOT NULL DEFAULT '333',
  time_ms INTEGER NOT NULL,
  penalty TEXT NOT NULL DEFAULT 'OK',
  scramble TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS solves_user_created
ON solves(user_id, created_at);

CREATE TABLE IF NOT EXISTS algorithm_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

db.pragma("foreign_keys = ON");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const token = (req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "");

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({
      error: "Please sign in again."
    });
  }
}

// REGISTER
app.post("/api/register", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();

  const password = String(req.body.password || "");

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8
  ) {
    return res.status(400).json({
      error: "Enter a valid email and a password of at least 8 characters."
    });
  }

  try {
    const hash = await bcrypt.hash(password, 12);

    const result = db.prepare(
      "INSERT INTO users(email,password_hash) VALUES(?,?)"
    ).run(email, hash);

    const token = jwt.sign(
      { sub: result.lastInsertRowid },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token, email });

  } catch {
    res.status(409).json({
      error: "An account with that email already exists."
    });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();

  const user = db.prepare(
    "SELECT * FROM users WHERE email=?"
  ).get(email);

  if (
    !user ||
    !(await bcrypt.compare(
      String(req.body.password || ""),
      user.password_hash
    ))
  ) {
    return res.status(401).json({
      error: "Incorrect email or password."
    });
  }

  const token = jwt.sign(
    { sub: user.id },
    JWT_SECRET,
    { expiresIn: "30d" }
  );

  res.json({ token, email });
});

// GET SOLVES
app.get("/api/solves", auth, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM solves WHERE user_id=? ORDER BY created_at DESC"
  ).all(req.userId);

  res.json(rows);
});

// SYNC SOLVES
app.post("/api/sync", auth, (req, res) => {
  const solves = Array.isArray(req.body.solves)
    ? req.body.solves.slice(0, 1000)
    : [];

  const insert = db.prepare(`
    INSERT INTO solves
    (
      id, user_id, session_name, event,
      time_ms, penalty, scramble, note, created_at
    )
    VALUES
    (
      @id, @user_id, @session_name, @event,
      @time_ms, @penalty, @scramble, @note, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      session_name=excluded.session_name,
      event=excluded.event,
      time_ms=excluded.time_ms,
      penalty=excluded.penalty,
      scramble=excluded.scramble,
      note=excluded.note,
      created_at=excluded.created_at
    WHERE solves.user_id=excluded.user_id
  `);

  const tx = db.transaction(items => {
    for (const s of items) {
      if (
        !s ||
        typeof s.id !== "string" ||
        !Number.isFinite(s.time_ms) ||
        s.time_ms < 0
      ) continue;

      insert.run({
        id: s.id.slice(0, 80),
        user_id: req.userId,
        session_name: String(s.session_name || "3x3").slice(0, 80),
        event: String(s.event || "333").slice(0, 20),
        time_ms: Math.round(s.time_ms),
        penalty: ["OK", "+2", "DNF"].includes(s.penalty)
          ? s.penalty
          : "OK",
        scramble: String(s.scramble || "").slice(0, 1000),
        note: String(s.note || "").slice(0, 500),
        created_at: String(
          s.created_at || new Date().toISOString()
        ).slice(0, 40)
      });
    }
  });

  tx(solves);

  res.json({ synced: solves.length });
});

// GET ALGORITHM PROGRESS
app.get("/api/algorithms/progress", auth, (req, res) => {
  const row = db.prepare(
    "SELECT progress_json FROM algorithm_progress WHERE user_id=?"
  ).get(req.userId);

  let progress = {};

  try {
    progress = row ? JSON.parse(row.progress_json) : {};
  } catch {}

  res.json({ progress });
});

// SAVE ALGORITHM PROGRESS
app.put("/api/algorithms/progress", auth, (req, res) => {
  const progress = req.body && req.body.progress;

  if (
    !progress ||
    typeof progress !== "object" ||
    Array.isArray(progress)
  ) {
    return res.status(400).json({
      error: "Invalid progress data."
    });
  }

  const clean = {};

  for (const [key, value] of Object.entries(progress).slice(0, 100)) {
    if (/^(OLL|PLL)-[0-9]+$/.test(key) &&
        typeof value === "boolean") {
      clean[key] = value;
    }
  }

  db.prepare(`
    INSERT INTO algorithm_progress
    (user_id, progress_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)

    ON CONFLICT(user_id) DO UPDATE SET
      progress_json=excluded.progress_json,
      updated_at=CURRENT_TIMESTAMP
  `).run(req.userId, JSON.stringify(clean));

  res.json({ ok: true });
});

// DELETE SOLVE
app.delete("/api/solves/:id", auth, (req, res) => {
  db.prepare(
    "DELETE FROM solves WHERE id=? AND user_id=?"
  ).run(req.params.id, req.userId);

  res.json({ ok: true });
});

// WEBSITE ROUTE
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, () => {
  console.log(`TurnForge running at http://localhost:${PORT}`);
});
