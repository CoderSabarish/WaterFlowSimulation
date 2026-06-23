// ============================================================
// admin.js — Admin Dashboard CRUD Operations
// ============================================================
// Handles:
//   1. Loading and displaying all pipes in a table
//   2. Adding new pipe connections (form submission)
//   3. Deleting pipe connections
//   4. Calculating and displaying statistics
// ============================================================

(function () {
  'use strict';

  // --- DOM Elements ---
  const pipeForm = document.getElementById('pipe-form');
  const pipeTableBody = document.getElementById('admin-pipe-table-body');
  const nodeAInput = document.getElementById('input-nodeA');
  const nodeBInput = document.getElementById('input-nodeB');
  const lengthInput = document.getElementById('input-length');
  const velocityInput = document.getElementById('input-velocity');
  const totalPipesEl = document.getElementById('stat-total-pipes');
  const totalNodesEl = document.getElementById('stat-total-nodes');
  const avgTimeEl = document.getElementById('stat-avg-time');

  // --- Debug: Check if all DOM elements are found ---
  console.log('🔍 [DEBUG] Admin.js loaded!');
  console.log('🔍 [DEBUG] pipe-form found:', !!pipeForm);
  console.log('🔍 [DEBUG] input-nodeA found:', !!nodeAInput);
  console.log('🔍 [DEBUG] input-nodeB found:', !!nodeBInput);
  console.log('🔍 [DEBUG] input-length found:', !!lengthInput);
  console.log('🔍 [DEBUG] input-velocity found:', !!velocityInput);
  console.log('🔍 [DEBUG] admin-pipe-table-body found:', !!pipeTableBody);

  // --- State ---
  let pipes = [];

  // ============================================================
  // LOAD ALL PIPES FROM SERVER
  // ============================================================
  async function loadPipes() {
    console.log('📡 [DEBUG] Loading pipes from /api/pipes...');
    try {
      const response = await fetch('/api/pipes');
      console.log('📡 [DEBUG] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ [DEBUG] Load failed:', errorData);
        throw new Error(errorData.error || 'Failed to load');
      }

      pipes = await response.json();
      console.log('✅ [DEBUG] Loaded', pipes.length, 'pipes:', pipes);
      renderTable();
      updateStats();
    } catch (error) {
      console.error('❌ [DEBUG] Error loading pipes:', error);
      showToast('Failed to load pipe data', 'error');
    }
  }

  // ============================================================
  // RENDER PIPE TABLE
  // ============================================================
  function renderTable() {
    if (pipes.length === 0) {
      pipeTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color: var(--text-muted); padding: 32px;">
            <div class="empty-state">
              <div class="empty-icon">🔧</div>
              <p>No pipes added yet. Use the form to add pipe connections.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    pipeTableBody.innerHTML = pipes.map(pipe => {
      const time = (pipe.length / pipe.velocity).toFixed(2);
      return `
        <tr>
          <td><span class="node-badge">${pipe.nodeA}</span></td>
          <td><span class="node-badge">${pipe.nodeB}</span></td>
          <td>${pipe.length} m</td>
          <td>${pipe.velocity} m/s</td>
          <td style="color: var(--neon-green); font-weight: 600;">${time}s</td>
          <td>
            <button class="btn btn-danger btn-icon" onclick="deletePipe(${pipe.id})" title="Delete this pipe">
              🗑️ Delete
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // ============================================================
  // UPDATE STATISTICS
  // ============================================================
  function updateStats() {
    // Total pipes
    totalPipesEl.textContent = pipes.length;

    // Total unique nodes
    const nodes = new Set();
    pipes.forEach(p => {
      nodes.add(p.nodeA);
      nodes.add(p.nodeB);
    });
    totalNodesEl.textContent = nodes.size;

    // Average time
    if (pipes.length > 0) {
      const totalTime = pipes.reduce((sum, p) => sum + (p.length / p.velocity), 0);
      avgTimeEl.textContent = (totalTime / pipes.length).toFixed(1) + 's';
    } else {
      avgTimeEl.textContent = '0s';
    }
  }

  // ============================================================
  // ADD A NEW PIPE (Form Submit Handler)
  // ============================================================
  if (!pipeForm) {
    console.error('❌ [DEBUG] CRITICAL: pipe-form element not found! Cannot attach submit handler.');
  } else {
    pipeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      console.log('📝 [DEBUG] Form submitted!');

      // Read values from form inputs
      const nodeA = nodeAInput ? nodeAInput.value.trim().toUpperCase() : '';
      const nodeB = nodeBInput ? nodeBInput.value.trim().toUpperCase() : '';
      const lengthVal = lengthInput ? lengthInput.value : '';
      const velocityVal = velocityInput ? velocityInput.value : '';

      console.log('📝 [DEBUG] Form values:', {
        nodeA: nodeA,
        nodeB: nodeB,
        length: lengthVal,
        velocity: velocityVal
      });

      // --- Client-side Validation ---
      if (!nodeA || !nodeB) {
        showToast('Please enter both node names (Node A and Node B)', 'error');
        console.log('❌ [DEBUG] Validation failed: missing node names');
        return;
      }

      if (nodeA === nodeB) {
        showToast('Node A and Node B must be different', 'error');
        console.log('❌ [DEBUG] Validation failed: same node names');
        return;
      }

      const length = parseFloat(lengthVal);
      const velocity = parseFloat(velocityVal);

      if (isNaN(length) || length <= 0) {
        showToast('Length must be a positive number', 'error');
        console.log('❌ [DEBUG] Validation failed: invalid length =', lengthVal);
        return;
      }

      if (isNaN(velocity) || velocity <= 0) {
        showToast('Velocity must be a positive number', 'error');
        console.log('❌ [DEBUG] Validation failed: invalid velocity =', velocityVal);
        return;
      }

      // --- Prepare data ---
      const pipeData = {
        nodeA: nodeA,
        nodeB: nodeB,
        length: length,
        velocity: velocity
      };

      console.log('📤 [DEBUG] Sending POST /api/pipes with data:', JSON.stringify(pipeData));

      // --- Find and disable the submit button while processing ---
      const submitBtn = pipeForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Adding...';
      }

      // --- Send to server ---
      try {
        const response = await fetch('/api/pipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pipeData)
        });

        console.log('📡 [DEBUG] Response status:', response.status);

        const data = await response.json();
        console.log('📡 [DEBUG] Response data:', JSON.stringify(data));

        if (!response.ok) {
          throw new Error(data.error || 'Failed to add pipe (server returned ' + response.status + ')');
        }

        // SUCCESS!
        console.log('✅ [DEBUG] Pipe added successfully:', data);
        showToast(`Pipe ${nodeA} → ${nodeB} added successfully!`, 'success');

        // Clear the form
        pipeForm.reset();
        console.log('🧹 [DEBUG] Form cleared');

        // Reload the table to show the new pipe
        await loadPipes();
        console.log('🔄 [DEBUG] Table refreshed');

      } catch (error) {
        console.error('❌ [DEBUG] Error adding pipe:', error);
        showToast('Failed to add pipe: ' + error.message, 'error');
      } finally {
        // Re-enable button
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '➕ Add Pipe';
        }
      }
    });

    console.log('✅ [DEBUG] Submit handler attached to pipe-form');
  }

  // ============================================================
  // DELETE A PIPE
  // ============================================================
  // This function is called from the onclick handler in the table
  window.deletePipe = async function (id) {
    // Confirm before deleting
    if (!confirm('Are you sure you want to delete this pipe?')) return;

    console.log('🗑️ [DEBUG] Deleting pipe ID:', id);

    try {
      const response = await fetch(`/api/pipes/${id}`, { method: 'DELETE' });
      const data = await response.json();

      console.log('📡 [DEBUG] Delete response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete');
      }

      showToast('Pipe deleted successfully', 'success');
      await loadPipes();

    } catch (error) {
      console.error('❌ [DEBUG] Error deleting pipe:', error);
      showToast(error.message, 'error');
    }
  };

  // --- Initialize ---
  console.log('🚀 [DEBUG] Initializing admin dashboard...');
  loadPipes();

})();
