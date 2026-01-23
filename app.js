// ==================== DATA ====================
let trades = [];
let transactions = [];
let journal = {};
let milestones = [100, 500, 1000, 5000, 10000];
let currentUser = null;
let settings = { balance: 1000, tp: 5, sl: 3 };
let currentTheme = 'dark';
let xp = 0;

// Safe JSON parse helper
function safeJSONParse(key, defaultValue) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn(`Error parsing ${key}:`, e);
        return defaultValue;
    }
}

// Load data from localStorage
trades = safeJSONParse('trades', []);
transactions = safeJSONParse('transactions', []);
journal = safeJSONParse('journal', {});
milestones = safeJSONParse('milestones', [100, 500, 1000, 5000, 10000]);
currentUser = safeJSONParse('currentUser', null);
settings = safeJSONParse('settings', { balance: 1000, tp: 5, sl: 3 });
currentTheme = localStorage.getItem('theme') || 'dark';
xp = parseInt(localStorage.getItem('xp') || '0');

// Initialize Firebase on load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase if available
    if (window.firebaseIntegration) {
        window.firebaseIntegration.init();
    }
});

// Chart instances
let equityChart = null;
let winLossChart = null;
let assetChart = null;
let growthChart = null;
let confidenceChart = null;

// Calendar state
let calendarDate = new Date();

// ==================== ACHIEVEMENTS ====================
const ACHIEVEMENTS = [
    { id: 'first_trade', icon: '🎯', name: 'First Trade', desc: 'Log your first trade', check: () => trades.length >= 1 },
    { id: 'ten_trades', icon: '📊', name: '10 Trades', desc: 'Complete 10 trades', check: () => trades.length >= 10 },
    { id: 'fifty_trades', icon: '💯', name: '50 Trades', desc: 'Complete 50 trades', check: () => trades.length >= 50 },
    { id: 'first_win', icon: '✅', name: 'First Win', desc: 'Win your first trade', check: () => trades.some(t => t.result === 'WIN') },
    { id: 'win_streak_3', icon: '🔥', name: '3 Win Streak', desc: 'Win 3 trades in a row', check: () => getMaxStreak('WIN') >= 3 },
    { id: 'win_streak_5', icon: '🔥🔥', name: '5 Win Streak', desc: 'Win 5 trades in a row', check: () => getMaxStreak('WIN') >= 5 },
    { id: 'win_streak_10', icon: '💎', name: '10 Win Streak', desc: 'Win 10 trades in a row', check: () => getMaxStreak('WIN') >= 10 },
    { id: 'win_rate_60', icon: '📈', name: '60% Win Rate', desc: 'Achieve 60% win rate (min 10 trades)', check: () => trades.length >= 10 && getWinRate() >= 60 },
    { id: 'win_rate_70', icon: '🏆', name: '70% Win Rate', desc: 'Achieve 70% win rate (min 20 trades)', check: () => trades.length >= 20 && getWinRate() >= 70 },
    { id: 'profitable', icon: '💰', name: 'Profitable', desc: 'Have positive total P/L', check: () => getTotalPL() > 0 },
    { id: 'first_withdrawal', icon: '🏦', name: 'First Withdrawal', desc: 'Make your first withdrawal', check: () => transactions.some(t => t.type === 'withdrawal') },
    { id: 'journal_week', icon: '📓', name: 'Journaling Week', desc: 'Write 7 journal entries', check: () => Object.keys(journal).length >= 7 },
];

// ==================== LEVELS ====================
const LEVELS = [
    { level: 1, title: 'Beginner', xp: 0 },
    { level: 2, title: 'Novice', xp: 100 },
    { level: 3, title: 'Apprentice', xp: 300 },
    { level: 4, title: 'Intermediate', xp: 600 },
    { level: 5, title: 'Advanced', xp: 1000 },
    { level: 6, title: 'Expert', xp: 1500 },
    { level: 7, title: 'Master', xp: 2500 },
    { level: 8, title: 'Grandmaster', xp: 4000 },
    { level: 9, title: 'Legend', xp: 6000 },
    { level: 10, title: 'Elite Trader', xp: 10000 },
];

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    // Apply theme
    applyTheme(currentTheme);
    
    // Check if user is logged in
    if (currentUser) {
        showMainApp();
    }
    
    // Set today's date for journal
    const journalDate = document.getElementById('journalDate');
    if (journalDate) {
        journalDate.value = new Date().toISOString().split('T')[0];
    }
    
    // Initialize trade form
    initTradeForm();
    
    // Initialize search/filter listeners
    const searchInput = document.getElementById('searchTrades');
    const filterSelect = document.getElementById('filterResult');
    if (searchInput) searchInput.addEventListener('input', filterTrades);
    if (filterSelect) filterSelect.addEventListener('change', filterTrades);
});

// ==================== TRADE FORM ====================
function initTradeForm() {
    const form = document.getElementById('tradeForm');
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form values
        const asset = document.getElementById('tradeAsset').value;
        const direction = document.getElementById('tradeDirection').value;
        const result = document.getElementById('tradeResult').value;
        const stake = parseFloat(document.getElementById('tradeStake').value);
        const payout = parseFloat(document.getElementById('tradePayout').value) || 85;
        
        // Validation with focus on error field
        if (!asset) {
            showToast('Please select an asset', 'error');
            document.getElementById('tradeAsset')?.focus();
            return;
        }
        if (!direction) {
            showToast('Please select direction (CALL/PUT)', 'error');
            return;
        }
        if (!result) {
            showToast('Please select result', 'error');
            document.getElementById('tradeResult')?.focus();
            return;
        }
        if (!stake || stake <= 0) {
            showToast('Please enter valid stake amount', 'error');
            document.getElementById('tradeStake')?.focus();
            return;
        }
        
        // Validate stake doesn't exceed balance
        const currentBalance = settings.balance + getTotalPL();
        if (stake > currentBalance) {
            showToast(`Stake exceeds available balance ($${currentBalance.toFixed(2)})`, 'error');
            return;
        }
        
        // Calculate P/L
        let pl = 0;
        if (result === 'WIN') {
            pl = stake * (payout / 100);
        } else if (result === 'LOSS') {
            pl = -stake;
        }
        
        // Create trade object
        const trade = {
            id: Date.now(),
            asset: asset,
            direction: direction,
            result: result,
            stake: stake,
            payout: payout,
            pl: pl,
            expiry: document.getElementById('tradeExpiry').value || '1m',
            session: document.getElementById('tradeSession').value || 'London',
            strategy: document.getElementById('tradeStrategy').value || 'Support/Resistance',
            entryPrice: document.getElementById('tradeEntryPrice')?.value || '',
            martingale: document.getElementById('tradeMartingale')?.value || '0',
            setupRating: document.getElementById('tradeSetupRating')?.value || '3',
            confidence: document.getElementById('tradeConfidence')?.value || '5',
            emotionBefore: document.getElementById('tradeEmotionBefore')?.value || 'calm',
            emotionAfter: document.getElementById('tradeEmotionAfter')?.value || 'satisfied',
            notes: document.getElementById('tradeNotes')?.value || '',
            tags: document.getElementById('tradeTags')?.value || '',
            timestamp: new Date().toISOString()
        };
        
        // Handle screenshot
        const screenshotInput = document.getElementById('tradeScreenshot');
        if (screenshotInput && screenshotInput.files && screenshotInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(event) {
                trade.screenshot = event.target.result;
                saveTrade(trade);
            };
            reader.readAsDataURL(screenshotInput.files[0]);
        } else {
            saveTrade(trade);
        }
    });
    
    // Initialize default values
    setSetupRating(3);
    setEmotionBefore('calm');
    setEmotionAfter('satisfied');
}

function saveTrade(trade) {
    // Add to trades array
    trades.unshift(trade);
    
    // Save to localStorage
    localStorage.setItem('trades', JSON.stringify(trades));
    
    // Save to cloud if connected
    if (window.firebaseIntegration) {
        window.firebaseIntegration.saveTrade(trade);
    }
    
    // Add XP
    const xpGain = trade.result === 'WIN' ? 15 : 5;
    addXP(xpGain);
    
    // Reset form
    resetTradeForm();
    
    // Update UI
    updateAll();
    checkAchievements();
    
    // Show success message
    showToast(`Trade saved! +${xpGain} XP`);
}

function resetTradeForm() {
    const form = document.getElementById('tradeForm');
    if (form) form.reset();
    
    // Reset hidden fields
    const directionInput = document.getElementById('tradeDirection');
    if (directionInput) directionInput.value = '';
    
    const setupRating = document.getElementById('tradeSetupRating');
    if (setupRating) setupRating.value = '3';
    
    const emotionBefore = document.getElementById('tradeEmotionBefore');
    if (emotionBefore) emotionBefore.value = 'calm';
    
    const emotionAfter = document.getElementById('tradeEmotionAfter');
    if (emotionAfter) emotionAfter.value = 'satisfied';
    
    // Reset default values
    const payoutInput = document.getElementById('tradePayout');
    if (payoutInput) payoutInput.value = '85';
    
    // Reset button styles
    const btnCall = document.getElementById('btnCall');
    const btnPut = document.getElementById('btnPut');
    if (btnCall) {
        btnCall.classList.remove('border-green-500', 'bg-green-500/20', 'call-selected');
    }
    if (btnPut) {
        btnPut.classList.remove('border-red-500', 'bg-red-500/20', 'put-selected');
    }
    
    // Reset setup rating stars
    setSetupRating(3);
    
    // Reset emotion buttons
    document.querySelectorAll('.emotion-btn-before').forEach(btn => {
        btn.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'selected');
    });
    document.querySelectorAll('.emotion-btn-after').forEach(btn => {
        btn.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'selected');
    });
    
    // Clear screenshot preview
    const preview = document.getElementById('screenshotPreview');
    const placeholder = document.getElementById('screenshotPlaceholder');
    if (preview) preview.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    
    // Reset confidence display
    const confidenceValue = document.getElementById('confidenceValue');
    if (confidenceValue) confidenceValue.textContent = '5';
}

// ==================== DIRECTION BUTTONS ====================
function setDirection(dir) {
    const directionInput = document.getElementById('tradeDirection');
    const btnCall = document.getElementById('btnCall');
    const btnPut = document.getElementById('btnPut');
    
    if (directionInput) directionInput.value = dir;
    
    if (btnCall && btnPut) {
        btnCall.classList.remove('border-green-500', 'bg-green-500/20', 'call-selected');
        btnPut.classList.remove('border-red-500', 'bg-red-500/20', 'put-selected');
        
        if (dir === 'CALL') {
            btnCall.classList.add('border-green-500', 'bg-green-500/20', 'call-selected');
        } else {
            btnPut.classList.add('border-red-500', 'bg-red-500/20', 'put-selected');
        }
    }
}

