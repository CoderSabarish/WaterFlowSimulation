// ============================================================
// server.js — Express Backend for Water Flow Simulation
// ============================================================
// This file sets up:
//   1. Express web server (serves HTML/CSS/JS files)
//   2. SQLite database (stores users and pipe connections)
//   3. Authentication (login/logout with hashed passwords)
//   4. CRUD API for pipe networks (admin only for write ops)
//   5. Dijkstra's Algorithm for shortest-path simulation
// ============================================================

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// ============================================================
// MIN-HEAP (Priority Queue) for Dijkstra's Algorithm
// ============================================================
// A proper min-heap gives O(log n) insert and extract-min,
// which is required for canonical Dijkstra's Algorithm.
// The heap is ordered by the "time" property of each entry.

class MinHeap {
  constructor() {
    this.heap = [];  // Internal array storing heap entries
  }

  // Returns the number of entries in the heap
  get length() {
    return this.heap.length;
  }

  // Insert a new entry into the heap — O(log n)
  push(item) {
    this.heap.push(item);              // Add to the end
    this._bubbleUp(this.heap.length - 1); // Restore heap property upward
  }

  // Remove and return the entry with the smallest time — O(log n)
  pop() {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];          // The root is always the minimum
    const last = this.heap.pop();      // Remove last element
    if (this.heap.length > 0) {
      this.heap[0] = last;             // Move last to root
      this._sinkDown(0);              // Restore heap property downward
    }
    return min;
  }

  // Bubble up: swap with parent until heap property is restored
  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].time <= this.heap[i].time) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  // Sink down: swap with smallest child until heap property is restored
  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].time < this.heap[smallest].time) smallest = left;
      if (right < n && this.heap[right].time < this.heap[smallest].time) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// --- Create Express App ---
const app = express();
const PORT = 3000;

// --- Middleware ---
// Parse JSON request bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware — stores login state in a cookie
app.use(session({
  secret: 'water-flow-simulation-secret-key-2024',  // Change in production!
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000  // Session lasts 24 hours
  }
}));

// ============================================================
// DATABASE SETUP (SQLite via sql.js — pure JavaScript)
// ============================================================
// sql.js runs SQLite entirely in JavaScript — no C++ compilation needed!

const DB_PATH = path.join(__dirname, 'pipes.db');
let db; // Will be initialized in the async startup

