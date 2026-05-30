const socket = io();
const API_URL = '/api';

let currentUser = null;
let currentTask = null;

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    const token = localStorage.getItem('token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
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

// Check auth and load user
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (!token || !user) {
        window.location.href = 'auth.html';
        return false;
    }

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
        } else if (page === 'challenges') {
            document.getElementById('challengesSection').classList.remove('hidden');
            loadChallenges();
        } else if (page === 'leaderboard') {
            document.getElementById('leaderboardSection').classList.remove('hidden');
            loadLeaderboard();
        } else if (page === 'profile') {
            document.getElementById('profileSection').classList.remove('hidden');
            loadProfile();
        }
    });
});

// Load tasks
async function loadTasks() {
    try {
        const tasks = await apiCall('GET', '/tasks');
        const tasksList = document.getElementById('tasksList');

        if (tasks.length === 0) {
            tasksList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Немає доступних завдань</p>';
            return;
        }

        tasksList.innerHTML = tasks.map(task => `
            <div class="task-card">
                <div class="task-card-header">
                    <div class="task-card-title">${task.title}</div>
                    <div class="task-card-actions">
                        <button class="btn btn-small btn-warning" onclick="openPostChallenge(${task.id})">📢 Виставити</button>
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
                <button class="btn btn-small" onclick="openSolveTask(${task.id}, '${task.title}', '${task.description.replace(/'/g, "\\'")}')">Розв'язати</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Load challenges
async function loadChallenges() {
    try {
        const challenges = await apiCall('GET', '/challenges');
        const challengesList = document.getElementById('challengesList');

        if (challenges.length === 0) {
            challengesList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Немає активних виклик</p>';
            return;
        }

        challengesList.innerHTML = challenges.map(challenge => `
            <div class="challenge-card">
                <div class="challenge-card-header">
                    <div class="challenge-card-title">${challenge.taskTitle}</div>
                    <div class="challenge-card-actions">
                        <span class="challenge-status">${challenge.status}</span>
                        <span class="challenge-prize">⭐ +${challenge.prize}</span>
                    </div>
                </div>
                <div class="challenge-card-info">
                    <div class="task-card-info-item">
                        <span class="task-card-info-label">Автор:</span>
                        <span class="task-card-info-value">${challenge.creatorUsername}</span>
                    </div>
                    <div class="task-card-info-item">
                        <span class="task-card-info-label">Дата:</span>
                        <span class="task-card-info-value">${new Date(challenge.createdAt).toLocaleDateString('uk-UA')}</span>
                    </div>
                </div>
                ${challenge.description ? `<p style="margin-top: 10px; font-size: 0.95rem; color: #555;">${challenge.description}</p>` : ''}
                <button class="btn btn-small" onclick="openSolveTask(${challenge.taskId}, '${challenge.taskTitle}', '${challenge.taskDescription.replace(/'/g, "\\'")}', true, ${challenge.prize})">Спробувати</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading challenges:', error);
    }
}

// Delete task
async function deleteTask(taskId) {
    if (confirm('Ви впевнені? Це завдання буде видалено назавжди.')) {
        try {
            await apiCall('DELETE', `/tasks/${taskId}`);
            alert('Завдання видалено!');
            loadTasks();
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    }
}

// Open post challenge modal
function openPostChallenge(taskId) {
    const task = { id: taskId };
    document.getElementById('challengeTaskSelect').value = taskId;
    document.getElementById('challengeDescription').value = '';
    document.getElementById('challengePrize').value = 10;
    document.getElementById('postChallengeModal').classList.remove('hidden');
}

// Post challenge
document.getElementById('postChallengeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskId = parseInt(document.getElementById('challengeTaskSelect').value);
    const description = document.getElementById('challengeDescription').value;
    const prize = parseInt(document.getElementById('challengePrize').value);

    try {
        await apiCall('POST', '/challenges', {
            taskId,
            description,
            prize,
            creatorId: currentUser.id
        });

        document.getElementById('postChallengeForm').reset();
        document.getElementById('postChallengeModal').classList.add('hidden');
        alert('Виклик виставлено!');
        loadTasks();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Open solve task modal
function openSolveTask(taskId, title, description, isChallenge = false, prize = 0) {
    currentTask = { id: taskId, title, description, isChallenge, prize };
    document.getElementById('solveTaskTitle').textContent = isChallenge ? `${title} (⭐ +${prize})` : title;
    document.getElementById('solveTaskDesc').textContent = description;
    document.getElementById('solutionCode').value = '';
    document.getElementById('resultMessage').className = 'result-message';
    document.getElementById('resultMessage').innerHTML = '';
    document.getElementById('solveTaskModal').classList.remove('hidden');
}

// Submit solution
document.getElementById('submitSolutionBtn').addEventListener('click', async () => {
    const code = document.getElementById('solutionCode').value.trim();

    if (!code) {
        showResult('Напиши код!', 'error');
        return;
    }

    try {
        const task = await apiCall('GET', `/tasks/${currentTask.id}`);

        if (code === task.correctCode.trim()) {
            const prizePoints = currentTask.isChallenge ? currentTask.prize : 10;
            showResult(`✅ Правильно! Завдання виконано! +${prizePoints} очків`, 'success');

            // Update user profile
            await apiCall('POST', `/submit-solution`, {
                taskId: currentTask.id,
                userId: currentUser.id,
                code: code,
                prize: prizePoints
            });

            // Update local storage
            currentUser.tasksCompleted = (currentUser.tasksCompleted || 0) + 1;
            currentUser.rating = (currentUser.rating || 0) + prizePoints;
            localStorage.setItem('user', JSON.stringify(currentUser));

            setTimeout(() => {
                document.getElementById('solveTaskModal').classList.add('hidden');
                loadTasks();
            }, 2000);
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
        await apiCall('POST', '/tasks', {
            title,
            description,
            correctCode: code,
            difficulty,
            userId: currentUser.id
        });

        document.getElementById('createTaskForm').reset();
        document.getElementById('createTaskModal').classList.add('hidden');
        alert('Завдання створено!');
        loadTasks();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Load leaderboard
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

// Load profile
async function loadProfile() {
    try {
        const user = await apiCall('GET', `/user/${currentUser.id}`);
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
                    <div class="profile-stat-label">Завдань Виконано</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">📝 ${user.tasksCreated}</div>
                    <div class="profile-stat-label">Завдань Створено</div>
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

// Initialize
if (checkAuth()) {
    loadTasks();
}
