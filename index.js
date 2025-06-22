const path = require("path");
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const dbPath = path.join(__dirname, "medicare.db"); // ✅ ensures DB is always in project folder
const db = new sqlite3.Database(dbPath);
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ✅ Table creation (only if they don't exist)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    dosage TEXT,
    frequency TEXT,
    taken INTEGER DEFAULT 0
  )`);
});

// 🧾 Sign Up
app.post("/signup", async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(
    `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
    [username, hashedPassword, role],
    function (err) {
      if (err) return res.status(400).json({ error: "User already exists" });
      res.json({ id: this.lastID, username, role });
    }
  );
});

// 🔐 Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user)
        return res.status(400).json({ error: "Invalid credentials" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        "secret",
        { expiresIn: "1h" }
      );
      res.json({ token, role: user.role });
    }
  );
});

// ➕ Add Medication
app.post("/medications", (req, res) => {
  const { name, dosage, frequency } = req.body;
  db.run(
    `INSERT INTO medications (name, dosage, frequency) VALUES (?, ?, ?)`,
    [name, dosage, frequency],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// 📄 View All Medications
app.get("/medications", (req, res) => {
  db.all(`SELECT * FROM medications`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ Mark as Taken
app.put("/medications/:id/taken", (req, res) => {
  db.run(
    `UPDATE medications SET taken = 1 WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.get("/users", (req, res) => {
  db.all(`SELECT id, username, role FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get medication adherence percentage
app.get("/medications/adherence", (req, res) => {
  db.get(
    `SELECT 
       (SELECT COUNT(*) FROM medications WHERE taken = 1) * 100.0 / 
       MAX(COUNT(*), 1) AS adherence 
     FROM medications`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ adherence: parseFloat(row.adherence.toFixed(2)) });
    }
  );
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
