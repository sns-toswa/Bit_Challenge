const socket = io();

const state = {
    user: null,
    token: null,
    currentBattle: null,
    tasks: [],
    battles: []
};

const API_URL = '/api';

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (state.token) {
        options.headers['Authorization'] = `Bearer ${state.token}`;
    }

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

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.classList.add('active');
}

function hideError(elementId) {
    document.getElementById(elementId).classList.remove('active');
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
//login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('loginError');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    console.log('Login attempt:', username);

    try {
        const response = await apiCall('POST', '/login', { username, password });
        console.log('Login response:', response);

        state.user = response.user;
        state.token = response.token;
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));

        console.log('Login successful');
        showPage('dashboardPage');
        loadDashboard();
    } catch (error) {
        console.error('Login error:', error);
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
        document.querySelector('[data-tab="login"]').click();
        alert('Реєстрація успішна! Тепер увійдіть зі своїми даними.');
    } catch (error) {
        showError('registerError', error.message);
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    state.user = null;
    state.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showPage('authPage');
});

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const page = e.target.dataset.page;
        if (page === 'dashboard') {
            document.getElementById('gamesSection').classList.remove('hidden');
            document.getElementById('leaderboardSection').classList.add('hidden');
            document.getElementById('profileSection').classList.add('hidden');
            loadBattles();
        } else if (page === 'leaderboard') {
            document.getElementById('gamesSection').classList.add('hidden');
            document.getElementById('leaderboardSection').classList.remove('hidden');
            document.getElementById('profileSection').classList.add('hidden');
            loadLeaderboard();
        } else if (page === 'profile') {
            document.getElementById('gamesSection').classList.add('hidden');
            document.getElementById('leaderboardSection').classList.add('hidden');
            document.getElementById('profileSection').classList.remove('hidden');
            loadProfile();
        }
    });
});

// Load battles
async function loadBattles() {
    try {
        console.log('Loading battles...'); // Додати
        state.battles = await apiCall('GET', '/battles');
        console.log('Battles loaded:', state.battles); // Додати
        renderBattles();
    } catch (error) {
        console.error('Error loading battles:', error);
        document.getElementById('battlesList').innerHTML = '<p style="text-align: center; color: red; padding: 40px;">Помилка завантаження: ' + error.message + '</p>';
    }
}

function renderBattles() {
    const battlesList = document.getElementById('battlesList');
    
    if (state.battles.length === 0) {
        battlesList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Немає доступних битв</p>';
        return;
    }
    
    battlesList.innerHTML = state.battles.map(battle => `
        <div class="battle-card" onclick="joinBattle(${battle.id})">
            <div class="battle-card-title">⚔️ ${battle.title}</div>
            <div class="battle-card-info">
                <div class="battle-card-info-item">
                    <span class="battle-card-info-label">Створений:</span>
                    <span class="battle-card-info-value">${battle.player1Username}</span>
                </div>
                <div class="battle-card-info-item">
                    <span class="battle-card-info-label">Складність:</span>
                    <span class="battle-difficulty difficulty-${battle.difficulty}">${battle.difficulty}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Join battle
async function joinBattle(battleId) {
    const battle = state.battles.find(b => b.id === battleId);
    state.currentBattle = battle;
    
    socket.emit('join_battle', battleId);
    
    document.getElementById('battleTitle').textContent = battle.title;
    document.getElementById('battleTaskContent').textContent = battle.description;
    document.getElementById('codeEditor').value = '';
    
    showModal('battleArenaModal');
}

// Submit code
document.getElementById('submitCodeBtn').addEventListener('click', () => {
    const code = document.getElementById('codeEditor').value;
    if (code.trim()) {
        socket.emit('submit_solution', {
            battleId: state.currentBattle.id,
            userId: state.user.id,
            code: code
        });
        alert('Код відправлено!');
    }
});

// Forfeit
document.getElementById('forfeitBtn').addEventListener('click', () => {
    if (confirm('Ви впевнені?')) {
        hideModal('battleArenaModal');
    }
});

// Create battle
document.getElementById('createBattleBtn').addEventListener('click', async () => {
    try {
        state.tasks = await apiCall('GET', '/tasks');
        const taskSelect = document.getElementById('taskSelect');
        taskSelect.innerHTML = state.tasks.map(task => 
            `<option value="${task.id}">${task.title}</option>`
        ).join('');
        showModal('createBattleModal');
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

document.getElementById('createBattleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const taskId = parseInt(document.getElementById('taskSelect').value);
    
    try {
        await apiCall('POST', '/battles', { taskId, player1Id: state.user.id });
        hideModal('createBattleModal');
        loadBattles();
        alert('Битва створена!');
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Create task
document.getElementById('createTaskBtn').addEventListener('click', () => {
    showModal('createTaskModal');
});

document.getElementById('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const difficulty = document.getElementById('taskDifficulty').value;
    
    try {
        await apiCall('POST', '/tasks', { 
            title, 
            description, 
            difficulty, 
            userId: state.user.id 
        });
        hideModal('createTaskModal');
        document.getElementById('createTaskForm').reset();
        alert('Завдання створено!');
        loadBattles();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Leaderboard
async function loadLeaderboard() {
    try {
        const users = await apiCall('GET', '/leaderboard');
        const leaderboardList = document.getElementById('leaderboardList');
        
        leaderboardList.innerHTML = users.map((user, index) => `
            <div class="leaderboard-item">
                <div class="rank">${index + 1}</div>
                <div class="username">${user.username}</div>
                <div class="rating">⭐ ${user.rating}</div>
                <div class="tasks-count">✅ ${user.tasksCompleted}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// Profile
async function loadProfile() {
    try {
        const user = await apiCall('GET', `/user/${state.user.id}`);
        const profileContent = document.getElementById('profileContent');
        
        profileContent.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">⚔️</div>
                <div class="profile-info">
                    <div class="profile-username">${user.username}</div>
                    <p>${user.email}</p>
                </div>
            </div>
            <div class="profile-stats">
                <div class="profile-stat">
                    <div class="profile-stat-value">⭐ ${user.rating}</div>
                    <div class="profile-stat-label">Рейтинг</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">✅ ${user.tasksCompleted}</div>
                    <div class="profile-stat-label">Виконано</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">📝 ${user.tasksCreated}</div>
                    <div class="profile-stat-label">Створено</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Modal controls
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        modal.classList.add('hidden');
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.add('hidden');
    }
});

// Socket events
socket.on('solution_submitted', (data) => {
    console.log('Solution submitted by user:', data.userId);
});

socket.on('battle_finished', (data) => {
    hideModal('battleArenaModal');
    alert('Битва завершена!');
    loadBattles();
});

function loadDashboard() {
    document.getElementById('gamesSection').classList.remove('hidden');
    document.getElementById('leaderboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    loadBattles();
}

// Initialize
function initialize() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
        state.token = token;
        state.user = JSON.parse(user);
        showPage('dashboardPage');
        loadDashboard();
    } else {
        showPage('authPage');
    }
}

window.addEventListener('DOMContentLoaded', initialize);