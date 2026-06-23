// ============================================================
// simulation.js — Graph Visualization & Water Flow Animation
// ============================================================
// This file handles:
//   1. Fetching pipe data from the server
//   2. Drawing the pipe network graph on a canvas
//   3. Running Dijkstra simulation via the API
//   4. Animating water flow along the shortest path
// ============================================================

(function () {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  const pipeTableBody = document.getElementById('pipe-table-body');
  const sourceSelect = document.getElementById('source-select');
  const destSelect = document.getElementById('dest-select');
  const runBtn = document.getElementById('run-simulation');
  const resultsPanel = document.getElementById('results-panel');

  // --- State ---
  let pipes = [];              // All pipe connections from DB
  let nodePositions = {};      // Calculated positions for each node
  let simulationResult = null; // Result from Dijkstra
  let animationId = null;      // Current animation frame ID
  let animationProgress = 0;   // 0 to 1 for path animation
  let waterParticles = [];     // Particles for water flow animation

  // --- Canvas Setup ---
  function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ============================================================
  // LOAD PIPE DATA
  // ============================================================
  async function loadPipes() {
    try {
      const response = await fetch('/api/pipes');
      if (!response.ok) {
        if (response.status === 401) {
          showToast('Please log in first', 'error');
          return;
        }
        throw new Error('Failed to load pipes');
      }
      pipes = await response.json();
      renderPipeTable();
      populateNodeSelects();
      calculateNodePositions();
      drawGraph();
    } catch (error) {
      console.error('❌ Error loading pipes:', error);
      showToast('Failed to load pipe network', 'error');
    }
  }

  // ============================================================
  // RENDER PIPE TABLE (Left Panel)
  // ============================================================
  function renderPipeTable() {
    if (pipes.length === 0) {
      pipeTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 24px;">
            No pipes found. Ask an admin to add some.
          </td>
        </tr>`;
      return;
    }

    pipeTableBody.innerHTML = pipes.map(pipe => `
      <tr>
        <td><span style="color: var(--neon-cyan); font-weight:600;">${pipe.nodeA}</span></td>
        <td><span style="color: var(--neon-cyan); font-weight:600;">${pipe.nodeB}</span></td>
        <td>${pipe.length}m</td>
        <td>${pipe.velocity} m/s</td>
        <td style="color: var(--neon-green);">${(pipe.length / pipe.velocity).toFixed(1)}s</td>
      </tr>
    `).join('');
  }

  // ============================================================
  // POPULATE SOURCE/DESTINATION DROPDOWNS
  // ============================================================
  function populateNodeSelects() {
    // Get unique node names
    const nodes = new Set();
    pipes.forEach(p => {
      nodes.add(p.nodeA);
      nodes.add(p.nodeB);
    });
    const sortedNodes = Array.from(nodes).sort();

    // Clear and fill dropdowns
    sourceSelect.innerHTML = '<option value="">Select Source</option>';
    destSelect.innerHTML = '<option value="">Select Destination</option>';

    sortedNodes.forEach(node => {
      sourceSelect.innerHTML += `<option value="${node}">${node}</option>`;
      destSelect.innerHTML += `<option value="${node}">${node}</option>`;
    });
  }

  // ============================================================
  // CALCULATE NODE POSITIONS (Circular Layout)
  // ============================================================
  // Arranges nodes in a circle on the canvas for clear visualization
  function calculateNodePositions() {
    const nodes = new Set();
    pipes.forEach(p => {
      nodes.add(p.nodeA);
      nodes.add(p.nodeB);
    });

    const nodeList = Array.from(nodes).sort();
    const count = nodeList.length;

    if (count === 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.32;

    nodePositions = {};
    nodeList.forEach((node, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      nodePositions[node] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });
  }

  // ============================================================
  // DRAW THE GRAPH ON CANVAS
  // ============================================================
  function drawGraph() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pipes.length === 0) {
      // Draw empty state message
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No pipe network data. Add pipes from Admin Panel.', canvas.width / 2, canvas.height / 2);
      return;
    }

    // --- Draw all pipes (edges) ---
    pipes.forEach(pipe => {
      const a = nodePositions[pipe.nodeA];
      const b = nodePositions[pipe.nodeB];
      if (!a || !b) return;

      drawPipe(a, b, pipe, false);
    });

    // --- Highlight shortest path if simulation has run ---
    if (simulationResult && simulationResult.edges) {
      simulationResult.edges.forEach(edge => {
        const a = nodePositions[edge.from];
        const b = nodePositions[edge.to];
        if (!a || !b) return;

        drawPipe(a, b, edge, true);
      });
    }

    // --- Draw all nodes ---
    for (const [name, pos] of Object.entries(nodePositions)) {
      drawNode(pos.x, pos.y, name);
    }

    // --- Draw water particles ---
    drawWaterParticles();
  }

  // --- Draw a single pipe (edge) ---
  function drawPipe(a, b, pipe, isHighlighted) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);

    if (isHighlighted) {
      // Highlighted path — bright cyan with glow
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 20;
    } else {
      // Normal pipe — dim blue
      ctx.strokeStyle = 'rgba(0, 119, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw label at midpoint
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    ctx.fillStyle = isHighlighted ? 'rgba(0, 212, 255, 0.9)' : 'rgba(255, 255, 255, 0.35)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';

    const time = (pipe.length / pipe.velocity).toFixed(1);
    ctx.fillText(`${pipe.length}m | ${pipe.velocity}m/s`, midX, midY - 8);
    ctx.fillText(`⏱ ${time}s`, midX, midY + 8);
  }

  // --- Draw a single node ---
  function drawNode(x, y, name) {
    const isSource = simulationResult && simulationResult.source === name;
    const isDest = simulationResult && simulationResult.destination === name;
    const isOnPath = simulationResult && simulationResult.path && simulationResult.path.includes(name);

    // Outer glow
    if (isSource || isDest) {
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fillStyle = isSource ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 51, 102, 0.15)';
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);

    if (isSource) {
      ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
      ctx.strokeStyle = '#00ff88';
    } else if (isDest) {
      ctx.fillStyle = 'rgba(255, 51, 102, 0.2)';
      ctx.strokeStyle = '#ff3366';
    } else if (isOnPath) {
      ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
      ctx.strokeStyle = '#00d4ff';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    }

    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Node label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y);
  }

  // ============================================================
  // WATER FLOW ANIMATION
  // ============================================================
  // Animates blue particles flowing along the shortest path

  function startWaterAnimation() {
    if (!simulationResult || !simulationResult.path || simulationResult.path.length < 2) return;

    // Cancel any previous animation
    if (animationId) cancelAnimationFrame(animationId);

    // Create water particles
    waterParticles = [];
    animationProgress = 0;

    // Build the full path as a series of points
    const pathPoints = simulationResult.path.map(name => nodePositions[name]);

    // Calculate total pixel distance
    let totalDist = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dx = pathPoints[i + 1].x - pathPoints[i].x;
      const dy = pathPoints[i + 1].y - pathPoints[i].y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }

    // Create 20 particles spaced along the path
    const PARTICLE_COUNT = 20;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      waterParticles.push({
        offset: i / PARTICLE_COUNT,  // Staggered start positions
        size: 3 + Math.random() * 4,
        opacity: 0.4 + Math.random() * 0.6,
        speed: 0.003 + Math.random() * 0.002
      });
    }

    // Start animation loop
    function animateWater() {
      // Update particle positions
      waterParticles.forEach(p => {
        p.offset += p.speed;
        if (p.offset > 1) p.offset -= 1;  // Loop back to start
      });

      // Redraw everything
      drawGraph();

      animationId = requestAnimationFrame(animateWater);
    }

    animateWater();
    showToast('Water flow simulation started!', 'info');
  }

  // --- Draw water particles on the path ---
  function drawWaterParticles() {
    if (!simulationResult || !simulationResult.path || waterParticles.length === 0) return;

    const pathPoints = simulationResult.path.map(name => nodePositions[name]);
    if (pathPoints.length < 2) return;

    // Calculate segment lengths
    const segments = [];
    let totalDist = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dx = pathPoints[i + 1].x - pathPoints[i].x;
      const dy = pathPoints[i + 1].y - pathPoints[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      segments.push({ start: pathPoints[i], end: pathPoints[i + 1], dist });
      totalDist += dist;
    }

    // Draw each particle
    waterParticles.forEach(particle => {
      // Find position along the path based on offset
      let targetDist = particle.offset * totalDist;
      let pos = null;

      let accum = 0;
      for (const seg of segments) {
        if (accum + seg.dist >= targetDist) {
          const t = (targetDist - accum) / seg.dist;
          pos = {
            x: seg.start.x + (seg.end.x - seg.start.x) * t,
            y: seg.start.y + (seg.end.y - seg.start.y) * t
          };
          break;
        }
        accum += seg.dist;
      }

      if (!pos) pos = pathPoints[pathPoints.length - 1];

      // Draw glowing particle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, particle.size, 0, Math.PI * 2);

      // Gradient glow
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, particle.size * 2);
      gradient.addColorStop(0, `rgba(0, 212, 255, ${particle.opacity})`);
      gradient.addColorStop(0.5, `rgba(0, 119, 255, ${particle.opacity * 0.5})`);
      gradient.addColorStop(1, 'rgba(0, 119, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.fill();

      // Core bright dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, particle.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity * 0.8})`;
      ctx.fill();
    });
  }

  // ============================================================
  // RUN SIMULATION (call Dijkstra API)
  // ============================================================
  async function runSimulation() {
    const source = sourceSelect.value;
    const destination = destSelect.value;

    if (!source || !destination) {
      showToast('Select both source and destination', 'error');
      return;
    }

    if (source === destination) {
      showToast('Source and destination must be different', 'error');
      return;
    }

    // Disable button while loading
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Calculating...';

    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Simulation failed');
      }

      simulationResult = data;
      displayResults(data);
      drawGraph();
      startWaterAnimation();

    } catch (error) {
      console.error('❌ Simulation error:', error);
      showToast(error.message, 'error');
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '🚀 Run Simulation';
    }
  }

  // ============================================================
  // DISPLAY RESULTS (Right Panel)
  // ============================================================
  function displayResults(data) {
    // Build path visualization
    const pathHTML = data.path.map((node, i) => {
      let html = `<span class="path-node">${node}</span>`;
      if (i < data.path.length - 1) {
        html += `<span class="path-arrow">→</span>`;
      }
      return html;
    }).join('');

    // Build edge breakdown
    const edgesHTML = data.edges.map(edge => `
      <div class="edge-item">
        <span class="edge-name">${edge.from} → ${edge.to}</span>
        <span class="edge-time">${edge.time.toFixed(2)}s</span>
      </div>
    `).join('');

    resultsPanel.innerHTML = `
      <div class="result-card" style="animation: fadeSlideUp 0.3s ease-out;">
        <div class="result-label">Total Flow Time</div>
        <div class="result-value">${data.totalTime.toFixed(2)} seconds</div>
      </div>

      <div class="result-card" style="animation: fadeSlideUp 0.4s ease-out;">
        <div class="result-label">Shortest Path (Dijkstra)</div>
        <div class="path-nodes">${pathHTML}</div>
      </div>

      <div class="result-card" style="animation: fadeSlideUp 0.5s ease-out;">
        <div class="result-label">Edge Breakdown (Time = Length ÷ Velocity)</div>
        <div class="edge-breakdown">${edgesHTML}</div>
      </div>

      <div class="result-card" style="animation: fadeSlideUp 0.6s ease-out;">
        <div class="result-label">Algorithm Used</div>
        <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
          <strong style="color: var(--neon-cyan);">Dijkstra's Algorithm</strong> with priority queue, 
          using <strong>Adjacency List</strong> graph representation.
          Edge weight = Length / Velocity (time in seconds).
        </div>
      </div>
    `;
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  runBtn.addEventListener('click', runSimulation);

  // Redraw graph when canvas is resized
  window.addEventListener('resize', () => {
    resizeCanvas();
    calculateNodePositions();
    drawGraph();
  });

  // --- Initialize ---
  loadPipes();

})();
