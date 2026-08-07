// ==========================================
// ADMIN PANEL JAVASCRIPT
// ==========================================

let allUsers = [];
let allChatLogs = [];
let allAuthLogs = [];
let confirmCallback = null;
let currentPanel = 'panel-overview';

// Panel titles/subtitles
const panelMeta = {
    'panel-overview': { title: 'System Overview', subtitle: 'Monitor system health, user activity, and query statistics' },
    'panel-users': { title: 'User Management', subtitle: 'View, promote, demote, or delete registered users' },
    'panel-logs': { title: 'Activity Logs', subtitle: 'Monitor all chat queries and authentication events' },
    'panel-database': { title: 'Database Controls', subtitle: 'Manage the medical knowledge base and system files' }
};

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAuth();
    setupNavigation();
    await loadStats();
    await loadActivityFeed();
    updateDbInfoFromStats();
});

async function checkAdminAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.logged_in) {
            window.location.href = '/login';
            return;
        }
        if (data.role !== 'admin') {
            window.location.href = '/';
            return;
        }
        document.getElementById('adminUsername').textContent = data.username;
    } catch {
        window.location.href = '/login';
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-btn[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
    });
}

function switchPanel(panelId) {
    currentPanel = panelId;

    document.querySelectorAll('.nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const navBtn = document.querySelector(`.nav-btn[data-panel="${panelId}"]`);
    if (navBtn) navBtn.classList.add('active');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');

    const meta = panelMeta[panelId] || {};
    document.getElementById('panelTitle').textContent = meta.title || '';
    document.getElementById('panelSubtitle').textContent = meta.subtitle || '';

    // Load panel data
    if (panelId === 'panel-users') loadUsers();
    if (panelId === 'panel-logs') loadLogs();
    if (panelId === 'panel-database') updateDbInfoFromStats();
}

async function refreshCurrentPanel() {
    await loadStats();
    if (currentPanel === 'panel-users') await loadUsers();
    if (currentPanel === 'panel-logs') await loadLogs();
    if (currentPanel === 'panel-overview') await loadActivityFeed();
}

// ==========================================
// STATS & OVERVIEW
// ==========================================
let cachedStats = null;

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        cachedStats = data;

        document.getElementById('statUsers').textContent = data.total_users;
        document.getElementById('statQueries').textContent = data.total_queries;
        document.getElementById('statDiseases').textContent = data.diseases_loaded;
        document.getElementById('statUptime').textContent = data.uptime;

        // Summary
        document.getElementById('summarySymptoms').textContent = data.symptoms_loaded;
        document.getElementById('summaryAdmins').textContent = data.admin_users;
        document.getElementById('summaryLogins').textContent = data.total_logins;
        document.getElementById('sysUptime').textContent = data.uptime;
    } catch (e) {
        console.error('Failed to load stats', e);
    }
}

function updateDbInfoFromStats() {
    if (!cachedStats) return;
    document.getElementById('dbDiseases').textContent = cachedStats.diseases_loaded || '—';
    document.getElementById('dbSymptoms').textContent = cachedStats.symptoms_loaded || '—';
    document.getElementById('sysUptime').textContent = cachedStats.uptime || '—';
}

