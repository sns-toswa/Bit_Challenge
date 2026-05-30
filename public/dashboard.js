const socket = io();
const API_URL = '/api';

let currentUser = null;
let currentTask = null;
let completedTaskIds = JSON.parse(localStorage.getItem('completedTasks') || '[]');

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    const token = localStorage.getItem('token');
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(API_URL + endpoint, options);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API Error');
    }
    return await response.json();
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (!token || !user) { window.location.href = 'auth.html'; return false; }
    currentUser = JSON.parse(user);
    return true;
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (e.target.id === 'logoutBtn') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'auth.html';
            return;
        }
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const page = e.target.dataset.page;
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        if (page === 'tasks') {
            document.getElementById('tasksSection').classList.remove('hidden');
            loadTasks();
        } else if (page === 'leaderboard') {
            document.getElementById('leaderboardSection').classList.remove('hidden');
            loadLeaderboard();
        } else if (page === 'profile') {
            document.getElementById('profileSection').classList.remove('hidden');
            loadProfile();
        }
    });
});

// Load tasks — фільтруємо вже виконані
async function loadTasks() {
    try {
        const tasks = await apiCall('GET', '/tasks');
        const tasksList = document.getElementById('tasksList');
        const available = tasks.filter(t => !completedTaskIds.includes(t.id));

        if (available.length === 0) {
            tasksList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Немає доступних завдань</p>';
            return;
        }

        tasksList.innerHTML = available.map(task => `
            <div class="task-card" id="task-card-${task.id}">
                <div class="task-card-header">
                    <div class="task-card-title">${task.title}</div>
                    <div class="task-card-actions">
                        ${task.creatorId === currentUser.id ? `
                            <button class="btn btn-small btn-danger" onclick="deleteTask(${task.id})">Видалити</button>
                        ` : ''}
                    </div>
                </div>
                <div class="task-card-info">
                    <div class="task-card-info-item">
                        <span class="task-card-info-label">Автор:</span>
                        <span class="task-card-info-value">${task.creatorUsername}</span>
                    </div>
                    <div class="task-card-info-item">
                        <span class="task-card-info-label">Складність:</span>
                        <span class="task-difficulty difficulty-${task.difficulty}">${task.difficulty}</span>
                    </div>
                </div>
                <button class="btn btn-small" onclick="openSolveTask(${task.id}, '${task.title.replace(/'/g, "\\'")}', '${task.description.replace(/'/g, "\\'")}')">Розв'язати</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Delete task
async function deleteTask(taskId) {
    if (confirm('Ви впевнені? Це завдання буде видалено назавжди.')) {
        try {
            await apiCall('DELETE', `/tasks/${taskId}`);
            loadTasks();
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    }
}

// Open solve task modal
function openSolveTask(taskId, title, description) {
    currentTask = { id: taskId, title, description };
    document.getElementById('solveTaskTitle').textContent = title;
    document.getElementById('solveTaskDesc').textContent = description;
    document.getElementById('solutionCode').value = '';
    document.getElementById('resultMessage').className = 'result-message';
    document.getElementById('resultMessage').innerHTML = '';
    document.getElementById('solveTaskModal').classList.remove('hidden');
}

// Submit solution
document.getElementById('submitSolutionBtn').addEventListener('click', async () => {
    const code = document.getElementById('solutionCode').value.trim();
    if (!code) { showResult('Напиши код!', 'error'); return; }

    try {
        const task = await apiCall('GET', `/tasks/${currentTask.id}`);

        if (code === task.correctCode.trim()) {
            showResult('✅ Правильно! Завдання виконано! +10 очків', 'success');

            await apiCall('POST', '/submit-solution', {
                taskId: currentTask.id,
                userId: currentUser.id,
                code: code,
                prize: 10
            });

            // Зберігаємо виконане завдання локально
            completedTaskIds.push(currentTask.id);
            localStorage.setItem('completedTasks', JSON.stringify(completedTaskIds));

            // Оновлюємо юзера в localStorage
            currentUser.tasksCompleted = (currentUser.tasksCompleted || 0) + 1;
            currentUser.rating = (currentUser.rating || 0) + 10;
            localStorage.setItem('user', JSON.stringify(currentUser));

            setTimeout(() => {
                document.getElementById('solveTaskModal').classList.add('hidden');
                // Видаляємо картку зі списку без перезавантаження
                const card = document.getElementById(`task-card-${currentTask.id}`);
                if (card) card.remove();
            }, 1500);
        } else {
            showResult('❌ Неправильно! Спробуй ще раз.', 'error');
        }
    } catch (error) {
        showResult('Помилка: ' + error.message, 'error');
    }
});

function showResult(message, type) {
    const resultMsg = document.getElementById('resultMessage');
    resultMsg.textContent = message;
    resultMsg.className = `result-message ${type}`;
}

// Create task
document.getElementById('createTaskBtn').addEventListener('click', () => {
    document.getElementById('createTaskModal').classList.remove('hidden');
});

document.getElementById('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const code = document.getElementById('taskCode').value;
    const difficulty = document.getElementById('taskDifficulty').value;

    try {
        await apiCall('POST', '/tasks', { title, description, correctCode: code, difficulty, userId: currentUser.id });
        document.getElementById('createTaskForm').reset();
        document.getElementById('createTaskModal').classList.add('hidden');
        loadTasks();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Leaderboard
async function loadLeaderboard() {
    try {
        const users = await apiCall('GET', '/leaderboard');
        document.getElementById('leaderboardList').innerHTML = users.map((user, index) => `
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

// Profile — з виконаними завданнями
async function loadProfile() {
    try {
        const user = await apiCall('GET', `/user/${currentUser.id}`);

        // Завантажуємо деталі виконаних завдань
        let completedTasksHTML = '<p style="color:#999;">Ще немає виконаних завдань</p>';
        if (completedTaskIds.length > 0) {
            const allTasks = await apiCall('GET', '/tasks');
            // tasks API не повертає виконані (вони відфільтровані), тому беремо з /tasks/:id
            const detailsPromises = completedTaskIds.map(id =>
                apiCall('GET', `/tasks/${id}`).catch(() => null)
            );
            const details = (await Promise.all(detailsPromises)).filter(Boolean);

            if (details.length > 0) {
                completedTasksHTML = details.map(t => `
                    <div class="completed-task-item">
                        <span class="completed-task-title">${t.title}</span>
                        <span class="task-difficulty difficulty-${t.difficulty}">${t.difficulty}</span>
                    </div>
                `).join('');
            }
        }

        document.getElementById('profileContent').innerHTML = `
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
                    <div class="profile-stat-label">Завдань Виконано</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">📝 ${user.tasksCreated}</div>
                    <div class="profile-stat-label">Завдань Створено</div>
                </div>
            </div>
            <div class="completed-tasks-section">
                <h3>Виконані завдання</h3>
                <div class="completed-tasks-list">${completedTasksHTML}</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Modal controls
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.add('hidden');
    });
});
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
});

if (checkAuth()) loadTasks();