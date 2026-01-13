// js/firebase.js

const firebaseConfig = {
    apiKey: "AIzaSyCUtkYNEItc-sI9_IIyfzxVNnpN_gj7UEA",
    authDomain: "gestion-paiements-ecole.firebaseapp.com",
    databaseURL: "https://gestion-paiements-ecole-default-rtdb.firebaseio.com",
    projectId: "gestion-paiements-ecole",
    storageBucket: "gestion-paiements-ecole.firebasestorage.app",
    messagingSenderId: "1007469956928",
    appId: "1:1007469956928:web:ca9b64e500976dc39634a5"
};

// Initialisation de Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// --- CONFIGURATION DU MODE HORS LIGNE ---
firebase.database().ref(".info/connected").on("value", (snap) => {
    if (snap.val() === true) {
        console.log("📡 Connecté au serveur Firebase");
    } else {
        console.log("📴 Mode hors-ligne détecté");
    }
});

window.db = firebase.database();
window.auth = firebase.auth();
window.currentSchoolId = null;
window.currentUserData = null;

console.log("🔥 Firebase Multi-Écoles initialisé !");

window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const snapshot = await window.db.ref(`users/${user.uid}`).once('value');
            window.currentUserData = snapshot.val();
            
            if (window.currentUserData) {
    // 1. Récupération de l'ID d'école
    window.currentSchoolId = window.currentUserData.schoolId;

    // 2. GESTION SPÉCIFIQUE DU SUPER ADMIN
    if (window.currentUserData.role === 'super_admin') {
        console.log("👑 Mode Super Admin : Accès total.");
        // Si le super_admin n'a pas d'ID rattaché, on lui en force un (ex: lyce_excellence)
        // pour qu'il puisse voir quelque chose au lieu de rester bloqué.
        if (!window.currentSchoolId || window.currentSchoolId === "system") {
            window.currentSchoolId = "lyce_excellence"; 
        }
    }

    // 3. MISE À JOUR DU STOCKAGE (Crucial pour eleves.js)
    if (window.currentSchoolId) {
        localStorage.setItem('currentSchoolId', window.currentSchoolId);
        console.log("🏫 École synchronisée :", window.currentSchoolId);
    }

    // 4. VÉRIFICATION DE L'ABONNEMENT (Sauf pour Super Admin)
    if (window.currentUserData.role !== 'super_admin' && window.currentSchoolId) {
        window.db.ref(`schools/${window.currentSchoolId}/config`).on('value', (snap) => {
            const config = snap.val();
            if (config) {
                const dateExpiration = new Date(config.expiration);
                const aujourdhui = new Date();
                
                if (config.statut === "bloqué" || aujourdhui > dateExpiration) {
                    document.body.innerHTML = `
                        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc; font-family: sans-serif; text-align: center; padding: 20px;">
                            <div style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 500px;">
                                <h1 style="color: #ef4444; font-size: 60px; margin: 0;">⚠️</h1>
                                <h2 style="color: #1e293b; margin-top: 20px;">Accès Restreint</h2>
                                <p style="color: #64748b;">L'abonnement de l'établissement <b>${window.currentSchoolId}</b> est expiré ou bloqué.</p>
                                <button onclick="window.logout()" style="margin-top: 20px; padding: 12px 25px; background: #1a73e8; color: white; border: none; border-radius: 10px; cursor: pointer;">Se déconnecter</button>
                            </div>
                        </div>`;
                }
            }
        });
    }

    // 5. LANCEMENT DE LA PAGE
    if (typeof window.initPage === "function") {
        window.initPage();
    }
}
        } catch (error) {
            console.error("Erreur profil:", error);
        }
    } else {
        if (!window.location.href.includes("index.html") && !window.location.pathname.endsWith("/")) {
            window.location.replace('index.html');
        }
    }
});



window.logout = function() {
    window.auth.signOut().then(() => window.location.replace('index.html'));
};