async function loadActivityFeed() {
    try {
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        const all = [
            ...(data.chat_logs || []).slice(0, 10).map(l => ({ ...l, type: 'chat' })),
            ...(data.auth_logs || []).slice(0, 10)
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 12);

        allChatLogs = data.chat_logs || [];
        allAuthLogs = data.auth_logs || [];

        const container = document.getElementById('activityList');
        if (all.length === 0) {
            container.innerHTML = '<div class="empty-state small"><i class="fa-solid fa-inbox"></i><span>No activity yet</span></div>';
            return;
        }

        container.innerHTML = all.map(item => {
            const icon = item.type === 'chat' ? 'fa-comment'
                : item.type === 'login' ? 'fa-right-to-bracket'
                : 'fa-user-plus';
            const action = item.type === 'chat'
                ? `asked: <em>"${escHtml(item.message || '').substring(0, 55)}${(item.message || '').length > 55 ? '…' : ''}"</em>`
                : item.type === 'login' ? 'logged in'
                : 'registered a new account';

            return `
                <div class="activity-item ${item.type}">
                    <div class="activity-icon"><i class="fa-solid ${icon}"></i></div>
                    <div class="activity-text">
                        <strong>${escHtml(item.username || 'user')}</strong> ${action}
                    </div>
                    <div class="activity-time">${formatTime(item.timestamp)}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load activity', e);
    }
}

// ==========================================
// USER MANAGEMENT
// ==========================================
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading users...</td></tr>';

    try {
        const res = await fetch('/api/admin/users');
        allUsers = await res.json();

        // Get current user
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        const currentUser = meData.username;

        document.getElementById('userCount').textContent = `${allUsers.length} users`;
        renderUsersTable(allUsers, currentUser);
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">Failed to load users</td></tr>';
    }
}

function renderUsersTable(users, currentUser) {
    const tbody = document.getElementById('usersTableBody');
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const isSelf = u.username === currentUser;
        const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
        const promoteBtn = u.role === 'user'
            ? `<button class="tbl-btn promote ${isSelf ? 'self' : ''}" onclick="changeRole('${u.username}', 'admin')" ${isSelf ? 'disabled title="Cannot change own role"' : ''}>
                   <i class="fa-solid fa-arrow-up"></i> Make Admin
               </button>`
            : `<button class="tbl-btn demote ${isSelf ? 'self' : ''}" onclick="changeRole('${u.username}', 'user')" ${isSelf ? 'disabled title="Cannot change own role"' : ''}>
                   <i class="fa-solid fa-arrow-down"></i> Make User
               </button>`;

        return `
            <tr>
                <td>
                    <strong>${escHtml(u.username)}</strong>
                    ${isSelf ? '<span style="font-size:0.72rem;color:#6366f1;margin-left:6px;">(you)</span>' : ''}
                </td>
                <td>${escHtml(u.email || '—')}</td>
                <td><span class="role-badge ${u.role}">${u.role}</span></td>
                <td>${created}</td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${promoteBtn}
                        <button class="tbl-btn delete ${isSelf ? 'self' : ''}" onclick="deleteUser('${u.username}')" ${isSelf ? 'disabled title="Cannot delete own account"' : ''}>
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterUsers(query) {
    const q = query.toLowerCase();
    const filtered = allUsers.filter(u =>
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.role.includes(q)
    );
    document.getElementById('userCount').textContent = `${filtered.length} users`;
    renderUsersTable(filtered, null);
}

async function changeRole(username, role) {
    const label = role === 'admin' ? 'promote to Admin' : 'demote to User';
    showConfirm(
        `Change Role: ${username}`,
        `Are you sure you want to ${label} "${username}"?`,
        async () => {
            try {
                const res = await fetch(`/api/admin/users/${username}/role`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role })
                });
                const data = await res.json();
                if (data.success) {
                    await loadUsers();
                    await loadStats();
                    showToast(data.message, 'success');
                } else {
                    showToast(data.error || 'Failed', 'error');
                }
            } catch {
                showToast('Network error', 'error');
            }
        }
    );
}

async function deleteUser(username) {
    showConfirm(
        `Delete User: ${username}`,
        `This will permanently delete "${username}". This action cannot be undone.`,
        async () => {
            try {
                const res = await fetch(`/api/admin/users/${username}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    await loadUsers();
                    await loadStats();
                    showToast(data.message, 'success');
                } else {
                    showToast(data.error || 'Failed', 'error');
                }
            } catch {
                showToast('Network error', 'error');
            }
        }
    );
}

// ==========================================
// LOGS
// ==========================================
async function loadLogs() {
    document.getElementById('chatLogsBody').innerHTML = '<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';
    document.getElementById('authLogsBody').innerHTML = '<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        allChatLogs = data.chat_logs || [];
        allAuthLogs = data.auth_logs || [];
        renderChatLogs(allChatLogs);
        renderAuthLogs(allAuthLogs);
    } catch {
        document.getElementById('chatLogsBody').innerHTML = '<tr><td colspan="5" class="table-loading">Failed to load</td></tr>';
    }
}

function renderChatLogs(logs) {
    const tbody = document.getElementById('chatLogsBody');
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No chat logs yet</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map((log, i) => `
        <tr>
            <td style="color:var(--text-dim);">${i + 1}</td>
            <td><strong>${escHtml(log.username || '—')}</strong></td>
            <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(log.message || '')}">
                ${escHtml(log.message || '—')}
            </td>
            <td><span class="type-pill ${log.response_type || ''}">${log.response_type || '—'}</span></td>
            <td style="white-space:nowrap;color:var(--text-dim);">${formatTime(log.timestamp)}</td>
        </tr>
    `).join('');
}

function renderAuthLogs(logs) {
    const tbody = document.getElementById('authLogsBody');
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No auth events yet</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map((log, i) => `
        <tr>
            <td style="color:var(--text-dim);">${i + 1}</td>
            <td><strong>${escHtml(log.username || '—')}</strong></td>
            <td><span class="type-pill ${log.type || ''}">${log.type || '—'}</span></td>
            <td style="color:var(--text-dim);">${escHtml(log.ip || '—')}</td>
            <td style="white-space:nowrap;color:var(--text-dim);">${formatTime(log.timestamp)}</td>
        </tr>
    `).join('');
}

function switchLogTab(type, btn) {
    document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('chatLogsPanel').classList.toggle('active', type === 'chat');
    document.getElementById('authLogsPanel').classList.toggle('active', type === 'auth');
}

function filterLogs(query) {
    const q = query.toLowerCase();
    const filtered = allChatLogs.filter(l =>
        (l.username || '').toLowerCase().includes(q) ||
        (l.message || '').toLowerCase().includes(q)
    );
    renderChatLogs(filtered);
}

// ==========================================
// DATABASE CONTROLS
// ==========================================
async function reloadKnowledgeBase() {
    const btn = document.getElementById('reloadKbBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Reloading...';
    }

    try {
        const res = await fetch('/api/admin/reload-kb', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            await loadStats();
            updateDbInfoFromStats();
        } else {
            showToast(data.error || 'Failed to reload', 'error');
        }
    } catch {
        showToast('Network error', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Reload Knowledge Base';
        }
    }
}

// ==========================================
// LOGOUT
// ==========================================
async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/login';
}

// ==========================================
// CONFIRM MODAL
// ==========================================
function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');

    const okBtn = document.getElementById('confirmOk');
    okBtn.onclick = () => {
        closeConfirm();
        if (confirmCallback) confirmCallback();
    };
}

function closeConfirm() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const existing = document.getElementById('adminToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.style.cssText = `
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        background: ${type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};
        border: 1px solid ${type === 'success' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'};
        color: ${type === 'success' ? '#6ee7b7' : '#fca5a5'};
        padding: 14px 20px;
        border-radius: 12px;
        font-family: var(--font-heading);
        font-weight: 600;
        font-size: 0.9rem;
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideUp 0.3s ease;
        max-width: 360px;
    `;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${escHtml(message)}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ==========================================
// UTILITY
// ==========================================
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'Z');
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return d.toLocaleDateString();
    } catch {
        return isoStr;
    }
}
