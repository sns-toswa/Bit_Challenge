const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const SECRET_KEY = 'your-secret-key-change-this';

// Створюємо папку data якщо не існує
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });

const db = new sqlite3.Database('./data/taskbattle.db', (err) => {
    if (err) console.error('DB connection error:', err);
    else console.log('Connected to SQLite database');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        rating INTEGER DEFAULT 0,
        tasksCompleted INTEGER DEFAULT 0,
        tasksCreated INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        correctCode TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        creatorId INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creatorId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS solutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        code TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (taskId) REFERENCES tasks(id),
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId INTEGER NOT NULL,
        creatorId INTEGER NOT NULL,
        description TEXT DEFAULT '',
        prize INTEGER DEFAULT 10,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (taskId) REFERENCES tasks(id),
        FOREIGN KEY (creatorId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId INTEGER NOT NULL,
        player1Id INTEGER NOT NULL,
        player2Id INTEGER,
        status TEXT DEFAULT 'waiting',
        winnerId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (taskId) REFERENCES tasks(id),
        FOREIGN KEY (player1Id) REFERENCES users(id),
        FOREIGN KEY (player2Id) REFERENCES users(id)
    )`);

    console.log('All tables created');
});

// ── Auth helper ──────────────────────────────────────────────────────────────
function verifyToken(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    try { return jwt.verify(token, SECRET_KEY); } catch { return null; }
}

// ── Register ─────────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({ error: 'All fields required' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
        `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
        [username, email, hashedPassword],
        function(err) {
            if (err) return res.status(400).json({ error: 'Username or email already exists' });
            res.status(201).json({ message: 'User registered successfully', userId: this.lastID });
        }
    );
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!bcrypt.compareSync(password, user.password))
            return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY);
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, rating: user.rating, tasksCompleted: user.tasksCompleted, tasksCreated: user.tasksCreated } });
    });
});

// ── User profile ──────────────────────────────────────────────────────────────
app.get('/api/user/:id', (req, res) => {
    db.get(
        `SELECT id, username, email, rating, tasksCompleted, tasksCreated, createdAt FROM users WHERE id = ?`,
        [req.params.id],
        (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'User not found' });
            res.json(user);
        }
    );
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
    db.all(
        `SELECT id, username, rating, tasksCompleted FROM users ORDER BY rating DESC LIMIT 50`,
        (err, users) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(users);
        }
    );
});

// ── Create task ───────────────────────────────────────────────────────────────
app.post('/api/tasks', (req, res) => {
    const { title, description, correctCode, difficulty, userId } = req.body;
    if (!title || !description || !correctCode || !userId)
        return res.status(400).json({ error: 'All fields required' });

    db.run(
        `INSERT INTO tasks (title, description, correctCode, difficulty, creatorId) VALUES (?, ?, ?, ?, ?)`,
        [title, description, correctCode, difficulty || 'medium', userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.run(`UPDATE users SET tasksCreated = tasksCreated + 1 WHERE id = ?`, [userId]);
            res.status(201).json({ message: 'Task created successfully', taskId: this.lastID });
        }
    );
});

// ── Get all tasks (без correctCode) ──────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
    db.all(
        `SELECT t.id, t.title, t.description, t.difficulty, t.creatorId, t.createdAt,
                u.username as creatorUsername
         FROM tasks t
                  LEFT JOIN users u ON u.id = t.creatorId
         ORDER BY t.createdAt DESC`,
        (err, tasks) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(tasks);
        }
    );
});

// ── Get task details (з correctCode) ─────────────────────────────────────────
app.get('/api/tasks/:id', (req, res) => {
    db.get(
        `SELECT t.*, u.username as creatorUsername
         FROM tasks t
                  LEFT JOIN users u ON u.id = t.creatorId
         WHERE t.id = ?`,
        [req.params.id],
        (err, task) => {
            if (err || !task) return res.status(404).json({ error: 'Task not found' });
            res.json(task);
        }
    );
});

// ── Delete task ───────────────────────────────────────────────────────────────
app.delete('/api/tasks/:id', (req, res) => {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    db.get(`SELECT creatorId FROM tasks WHERE id = ?`, [req.params.id], (err, task) => {
        if (err || !task) return res.status(404).json({ error: 'Task not found' });
        if (decoded.userId !== task.creatorId)
            return res.status(403).json({ error: 'You can only delete your own tasks' });

        db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.run(`UPDATE users SET tasksCreated = tasksCreated - 1 WHERE id = ?`, [task.creatorId]);
            res.json({ message: 'Task deleted successfully' });
        });
    });
});

// ── Submit solution ───────────────────────────────────────────────────────────
app.post('/api/submit-solution', (req, res) => {
    const { taskId, userId, code, prize } = req.body;
    if (!taskId || !userId || !code)
        return res.status(400).json({ error: 'All fields required' });

    db.run(
        `INSERT INTO solutions (taskId, userId, code) VALUES (?, ?, ?)`,
        [taskId, userId, code],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            const prizePoints = prize || 10;
            db.run(
                `UPDATE users SET tasksCompleted = tasksCompleted + 1, rating = rating + ? WHERE id = ?`,
                [prizePoints, userId]
            );
            res.status(201).json({ message: 'Solution submitted successfully', solutionId: this.lastID });
        }
    );
});

// ── Create challenge ──────────────────────────────────────────────────────────
app.post('/api/challenges', (req, res) => {
    const { taskId, description, prize, creatorId } = req.body;
    if (!taskId || !creatorId)
        return res.status(400).json({ error: 'All fields required' });

    db.run(
        `INSERT INTO challenges (taskId, creatorId, description, prize) VALUES (?, ?, ?, ?)`,
        [taskId, creatorId, description || '', prize || 10],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ message: 'Challenge posted successfully', challengeId: this.lastID });
        }
    );
});

// ── Get all challenges ────────────────────────────────────────────────────────
app.get('/api/challenges', (req, res) => {
    db.all(
        `SELECT c.*, t.title as taskTitle, t.description as taskDescription,
                u.username as creatorUsername
         FROM challenges c
                  JOIN tasks t ON c.taskId = t.id
                  LEFT JOIN users u ON u.id = c.creatorId
         WHERE c.status = 'active'
         ORDER BY c.createdAt DESC`,
        (err, challenges) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(challenges);
        }
    );
});

// ── Get battles ───────────────────────────────────────────────────────────────
app.get('/api/battles', (req, res) => {
    db.all(
        `SELECT b.*, t.title, t.description, t.difficulty,
                u1.username as player1Username, u2.username as player2Username
         FROM battles b
         JOIN tasks t ON b.taskId = t.id
         JOIN users u1 ON b.player1Id = u1.id
         LEFT JOIN users u2 ON b.player2Id = u2.id
         WHERE b.status != 'completed'
         ORDER BY b.createdAt DESC`,
        (err, battles) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(battles);
        }
    );
});

// ── Create battle ─────────────────────────────────────────────────────────────
app.post('/api/battles', (req, res) => {
    const { taskId, player1Id } = req.body;
    if (!taskId || !player1Id)
        return res.status(400).json({ error: 'Task and player required' });

    db.run(
        `INSERT INTO battles (taskId, player1Id, status) VALUES (?, ?, 'waiting')`,
        [taskId, player1Id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ message: 'Battle created successfully', battleId: this.lastID });
        }
    );
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.on('join_battle', (battleId) => socket.join(`battle_${battleId}`));
    socket.on('submit_solution', (data) => io.to(`battle_${data.battleId}`).emit('solution_submitted', data));
    socket.on('disconnect', () => console.log(`User disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));