// Save database to disk
function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Initialize database
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing database or create a new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('📂 Loaded existing database: pipes.db');
  } else {
    db = new SQL.Database();
    console.log('📂 Created new database: pipes.db');
  }

  // --- Create "users" table ---
  // Stores username, hashed password, and role (admin/user)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    )
  `);

  // --- Create "pipes" table ---
  // Stores pipe connections: nodeA -> nodeB with length and velocity
  db.run(`
    CREATE TABLE IF NOT EXISTS pipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nodeA TEXT NOT NULL,
      nodeB TEXT NOT NULL,
      length REAL NOT NULL,
      velocity REAL NOT NULL
    )
  `);

  // --- Seed default admin account ---
  // Only created on first run (if no admin exists)
  const adminCheck = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (adminCheck.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['admin', hashedPassword, 'admin']);
    console.log('✅ Default admin account created (admin / admin123)');
  }

  // --- Seed default user account ---
  const userCheck = db.exec("SELECT id FROM users WHERE username = 'user'");
  if (userCheck.length === 0) {
    const hashedPassword = bcrypt.hashSync('user123', 10);
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['user', hashedPassword, 'user']);
    console.log('✅ Default user account created (user / user123)');
  }

  // --- Seed sample pipe data (only if empty) ---
  const pipeCount = db.exec("SELECT COUNT(*) as count FROM pipes");
  const count = pipeCount[0] ? pipeCount[0].values[0][0] : 0;

  if (count === 0) {
    const samplePipes = [
      ['A', 'B', 100, 5],
      ['A', 'C', 150, 3],
      ['B', 'D', 80, 4],
      ['C', 'D', 120, 6],
      ['B', 'E', 200, 8],
      ['D', 'E', 90, 5],
      ['D', 'F', 110, 4],
      ['E', 'F', 60, 7]
    ];

    for (const [nodeA, nodeB, length, velocity] of samplePipes) {
      db.run("INSERT INTO pipes (nodeA, nodeB, length, velocity) VALUES (?, ?, ?, ?)",
        [nodeA, nodeB, length, velocity]);
    }
    console.log('✅ Sample pipe network data inserted');
  }

  // Save to disk
  saveDB();
}

// ============================================================
// HELPER: Query the database
// ============================================================
// These helper functions wrap sql.js to make queries easier

// Get all rows from a query (returns array of objects)
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Get a single row from a query (returns object or null)
function dbGet(sql, params = []) {
  const results = dbAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Run a statement (INSERT, UPDATE, DELETE) — returns nothing
function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDB();  // Persist changes to disk
}

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
// These functions check if a user is logged in or is admin

// Check if user is logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();  // User is logged in, proceed
  }
  return res.status(401).json({ error: 'Please log in first' });
}

// Check if user is an admin
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();  // User is admin, proceed
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ============================================================
// AUTH API ROUTES
// ============================================================

// --- POST /api/login ---
// Authenticates user and creates a session
app.post('/api/login', (req, res) => {
  const { username, password, role } = req.body;

  // Validate input
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Find user in database
  const user = dbGet('SELECT * FROM users WHERE username = ? AND role = ?', [username, role]);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or role' });
  }

  // Compare password with hashed version
  const passwordMatch = bcrypt.compareSync(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Create session (store user info)
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  console.log(`🔑 User "${username}" logged in as ${role}`);
  res.json({
    message: 'Login successful',
    user: { username: user.username, role: user.role }
  });
});

// --- POST /api/logout ---
// Destroys the session
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

// --- GET /api/session ---
// Returns current session info (used to check login state)
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// ============================================================
// PIPE NETWORK API ROUTES
// ============================================================

// --- GET /api/pipes ---
// Returns all pipe connections (any logged-in user)
app.get('/api/pipes', requireAuth, (req, res) => {
  const pipes = dbAll('SELECT * FROM pipes ORDER BY id ASC');
  res.json(pipes);
});

// --- POST /api/pipes AND /api/pipes/add ---
// Adds a new pipe connection (admin only)
// Both routes do the same thing for compatibility
function addPipeHandler(req, res) {
  console.log('📥 [DEBUG] Add pipe request received:', JSON.stringify(req.body));
  console.log('📥 [DEBUG] Session user:', JSON.stringify(req.session.user));

  try {
    const { nodeA, nodeB, length, velocity } = req.body;

    // Validate input
    if (!nodeA || !nodeB) {
      console.log('❌ [DEBUG] Missing node names');
      return res.status(400).json({ error: 'Node A and Node B are required' });
    }

    if (length === undefined || length === null || length === '') {
      console.log('❌ [DEBUG] Missing length');
      return res.status(400).json({ error: 'Length is required' });
    }

    if (velocity === undefined || velocity === null || velocity === '') {
      console.log('❌ [DEBUG] Missing velocity');
      return res.status(400).json({ error: 'Velocity is required' });
    }

    const parsedLength = parseFloat(length);
    const parsedVelocity = parseFloat(velocity);

    if (isNaN(parsedLength) || parsedLength <= 0) {
      return res.status(400).json({ error: 'Length must be a positive number' });
    }

    if (isNaN(parsedVelocity) || parsedVelocity <= 0) {
      return res.status(400).json({ error: 'Velocity must be a positive number' });
    }

    // Insert into database
    const nA = String(nodeA).toUpperCase().trim();
    const nB = String(nodeB).toUpperCase().trim();

    console.log(`📝 [DEBUG] Inserting pipe: ${nA} → ${nB}, L=${parsedLength}, V=${parsedVelocity}`);

    dbRun(
      'INSERT INTO pipes (nodeA, nodeB, length, velocity) VALUES (?, ?, ?, ?)',
      [nA, nB, parsedLength, parsedVelocity]
    );

    // Get the last inserted ID using db.exec (works correctly with sql.js)
    const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
    const newId = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : null;

    console.log(`✅ [DEBUG] Pipe added successfully! ID=${newId}, ${nA} → ${nB} (L=${parsedLength}, V=${parsedVelocity})`);

    // Verify it was actually saved by reading it back
    const allPipesAfter = dbAll('SELECT * FROM pipes ORDER BY id DESC LIMIT 1');
    console.log(`🔍 [DEBUG] Verification (latest pipe in DB):`, JSON.stringify(allPipesAfter));

    res.json({
      success: true,
      message: 'Pipe added successfully',
      pipe: { id: newId, nodeA: nA, nodeB: nB, length: parsedLength, velocity: parsedVelocity }
    });

  } catch (error) {
    console.error('❌ [DEBUG] Server error adding pipe:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
}

// Register BOTH routes for compatibility
app.post('/api/pipes', requireAdmin, addPipeHandler);
app.post('/api/pipes/add', requireAdmin, addPipeHandler);

// --- DELETE /api/pipes/:id ---
// Deletes a pipe connection (admin only)
app.delete('/api/pipes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const pipe = dbGet('SELECT * FROM pipes WHERE id = ?', [parseInt(id)]);
  if (!pipe) {
    return res.status(404).json({ error: 'Pipe not found' });
  }

  dbRun('DELETE FROM pipes WHERE id = ?', [parseInt(id)]);
  console.log(`🗑️ Pipe deleted: ID ${id}`);
  res.json({ message: 'Pipe deleted successfully' });
});

// ============================================================
// SIMULATION API ROUTE — Dijkstra's Algorithm
// ============================================================

// --- POST /api/simulate ---
// Runs Dijkstra's algorithm to find shortest-time path
app.post('/api/simulate', requireAuth, (req, res) => {
  const { source, destination } = req.body;

  if (!source || !destination) {
    return res.status(400).json({ error: 'Source and destination are required' });
  }

  // Step 1: Get all pipes from database
  const pipes = dbAll('SELECT * FROM pipes');

  if (pipes.length === 0) {
    return res.status(400).json({ error: 'No pipe network data found' });
  }

  // Step 2: Build adjacency list (Graph data structure)
  // ─────────────────────────────────────────────────
  // The adjacency list stores each node's neighbors
  // along with the time to reach them (Time = Length / Velocity)
  const graph = {};

  for (const pipe of pipes) {
    // Initialize arrays if nodes don't exist yet
    if (!graph[pipe.nodeA]) graph[pipe.nodeA] = [];
    if (!graph[pipe.nodeB]) graph[pipe.nodeB] = [];

    // Calculate time for this pipe segment
    const time = pipe.length / pipe.velocity;

    // Add edges in both directions (undirected graph)
    graph[pipe.nodeA].push({
      node: pipe.nodeB,
      length: pipe.length,
      velocity: pipe.velocity,
      time: time,
      pipeId: pipe.id
    });
    graph[pipe.nodeB].push({
      node: pipe.nodeA,
      length: pipe.length,
      velocity: pipe.velocity,
      time: time,
      pipeId: pipe.id
    });
  }

  // Check if source and destination exist in the graph
  if (!graph[source]) {
    return res.status(400).json({ error: `Source node "${source}" not found in network` });
  }
  if (!graph[destination]) {
    return res.status(400).json({ error: `Destination node "${destination}" not found in network` });
  }

  // Step 3: Dijkstra's Algorithm
  // ────────────────────────────
  // Finds the shortest-time path from source to destination
  // Uses a priority queue (implemented as a simple sorted array)

  const distances = {};    // Shortest known time to each node
  const previous = {};     // Previous node in optimal path
  const edgeUsed = {};     // Edge used to reach each node
  const visited = new Set(); // Nodes we've fully processed

  // Initialize all distances to infinity
  for (const node in graph) {
    distances[node] = Infinity;
    previous[node] = null;
    edgeUsed[node] = null;
  }
  distances[source] = 0;  // Distance to source is 0

  // Priority Queue — Min-Heap for O(log n) extract-min
  // This is the canonical data structure for Dijkstra's Algorithm.
  // Each entry is { node, time } where time is the tentative distance.
  const queue = new MinHeap();
  queue.push({ node: source, time: 0 });

  while (queue.length > 0) {
    // Extract the node with the smallest tentative distance — O(log n)
    const current = queue.pop();

    // Skip if already visited
    if (visited.has(current.node)) continue;
    visited.add(current.node);

    // If we reached the destination, we're done!
    if (current.node === destination) break;

    // Explore all neighbors
    for (const neighbor of graph[current.node]) {
      if (visited.has(neighbor.node)) continue;

      // Calculate new time through current node
      const newTime = distances[current.node] + neighbor.time;

      // If this path is shorter, update it
      if (newTime < distances[neighbor.node]) {
        distances[neighbor.node] = newTime;
        previous[neighbor.node] = current.node;
        edgeUsed[neighbor.node] = neighbor;
        queue.push({ node: neighbor.node, time: newTime });
      }
    }
  }

  // Step 4: Reconstruct the shortest path
  // ─────────────────────────────────────
  if (distances[destination] === Infinity) {
    return res.status(400).json({ error: `No path found from "${source}" to "${destination}"` });
  }

  // Walk backwards from destination to source using the "previous" map
  const resultPath = [];
  const edges = [];
  let currentNode = destination;

  while (currentNode !== null) {
    resultPath.unshift(currentNode);  // Add to front of path
    if (edgeUsed[currentNode]) {
      edges.unshift({
        from: previous[currentNode],
        to: currentNode,
        length: edgeUsed[currentNode].length,
        velocity: edgeUsed[currentNode].velocity,
        time: edgeUsed[currentNode].time
      });
    }
    currentNode = previous[currentNode];
  }

  // Step 5: Return results
  console.log(`🚰 Simulation: ${source} → ${destination} | Path: ${resultPath.join(' → ')} | Time: ${distances[destination].toFixed(2)}s`);

  res.json({
    source,
    destination,
    path: resultPath,
    edges,
    totalTime: parseFloat(distances[destination].toFixed(2)),
    graph: graph,  // Send full graph for visualization
    allPipes: pipes // Send all pipes for drawing
  });
});

// ============================================================
// SERVE HTML PAGES
// ============================================================

// Default route — serve login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER (after database is ready)
// ============================================================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   💧 Water Flow Simulation Server Running       ║');
    console.log(`║   🌐 Open: http://localhost:${PORT}                 ║`);
    console.log('║   📁 Database: pipes.db                         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║   Default Accounts:                             ║');
    console.log('║   👑 Admin: admin / admin123                    ║');
    console.log('║   👤 User:  user  / user123                     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
