// ==================== FIREBASE CONFIGURATION ====================
// Replace these values with your Firebase project config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let app, auth, db;
let isFirebaseConfigured = false;

function initFirebase() {
    // Check if Firebase is configured
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("⚠️ Firebase not configured. Using localStorage only.");
        isFirebaseConfigured = false;
        return false;
    }
    
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        isFirebaseConfigured = true;
        console.log("✅ Firebase initialized successfully");
        
        // Enable offline persistence
        db.enablePersistence()
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn("Multiple tabs open, persistence enabled in first tab only");
                } else if (err.code === 'unimplemented') {
                    console.warn("Browser doesn't support persistence");
                }
            });
        
        // Listen for auth state changes
        auth.onAuthStateChanged(handleAuthStateChange);
        
        return true;
    } catch (error) {
        console.error("Firebase initialization error:", error);
        isFirebaseConfigured = false;
        return false;
    }
}

// ==================== AUTHENTICATION ====================

// Handle auth state changes
function handleAuthStateChange(user) {
    if (user) {
        console.log("✅ User logged in:", user.email);
        currentUser = {
            uid: user.uid,
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            pic: user.photoURL || null,
            provider: user.providerData[0]?.providerId || 'email',
            createdAt: user.metadata.creationTime
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Load user data from Firestore
        loadUserDataFromCloud();
        showMainApp();
    } else {
        console.log("❌ User logged out");
        currentUser = null;
        localStorage.removeItem('currentUser');
    }
}

// Email/Password Sign Up
async function firebaseSignUp(email, password, name) {
    if (!isFirebaseConfigured) {
        // Fallback to localStorage
        return localSignUp(email, password, name);
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Update profile with name
        await userCredential.user.updateProfile({
            displayName: name
        });
        
        // Create user document in Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            settings: {
                balance: 1000,
                tp: 5,
                sl: 3
            }
        });
        
        showToast("Account created successfully!");
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Sign up error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
        return { success: false, error: error.message };
    }
}

// Email/Password Login
async function firebaseLogin(email, password) {
    if (!isFirebaseConfigured) {
        return localLogin(email, password);
    }
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        showToast("Welcome back!");
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Login error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
        return { success: false, error: error.message };
    }
}

// Google Sign In
async function firebaseGoogleLogin() {
    if (!isFirebaseConfigured) {
        return localGoogleLogin();
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        
        // Check if new user
        if (result.additionalUserInfo?.isNewUser) {
            await db.collection('users').doc(result.user.uid).set({
                name: result.user.displayName,
                email: result.user.email,
                pic: result.user.photoURL,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                settings: {
                    balance: 1000,
                    tp: 5,
                    sl: 3
                }
            });
        }
        
        showToast("Logged in with Google!");
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Google login error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
        return { success: false, error: error.message };
    }
}

