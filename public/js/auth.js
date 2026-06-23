// ============================================================
// auth.js — Authentication Helper Functions
// ============================================================
// Provides functions to check login state, protect pages,
// and handle logout. Used by all pages.
// ============================================================

// --- Check if user is currently logged in ---
// Returns the session data { loggedIn, user } or null
async function checkSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Session check failed:', error);
    return { loggedIn: false };
  }
}

// --- Protect a page (redirect to login if not logged in) ---
// Call this at the top of any page that requires authentication
async function requireLogin() {
  const session = await checkSession();

  if (!session.loggedIn) {
    // Not logged in — redirect to login page
    showToast('Please log in to access this page', 'error');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1000);
    return null;
  }

  return session.user;
}

// --- Protect admin-only pages ---
// Redirects non-admin users to home page
async function requireAdminLogin() {
  const session = await checkSession();

  if (!session.loggedIn) {
    showToast('Please log in to access this page', 'error');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1000);
    return null;
  }

  if (session.user.role !== 'admin') {
    showToast('Admin access required', 'error');
    setTimeout(() => {
      window.location.href = '/home.html';
    }, 1000);
    return null;
  }

  return session.user;
}

// --- Logout the current user ---
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 800);
  } catch (error) {
    console.error('❌ Logout failed:', error);
    // Redirect anyway
    window.location.href = '/index.html';
  }
}

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================
// Shows a temporary message at the top-right of the screen

// Create toast container if it doesn't exist
function getToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

// Show a toast notification
// type: 'success', 'error', or 'info'
function showToast(message, type = 'info') {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // Add icon based on type
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  toast.textContent = `${icons[type] || ''} ${message}`;
  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(60px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