// ==================== SETUP RATING ====================
function setSetupRating(rating) {
    const ratingInput = document.getElementById('tradeSetupRating');
    if (ratingInput) ratingInput.value = rating;
    
    document.querySelectorAll('#setupRating button').forEach((btn, i) => {
        if (i < rating) {
            btn.classList.add('opacity-100', 'active');
            btn.classList.remove('opacity-30');
        } else {
            btn.classList.remove('opacity-100', 'active');
            btn.classList.add('opacity-30');
        }
    });
}

// ==================== EMOTION BUTTONS ====================
function setEmotionBefore(emotion) {
    const input = document.getElementById('tradeEmotionBefore');
    if (input) input.value = emotion;
    
    document.querySelectorAll('.emotion-btn-before').forEach(btn => {
        btn.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'selected');
        if (btn.dataset.emotion === emotion) {
            btn.classList.add('bg-indigo-500/20', 'border-indigo-500', 'selected');
        }
    });
}

function setEmotionAfter(emotion) {
    const input = document.getElementById('tradeEmotionAfter');
    if (input) input.value = emotion;
    
    document.querySelectorAll('.emotion-btn-after').forEach(btn => {
        btn.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'selected');
        if (btn.dataset.emotion === emotion) {
            btn.classList.add('bg-indigo-500/20', 'border-indigo-500', 'selected');
        }
    });
}