// GitHub Sign In
async function firebaseGithubLogin() {
    if (!isFirebaseConfigured) {
        return localGithubLogin();
    }
    
    try {
        const provider = new firebase.auth.GithubAuthProvider();
        const result = await auth.signInWithPopup(provider);
        
        // Check if new user
        if (result.additionalUserInfo?.isNewUser) {
            await db.collection('users').doc(result.user.uid).set({
                name: result.user.displayName || result.additionalUserInfo.username,
                email: result.user.email,
                pic: result.user.photoURL,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                settings: {
                    balance: 1000,
                    tp: 5,
                    sl: 3
                }
            });
        }
        
        showToast("Logged in with GitHub!");
        return { success: true, user: result.user };
    } catch (error) {
        console.error("GitHub login error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
        return { success: false, error: error.message };
    }
}

// Logout
async function firebaseLogout() {
    if (!isFirebaseConfigured) {
        return localLogout();
    }
    
    try {
        await auth.signOut();
        // Clear local data
        trades = [];
        transactions = [];
        journal = {};
        currentUser = null;
        localStorage.clear();
        location.reload();
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Error logging out", 'error');
    }
}

// Password Reset
async function firebaseResetPassword(email) {
    if (!isFirebaseConfigured) {
        showToast("Password reset not available in offline mode", 'error');
        return;
    }
    
    try {
        await auth.sendPasswordResetEmail(email);
        showToast("Password reset email sent!");
    } catch (error) {
        console.error("Password reset error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
    }
}

// Update Password
async function firebaseUpdatePassword(currentPassword, newPassword) {
    if (!isFirebaseConfigured || !auth.currentUser) {
        showToast("Please login first", 'error');
        return;
    }
    
    try {
        // Re-authenticate user
        const credential = firebase.auth.EmailAuthProvider.credential(
            auth.currentUser.email,
            currentPassword
        );
        await auth.currentUser.reauthenticateWithCredential(credential);
        
        // Update password
        await auth.currentUser.updatePassword(newPassword);
        showToast("Password updated successfully!");
    } catch (error) {
        console.error("Update password error:", error);
        showToast(getFirebaseErrorMessage(error.code), 'error');
    }
}

// ==================== DATA SYNC ====================

// Load all user data from Firestore
async function loadUserDataFromCloud() {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        // Load settings
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.settings) {
                settings = userData.settings;
                localStorage.setItem('settings', JSON.stringify(settings));
            }
        }
        
        // Load trades
        const tradesSnapshot = await db.collection('users').doc(uid)
            .collection('trades').orderBy('timestamp', 'desc').get();
        trades = tradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localStorage.setItem('trades', JSON.stringify(trades));
        
        // Load transactions
        const transSnapshot = await db.collection('users').doc(uid)
            .collection('transactions').orderBy('timestamp', 'desc').get();
        transactions = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localStorage.setItem('transactions', JSON.stringify(transactions));
        
        // Load journal
        const journalSnapshot = await db.collection('users').doc(uid)
            .collection('journal').get();
        journal = {};
        journalSnapshot.docs.forEach(doc => {
            journal[doc.id] = doc.data();
        });
        localStorage.setItem('journal', JSON.stringify(journal));
        
        // Load milestones
        const milestonesDoc = await db.collection('users').doc(uid)
            .collection('data').doc('milestones').get();
        if (milestonesDoc.exists) {
            milestones = milestonesDoc.data().values || [100, 500, 1000, 5000, 10000];
            localStorage.setItem('milestones', JSON.stringify(milestones));
        }
        
        // Load XP
        const xpDoc = await db.collection('users').doc(uid)
            .collection('data').doc('progress').get();
        if (xpDoc.exists) {
            xp = xpDoc.data().xp || 0;
            localStorage.setItem('xp', xp.toString());
        }
        
        console.log("✅ User data loaded from cloud");
        updateAll();
        
    } catch (error) {
        console.error("Error loading data from cloud:", error);
        // Fallback to localStorage
    }
}

// Save trade to Firestore
async function saveTradeToCloud(trade) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        const docRef = await db.collection('users').doc(uid)
            .collection('trades').add({
                ...trade,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        trade.id = docRef.id;
        console.log("✅ Trade saved to cloud");
    } catch (error) {
        console.error("Error saving trade:", error);
    }
}

// Delete trade from Firestore
async function deleteTradeFromCloud(tradeId) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('trades').doc(tradeId.toString()).delete();
        console.log("✅ Trade deleted from cloud");
    } catch (error) {
        console.error("Error deleting trade:", error);
    }
}

// Save transaction to Firestore
async function saveTransactionToCloud(transaction) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('transactions').add({
                ...transaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log("✅ Transaction saved to cloud");
    } catch (error) {
        console.error("Error saving transaction:", error);
    }
}

// Save journal entry to Firestore
async function saveJournalToCloud(date, entry) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('journal').doc(date).set(entry);
        console.log("✅ Journal saved to cloud");
    } catch (error) {
        console.error("Error saving journal:", error);
    }
}

// Delete journal entry from Firestore
async function deleteJournalFromCloud(date) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('journal').doc(date).delete();
        console.log("✅ Journal deleted from cloud");
    } catch (error) {
        console.error("Error deleting journal:", error);
    }
}

// Save settings to Firestore
async function saveSettingsToCloud() {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid).update({
            settings: settings
        });
        console.log("✅ Settings saved to cloud");
    } catch (error) {
        console.error("Error saving settings:", error);
    }
}

// Save milestones to Firestore
async function saveMilestonesToCloud() {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('data').doc('milestones').set({
                values: milestones
            });
        console.log("✅ Milestones saved to cloud");
    } catch (error) {
        console.error("Error saving milestones:", error);
    }
}

// Save XP to Firestore
async function saveXPToCloud() {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid)
            .collection('data').doc('progress').set({
                xp: xp,
                level: getCurrentLevel().level,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log("✅ XP saved to cloud");
    } catch (error) {
        console.error("Error saving XP:", error);
    }
}

