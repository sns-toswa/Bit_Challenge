// Socket.IO connection
const socket = io();

// Global state
const state = {
    user: null,
    token: null,
    currentBattle: null,
    tasks: [],
    battles: [],
    users: []
};

// API Configuration
const API_URL = '/api';

// ==================== API Functions ====================

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

    try {
        const response = await fetch(API_URL + endpoint, options);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API Error');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function register(username, email, password) {
    return apiCall('POST', '/register', { username, email, password });
}

async function login(username, password) {
    return apiCall('POST', '/login', { username, password });
}

async function getUser(userId) {
    return apiCall('GET', `/user/${userId}`);
}

async function getLeaderboard() {
    return apiCall('GET', '/leaderboard');
}

async function createTask(title, description, difficulty, userId) {
    return apiCall('POST', '/tasks', { title, description, difficulty, userId });
}

async function getTasks() {
    return apiCall('GET', '/tasks');
}

async function getTask(taskId) {
    return apiCall('GET', `/tasks/${taskId}`);
}

async function createBattle(taskId, player1Id, player2Id = null) {
    return apiCall('POST', '/battles', { taskId, player1Id, player2Id });
}

async function getBattles() {
    return apiCall('GET', '/battles');
}

// ==================== UI Functions ====================

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
    const errorEl = document.getElementById(elementId);
    errorEl.classList.remove('active');
}

// ==================== Authentication ====================

document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(tabName + 'Form').classList.add('active');
    });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('loginError');
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await login(username, password);
        state.user = response.user;
        state.token = response.token;
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        showPage('dashboardPage');
        loadDashboard();
    } catch (error) {
        showError('loginError', error.message);
    }
});

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
        await register(username, email, password);
        showError('registerError', '');
        document.getElementById('registerForm').reset();
        
        // Switch to login tab
        document.querySelector('[data-tab="login"]').click();
        
        setTimeout(() => {
            alert('Реєстрація успішна! Тепер увійдіть зі своїми даними.');
        }, 500);
    } catch (error) {
        showError('registerError', error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    state.user = null;
    state.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showPage('authPage');
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
});

// ==================== Dashboard Navigation ====================

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
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

// ==================== Battles ====================

async function loadBattles() {
    try {
        state.battles = await getBattles();
        renderBattles();
    } catch (error) {
        console.error('Error loading battles:', error);
    }
}