// ==================== SCREENSHOT ====================
function previewScreenshot(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('screenshotImg');
            const preview = document.getElementById('screenshotPreview');
            const placeholder = document.getElementById('screenshotPlaceholder');
            
            if (img) img.src = e.target.result;
            if (preview) preview.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function clearScreenshot(event) {
    event.stopPropagation();
    const input = document.getElementById('tradeScreenshot');
    const preview = document.getElementById('screenshotPreview');
    const placeholder = document.getElementById('screenshotPlaceholder');
    
    if (input) input.value = '';
    if (preview) preview.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
}

// ==================== DELETE TRADE ====================
function deleteTrade(id) {
    if (confirm('Delete this trade?')) {
        trades = trades.filter(t => t.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        
        // Delete from cloud if connected
        if (window.firebaseIntegration) {
            window.firebaseIntegration.deleteTrade(id);
        }
        
        updateAll();
        showToast('Trade deleted');
    }
}

// ==================== AUTH ====================
function showAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
        const isActive = t.dataset.tab === tab;
        t.classList.toggle('border-indigo-500', isActive);
        t.classList.toggle('text-indigo-400', isActive);
        t.classList.toggle('border-transparent', !isActive);
    });
    
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (loginForm) loginForm.classList.toggle('hidden', tab !== 'login');
    if (signupForm) signupForm.classList.toggle('hidden', tab !== 'signup');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Use Firebase if available
    if (window.firebaseIntegration) {
        await window.firebaseIntegration.login(email, password);
    } else {
        currentUser = { 
            name: email.split('@')[0], 
            email: email,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApp();
        showToast('Welcome back!');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;
    
    if (password !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    // Use Firebase if available
    if (window.firebaseIntegration) {
        await window.firebaseIntegration.signUp(email, password, name);
    } else {
        currentUser = { 
            name: name, 
            email: email,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApp();
        showToast('Account created!');
    }
}

async function handleGoogleLogin() {
    if (window.firebaseIntegration) {
        await window.firebaseIntegration.googleLogin();
    } else {
        currentUser = { 
            name: 'Google User', 
            email: 'demo@gmail.com', 
            pic: 'https://ui-avatars.com/api/?name=G&background=ea4335&color=fff',
            provider: 'google',
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApp();
        showToast('Logged in with Google!');
    }
}

async function handleGithubLogin() {
    if (window.firebaseIntegration) {
        await window.firebaseIntegration.githubLogin();
    } else {
        currentUser = { 
            name: 'GitHub User', 
            email: 'demo@github.com', 
            pic: 'https://ui-avatars.com/api/?name=GH&background=333&color=fff',
            provider: 'github',
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApp();
        showToast('Logged in with GitHub!');
    }
}

function logout() {
    if (window.firebaseIntegration) {
        window.firebaseIntegration.logout();
    } else {
        currentUser = null;
        localStorage.removeItem('currentUser');
        location.reload();
    }
}

function showMainApp() {
    const authPage = document.getElementById('authPage');
    const mainApp = document.getElementById('mainApp');
    
    if (authPage) authPage.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    
    loadProfile();
    loadSettings();
    initCharts();
    updateAll();
}

// ==================== THEME ====================
function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
    localStorage.setItem('theme', currentTheme);
}

function applyTheme(theme) {
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(theme);
    
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// ==================== NAVIGATION ====================
function showSection(id) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    
    // Show target section
    const section = document.getElementById(id);
    if (section) section.classList.remove('hidden');
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`[data-section="${id}"]`);
    if (navItem) navItem.classList.add('active');
    
    // Section-specific updates
    if (id === 'analytics') updateAnalytics();
    if (id === 'gallery') renderGallery();
    if (id === 'achievements') renderAchievements();
    if (id === 'milestones') renderMilestones();
    if (id === 'calculator') calculateGrowth();
    if (id === 'journal') renderJournalList();
    if (id === 'calendar') renderCalendar();
    if (id === 'psychology') updatePsychology();
    if (id === 'riskEngine') updateRiskStats();
    if (id === 'reports') updateReports();
    if (id === 'profile') updateProfileStats();
    if (id === 'liveCharts') initLiveCharts();
}

function toggleExportDropdown() {
    const dropdown = document.getElementById('exportDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.relative')) {
        const dropdown = document.getElementById('exportDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }
});

// ==================== CHARTS ====================
function initCharts() {
    const equityCanvas = document.getElementById('equityChart');
    if (equityCanvas && !equityChart) {
        equityChart = new Chart(equityCanvas, {
            type: 'line',
            data: { 
                labels: [], 
                datasets: [{ 
                    data: [], 
                    borderColor: '#10b981', 
                    backgroundColor: 'rgba(16,185,129,0.1)', 
                    fill: true, 
                    tension: 0.4, 
                    pointRadius: 0 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: false }, 
                    y: { ticks: { callback: v => '$' + v } } 
                } 
            }
        });
    }
}

function updateEquityChart() {
    if (!equityChart) return;
    
    let equity = settings.balance;
    const data = [equity];
    
    [...trades].reverse().forEach(t => { 
        equity += t.pl; 
        data.push(equity); 
    });
    
    equityChart.data.labels = data.map((_, i) => i);
    equityChart.data.datasets[0].data = data;
    equityChart.data.datasets[0].borderColor = data[data.length-1] >= settings.balance ? '#10b981' : '#ef4444';
    equityChart.update('none');
}

// ==================== ANALYTICS ====================
function updateAnalytics() {
    const wins = trades.filter(t => t.result === 'WIN');
    const losses = trades.filter(t => t.result === 'LOSS');
    
    const statTotal = document.getElementById('statTotalTrades');
    const statWinRate = document.getElementById('statWinRate');
    const statProfitFactor = document.getElementById('statProfitFactor');
    const statBestStreak = document.getElementById('statBestStreak');
    
    if (statTotal) statTotal.textContent = trades.length;
    if (statWinRate) statWinRate.textContent = getWinRate().toFixed(1) + '%';
    if (statProfitFactor) {
        const pf = losses.length ? (wins.reduce((s, t) => s + t.pl, 0) / Math.abs(losses.reduce((s, t) => s + t.pl, 0))).toFixed(2) : '∞';
        statProfitFactor.textContent = pf;
    }
    if (statBestStreak) statBestStreak.textContent = getMaxStreak('WIN');

    // Win/Loss Chart
    const winLossCanvas = document.getElementById('winLossChart');
    if (winLossCanvas) {
        if (winLossChart) winLossChart.destroy();
        winLossChart = new Chart(winLossCanvas, {
            type: 'doughnut',
            data: { 
                labels: ['Wins', 'Losses'], 
                datasets: [{ 
                    data: [wins.length, losses.length], 
                    backgroundColor: ['#10b981', '#ef4444'], 
                    borderWidth: 0 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false, 
                cutout: '70%', 
                plugins: { legend: { display: false } } 
            }
        });
    }

    // Asset Chart
    const assetCanvas = document.getElementById('assetChart');
    if (assetCanvas) {
        if (assetChart) assetChart.destroy();
        const assetStats = {};
        trades.forEach(t => { 
            if (!assetStats[t.asset]) assetStats[t.asset] = 0; 
            assetStats[t.asset] += t.pl; 
        });
        assetChart = new Chart(assetCanvas, {
            type: 'bar',
            data: { 
                labels: Object.keys(assetStats), 
                datasets: [{ 
                    data: Object.values(assetStats), 
                    backgroundColor: Object.values(assetStats).map(v => v >= 0 ? '#10b981' : '#ef4444'), 
                    borderRadius: 4 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false, 
                plugins: { legend: { display: false } }, 
                scales: { y: { ticks: { callback: v => '$' + v } } } 
            }
        });
    }
}

// ==================== MONEY TRACKER ====================
function setTransactionType(type) {
    const input = document.getElementById('transactionType');
    const btnDeposit = document.getElementById('btnDeposit');
    const btnWithdrawal = document.getElementById('btnWithdrawal');
    
    if (input) input.value = type;
    
    if (btnDeposit && btnWithdrawal) {
        btnDeposit.classList.remove('border-green-500', 'bg-green-500/20');
        btnWithdrawal.classList.remove('border-blue-500', 'bg-blue-500/20');
        
        if (type === 'deposit') {
            btnDeposit.classList.add('border-green-500', 'bg-green-500/20');
        } else {
            btnWithdrawal.classList.add('border-blue-500', 'bg-blue-500/20');
        }
    }
}

function addTransaction() {
    const amount = parseFloat(document.getElementById('transactionAmount').value);
    if (!amount || amount <= 0) {
        showToast('Enter valid amount', 'error');
        return;
    }
    
    const transaction = {
        id: Date.now(),
        type: document.getElementById('transactionType').value || 'deposit',
        amount: amount,
        note: document.getElementById('transactionNote').value || '',
        timestamp: new Date().toISOString()
    };
    
    transactions.unshift(transaction);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    
    // Save to cloud if connected
    if (window.firebaseIntegration) {
        window.firebaseIntegration.saveTransaction(transaction);
    }
    
    document.getElementById('transactionAmount').value = '';
    document.getElementById('transactionNote').value = '';
    
    updateMoneyTracker();
    checkAchievements();
    showToast('Transaction added!');
}

function updateMoneyTracker() {
    const deposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
    const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);
    const tradePL = getTotalPL();
    
    const totalDeposits = document.getElementById('totalDeposits');
    const totalWithdrawals = document.getElementById('totalWithdrawals');
    const realNetProfit = document.getElementById('realNetProfit');
    const dashWithdrawn = document.getElementById('dashWithdrawn');
    
    if (totalDeposits) totalDeposits.textContent = deposits.toFixed(2);
    if (totalWithdrawals) totalWithdrawals.textContent = withdrawals.toFixed(2);
    if (realNetProfit) realNetProfit.textContent = (withdrawals - deposits + tradePL).toFixed(2);
    if (dashWithdrawn) dashWithdrawn.textContent = withdrawals.toFixed(0);
    
    const transactionList = document.getElementById('transactionList');
    if (transactionList) {
        transactionList.innerHTML = transactions.length ? transactions.slice(0, 10).map(t => `
            <div class="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]">
                <div class="flex items-center gap-2">
                    <i class="fas fa-arrow-${t.type === 'deposit' ? 'down text-green-400' : 'up text-blue-400'}"></i>
                    <div>
                        <p class="text-sm font-medium">${t.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</p>
                        <p class="text-xs text-[var(--text-secondary)]">${t.note || new Date(t.timestamp).toLocaleDateString()}</p>
                    </div>
                </div>
                <p class="font-bold ${t.type === 'deposit' ? 'text-green-400' : 'text-blue-400'}">$${t.amount.toFixed(2)}</p>
            </div>
        `).join('') : '<p class="text-center text-[var(--text-secondary)] py-8">No transactions yet</p>';
    }
}

// ==================== JOURNAL ====================
function setMood(level) {
    const input = document.getElementById('journalMood');
    if (input) input.value = level;
    
    document.querySelectorAll('#moodRating button').forEach((b, i) => {
        b.classList.toggle('opacity-100', i < level);
        b.classList.toggle('opacity-50', i >= level);
    });
}

function saveJournalEntry() {
    const date = document.getElementById('journalDate').value;
    
    const entry = {
        pre: document.getElementById('journalPre').value || '',
        goals: document.getElementById('journalGoals').value || '',
        post: document.getElementById('journalPost').value || '',
        mistakes: document.getElementById('journalMistakes').value || '',
        mood: document.getElementById('journalMood').value || '3',
        discipline: document.getElementById('journalDiscipline').value || '5'
    };
    
    journal[date] = entry;
    localStorage.setItem('journal', JSON.stringify(journal));
    
    // Save to cloud if connected
    if (window.firebaseIntegration) {
        window.firebaseIntegration.saveJournal(date, entry);
    }
    
    addXP(10);
    checkAchievements();
    renderJournalList();
    showToast('Journal saved! +10 XP');
}

function loadJournalEntry() {
    const date = document.getElementById('journalDate').value;
    const entry = journal[date] || {};
    
    const pre = document.getElementById('journalPre');
    const goals = document.getElementById('journalGoals');
    const post = document.getElementById('journalPost');
    const mistakes = document.getElementById('journalMistakes');
    const discipline = document.getElementById('journalDiscipline');
    
    if (pre) pre.value = entry.pre || '';
    if (goals) goals.value = entry.goals || '';
    if (post) post.value = entry.post || '';
    if (mistakes) mistakes.value = entry.mistakes || '';
    if (discipline) discipline.value = entry.discipline || '5';
    
    setMood(entry.mood || 3);
}

// Journal View Toggle
function showJournalView(view) {
    document.querySelectorAll('.journal-tab').forEach(tab => {
        const isActive = tab.dataset.view === view;
        tab.classList.toggle('bg-indigo-500/20', isActive);
        tab.classList.toggle('text-indigo-400', isActive);
        tab.classList.toggle('border', !isActive);
        tab.classList.toggle('border-[var(--bg-tertiary)]', !isActive);
    });
    
    document.getElementById('journalWriteTab').classList.toggle('hidden', view !== 'write');
    document.getElementById('journalHistoryTab').classList.toggle('hidden', view !== 'history');
    
    if (view === 'history') {
        renderFullJournalList();
    }
}

function renderJournalList() {
    const list = document.getElementById('journalList');
    if (!list) return;
    
    const dates = Object.keys(journal).sort().reverse().slice(0, 5);
    list.innerHTML = dates.length ? dates.map(d => {
        const entry = journal[d];
        const dateObj = new Date(d);
        const moodEmoji = ['😢','😕','😐','🙂','😄'][parseInt(entry.mood || 3) - 1] || '😐';
        const moodText = ['Poor', 'Low', 'Neutral', 'Good', 'Great'][parseInt(entry.mood || 3) - 1] || 'Neutral';
        const discipline = parseInt(entry.discipline || 5);
        
        // Get trades for this day
        const dayTrades = trades.filter(t => t.timestamp && t.timestamp.split('T')[0] === d);
        const dayPL = dayTrades.reduce((sum, t) => sum + (t.pl || 0), 0);
        
        return `
            <div class="p-4 rounded-xl bg-[var(--bg-tertiary)] cursor-pointer hover:border-indigo-500 border border-transparent transition-all group" onclick="openJournalModal('${d}')">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${moodEmoji}</span>
                        <div>
                            <span class="font-medium">${dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            <p class="text-xs text-[var(--text-secondary)]">${moodText} • ${discipline * 10}% discipline</p>
                        </div>
                    </div>
                    <div class="text-right">
                        ${dayTrades.length > 0 ? `
                            <p class="text-sm font-bold ${dayPL >= 0 ? 'text-green-400' : 'text-red-400'}">${dayPL >= 0 ? '+' : ''}$${dayPL.toFixed(2)}</p>
                            <p class="text-xs text-[var(--text-secondary)]">${dayTrades.length} trades</p>
                        ` : '<span class="text-xs text-[var(--text-secondary)]">No trades</span>'}
                    </div>
                </div>
                <p class="text-sm text-[var(--text-secondary)] line-clamp-2">${entry.goals || entry.pre || entry.post || 'Click to view entry...'}</p>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-[var(--bg-primary)]">
                    <span class="text-xs text-[var(--text-secondary)]"><i class="fas fa-eye mr-1"></i>Click to view</span>
                    <i class="fas fa-chevron-right text-xs text-[var(--text-secondary)] group-hover:text-indigo-400 transition-colors"></i>
                </div>
            </div>
        `;
    }).join('') : '<p class="text-center text-[var(--text-secondary)] py-8">No entries yet. Start journaling to track your trading mindset!</p>';
}

// Open Journal Modal to view full entry
let currentModalDate = null;

function openJournalModal(date) {
    currentModalDate = date;
    const entry = journal[date];
    if (!entry) return;
    
    const dateObj = new Date(date);
    const moodEmoji = ['😢','😕','😐','🙂','😄'][parseInt(entry.mood || 3) - 1] || '😐';
    const moodText = ['Poor', 'Low', 'Neutral', 'Good', 'Great'][parseInt(entry.mood || 3) - 1] || 'Neutral';
    const moodColor = ['red', 'orange', 'yellow', 'blue', 'green'][parseInt(entry.mood || 3) - 1] || 'yellow';
    const discipline = parseInt(entry.discipline || 5);
    const discStars = '⭐'.repeat(Math.ceil(discipline / 2));
    
    // Get trades for this day
    const dayTrades = trades.filter(t => t.timestamp && t.timestamp.split('T')[0] === date);
    const dayPL = dayTrades.reduce((sum, t) => sum + (t.pl || 0), 0);
    const dayWins = dayTrades.filter(t => t.result === 'WIN').length;
    
    // Update modal header
    document.getElementById('modalDay').textContent = dateObj.getDate();
    document.getElementById('modalMonth').textContent = dateObj.toLocaleDateString('en-US', { month: 'short' });
    document.getElementById('modalWeekday').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    document.getElementById('modalYear').textContent = dateObj.getFullYear();
    document.getElementById('modalMood').textContent = `${moodEmoji} ${moodText}`;
    document.getElementById('modalDiscipline').textContent = `${discStars} ${discipline * 10}%`;
    document.getElementById('modalFullDate').textContent = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Update trading stats
    const statsSection = document.getElementById('modalTradingStats');
    if (dayTrades.length > 0) {
        statsSection.classList.remove('hidden');
        document.getElementById('modalTrades').textContent = dayTrades.length;
        document.getElementById('modalWins').textContent = dayWins;
        const plEl = document.getElementById('modalPL');
        plEl.textContent = `${dayPL >= 0 ? '+' : ''}$${dayPL.toFixed(2)}`;
        plEl.className = `text-2xl font-bold ${dayPL >= 0 ? 'text-green-400' : 'text-red-400'}`;
    } else {
        statsSection.classList.add('hidden');
    }
    
    // Update content sections
    updateModalSection('modalPreSection', 'modalPre', entry.pre);
    updateModalSection('modalGoalsSection', 'modalGoals', entry.goals);
    updateModalSection('modalPostSection', 'modalPost', entry.post);
    updateModalSection('modalMistakesSection', 'modalMistakes', entry.mistakes);
    
    // Show modal
    document.getElementById('journalModal').classList.remove('hidden');
}

function updateModalSection(sectionId, contentId, content) {
    const section = document.getElementById(sectionId);
    const contentEl = document.getElementById(contentId);
    
    if (content && content.trim()) {
        section.classList.remove('hidden');
        contentEl.textContent = content;
    } else {
        section.classList.add('hidden');
    }
}

function closeJournalModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('journalModal').classList.add('hidden');
    currentModalDate = null;
}

function editJournalFromModal() {
    if (!currentModalDate) return;
    document.getElementById('journalDate').value = currentModalDate;
    loadJournalEntry();
    closeJournalModal();
    showJournalView('write');
    showToast('Entry loaded for editing');
}

function deleteJournalFromModal() {
    if (!currentModalDate) return;
    const date = currentModalDate;
    if (confirm(`Delete journal entry for ${new Date(date).toLocaleDateString()}?`)) {
        delete journal[date];
        localStorage.setItem('journal', JSON.stringify(journal));
        closeJournalModal();
        renderJournalList();
        renderFullJournalList();
        showToast('Journal entry deleted');
    }
}

function renderFullJournalList() {
    const list = document.getElementById('journalFullList');
    if (!list) return;
    
    const entries = Object.entries(journal);
    
    // Update stats
    const totalEl = document.getElementById('journalTotalEntries');
    const avgMoodEl = document.getElementById('journalAvgMood');
    const avgDiscEl = document.getElementById('journalAvgDiscipline');
    const streakEl = document.getElementById('journalStreak');
    
    if (totalEl) totalEl.textContent = entries.length;
    
    if (entries.length > 0) {
        const avgMood = entries.reduce((sum, [_, e]) => sum + parseInt(e.mood || 3), 0) / entries.length;
        const avgDisc = entries.reduce((sum, [_, e]) => sum + parseInt(e.discipline || 5), 0) / entries.length;
        
        if (avgMoodEl) avgMoodEl.textContent = ['😢','😕','😐','🙂','😄'][Math.round(avgMood) - 1] || '😐';
        if (avgDiscEl) avgDiscEl.textContent = (avgDisc * 10).toFixed(0) + '%';
        
        // Calculate streak
        const sortedDates = Object.keys(journal).sort().reverse();
        let streak = 0;
        let checkDate = new Date();
        checkDate.setHours(0, 0, 0, 0);
        
        for (const dateStr of sortedDates) {
            const entryDate = new Date(dateStr);
            entryDate.setHours(0, 0, 0, 0);
            
            const diffDays = Math.floor((checkDate - entryDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 1) {
                streak++;
                checkDate = entryDate;
            } else {
                break;
            }
        }
        if (streakEl) streakEl.textContent = streak;
    }
    
    // Apply filters
    filterJournalEntries();
}

function filterJournalEntries() {
    const list = document.getElementById('journalFullList');
    if (!list) return;
    
    const searchTerm = document.getElementById('journalSearch')?.value.toLowerCase() || '';
    const moodFilter = document.getElementById('journalMoodFilter')?.value || '';
    const sortOrder = document.getElementById('journalSortOrder')?.value || 'newest';
    
    let entries = Object.entries(journal);
    
    // Filter by search
    if (searchTerm) {
        entries = entries.filter(([date, entry]) => {
            const text = `${entry.pre || ''} ${entry.goals || ''} ${entry.post || ''} ${entry.mistakes || ''}`.toLowerCase();
            return text.includes(searchTerm) || date.includes(searchTerm);
        });
    }
    
    // Filter by mood
    if (moodFilter) {
        entries = entries.filter(([_, entry]) => entry.mood == moodFilter);
    }
    
    // Sort
    entries.sort((a, b) => {
        const dateA = new Date(a[0]);
        const dateB = new Date(b[0]);
        const moodA = parseInt(a[1].mood || 3);
        const moodB = parseInt(b[1].mood || 3);
        
        switch (sortOrder) {
            case 'oldest': return dateA - dateB;
            case 'mood-high': return moodB - moodA;
            case 'mood-low': return moodA - moodB;
            default: return dateB - dateA; // newest
        }
    });
    
    if (entries.length === 0) {
        list.innerHTML = `
            <div class="card rounded-2xl p-12 text-center">
                <div class="text-6xl mb-4">📓</div>
                <h3 class="text-xl font-bold mb-2">${searchTerm || moodFilter ? 'No Matching Entries' : 'No Journal Entries Yet'}</h3>
                <p class="text-[var(--text-secondary)] mb-4">${searchTerm || moodFilter ? 'Try adjusting your filters' : 'Start documenting your trading journey!'}</p>
                ${!searchTerm && !moodFilter ? '<button onclick="showJournalView(\'write\')" class="px-6 py-2 rounded-lg bg-indigo-500/20 text-indigo-400"><i class="fas fa-pen mr-2"></i>Write First Entry</button>' : ''}
            </div>
        `;
        return;
    }
    
    list.innerHTML = entries.map(([date, entry]) => {
        const dateObj = new Date(date);
        const moodEmoji = ['😢','😕','😐','🙂','😄'][parseInt(entry.mood || 3) - 1] || '😐';
        const moodText = ['Poor', 'Low', 'Neutral', 'Good', 'Great'][parseInt(entry.mood || 3) - 1] || 'Neutral';
        const moodColor = ['red', 'orange', 'yellow', 'blue', 'green'][parseInt(entry.mood || 3) - 1] || 'yellow';
        const discipline = parseInt(entry.discipline || 5);
        const discStars = '⭐'.repeat(Math.ceil(discipline / 2));
        
        // Get trades for this date
        const dayTrades = trades.filter(t => t.timestamp && t.timestamp.split('T')[0] === date);
        const dayPL = dayTrades.reduce((sum, t) => sum + (t.pl || 0), 0);
        const dayWins = dayTrades.filter(t => t.result === 'WIN').length;
        
        return `
            <div class="card rounded-2xl overflow-hidden journal-entry" data-date="${date}">
                <!-- Header -->
                <div class="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-6 py-4 border-b border-[var(--bg-tertiary)]">
                    <div class="flex items-center justify-between flex-wrap gap-3">
                        <div class="flex items-center gap-4">
                            <div class="text-center">
                                <div class="text-2xl font-bold">${dateObj.getDate()}</div>
                                <div class="text-xs text-[var(--text-secondary)]">${dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                            </div>
                            <div>
                                <h3 class="font-semibold">${dateObj.toLocaleDateString('en-US', { weekday: 'long' })}</h3>
                                <p class="text-sm text-[var(--text-secondary)]">${dateObj.toLocaleDateString('en-US', { year: 'numeric' })}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            ${dayTrades.length > 0 ? `
                                <div class="text-center px-3 py-1 rounded-lg bg-[var(--bg-tertiary)]">
                                    <div class="text-xs text-[var(--text-secondary)]">Trades</div>
                                    <div class="font-bold">${dayTrades.length}</div>
                                </div>
                                <div class="text-center px-3 py-1 rounded-lg bg-[var(--bg-tertiary)]">
                                    <div class="text-xs text-[var(--text-secondary)]">P/L</div>
                                    <div class="font-bold ${dayPL >= 0 ? 'text-green-400' : 'text-red-400'}">${dayPL >= 0 ? '+' : ''}$${dayPL.toFixed(2)}</div>
                                </div>
                            ` : ''}
                            <div class="px-3 py-1 rounded-full bg-${moodColor}-500/20 text-${moodColor}-400 text-sm font-medium">
                                ${moodEmoji} ${moodText}
                            </div>
                            <div class="text-center">
                                <div class="text-xs">${discStars}</div>
                                <div class="text-xs text-[var(--text-secondary)]">${discipline * 10}%</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${entry.pre ? `
                            <div class="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-lg">🧠</span>
                                    <h4 class="font-semibold text-sm">Pre-Session Mindset</h4>
                                </div>
                                <p class="text-sm text-[var(--text-secondary)] leading-relaxed">${entry.pre}</p>
                            </div>
                        ` : ''}
                        ${entry.goals ? `
                            <div class="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-lg">🎯</span>
                                    <h4 class="font-semibold text-sm">Goals for the Day</h4>
                                </div>
                                <p class="text-sm text-[var(--text-secondary)] leading-relaxed">${entry.goals}</p>
                            </div>
                        ` : ''}
                        ${entry.post ? `
                            <div class="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-lg">📝</span>
                                    <h4 class="font-semibold text-sm">Post-Session Reflection</h4>
                                </div>
                                <p class="text-sm text-[var(--text-secondary)] leading-relaxed">${entry.post}</p>
                            </div>
                        ` : ''}
                        ${entry.mistakes ? `
                            <div class="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-lg">⚠️</span>
                                    <h4 class="font-semibold text-sm text-red-400">Mistakes to Avoid</h4>
                                </div>
                                <p class="text-sm text-[var(--text-secondary)] leading-relaxed">${entry.mistakes}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${!entry.pre && !entry.goals && !entry.post && !entry.mistakes ? `
                        <p class="text-center text-[var(--text-secondary)] py-4">No content recorded for this entry.</p>
                    ` : ''}
                </div>
                
                <!-- Footer -->
                <div class="px-6 py-3 border-t border-[var(--bg-tertiary)] flex items-center justify-between">
                    <span class="text-xs text-[var(--text-secondary)]">
                        <i class="fas fa-clock mr-1"></i>${dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    <div class="flex gap-2">
                        <button onclick="editJournalEntry('${date}')" class="px-3 py-1 rounded-lg text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
                        <button onclick="deleteJournalEntry('${date}')" class="px-3 py-1 rounded-lg text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                            <i class="fas fa-trash mr-1"></i>Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function editJournalEntry(date) {
    document.getElementById('journalDate').value = date;
    loadJournalEntry();
    showJournalView('write');
    showToast('Entry loaded for editing');
}

function deleteJournalEntry(date) {
    if (confirm(`Delete journal entry for ${new Date(date).toLocaleDateString()}?`)) {
        delete journal[date];
        localStorage.setItem('journal', JSON.stringify(journal));
        renderFullJournalList();
        renderJournalList();
        showToast('Journal entry deleted');
    }
}

// ==================== GALLERY ====================
function renderGallery(filter = 'all') {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    
    const filtered = trades.filter(t => t.screenshot && (filter === 'all' || t.result === filter));
    
    grid.innerHTML = filtered.length ? filtered.map(t => `
        <div class="relative group cursor-pointer" onclick="openScreenshot('${t.screenshot}')">
            <img src="${t.screenshot}" class="w-full h-32 object-cover rounded-xl border-2 ${t.result === 'WIN' ? 'border-green-500/50' : 'border-red-500/50'}">
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                <i class="fas fa-search-plus text-white text-xl"></i>
            </div>
            <span class="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold ${t.result === 'WIN' ? 'bg-green-500' : 'bg-red-500'}">${t.result}</span>
            <p class="text-xs text-center mt-1">${t.asset} - ${new Date(t.timestamp).toLocaleDateString()}</p>
        </div>
    `).join('') : '<p class="col-span-full text-center text-[var(--text-secondary)] py-12">No screenshots found</p>';
}

function filterGallery(filter) {
    document.querySelectorAll('.gallery-filter').forEach(b => {
        b.classList.remove('bg-indigo-500/20', 'text-indigo-400');
        b.classList.add('border', 'border-[var(--bg-tertiary)]');
    });
    event.target.classList.add('bg-indigo-500/20', 'text-indigo-400');
    renderGallery(filter);
}

function openScreenshot(src) {
    const modal = document.getElementById('screenshotModal');
    const img = document.getElementById('screenshotModalImg');
    
    if (img) img.src = src;
    if (modal) modal.classList.remove('hidden');
}

function closeScreenshotModal() {
    const modal = document.getElementById('screenshotModal');
    if (modal) modal.classList.add('hidden');
}

// ==================== ACHIEVEMENTS ====================
function renderAchievements() {
    const unlocked = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    updateLevelDisplay();
    
    const grid = document.getElementById('achievementGrid');
    if (grid) {
        grid.innerHTML = ACHIEVEMENTS.map(a => `
            <div class="card rounded-xl p-4 text-center ${unlocked.includes(a.id) ? 'badge-unlocked border-yellow-500/50' : 'badge-locked'}">
                <div class="text-3xl mb-2">${a.icon}</div>
                <h4 class="font-semibold text-sm">${a.name}</h4>
                <p class="text-xs text-[var(--text-secondary)] mt-1">${a.desc}</p>
            </div>
        `).join('');
    }
}

function checkAchievements() {
    const unlocked = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    let newUnlocks = 0;
    
    ACHIEVEMENTS.forEach(a => {
        if (!unlocked.includes(a.id) && a.check()) {
            unlocked.push(a.id);
            newUnlocks++;
            addXP(25);
        }
    });
    
    if (newUnlocks > 0) {
        localStorage.setItem('unlockedAchievements', JSON.stringify(unlocked));
        showToast(`🏆 ${newUnlocks} new achievement${newUnlocks > 1 ? 's' : ''} unlocked!`);
    }
}

function updateLevelDisplay() {
    const level = getCurrentLevel();
    const nextLevel = LEVELS[level.level] || LEVELS[LEVELS.length - 1];
    const prevXP = LEVELS[level.level - 1]?.xp || 0;
    const progress = ((xp - prevXP) / (nextLevel.xp - prevXP)) * 100;
    
    // Achievement page
    const achieveLevel = document.getElementById('achieveLevel');
    const achieveLevelText = document.getElementById('achieveLevelText');
    const achieveLevelTitle = document.getElementById('achieveLevelTitle');
    const achieveXP = document.getElementById('achieveXP');
    const achieveXPNext = document.getElementById('achieveXPNext');
    const achieveLevelBar = document.getElementById('achieveLevelBar');
    
    if (achieveLevel) achieveLevel.textContent = level.level;
    if (achieveLevelText) achieveLevelText.textContent = level.level;
    if (achieveLevelTitle) achieveLevelTitle.textContent = level.title;
    if (achieveXP) achieveXP.textContent = xp;
    if (achieveXPNext) achieveXPNext.textContent = nextLevel.xp;
    if (achieveLevelBar) achieveLevelBar.style.width = Math.min(100, progress) + '%';
    
    // Sidebar
    const sidebarLevel = document.getElementById('sidebarLevel');
    const sidebarXP = document.getElementById('sidebarXP');
    const levelProgressBar = document.getElementById('levelProgressBar');
    const headerLevel = document.getElementById('headerLevel');
    
    if (sidebarLevel) sidebarLevel.textContent = level.level;
    if (sidebarXP) sidebarXP.textContent = `${xp}/${nextLevel.xp} XP`;
    if (levelProgressBar) levelProgressBar.style.width = Math.min(100, progress) + '%';
    if (headerLevel) headerLevel.textContent = level.level;
}

function getCurrentLevel() {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp >= LEVELS[i].xp) return LEVELS[i];
    }
    return LEVELS[0];
}

function addXP(amount) {
    xp += amount;
    localStorage.setItem('xp', xp.toString());
    updateLevelDisplay();
    
    // Save to cloud if connected
    if (window.firebaseIntegration) {
        window.firebaseIntegration.saveXP();
    }
}

// ==================== MILESTONES ====================
function renderMilestones() {
    const totalPL = getTotalPL();
    const grid = document.getElementById('milestoneGrid');
    
    if (grid) {
        grid.innerHTML = milestones.map(m => {
            const complete = totalPL >= m;
            return `
                <div class="card rounded-xl p-6 text-center ${complete ? 'milestone-complete' : ''}">
                    <div class="text-3xl mb-2">${complete ? '✅' : '🎯'}</div>
                    <h4 class="text-2xl font-bold ${complete ? 'text-green-400' : ''}">$${m.toLocaleString()}</h4>
                    <p class="text-sm text-[var(--text-secondary)] mt-2">
                        ${complete ? 'Achieved!' : `$${Math.max(0, m - totalPL).toFixed(0)} to go`}
                    </p>
                    <div class="h-2 bg-[var(--bg-tertiary)] rounded-full mt-3 overflow-hidden">
                        <div class="h-full bg-green-500" style="width: ${Math.min(100, (totalPL / m) * 100)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function addMilestone() {
    const input = document.getElementById('newMilestone');
    const amount = parseInt(input.value);
    
    if (amount && !milestones.includes(amount)) {
        milestones.push(amount);
        milestones.sort((a, b) => a - b);
        localStorage.setItem('milestones', JSON.stringify(milestones));
        input.value = '';
        renderMilestones();
        showToast('Milestone added!');
    }
}

// ==================== CALENDAR ====================
function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const monthLabel = document.getElementById('calendarMonth');
    if (monthLabel) {
        monthLabel.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get daily P/L and trade counts
    const dailyData = {};
    trades.forEach(t => {
        const date = new Date(t.timestamp).toISOString().split('T')[0];
        if (!dailyData[date]) dailyData[date] = { pl: 0, trades: 0, wins: 0 };
        dailyData[date].pl += t.pl;
        dailyData[date].trades++;
        if (t.result === 'WIN') dailyData[date].wins++;
    });
    
    let html = '';
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="h-14"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const data = dailyData[dateStr];
        const hasData = data !== undefined;
        const pl = hasData ? data.pl : 0;
        const isToday = new Date().toISOString().split('T')[0] === dateStr;
        
        let bgClass = 'bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)]';
        let plColor = 'text-[var(--text-secondary)]';
        let plText = '--';
        
        if (hasData) {
            if (pl > 0) {
                bgClass = 'bg-green-500/15 hover:bg-green-500/25 border-green-500/30';
                plColor = 'text-green-400';
                plText = `+$${pl.toFixed(0)}`;
            } else if (pl < 0) {
                bgClass = 'bg-red-500/15 hover:bg-red-500/25 border-red-500/30';
                plColor = 'text-red-400';
                plText = `-$${Math.abs(pl).toFixed(0)}`;
            } else {
                bgClass = 'bg-yellow-500/15 hover:bg-yellow-500/25 border-yellow-500/30';
                plColor = 'text-yellow-400';
                plText = '$0';
            }
        }
        
        const tooltip = hasData 
            ? `${data.trades} trade${data.trades > 1 ? 's' : ''} • ${data.wins}W/${data.trades - data.wins}L • ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`
            : 'No trades';
        
        html += `
            <div class="relative h-14 rounded-lg ${bgClass} ${isToday ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[var(--bg-primary)]' : ''} flex flex-col items-center justify-center border border-transparent cursor-pointer transition-all duration-200 group" title="${tooltip}">
                <span class="text-sm font-bold ${isToday ? 'text-indigo-400' : ''}">${day}</span>
                <span class="text-[10px] font-medium ${plColor}">${plText}</span>
                ${hasData ? `<div class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${pl > 0 ? 'bg-green-500' : pl < 0 ? 'bg-red-500' : 'bg-yellow-500'}"></div>` : ''}
            </div>
        `;
    }
    
    const grid = document.getElementById('calendarGrid');
    if (grid) grid.innerHTML = html;
}

function changeMonth(delta) {
    calendarDate.setMonth(calendarDate.getMonth() + delta);
    renderCalendar();
}

// ==================== PSYCHOLOGY ====================
function updatePsychology() {
    // Revenge trades
    let revengeTrades = 0;
    let lossStreak = 0;
    trades.forEach(t => {
        if (t.result === 'LOSS') lossStreak++;
        else if (t.result === 'WIN' && lossStreak >= 2) { revengeTrades++; lossStreak = 0; }
        else lossStreak = 0;
    });
    
    const revengeEl = document.getElementById('revengeTrades');
    if (revengeEl) revengeEl.textContent = revengeTrades;
    
    // Overtrading days
    const tradeDays = {};
    trades.forEach(t => {
        const date = new Date(t.timestamp).toDateString();
        tradeDays[date] = (tradeDays[date] || 0) + 1;
    });
    const overtradingDays = Object.values(tradeDays).filter(c => c >= 10).length;
    
    const overtradingEl = document.getElementById('overtradingDays');
    if (overtradingEl) overtradingEl.textContent = overtradingDays;
    
    // Best session
    const sessionStats = {};
    trades.forEach(t => {
        if (!sessionStats[t.session]) sessionStats[t.session] = { wins: 0, total: 0 };
        sessionStats[t.session].total++;
        if (t.result === 'WIN') sessionStats[t.session].wins++;
    });
    
    let bestSession = '--';
    let bestRate = 0;
    Object.entries(sessionStats).forEach(([s, d]) => {
        const rate = d.total > 0 ? (d.wins / d.total) * 100 : 0;
        if (rate > bestRate) { bestRate = rate; bestSession = s; }
    });
    
    const bestSessionEl = document.getElementById('bestSession');
    if (bestSessionEl) bestSessionEl.textContent = bestSession;
}

// ==================== RISK ENGINE ====================
function calculatePosition() {
    const balance = parseFloat(document.getElementById('riskBalance').value) || 1000;
    const riskPct = parseFloat(document.getElementById('riskPercent').value) || 2;
    const payout = parseFloat(document.getElementById('riskPayout').value) || 85;
    
    const stake = (balance * riskPct) / 100;
    const profit = stake * (payout / 100);
    
    const stakeEl = document.getElementById('riskStake');
    const profitEl = document.getElementById('riskProfit');
    
    if (stakeEl) stakeEl.textContent = '$' + stake.toFixed(2);
    if (profitEl) profitEl.textContent = profit.toFixed(2);
    
    showToast(`Stake: $${stake.toFixed(2)} | Potential: $${profit.toFixed(2)}`);
}

function updateRiskStats() {
    // Max drawdown
    let peak = settings.balance;
    let maxDD = 0;
    let equity = settings.balance;
    
    [...trades].reverse().forEach(t => {
        equity += t.pl;
        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
    });
    
    const maxDrawdown = document.getElementById('maxDrawdown');
    const drawdownBar = document.getElementById('drawdownBar');
    
    if (maxDrawdown) maxDrawdown.textContent = maxDD.toFixed(1) + '%';
    if (drawdownBar) drawdownBar.style.width = Math.min(100, maxDD * 2) + '%';
    
    // Risk of ruin
    const winRate = getWinRate();
    const riskLevel = winRate >= 60 ? 'Low' : winRate >= 50 ? 'Medium' : 'High';
    
    const riskOfRuin = document.getElementById('riskOfRuin');
    if (riskOfRuin) {
        riskOfRuin.textContent = riskLevel;
        riskOfRuin.className = 'font-bold ' + (riskLevel === 'Low' ? 'text-green-400' : riskLevel === 'Medium' ? 'text-yellow-400' : 'text-red-400');
    }
    
    // Max loss streak
    const maxLossStreak = document.getElementById('maxLossStreak');
    if (maxLossStreak) maxLossStreak.textContent = getMaxStreak('LOSS');
    
    // Sync balance
    const riskBalance = document.getElementById('riskBalance');
    if (riskBalance) riskBalance.value = settings.balance + getTotalPL();
}

// ==================== REPORTS ====================
function updateReports() {
    if (trades.length < 5) {
        const reportConsistency = document.getElementById('reportConsistency');
        const reportDiscipline = document.getElementById('reportDiscipline');
        const reportBehavioral = document.getElementById('reportBehavioral');
        
        if (reportConsistency) reportConsistency.textContent = '--';
        if (reportDiscipline) reportDiscipline.textContent = '--';
        if (reportBehavioral) reportBehavioral.textContent = '--';
        return;
    }
    
    // Consistency
    const consistency = Math.min(100, getWinRate() + 20);
    const reportConsistency = document.getElementById('reportConsistency');
    if (reportConsistency) reportConsistency.textContent = consistency.toFixed(0) + '%';
    
    // Discipline
    const tradeDays = {};
    trades.forEach(t => {
        const date = new Date(t.timestamp).toDateString();
        tradeDays[date] = (tradeDays[date] || 0) + 1;
    });
    const overtradeDays = Object.values(tradeDays).filter(c => c > 10).length;
    const discipline = Math.max(0, 100 - (overtradeDays * 10));
    
    const reportDiscipline = document.getElementById('reportDiscipline');
    if (reportDiscipline) reportDiscipline.textContent = discipline.toFixed(0) + '%';
    
    // Behavioral
    const journalDays = Object.keys(journal).length;
    const behavioral = Math.min(100, journalDays * 10);
    
    const reportBehavioral = document.getElementById('reportBehavioral');
    if (reportBehavioral) reportBehavioral.textContent = behavioral.toFixed(0) + '%';
    
    // Weekly summary
    const thisWeek = trades.filter(t => {
        const d = new Date(t.timestamp);
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= weekAgo;
    });
    
    const weeklyReport = document.getElementById('weeklyReport');
    if (weeklyReport && thisWeek.length > 0) {
        const weekPL = thisWeek.reduce((s, t) => s + t.pl, 0);
        const weekWins = thisWeek.filter(t => t.result === 'WIN').length;
        weeklyReport.innerHTML = `
            <div class="grid grid-cols-3 gap-4">
                <div class="p-4 rounded-xl bg-[var(--bg-tertiary)] text-center">
                    <p class="text-sm text-[var(--text-secondary)]">Trades</p>
                    <p class="text-xl font-bold">${thisWeek.length}</p>
                </div>
                <div class="p-4 rounded-xl bg-[var(--bg-tertiary)] text-center">
                    <p class="text-sm text-[var(--text-secondary)]">Win Rate</p>
                    <p class="text-xl font-bold text-green-400">${((weekWins/thisWeek.length)*100).toFixed(0)}%</p>
                </div>
                <div class="p-4 rounded-xl bg-[var(--bg-tertiary)] text-center">
                    <p class="text-sm text-[var(--text-secondary)]">P/L</p>
                    <p class="text-xl font-bold ${weekPL >= 0 ? 'text-green-400' : 'text-red-400'}">${weekPL >= 0 ? '+' : ''}$${weekPL.toFixed(2)}</p>
                </div>
            </div>
        `;
    }
}

// ==================== CALCULATOR ====================
function calculateGrowth() {
    const start = parseFloat(document.getElementById('calcStart')?.value || 100);
    const growth = parseFloat(document.getElementById('calcGrowth')?.value || 5) / 100;
    const days = parseInt(document.getElementById('calcDays')?.value || 30);

    const balances = [start];
    const dailyData = [];
    let balance = start;
    let totalProfit = 0;
    
    for (let i = 0; i < days; i++) {
        const startBal = balance;
        const profit = balance * growth;
        balance = balance + profit;
        totalProfit += profit;
        balances.push(balance);
        dailyData.push({ day: i + 1, start: startBal, profit, end: balance });
    }

    const calcFinal = document.getElementById('calcFinal');
    const calcProfit = document.getElementById('calcProfit');
    const calcPercent = document.getElementById('calcPercent');
    const calcTotalProfit = document.getElementById('calcTotalProfit');
    
    if (calcFinal) calcFinal.textContent = '$' + balance.toFixed(2);
    if (calcProfit) calcProfit.textContent = '+$' + (balance - start).toFixed(2);
    if (calcPercent) calcPercent.textContent = '+' + (((balance - start) / start) * 100).toFixed(0) + '%';
    if (calcTotalProfit) calcTotalProfit.textContent = '+$' + totalProfit.toFixed(2);
    
    // Daily breakdown table
    const dailyProfitTable = document.getElementById('dailyProfitTable');
    if (dailyProfitTable) {
        dailyProfitTable.innerHTML = dailyData.map(d => `
            <tr class="border-b border-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]">
                <td class="px-3 py-2">Day ${d.day}</td>
                <td class="px-3 py-2 text-right">$${d.start.toFixed(2)}</td>
                <td class="px-3 py-2 text-right text-green-400">+$${d.profit.toFixed(2)}</td>
                <td class="px-3 py-2 text-right font-medium">$${d.end.toFixed(2)}</td>
            </tr>
        `).join('');
    }

    // Growth chart
    const growthCanvas = document.getElementById('growthChart');
    if (growthCanvas) {
        if (growthChart) growthChart.destroy();
        growthChart = new Chart(growthCanvas, {
            type: 'line',
            data: { 
                labels: balances.map((_, i) => i), 
                datasets: [{ 
                    data: balances, 
                    borderColor: '#10b981', 
                    backgroundColor: 'rgba(16,185,129,0.1)', 
                    fill: true, 
                    tension: 0.4, 
                    pointRadius: 0 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: false }, 
                    y: { ticks: { callback: v => '$' + v.toFixed(0) } } 
                } 
            }
        });
    }
}

// ==================== SETTINGS ====================
function loadSettings() {
    const balance = document.getElementById('settingBalance');
    const tp = document.getElementById('settingTP');
    const sl = document.getElementById('settingSL');
    
    if (balance) balance.value = settings.balance;
    if (tp) tp.value = settings.tp;
    if (sl) sl.value = settings.sl;
}

function saveSettings() {
    settings = {
        balance: parseFloat(document.getElementById('settingBalance').value) || 1000,
        tp: parseFloat(document.getElementById('settingTP').value) || 5,
        sl: parseFloat(document.getElementById('settingSL').value) || 3
    };
    localStorage.setItem('settings', JSON.stringify(settings));
    
    // Save to cloud if connected
    if (window.firebaseIntegration) {
        window.firebaseIntegration.saveSettings();
    }
    
    updateAll();
    showToast('Settings saved!');
}

// ==================== PROFILE ====================
function loadProfile() {
    if (!currentUser) return;
    
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    
    const headerInitials = document.getElementById('headerInitials');
    const profileInitials = document.getElementById('profileInitials');
    const profileName = document.getElementById('profileName');
    const profileEmailText = document.getElementById('profileEmailText');
    const profileNameInput = document.getElementById('profileNameInput');
    const profileEmailInput = document.getElementById('profileEmailInput');
    
    if (headerInitials) headerInitials.textContent = initials;
    if (profileInitials) profileInitials.textContent = initials;
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmailText) profileEmailText.textContent = currentUser.email;
    if (profileNameInput) profileNameInput.value = currentUser.name;
    if (profileEmailInput) profileEmailInput.value = currentUser.email;
    
    if (currentUser.pic) {
        const profilePicPreview = document.getElementById('profilePicPreview');
        const headerPic = document.getElementById('headerPic');
        
        if (profilePicPreview) {
            profilePicPreview.src = currentUser.pic;
            profilePicPreview.classList.remove('hidden');
        }
        if (profileInitials) profileInitials.classList.add('hidden');
        if (headerPic) {
            headerPic.src = currentUser.pic;
            headerPic.classList.remove('hidden');
        }
        if (headerInitials) headerInitials.classList.add('hidden');
    }
    
    // Show provider badge
    if (currentUser.provider) {
        const profileProvider = document.getElementById('profileProvider');
        if (profileProvider) profileProvider.classList.remove('hidden');
    }
}

function updateProfilePic(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            currentUser.pic = event.target.result;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            loadProfile();
            showToast('Profile picture updated!');
        };
        reader.readAsDataURL(file);
    }
}

function updateProfile(e) {
    e.preventDefault();
    
    currentUser.name = document.getElementById('profileNameInput').value;
    currentUser.email = document.getElementById('profileEmailInput').value;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Save additional profile data
    const profile = {
        bio: document.getElementById('profileBio')?.value || '',
        experience: document.getElementById('profileExperience')?.value || '',
        broker: document.getElementById('profileBroker')?.value || '',
        assets: document.getElementById('profileAssets')?.value || ''
    };
    localStorage.setItem('userProfile', JSON.stringify(profile));
    
    loadProfile();
    showToast('Profile updated!');
}

function updateProfileStats() {
    const profileTotalTrades = document.getElementById('profileTotalTrades');
    const profileWinRate = document.getElementById('profileWinRate');
    const profileStreak = document.getElementById('profileStreak');
    const profileLevel = document.getElementById('profileLevel');
    
    if (profileTotalTrades) profileTotalTrades.textContent = trades.length;
    if (profileWinRate) profileWinRate.textContent = getWinRate().toFixed(0) + '%';
    if (profileStreak) profileStreak.textContent = getMaxStreak('WIN');
    
    const level = getCurrentLevel();
    if (profileLevel) profileLevel.textContent = `Level ${level.level} - ${level.title}`;
    
    // Member since
    if (currentUser?.createdAt) {
        const date = new Date(currentUser.createdAt);
        const profileMemberSince = document.getElementById('profileMemberSince');
        if (profileMemberSince) {
            profileMemberSince.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    }
    
    // Load profile fields
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    const profileBio = document.getElementById('profileBio');
    const profileExperience = document.getElementById('profileExperience');
    const profileBroker = document.getElementById('profileBroker');
    const profileAssets = document.getElementById('profileAssets');
    
    if (profile.bio && profileBio) profileBio.value = profile.bio;
    if (profile.experience && profileExperience) profileExperience.value = profile.experience;
    if (profile.broker && profileBroker) profileBroker.value = profile.broker;
    if (profile.assets && profileAssets) profileAssets.value = profile.assets;
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const icon = input.nextElementSibling?.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

function changePassword(event) {
    event.preventDefault();
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (newPass !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (newPass.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    currentUser.password = newPass;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    showToast('Password updated successfully!');
}

function saveGoals(event) {
    event.preventDefault();
    const goals = {
        monthlyProfit: parseFloat(document.getElementById('goalMonthlyProfit')?.value) || 0,
        winRate: parseFloat(document.getElementById('goalWinRate')?.value) || 65,
        maxTrades: parseInt(document.getElementById('goalMaxTrades')?.value) || 10,
        tradingDays: parseInt(document.getElementById('goalTradingDays')?.value) || 5
    };
    localStorage.setItem('tradingGoals', JSON.stringify(goals));
    showToast('Trading goals saved!');
}

function deleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone!')) {
        localStorage.clear();
        showToast('Account deleted. Redirecting...');
        setTimeout(() => location.reload(), 2000);
    }
}

// ==================== EXPORT/IMPORT ====================
function exportData(format) {
    const startDate = document.getElementById('exportStart')?.value;
    const endDate = document.getElementById('exportEnd')?.value;
    
    let filteredTrades = trades;
    if (startDate && endDate) {
        filteredTrades = trades.filter(t => {
            const d = t.timestamp.split('T')[0];
            return d >= startDate && d <= endDate;
        });
    }
    
    if (format === 'json') {
        const data = { trades: filteredTrades, transactions, journal, milestones, settings, xp };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tradeedge_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('JSON exported!');
    } else if (format === 'csv') {
        const headers = ['Date', 'Asset', 'Direction', 'Stake', 'Payout', 'Result', 'P/L', 'Session', 'Strategy'];
        const rows = filteredTrades.map(t => [
            new Date(t.timestamp).toLocaleDateString(),
            t.asset, t.direction, t.stake, t.payout + '%', t.result, t.pl.toFixed(2), t.session, t.strategy
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tradeedge_trades_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        showToast('CSV exported!');
    } else if (format === 'pdf') {
        generatePDF(filteredTrades);
    }
}

function generatePDF(filteredTrades) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('TradeEdge Pro', 15, 18);
    doc.setFontSize(10);
    doc.text('Trading Performance Report', 15, 26);
    doc.text(new Date().toLocaleDateString(), 180, 18);
    
    // Summary Stats
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Account Summary', 15, 48);
    
    const totalPL = filteredTrades.reduce((s, t) => s + t.pl, 0);
    const wins = filteredTrades.filter(t => t.result === 'WIN').length;
    const winRate = filteredTrades.length ? ((wins / filteredTrades.length) * 100).toFixed(1) : 0;
    
    doc.setFontSize(10);
    doc.text(`Total Trades: ${filteredTrades.length}`, 15, 58);
    doc.text(`Win Rate: ${winRate}%`, 15, 66);
    doc.text(`Total P/L: $${totalPL.toFixed(2)}`, 15, 74);
    doc.text(`Wins: ${wins} | Losses: ${filteredTrades.length - wins}`, 15, 82);
    
    // Trade Table
    doc.setFontSize(14);
    doc.text('Trade History', 15, 98);
    
    const tableData = filteredTrades.slice(0, 20).map(t => [
        new Date(t.timestamp).toLocaleDateString(),
        t.asset,
        t.direction,
        '$' + t.stake.toFixed(2),
        t.result,
        (t.pl >= 0 ? '+' : '') + '$' + t.pl.toFixed(2)
    ]);
    
    doc.autoTable({
        startY: 105,
        head: [['Date', 'Asset', 'Dir', 'Stake', 'Result', 'P/L']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
        styles: { fontSize: 8 }
    });
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('Generated by TradeEdge Pro | © 2025 Sayan Roy', 15, 290);
        doc.text(`Page ${i} of ${pageCount}`, 180, 290);
    }
    
    doc.save(`tradeedge_report_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF exported!');
}

function importData(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = JSON.parse(event.target.result);
                if (data.trades) { trades = data.trades; localStorage.setItem('trades', JSON.stringify(trades)); }
                if (data.transactions) { transactions = data.transactions; localStorage.setItem('transactions', JSON.stringify(transactions)); }
                if (data.journal) { journal = data.journal; localStorage.setItem('journal', JSON.stringify(journal)); }
                if (data.milestones) { milestones = data.milestones; localStorage.setItem('milestones', JSON.stringify(milestones)); }
                if (data.settings) { settings = data.settings; localStorage.setItem('settings', JSON.stringify(settings)); }
                if (data.xp) { xp = data.xp; localStorage.setItem('xp', data.xp.toString()); }
                updateAll();
                showToast('Data imported!');
            } catch (err) {
                showToast('Invalid file', 'error');
            }
        };
        reader.readAsText(file);
    }
}

function clearAllData() {
    if (confirm('Delete ALL data? This cannot be undone!')) {
        trades = []; 
        transactions = []; 
        journal = {}; 
        milestones = [100, 500, 1000, 5000, 10000]; 
        xp = 0;
        
        localStorage.removeItem('trades');
        localStorage.removeItem('transactions');
        localStorage.removeItem('journal');
        localStorage.removeItem('unlockedAchievements');
        localStorage.setItem('milestones', JSON.stringify(milestones));
        localStorage.setItem('xp', '0');
        
        updateAll();
        showToast('All data cleared');
    }
}

// ==================== LIVE CHARTS ====================
function loadChart(symbol = 'EURUSD') {
    if (!symbol) symbol = 'EURUSD';
    
    const iframe = document.getElementById('tradingview_iframe');
    if (!iframe) return;
    
    // Map common symbols to TradingView format
    const symbolMap = {
        'EURUSD': 'FX:EURUSD',
        'GBPUSD': 'FX:GBPUSD',
        'USDJPY': 'FX:USDJPY',
        'GBPJPY': 'FX:GBPJPY',
        'AUDUSD': 'FX:AUDUSD',
        'USDCAD': 'FX:USDCAD',
        'USDCHF': 'FX:USDCHF',
        'NZDUSD': 'FX:NZDUSD',
        'BTCUSD': 'BITSTAMP:BTCUSD',
        'ETHUSD': 'BITSTAMP:ETHUSD',
        'XAUUSD': 'OANDA:XAUUSD',
        'GOLD': 'OANDA:XAUUSD',
        'DXY': 'TVC:DXY',
        'US30': 'DJ:DJI',
        'US500': 'SP:SPX',
        'NAS100': 'NASDAQ:NDX'
    };
    
    // Use mapped symbol or original
    const tvSymbol = symbolMap[symbol.toUpperCase()] || symbol;
    const encodedSymbol = encodeURIComponent(tvSymbol);
    const theme = currentTheme === 'dark' ? 'dark' : 'light';
    const toolbarBg = currentTheme === 'dark' ? '1e293b' : 'f8fafc';
    
    // Build iframe URL
    const iframeUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_iframe&symbol=${encodedSymbol}&interval=1&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=${toolbarBg}&studies=%5B%22RSI%40tv-basicstudies%22%5D&theme=${theme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en`;
    
    iframe.src = iframeUrl;
    
    showToast(`📈 Loading ${symbol} chart...`);
}

function initLiveCharts() {
    // Chart loads automatically via iframe - just show toast
    showToast('📈 Live charts ready!');
}

// ==================== CONTACT ====================
function sendContact() {
    const name = document.getElementById('contactName')?.value;
    const email = document.getElementById('contactEmail')?.value;
    const service = document.getElementById('contactService')?.value;
    const message = document.getElementById('contactMessage')?.value;
    
    if (!name || !email || !message) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    const mailtoLink = `mailto:sayanroy@example.com?subject=TradeEdge Pro - ${service}&body=Name: ${name}%0AEmail: ${email}%0AService: ${service}%0A%0AMessage:%0A${encodeURIComponent(message)}`;
    window.open(mailtoLink);
    showToast('Opening email client...');
}

// ==================== HELPERS ====================
function getTotalPL() { 
    return trades.reduce((s, t) => s + t.pl, 0); 
}

function getWinRate() { 
    return trades.length ? (trades.filter(t => t.result === 'WIN').length / trades.length) * 100 : 0; 
}

function getMaxStreak(type) {
    let max = 0, current = 0;
    trades.forEach(t => {
        if (t.result === type) { current++; max = Math.max(max, current); }
        else current = 0;
    });
    return max;
}

// ==================== TOAST ====================
let toastTimeout = null;

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    
    if (!toast) return;
    
    // Clear existing timeout
    if (toastTimeout) clearTimeout(toastTimeout);
    
    if (toastMessage) toastMessage.textContent = msg;
    if (toastIcon) {
        toastIcon.className = type === 'success' 
            ? 'fas fa-check-circle text-green-400' 
            : type === 'error'
            ? 'fas fa-exclamation-circle text-red-400'
            : 'fas fa-info-circle text-blue-400';
    }
    
    toast.classList.remove('hidden');
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==================== UPDATE ALL ====================
function updateAll() {
    const totalPL = getTotalPL();
    const balance = settings.balance + totalPL;
    const wins = trades.filter(t => t.result === 'WIN').length;
    const winRate = getWinRate();
    const todayTrades = trades.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString());
    const todayPL = todayTrades.reduce((s, t) => s + t.pl, 0);

    // Dashboard Balance
    const dashBalance = document.getElementById('dashBalance');
    const dashBalanceChange = document.getElementById('dashBalanceChange');
    if (dashBalance) dashBalance.textContent = balance.toFixed(2);
    if (dashBalanceChange) dashBalanceChange.textContent = `${totalPL >= 0 ? '+' : ''}${((totalPL / settings.balance) * 100).toFixed(1)}% all time`;

    // Net Profit
    const dashNetProfit = document.getElementById('dashNetProfit');
    if (dashNetProfit) dashNetProfit.textContent = (totalPL >= 0 ? '+' : '') + '$' + totalPL.toFixed(2);

    // Win Rate
    const dashWinRate = document.getElementById('dashWinRate');
    const dashWinLoss = document.getElementById('dashWinLoss');
    if (dashWinRate) dashWinRate.textContent = winRate.toFixed(1) + '%';
    if (dashWinLoss) dashWinLoss.textContent = `${wins}W / ${trades.length - wins}L`;

    // Today's P/L with TP/SL status
    const dashTodayPL = document.getElementById('dashTodayPL');
    if (dashTodayPL) {
        dashTodayPL.textContent = (todayPL >= 0 ? '+' : '') + '$' + todayPL.toFixed(2);
        dashTodayPL.className = 'text-2xl font-bold ' + (todayPL >= 0 ? 'text-green-400' : 'text-red-400');
    }

    // TP/SL Status
    updateTPSLStatus(todayPL, balance);

    // Sidebar
    const sidebarTPSL = document.getElementById('sidebarTPSL');
    if (sidebarTPSL) sidebarTPSL.textContent = `+${settings.tp}% / -${settings.sl}%`;
    
    const sidebarProgressBar = document.getElementById('sidebarProgressBar');
    if (sidebarProgressBar) {
        const todayPercent = (todayPL / settings.balance) * 100;
        sidebarProgressBar.style.width = Math.min(100, Math.abs(todayPercent / (todayPercent >= 0 ? settings.tp : settings.sl)) * 100) + '%';
        sidebarProgressBar.className = 'h-full ' + (todayPL >= 0 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-red-500 to-orange-400');
    }
    
    // Streak
    const sidebarStreak = document.getElementById('sidebarStreak');
    if (sidebarStreak) sidebarStreak.textContent = getMaxStreak('WIN') + ' days';
    
    // Recent trades
    const recentTrades = document.getElementById('recentTrades');
    if (recentTrades) {
        recentTrades.innerHTML = trades.length ? trades.slice(0, 5).map(t => `
            <div class="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]">
                <div>
                    <span class="font-medium text-sm">${t.asset}</span>
                    <span class="text-xs text-[var(--text-secondary)] ml-2">${t.direction}</span>
                </div>
                <span class="text-sm font-bold ${t.pl >= 0 ? 'text-green-400' : 'text-red-400'}">${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(2)}</span>
            </div>
        `).join('') : '<p class="text-center text-[var(--text-secondary)] py-8">No trades yet</p>';
    }

    // Trade history table
    const tradeTable = document.getElementById('tradeTable');
    if (tradeTable) {
        tradeTable.innerHTML = trades.length ? trades.map(t => `
            <tr>
                <td class="px-4 py-3 text-xs">${new Date(t.timestamp).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-xs font-medium">${t.asset}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${t.direction === 'CALL' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${t.direction}</span></td>
                <td class="px-4 py-3 text-xs">$${t.stake.toFixed(2)}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs font-bold ${t.result === 'WIN' ? 'win-badge' : 'loss-badge'}">${t.result}</span></td>
                <td class="px-4 py-3 text-xs font-medium ${t.pl >= 0 ? 'text-green-400' : 'text-red-400'}">${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(2)}</td>
                <td class="px-4 py-3"><button onclick="deleteTrade(${t.id})" class="text-red-400 hover:text-red-300"><i class="fas fa-trash text-xs"></i></button></td>
            </tr>
        `).join('') : '<tr><td colspan="7" class="px-4 py-8 text-center text-[var(--text-secondary)]">No trades yet</td></tr>';
    }

    // Dashboard achievements preview
    const dashAchievements = document.getElementById('dashAchievements');
    if (dashAchievements) {
        const unlocked = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        dashAchievements.innerHTML = ACHIEVEMENTS.slice(0, 6).map(a => `
            <div class="card rounded-lg p-3 text-center ${unlocked.includes(a.id) ? '' : 'opacity-30'}">
                <div class="text-xl">${a.icon}</div>
                <p class="text-xs mt-1">${a.name}</p>
            </div>
        `).join('');
    }

    updateEquityChart();
    updateMoneyTracker();
    updateLevelDisplay();
}

function updateTPSLStatus(todayPL, balance) {
    const todayPercent = (todayPL / settings.balance) * 100;
    const tpslCard = document.getElementById('tpslCard');
    const tpslIcon = document.getElementById('tpslIcon');
    const tpslIconWrapper = document.getElementById('tpslIconWrapper');
    const tpslLabel = document.getElementById('tpslLabel');
    const tpslBadge = document.getElementById('tpslBadge');
    const tpslStatus = document.getElementById('dashTPSLStatus');
    const confettiContainer = document.getElementById('confettiContainer');
    
    if (!tpslCard) return;
    
    // Reset classes
    tpslCard.classList.remove('tp-hit-card', 'sl-hit-card');
    if (tpslBadge) tpslBadge.classList.add('hidden');
    if (confettiContainer) confettiContainer.innerHTML = '';
    
    if (todayPercent >= settings.tp) {
        // TP HIT
        tpslCard.classList.add('tp-hit-card');
        if (tpslLabel) {
            tpslLabel.innerHTML = '🎯 TARGET ACHIEVED';
            tpslLabel.className = 'text-green-400 text-sm font-bold';
        }
        if (tpslIconWrapper) tpslIconWrapper.innerHTML = '<span class="text-3xl tp-icon">🏆</span>';
        if (tpslStatus) {
            tpslStatus.innerHTML = `
                <div class="mt-2 p-2 rounded-lg bg-green-500/20 border border-green-500/50">
                    <p class="text-green-400 font-bold text-center">✅ TAKE PROFIT HIT!</p>
                    <p class="text-green-300 text-center text-xs mt-1">+${todayPercent.toFixed(1)}% achieved • Stop trading today!</p>
                </div>
            `;
        }
        if (tpslBadge) {
            tpslBadge.classList.remove('hidden');
            tpslBadge.innerHTML = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-400 text-white shadow-lg">TP +' + todayPercent.toFixed(1) + '%</span>';
        }
        
        // Add confetti
        if (confettiContainer) {
            const colors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24'];
            for (let i = 0; i < 8; i++) {
                const particle = document.createElement('div');
                particle.className = 'confetti-particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = '50%';
                particle.style.background = colors[Math.floor(Math.random() * colors.length)];
                particle.style.animationDelay = Math.random() * 0.5 + 's';
                confettiContainer.appendChild(particle);
            }
        }
        
    } else if (todayPercent <= -settings.sl) {
        // SL HIT
        tpslCard.classList.add('sl-hit-card');
        if (tpslLabel) {
            tpslLabel.innerHTML = '⚠️ LIMIT REACHED';
            tpslLabel.className = 'text-red-400 text-sm font-bold';
        }
        if (tpslIconWrapper) tpslIconWrapper.innerHTML = '<span class="text-3xl sl-icon">🛑</span>';
        if (tpslStatus) {
            tpslStatus.innerHTML = `
                <div class="mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50">
                    <p class="text-red-400 font-bold text-center">🛑 STOP LOSS HIT!</p>
                    <p class="text-red-300 text-center text-xs mt-1">${todayPercent.toFixed(1)}% loss • Stop trading immediately!</p>
                </div>
            `;
        }
        if (tpslBadge) {
            tpslBadge.classList.remove('hidden');
            tpslBadge.innerHTML = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg">SL ' + todayPercent.toFixed(1) + '%</span>';
        }
        
    } else {
        // Normal Mode
        if (tpslLabel) {
            tpslLabel.innerHTML = "Today's P/L";
            tpslLabel.className = 'text-[var(--text-secondary)] text-sm';
        }
        if (tpslIconWrapper && tpslIcon) {
            tpslIconWrapper.innerHTML = '<i class="fas fa-calendar-day text-orange-400" id="tpslIcon"></i>';
        }
        
        const tpProgress = Math.min(100, (todayPercent / settings.tp) * 100);
        const slProgress = Math.min(100, (Math.abs(todayPercent) / settings.sl) * 100);
        
        if (tpslStatus) {
            if (todayPL >= 0) {
                tpslStatus.innerHTML = `
                    <div class="mt-1">
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-[var(--text-secondary)]">Progress to TP</span>
                            <span class="text-green-400">${todayPercent.toFixed(1)}% / ${settings.tp}%</span>
                        </div>
                        <div class="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500" style="width: ${tpProgress}%"></div>
                        </div>
                        ${tpProgress >= 80 ? '<p class="text-xs text-green-400 mt-1 text-center animate-pulse">🔥 Almost there! Keep going!</p>' : ''}
                    </div>
                `;
            } else {
                tpslStatus.innerHTML = `
                    <div class="mt-1">
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-[var(--text-secondary)]">Approaching SL</span>
                            <span class="text-red-400">${Math.abs(todayPercent).toFixed(1)}% / ${settings.sl}%</span>
                        </div>
                        <div class="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-yellow-500 to-red-500 transition-all duration-500" style="width: ${slProgress}%"></div>
                        </div>
                        ${slProgress >= 70 ? '<p class="text-xs text-yellow-400 mt-1 text-center animate-pulse">⚠️ Caution! Consider stopping.</p>' : ''}
                    </div>
                `;
            }
        }
    }
}

// Search & Filter trades
function filterTrades() {
    const search = document.getElementById('searchTrades')?.value.toLowerCase() || '';
    const result = document.getElementById('filterResult')?.value || '';
    
    const filtered = trades.filter(t => {
        if (search && !t.asset.toLowerCase().includes(search)) return false;
        if (result && t.result !== result) return false;
        return true;
    });
    
    const tradeTable = document.getElementById('tradeTable');
    if (tradeTable) {
        tradeTable.innerHTML = filtered.map(t => `
            <tr>
                <td class="px-4 py-3 text-xs">${new Date(t.timestamp).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-xs font-medium">${t.asset}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${t.direction === 'CALL' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${t.direction}</span></td>
                <td class="px-4 py-3 text-xs">$${t.stake.toFixed(2)}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs font-bold ${t.result === 'WIN' ? 'win-badge' : 'loss-badge'}">${t.result}</span></td>
                <td class="px-4 py-3 text-xs font-medium ${t.pl >= 0 ? 'text-green-400' : 'text-red-400'}">${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(2)}</td>
                <td class="px-4 py-3"><button onclick="deleteTrade(${t.id})" class="text-red-400"><i class="fas fa-trash text-xs"></i></button></td>
            </tr>
        `).join('');
    }
}
