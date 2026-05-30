const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./data/taskbattle.db', (err) => {
  if (err) console.error(err);
  else console.log('Connected to SQLite database');
});

const SECRET_KEY = 'your-secret-key-change-this';

// Initialize database tables
db.serialize(() => {
  // Users table
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

  // Tasks table
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    creatorId INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creatorId) REFERENCES users(id)
  )`);

  // Battles table
  db.run(`CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    player1Id INTEGER NOT NULL,
    player2Id INTEGER,
    winnerId INTEGER,
    status TEXT DEFAULT 'waiting',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(taskId) REFERENCES tasks(id),
    FOREIGN KEY(player1Id) REFERENCES users(id),
    FOREIGN KEY(player2Id) REFERENCES users(id),
    FOREIGN KEY(winnerId) REFERENCES users(id)
  )`);

  // Solutions table
  db.run(`CREATE TABLE IF NOT EXISTS solutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    battleId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    code TEXT,
    submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(battleId) REFERENCES battles(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);
});

// API Routes

// Register
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
    [username, email, hashedPassword],
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      res.status(201).json({ 
        message: 'User registered successfully',
        userId: this.lastID
      });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY);
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          rating: user.rating,
          tasksCompleted: user.tasksCompleted,
          tasksCreated: user.tasksCreated
        }
      });
    }
  );
});

// Get user profile
app.get('/api/user/:id', (req, res) => {
  db.get(
    `SELECT id, username, email, rating, tasksCompleted, tasksCreated, createdAt FROM users WHERE id = ?`,
    [req.params.id],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  db.all(
    `SELECT id, username, rating, tasksCompleted FROM users ORDER BY rating DESC LIMIT 50`,
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(users);
    }
  );
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, difficulty, userId } = req.body;

  if (!title || !description || !userId) {
    return res.status(400).json({ error: 'All fields required' });
  }

  db.run(
    `INSERT INTO tasks (title, description, difficulty, creatorId) VALUES (?, ?, ?, ?)`,
    [title, description, difficulty || 'medium', userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      db.run(`UPDATE users SET tasksCreated = tasksCreated + 1 WHERE id = ?`, [userId]);
      
      res.status(201).json({
        message: 'Task created successfully',
        taskId: this.lastID
      });
    }
  );
});

// Get all tasks
app.get('/api/tasks', (req, res) => {
  db.all(
    `SELECT t.*, u.username as creatorUsername FROM tasks t 
     JOIN users u ON t.creatorId = u.id 
     ORDER BY t.createdAt DESC`,
    (err, tasks) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(tasks);
    }
  );
});

// Get task details
app.get('/api/tasks/:id', (req, res) => {
  db.get(
    `SELECT t.*, u.username as creatorUsername FROM tasks t 
     JOIN users u ON t.creatorId = u.id 
     WHERE t.id = ?`,
    [req.params.id],
    (err, task) => {
      if (err || !task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    }
  );
});

// Create battle
app.post('/api/battles', (req, res) => {
  const { taskId, player1Id, player2Id } = req.body;

  if (!taskId || !player1Id) {
    return res.status(400).json({ error: 'Task and player required' });
  }

  db.run(
    `INSERT INTO battles (taskId, player1Id, player2Id, status) VALUES (?, ?, ?, 'waiting')`,
    [taskId, player1Id, player2Id || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(201).json({
        message: 'Battle created successfully',
        battleId: this.lastID
      });
    }
  );
});

// Get battles
app.get('/api/battles', (req, res) => {
  db.all(
    `SELECT b.*, t.title, u1.username as player1Username, u2.username as player2Username 
     FROM battles b
     JOIN tasks t ON b.taskId = t.id
     JOIN users u1 ON b.player1Id = u1.id
     LEFT JOIN users u2 ON b.player2Id = u2.id
     WHERE b.status != 'completed'
     ORDER BY b.createdAt DESC`,
    (err, battles) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(battles);
    }
  );
});

// Socket.IO Real-time communication
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_battle', (battleId) => {
    socket.join(`battle_${battleId}`);
    io.to(`battle_${battleId}`).emit('user_joined', { socketId: socket.id });
  });

  socket.on('submit_solution', (data) => {
    const { battleId, userId, code } = data;

    db.run(
      `INSERT INTO solutions (battleId, userId, code) VALUES (?, ?, ?)`,
      [battleId, userId, code],
      (err) => {
        if (err) console.error(err);
        io.to(`battle_${battleId}`).emit('solution_submitted', {
          userId,
          timestamp: new Date()
        });
      }
    );
  });

  socket.on('finish_battle', (data) => {
    const { battleId, winnerId } = data;

    db.run(
      `UPDATE battles SET status = 'completed', winnerId = ? WHERE id = ?`,
      [winnerId, battleId],
      (err) => {
        if (err) console.error(err);
        
        // Update winner rating
        db.run(
          `UPDATE users SET rating = rating + 10, tasksCompleted = tasksCompleted + 1 WHERE id = ?`,
          [winnerId]
        );

        io.to(`battle_${battleId}`).emit('battle_finished', { winnerId });
      }
    );
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
