// ============================================================
// nav.js — Dynamic Navigation Bar
// ============================================================
// Injects the navbar into every page
// Highlights the current page link
// Shows different options based on login state
// ============================================================

(async function () {
  'use strict';

  // --- Check current session ---
  let session = { loggedIn: false };
  try {
    const res = await fetch('/api/session');
    session = await res.json();
  } catch (e) {
    // Not logged in or server error
  }

  // --- Determine current page ---
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // --- Build navbar HTML ---
  const navHTML = `
    <nav class="navbar" id="main-navbar">
      <a href="/home.html" class="navbar-brand">
        <span class="brand-icon">💧</span>
        <span>FlowSim</span>
      </a>

      <div class="navbar-toggle" id="nav-toggle" onclick="toggleMobileNav()">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <ul class="navbar-links" id="nav-links">
        <li><a href="/home.html" ${currentPage === 'home.html' ? 'class="active"' : ''}>Home</a></li>
        <li><a href="/simulation.html" ${currentPage === 'simulation.html' ? 'class="active"' : ''}>Simulation</a></li>
        <li><a href="/applications.html" ${currentPage === 'applications.html' ? 'class="active"' : ''}>Applications</a></li>
        ${session.loggedIn && session.user.role === 'admin' ?
      `<li><a href="/admin.html" ${currentPage === 'admin.html' ? 'class="active"' : ''}>Admin Panel</a></li>` : ''}
        ${session.loggedIn ?
      `<li>
          <a href="#" class="nav-btn-logout" onclick="logout(); return false;">
            Logout (${session.user.username})
          </a>
        </li>` :
      `<li><a href="/index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>Login</a></li>`
    }
      </ul>
    </nav>
  `;

  // --- Inject navbar at the top of body ---
  // Don't show navbar on login page
  if (currentPage !== 'index.html') {
    document.body.insertAdjacentHTML('afterbegin', navHTML);
  }
})();

// --- Mobile menu toggle ---
function toggleMobileNav() {
  const links = document.getElementById('nav-links');
  if (links) {
    links.classList.toggle('open');
  }
}
