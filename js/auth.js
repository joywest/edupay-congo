// js/auth.js

// --- 1. LOGIQUE DE CONNEXION CLASSIQUE (DIRECTEURS & AUTRES) ---
const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPassword').value;
        const btn = document.getElementById('btnLogin');
        const errorDiv = document.getElementById('error');

        btn.innerText = "Vérification...";
        btn.disabled = true;

        auth.signInWithEmailAndPassword(email, pass)
            .then(async (userCredential) => {
                const user = userCredential.user;
                const snapshot = await db.ref(`users/${user.uid}`).once('value');
                const userData = snapshot.val();

                if (userData) {
                    // --- NOUVEAU : SÉCURITÉ ABONNEMENT POUR LES CLIENTS ---
                    if (userData.role !== "super_admin") {
                        const schoolId = userData.schoolId;

                        // AJOUT DE LA LIGNE POUR LES STATISTIQUES ET LE RÔLE
                        localStorage.setItem('currentSchoolId', schoolId);
                        localStorage.setItem('userRole', userData.role); // <-- AJOUTÉ

                        const schoolSnap = await db.ref(`schools/${schoolId}/config`).once('value');
                        const config = schoolSnap.val();

                        const dateExpiration = new Date(config.expiration);
                        const aujourdhui = new Date();

                        if (config.statut === "bloqué" || dateExpiration < aujourdhui) {
                            await auth.signOut(); // On le déconnecte immédiatement
                            localStorage.removeItem('userRole'); // Nettoyage <-- AJOUTÉ
                            btn.innerText = "Se connecter";
                            btn.disabled = false;
                            Swal.fire({
                                icon: 'error',
                                title: 'Accès Refusé',
                                text: 'Votre abonnement a expiré ou votre compte est bloqué. Contactez EduPay Congo.',
                                confirmButtonColor: '#1a73e8'
                            });
                            return; // On arrête tout ici
                        }
                    } else {
                        // C'est un super_admin qui se connecte via le form classique
                        localStorage.setItem('userRole', 'super_admin'); // <-- AJOUTÉ
                    }

                    // --- REDIRECTION SI TOUT EST OK ---
                    if (userData.role === "super_admin") {
                        window.location.replace('admin-dashboard.html');
                    } else {
                        window.location.replace('dashboard.html');
                    }
                } else {
                    auth.signOut();
                    localStorage.removeItem('userRole'); // <-- AJOUTÉ
                    throw { code: "auth/user-not-found" };
                }
            })
            .catch((error) => {
                btn.innerText = "Se connecter";
                btn.disabled = false;
                if(errorDiv) errorDiv.innerText = "Erreur : " + error.message;
            });
    });
}

// --- 2. LOGIQUE POUR L'ACCÈS SUPER ADMIN (VIA L'ENGRENAGE) ---

window.ouvrirConnexionMaster = function() {
    const modal = document.getElementById('modalMaster');
    if (modal) modal.style.display = 'flex';
};

window.connexionMaster = async function() {
    const email = document.getElementById('masterEmail').value.trim();
    const pass = document.getElementById('masterPass').value;
    const btn = document.getElementById('btnMaster');

    if (!email || !pass) {
        Swal.fire("Champs vides", "Veuillez entrer vos identifiants Master.", "warning");
        return;
    }

    btn.innerText = "Vérification Master...";
    btn.disabled = true;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, pass);
        const user = userCredential.user;

        const snapshot = await db.ref(`users/${user.uid}`).once('value');
        const userData = snapshot.val();

        if (userData && userData.role === "super_admin") {
            // Sauvegarde du rôle avant redirection
            localStorage.setItem('userRole', 'super_admin'); // <-- AJOUTÉ
            window.location.replace('admin-dashboard.html');
        } else {
            await auth.signOut();
            localStorage.removeItem('userRole'); // <-- AJOUTÉ
            btn.innerText = "Entrer dans le Dashboard";
            btn.disabled = false;
            Swal.fire("Accès Refusé", "Ce compte n'a pas les droits Super Admin.", "error");
        }
    } catch (error) {
        btn.innerText = "Entrer dans le Dashboard";
        btn.disabled = false;
        Swal.fire("Erreur", "Identifiants Master invalides.", "error");
    }
};

// --- 3. FONCTIONS D'INTERFACE ---

async function mettreAJourNomEcole(schoolId) {
    if (!schoolId) return;
    try {
        const snap = await db.ref(`schools/${schoolId}/info`).once('value');
        const info = snap.val();
        
        if (info && info.nom) {
            const brandElement = document.getElementById('schoolNameSidebar');
            if (brandElement) {
                brandElement.innerText = info.nom.toUpperCase();
                document.title = info.nom + " | Gestion";
            }
        }
    } catch (e) {
        console.error("Erreur de récupération du nom:", e);
    }
}

// --- 4. PERSISTANCE ET ÉTAT DE CONNEXION ---

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const snap = await db.ref(`users/${user.uid}`).once('value');
        const userData = snap.val();

        if (userData) {
            localStorage.setItem('userRole', userData.role);
            if (userData.schoolId) {
                localStorage.setItem('currentSchoolId', userData.schoolId);
                window.currentSchoolId = userData.schoolId;
                mettreAJourNomEcole(userData.schoolId);
            }
        }
    } else {
        // --- MODIFICATION ICI ---
        // On vide TOUT le stockage d'un coup (plus simple et plus sûr)
        localStorage.clear(); 
        sessionStorage.clear();
        
        // On définit proprement les pages où la redirection ne doit PAS se faire
        const isLoginPage = window.location.pathname.includes('index.html') || 
                            window.location.pathname === "/" || 
                            window.location.pathname === "";

        // Si on n'est pas sur la page de connexion, on y va de force
        if (!isLoginPage) {
            window.location.replace('index.html');
        }
    }
});
// --- 5. DÉCONNEXION SÉCURISÉE ---

window.logout = function() {
    Swal.fire({
        title: 'Déconnexion',
        text: "Voulez-vous vraiment quitter la session ?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Oui, me déconnecter',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            // Déconnexion de Firebase
            auth.signOut().then(() => {
                // Nettoyage complet
                localStorage.clear(); 
                sessionStorage.clear();
                // Redirection forcée
                window.location.replace('index.html');
            }).catch((error) => {
                console.error("Erreur déconnexion:", error);
                // En cas d'erreur, on force quand même le nettoyage local
                localStorage.clear();
                window.location.replace('index.html');
            });
        }
    });
};