// Save profile to Firestore
async function saveProfileToCloud(profileData) {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    
    try {
        await db.collection('users').doc(uid).update({
            ...profileData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update Firebase Auth profile
        if (profileData.name) {
            await auth.currentUser.updateProfile({
                displayName: profileData.name
            });
        }
        
        console.log("✅ Profile saved to cloud");
    } catch (error) {
        console.error("Error saving profile:", error);
    }
}

// Sync all data to cloud
async function syncAllDataToCloud() {
    if (!isFirebaseConfigured || !auth.currentUser) {
        showToast("Cloud sync not available", 'error');
        return;
    }
    
    const uid = auth.currentUser.uid;
    showToast("Syncing data to cloud...");
    
    try {
        // Batch write for efficiency
        const batch = db.batch();
        
        // Save settings
        const userRef = db.collection('users').doc(uid);
        batch.update(userRef, { settings: settings });
        
        // Commit batch
        await batch.commit();
        
        // Save trades one by one (can't batch subcollections easily)
        for (const trade of trades) {
            await db.collection('users').doc(uid)
                .collection('trades').doc(trade.id.toString()).set(trade);
        }
        
        // Save transactions
        for (const trans of transactions) {
            await db.collection('users').doc(uid)
                .collection('transactions').doc(trans.id.toString()).set(trans);
        }
        
        // Save journal
        for (const [date, entry] of Object.entries(journal)) {
            await db.collection('users').doc(uid)
                .collection('journal').doc(date).set(entry);
        }
        
        // Save milestones
        await saveMilestonesToCloud();
        
        // Save XP
        await saveXPToCloud();
        
        showToast("✅ All data synced to cloud!");
        
    } catch (error) {
        console.error("Sync error:", error);
        showToast("Sync failed: " + error.message, 'error');
    }
}

// ==================== LOCAL FALLBACKS ====================

function localSignUp(email, password, name) {
    currentUser = {
        uid: 'local_' + Date.now(),
        name: name,
        email: email,
        createdAt: new Date().toISOString()
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showMainApp();
    showToast("Account created (offline mode)");
    return { success: true, user: currentUser };
}

function localLogin(email, password) {
    currentUser = {
        uid: 'local_' + Date.now(),
        name: email.split('@')[0],
        email: email,
        createdAt: new Date().toISOString()
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showMainApp();
    showToast("Logged in (offline mode)");
    return { success: true, user: currentUser };
}

function localGoogleLogin() {
    currentUser = {
        uid: 'local_google_' + Date.now(),
        name: 'Google User',
        email: 'demo@gmail.com',
        pic: 'https://ui-avatars.com/api/?name=G&background=ea4335&color=fff',
        provider: 'google',
        createdAt: new Date().toISOString()
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showMainApp();
    showToast("Logged in with Google (demo mode)");
    return { success: true, user: currentUser };
}

function localGithubLogin() {
    currentUser = {
        uid: 'local_github_' + Date.now(),
        name: 'GitHub User',
        email: 'demo@github.com',
        pic: 'https://ui-avatars.com/api/?name=GH&background=333&color=fff',
        provider: 'github',
        createdAt: new Date().toISOString()
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showMainApp();
    showToast("Logged in with GitHub (demo mode)");
    return { success: true, user: currentUser };
}

function localLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    location.reload();
}

// ==================== HELPER FUNCTIONS ====================

function getFirebaseErrorMessage(code) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/too-many-requests': 'Too many attempts. Try again later',
        'auth/popup-closed-by-user': 'Login cancelled',
        'auth/network-request-failed': 'Network error. Check your connection',
        'auth/requires-recent-login': 'Please login again to continue'
    };
    return errorMessages[code] || 'An error occurred. Please try again.';
}

// Check Firebase connection status
function isFirebaseConnected() {
    return isFirebaseConfigured && auth?.currentUser;
}

// Get connection status for UI
function getConnectionStatus() {
    if (!isFirebaseConfigured) return { status: 'offline', text: 'Offline Mode', color: 'gray' };
    if (auth?.currentUser) return { status: 'connected', text: 'Cloud Connected', color: 'green' };
    return { status: 'disconnected', text: 'Not Logged In', color: 'yellow' };
}

// Export for use in app.js
window.firebaseIntegration = {
    init: initFirebase,
    signUp: firebaseSignUp,
    login: firebaseLogin,
    googleLogin: firebaseGoogleLogin,
    githubLogin: firebaseGithubLogin,
    logout: firebaseLogout,
    resetPassword: firebaseResetPassword,
    updatePassword: firebaseUpdatePassword,
    saveTrade: saveTradeToCloud,
    deleteTrade: deleteTradeFromCloud,
    saveTransaction: saveTransactionToCloud,
    saveJournal: saveJournalToCloud,
    deleteJournal: deleteJournalFromCloud,
    saveSettings: saveSettingsToCloud,
    saveMilestones: saveMilestonesToCloud,
    saveXP: saveXPToCloud,
    saveProfile: saveProfileToCloud,
    syncAll: syncAllDataToCloud,
    loadData: loadUserDataFromCloud,
    isConnected: isFirebaseConnected,
    getStatus: getConnectionStatus
};

console.log("📦 Firebase module loaded");
