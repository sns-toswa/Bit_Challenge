const API_URL = '/api';

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(API_URL + endpoint, options);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API Error');
    }
    return await response.json();
}

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.classList.add('active');
}

function hideError(elementId) {
    document.getElementById(elementId).classList.remove('active');
}

function showSuccess(elementId, message) {
    const successEl = document.getElementById(elementId);
    successEl.textContent = message;
    successEl.classList.add('active');
}

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;

        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

        e.target.classList.add('active');
        document.getElementById(tabName + 'Form').classList.add('active');
    });
});

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('loginError');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await apiCall('POST', '/login', { username, password });
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));

        window.location.href = 'dashboard.html';
    } catch (error) {
        showError('loginError', error.message);
    }
});

// Register
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('registerError');

    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;

    if (password !== confirmPassword) {
        showError('registerError', 'Паролі не збігаються');
        return;
    }

    try {
        await apiCall('POST', '/register', { username, email, password });
        document.getElementById('registerForm').reset();
        showSuccess('registerSuccess', 'Реєстрація успішна! Тепер увійдіть зі своїми даними.');
        setTimeout(() => {
            document.querySelector('[data-tab="login"]').click();
        }, 2000);
    } catch (error) {
        showError('registerError', error.message);
    }
});
