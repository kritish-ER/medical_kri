// ==========================================
// AUTH PAGE JAVASCRIPT
// ==========================================

let currentTab = 'login';

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('loginForm').classList.toggle('active', tab === 'login');
    document.getElementById('registerForm').classList.toggle('active', tab === 'register');
    document.getElementById('loginTab').classList.toggle('active', tab === 'login');
    document.getElementById('registerTab').classList.toggle('active', tab === 'register');
    hideAlert();
}

function showAlert(message, type = 'error') {
    const alert = document.getElementById('authAlert');
    const icon = type === 'error'
        ? '<i class="fa-solid fa-circle-exclamation"></i>'
        : '<i class="fa-solid fa-circle-check"></i>';
    alert.innerHTML = icon + ' ' + message;
    alert.className = `auth-alert ${type}`;
    alert.style.display = 'flex';
}

function hideAlert() {
    const alert = document.getElementById('authAlert');
    alert.style.display = 'none';
}

function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
}

// Password strength indicator
document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('regPassword');
    const strengthEl = document.getElementById('pwStrength');
    if (pwInput && strengthEl) {
        pwInput.addEventListener('input', () => {
            const pw = pwInput.value;
            if (pw.length === 0) {
                strengthEl.textContent = '';
                strengthEl.className = 'pw-strength';
                return;
            }
            let score = 0;
            if (pw.length >= 6) score++;
            if (pw.length >= 10) score++;
            if (/[A-Z]/.test(pw) || /[0-9]/.test(pw)) score++;
            if (/[^a-zA-Z0-9]/.test(pw)) score++;

            if (score <= 1) {
                strengthEl.textContent = '⚠️ Weak password';
                strengthEl.className = 'pw-strength weak';
            } else if (score === 2 || score === 3) {
                strengthEl.textContent = '🔒 Medium strength';
                strengthEl.className = 'pw-strength medium';
            } else {
                strengthEl.textContent = '✅ Strong password!';
                strengthEl.className = 'pw-strength strong';
            }
        });
    }
});

// ==========================================
// LOGIN
// ==========================================
async function handleLogin(e) {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    if (!username || !password) {
        showAlert('Please fill in all fields.');
        return;
    }

    setButtonLoading(btn, true);

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
            showAlert(data.error || 'Login failed. Please check your credentials.');
            setButtonLoading(btn, false);
            return;
        }

        showAlert('✅ ' + data.message + ' Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = '/';
        }, 900);
    } catch (err) {
        showAlert('Network error. Please check if the server is running.');
        setButtonLoading(btn, false);
    }
}

// ==========================================
// REGISTER
// ==========================================
async function handleRegister(e) {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    const btn = document.getElementById('registerBtn');

    if (!username || !password || !confirm) {
        showAlert('Please fill in all required fields.');
        return;
    }

    if (password !== confirm) {
        showAlert('Passwords do not match.');
        return;
    }

    if (password.length < 6) {
        showAlert('Password must be at least 6 characters.');
        return;
    }

    setButtonLoading(btn, true);

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email })
        });
        const data = await res.json();

        if (!res.ok) {
            showAlert(data.error || 'Registration failed. Please try again.');
            setButtonLoading(btn, false);
            return;
        }

        showAlert('✅ ' + data.message, 'success');
        setButtonLoading(btn, false);

        // Switch to login tab after short delay
        setTimeout(() => {
            document.getElementById('loginUsername').value = username;
            switchTab('login');
        }, 1500);
    } catch (err) {
        showAlert('Network error. Please check if the server is running.');
        setButtonLoading(btn, false);
    }
}

function setButtonLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const spin = btn.querySelector('.btn-loading');
    if (loading) {
        text.style.display = 'none';
        spin.style.display = 'flex';
        btn.disabled = true;
    } else {
        text.style.display = 'flex';
        spin.style.display = 'none';
        btn.disabled = false;
    }
}