function renderBattles() {
    const battlesList = document.getElementById('battlesList');
    
    if (state.battles.length === 0) {
        battlesList.innerHTML = '<p class="loading">Немає доступних битв. Створіть нову!</p>';
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
                    <span class="battle-card-info-label">Статус:</span>
                    <span class="battle-card-info-value">${battle.player2Id ? 'В процесі' : 'Очікування'}</span>
                </div>
                <div class="battle-card-info-item">
                    <span class="battle-card-info-label">Складність:</span>
                    <span class="battle-difficulty difficulty-${battle.difficulty}">${battle.difficulty}</span>
                </div>
                <div class="battle-card-info-item">
                    <span class="battle-card-info-label">Опис:</span>
                    <span class="battle-card-info-value">${battle.description.substring(0, 30)}...</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function joinBattle(battleId) {
    try {
        const battle = state.battles.find(b => b.id === battleId);
        state.currentBattle = battle;
        
        socket.emit('join_battle', battleId);
        
        document.getElementById('battleTitle').textContent = `Битва: ${battle.title}`;
        document.getElementById('battleTaskContent').textContent = battle.description;
        document.getElementById('battleStatus').innerHTML = `
            <div class="status-item">🎮 Суперник 1: ${battle.player1Username}</div>
            ${battle.player2Username ? `<div class="status-item">🎮 Суперник 2: ${battle.player2Username}</div>` : '<div class="status-item">⏳ Очікування другого гравця...</div>'}
        `;
        
        showModal('battleArenaModal');
    } catch (error) {
        console.error('Error joining battle:', error);
    }
}

document.getElementById('submitCodeBtn').addEventListener('click', () => {
    const code = document.getElementById('codeEditor').value;
    if (code.trim()) {
        socket.emit('submit_solution', {
            battleId: state.currentBattle.id,
            userId: state.user.id,
            code: code
        });
        
        document.getElementById('battleStatus').innerHTML += `
            <div class="status-item">✅ Ви відправили код!</div>
        `;
    }
});

document.getElementById('forfeitBtn').addEventListener('click', () => {
    if (confirm('Ви впевнені, що хочете здатися?')) {
        hideModal('battleArenaModal');
        loadBattles();
    }
});

// ==================== Create Battle ====================

document.getElementById('createBattleBtn').addEventListener('click', async () => {
    try {
        state.tasks = await getTasks();
        const taskSelect = document.getElementById('taskSelect');
        taskSelect.innerHTML = state.tasks.map(task => 
            `<option value="${task.id}">${task.title} (${task.difficulty})</option>`
        ).join('');
        showModal('createBattleModal');
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
});

document.getElementById('createBattleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const taskId = parseInt(document.getElementById('taskSelect').value);
    
    try {
        await createBattle(taskId, state.user.id);
        hideModal('createBattleModal');
        loadBattles();
        alert('Битва створена! Очікування суперника...');
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// ==================== Create Task ====================

document.getElementById('createTaskBtn').addEventListener('click', () => {
    showModal('createTaskModal');
});

document.getElementById('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const difficulty = document.getElementById('taskDifficulty').value;
    
    try {
        await createTask(title, description, difficulty, state.user.id);
        hideModal('createTaskModal');
        document.getElementById('createTaskForm').reset();
        alert('Завдання створено успішно!');
        loadBattles();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// ==================== Leaderboard ====================

async function loadLeaderboard() {
    try {
        const users = await getLeaderboard();
        renderLeaderboard(users);
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

function renderLeaderboard(users) {
    const leaderboardList = document.getElementById('leaderboardList');
    
    leaderboardList.innerHTML = users.map((user, index) => {
        let rankClass = '';
        if (index === 0) rankClass = 'gold';
        else if (index === 1) rankClass = 'silver';
        else if (index === 2) rankClass = 'bronze';
        
        return `
            <div class="leaderboard-item">
                <div class="rank ${rankClass}">${index + 1}</div>
                <div class="username">${user.username}</div>
                <div class="rating">⭐ ${user.rating}</div>
                <div class="tasks-count">✅ ${user.tasksCompleted}</div>
            </div>
        `;
    }).join('');
}

// ==================== Profile ====================

async function loadProfile() {
    try {
        const user = await getUser(state.user.id);
        renderProfile(user);
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function renderProfile(user) {
    const profileContent = document.getElementById('profileContent');
    
    profileContent.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar">⚔️</div>
            <div class="profile-info">
                <div class="profile-username">${user.username}</div>
                <p>${user.email}</p>
                <p style="color: #999; font-size: 0.9rem;">Приєднався: ${new Date(user.createdAt).toLocaleDateString('uk-UA')}</p>
            </div>
        </div>
        <div class="profile-stats">
            <div class="profile-stat">
                <div class="profile-stat-value">⭐ ${user.rating}</div>
                <div class="profile-stat-label">Рейтинг</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-value">✅ ${user.tasksCompleted}</div>
                <div class="profile-stat-label">Завдань Виконано</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-value">📝 ${user.tasksCreated}</div>
                <div class="profile-stat-label">Завдань Створено</div>
            </div>
        </div>
    `;
}

// ==================== Modal Controls ====================

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

// ==================== Socket.IO Events ====================

socket.on('user_joined', (data) => {
    console.log('User joined battle:', data);
    if (state.currentBattle) {
        const status = document.getElementById('battleStatus');
        status.innerHTML += `<div class="status-item">👤 Гравець приєднався до битви</div>`;
    }
});

socket.on('solution_submitted', (data) => {
    console.log('Solution submitted:', data);
    if (state.currentBattle) {
        const status = document.getElementById('battleStatus');
        status.innerHTML += `<div class="status-item">💾 Гравець ${data.userId} відправив рішення</div>`;
    }
});

socket.on('battle_finished', (data) => {
    console.log('Battle finished:', data);
    setTimeout(() => {
        hideModal('battleArenaModal');
        alert(`Битва завершена! Переможець: ${data.winnerId}`);
        loadBattles();
    }, 1000);
});

// ==================== Initialization ====================

function initialize() {
    // Check if user is logged in
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

function loadDashboard() {
    document.getElementById('gamesSection').classList.remove('hidden');
    document.getElementById('leaderboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    loadBattles();
}

// Start the app
window.addEventListener('DOMContentLoaded', initialize);
