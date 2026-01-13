// js/dashboard.js

// --- 0. GESTION DES ARCHIVES (BRANCHEMENT DU SÉLECTEUR) ---
let anneeConsultation = "2025-2026";
let profSelectionneId = null; // Très important, doit être en haut du fichier

window.changerAnneeConsultation = function(nouvelleAnnee) {
    anneeConsultation = nouvelleAnnee;
    console.log("🔄 Consultation de l'archive : " + anneeConsultation);
    loadDashboardData(); // On recharge tout avec la nouvelle année
};

// --- 1. LA SENTINELLE (SÉCURITÉ TEMPS RÉEL) ---
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userSnap = await db.ref(`users/${user.uid}`).once('value');
            const userData = userSnap.val();

            if (userData && userData.role !== 'super_admin') {
                const schoolId = userData.schoolId;
                
                db.ref(`schools/${schoolId}/config`).on('value', (snapshot) => {
                    const config = snapshot.val();
                    if (!config) return;

                    const expDate = new Date(config.expiration);
                    const today = new Date();

                    if (config.statut === "bloqué" || expDate < today) {
                        auth.signOut().then(() => {
                            window.location.replace("index.html");
                        });
                    }
                });
            }
        } else {
            if (!window.location.href.includes('index.html')) {
                window.location.replace("index.html");
            }
        }
    });
}

// --- 2. TES FONCTIONS EXISTANTES (STRUCTURE CONSERVÉE À 100%) ---

window.changerAnneeFirebase = function(nouvelleAnnee) {
    const sId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;
    if (!sId) return;
    
    Swal.fire({
        title: "Changer d'année ?",
        text: `Vous allez basculer sur l'année scolaire ${nouvelleAnnee}.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#1a73e8",
        confirmButtonText: "Oui, basculer",
        cancelButtonText: "Annuler"
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`schools/${sId}/config/currentYear`).set(nouvelleAnnee)
            .then(() => {
                Swal.fire("Succès", `L'application est maintenant sur ${nouvelleAnnee}`, "success");
            })
            .catch(err => Swal.fire("Erreur", err.message, "error"));
        } else {
            location.reload(); 
        }
    });
};

function logout() {
    // --- SÉCURITÉ AJOUTÉE : On détruit la clé d'accès Directeur ---
    sessionStorage.removeItem('directionDebloquee');
    sessionStorage.clear(); // Efface toutes les autres données temporaires

    auth.signOut().then(() => {
        window.location.replace('index.html');
    }).catch((error) => {
        window.location.href = 'index.html';
    });
}
window.logout = logout;

function loadDashboardData() {
    const sId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;
    if (!db || !sId) {
        setTimeout(loadDashboardData, 500);
        return;
    }

    // MODIFICATION : On utilise l'année du sélecteur d'archive (anneeConsultation)
    const yearToLoad = anneeConsultation;

    // Mise à jour visuelle du sélecteur d'archive pour qu'il soit synchro
    const archiveSelect = document.getElementById('selectAnneeArchive');
    if(archiveSelect) archiveSelect.value = yearToLoad;

    // ÉTAPE B: Pointer vers les dossiers de l'année sélectionnée (yearToLoad remplace selectedYear)
    const studentsRef = db.ref(`schools/${sId}/${yearToLoad}/students`);
    const paymentsRef = db.ref(`schools/${sId}/${yearToLoad}/paiements`);

    // 1. STATISTIQUES ÉLÈVES (VERSION FINALE NETTOYÉE)
    studentsRef.on('value', (snapshot) => {
        let studentCount = 0;
        let totalRetardataires = 0;

        snapshot.forEach((child) => {
            const s = child.val();
            studentCount++;
            
            const resteBase = parseFloat(s.reste || 0);
            const scolariteTotale = parseFloat(s.scolarite || s.frais_scolarite || 0);
            const montantPaye = parseFloat(s.paye || s.montantPaye || 0);
            const resteCalculé = scolariteTotale - montantPaye;

            if (resteBase > 0 || resteBase < 0 || resteCalculé > 0) {
                totalRetardataires++;
            }
        });

        const displayTotal = document.getElementById('totalStudents');
        const displayArrears = document.getElementById('totalArrears');
        
        if(displayTotal) displayTotal.innerText = studentCount;
        if(displayArrears) displayArrears.innerText = totalRetardataires;
    });

    // 2. RECETTES ET DERNIERS PAIEMENTS
    paymentsRef.on('value', (snapshot) => {
        const inputDay = document.getElementById('statsDateDay');
        const inputMonth = document.getElementById('statsDateMonth');
        
        const selectedDay = inputDay ? inputDay.value : new Date().toISOString().split('T')[0];
        const selectedMonth = inputMonth ? inputMonth.value : new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');

        const dayCible = selectedDay.split('-').reverse().join('/'); 
        const [yearM, monthM] = selectedMonth.split('-');
        const moisCible = `${monthM}/${yearM}`; 

        let dailyRevenue = 0;
        let monthlyRevenue = 0;
        
        const tableBody = document.querySelector('#lastPaymentsTable tbody');
        if (tableBody) tableBody.innerHTML = ""; 
        
        let paymentsList = [];

        snapshot.forEach((child) => {
            const p = child.val();
            const montantPaiement = parseFloat(p.montantTotal || p.montant || 0);
            const dateP = p.date || ""; 
            
            if (dateP === dayCible) {
                dailyRevenue += montantPaiement;
            }

            if (dateP.includes(moisCible)) {
                monthlyRevenue += montantPaiement;
            }

            p.key = child.key;
            paymentsList.push(p);
        });

        const dayDisp = document.getElementById('dayRevenue');
        const monthDisp = document.getElementById('monthRevenue');

        if(dayDisp) dayDisp.innerText = dailyRevenue.toLocaleString('fr-FR') + " FCFA";
        if(monthDisp) monthDisp.innerText = monthlyRevenue.toLocaleString('fr-FR') + " FCFA";

        const labelDay = document.getElementById('displaySelectedDay');
        const labelMonth = document.getElementById('displaySelectedMonth');
        if(labelDay) labelDay.innerText = "Date : " + dayCible;
        if(labelMonth) labelMonth.innerText = "Période : " + moisCible;

        paymentsList.reverse(); 
        if (tableBody) {
            if(paymentsList.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Aucun paiement.</td></tr>';
            } else {
                paymentsList.slice(0, 5).forEach(p => {
                    const row = `
                        <tr>
                            <td>${p.date || '--/--/----'}</td>
                            <td><strong>${p.nom || p.nomEleve || 'Inconnu'}</strong></td>
                            <td style="color: #2ecc71; font-weight: bold;">${parseFloat(p.montantTotal || p.montant || 0).toLocaleString()}</td>
                            <td><span class="badge" style="background:#e8f0fe; color:#1a73e8; padding:4px 8px; border-radius:6px; font-size:11px;">${p.methode || p.mode || 'Espèces'}</span></td>
                        </tr>`;
                    tableBody.innerHTML += row;
                });
            }
        }
    });
}

// Initialisation
window.initPage = () => { loadDashboardData(); 
    if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.role === 'secretaire') {
        const laPorteRapport = document.getElementById('linkRapport');
        if (laPorteRapport) {
            laPorteRapport.href = "#"; 
            laPorteRapport.innerHTML = '<span class="icon">🔒</span> Rapports Direction';
            laPorteRapport.onclick = (e) => {
                e.preventDefault();
                demanderCodeAuDirecteur();
            };
        }
    }
    const btnAjout = document.getElementById('btnAjoutPersonnel');
    if (currentUserData && currentUserData.role === 'admin' && btnAjout) btnAjout.style.display = 'block';
};


document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(user => {
            const userDisplay = document.getElementById('userDisplay');
            if (user && userDisplay) {
                const displayName = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) 
                    ? currentUserData.name 
                    : user.email.split('@')[0];
                userDisplay.innerText = displayName.toUpperCase();
            }
        });
    }
});
async function demanderCodeAuDirecteur() {
    const { value: password } = await Swal.fire({
        title: 'Accès Direction',
        text: 'Veuillez saisir le mot de passe du Directeur.',
        input: 'password',
        inputPlaceholder: 'Mot de passe...',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8'
    });

    if (password) {
        try {
            // On vérifie le mot de passe via Firebase
            await auth.signInWithEmailAndPassword(auth.currentUser.email, password);
            
            // --- SÉCURITÉ AJOUTÉE : On marque la session comme débloquée ---
            sessionStorage.setItem('directionDebloquee', 'true');
            
            window.location.href = 'directeur.html';
        } catch (error) {
            Swal.fire("Erreur", "Mot de passe incorrect.", "error");
        }
    }
}
window.updateDashboardStats = function() {
    loadDashboardData(); 
};

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const dayInput = document.getElementById('statsDateDay');
    const monthInput = document.getElementById('statsDateMonth');
    
    if(dayInput) dayInput.value = today.toISOString().split('T')[0];
    if(monthInput) monthInput.value = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
});
// --- FONCTION POUR CRÉER LE COMPTE SECRÉTAIRE ---
async function ouvrirModalSecretaire() {
    // 1. On ouvre la fenêtre de saisie (SweetAlert2)
    const { value: formValues } = await Swal.fire({
        title: 'Ajouter une Secrétaire',
        html:
            '<div style="text-align:left; margin-bottom:10px; font-weight:bold;">Nom complet :</div>' +
            '<input id="swal-nom" class="swal2-input" placeholder="Ex: Mme. Sylvie">' +
            '<div style="text-align:left; margin-bottom:10px; font-weight:bold;">Email de connexion :</div>' +
            '<input id="swal-email" type="email" class="swal2-input" placeholder="sylvie@email.com">' +
            '<div style="text-align:left; margin-bottom:10px; font-weight:bold;">Mot de passe provisoire :</div>' +
            '<input id="swal-pass" type="password" class="swal2-input" placeholder="Minimum 6 caractères">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Créer le compte',
        confirmButtonColor: '#1a73e8',
        cancelButtonText: 'Annuler',
        preConfirm: () => {
            const nom = document.getElementById('swal-nom').value;
            const email = document.getElementById('swal-email').value;
            const pass = document.getElementById('swal-pass').value;
            if (!nom || !email || !pass) {
                Swal.showValidationMessage('Veuillez remplir tous les champs');
            }
            return { nom, email, pass };
        }
    });

    // 2. Si le directeur a validé le formulaire
    if (formValues) {
        const { nom, email, pass } = formValues;
        const currentSchoolId = currentUserData.schoolId; // On récupère l'ID de ton école

        Swal.fire({ title: 'Création du compte...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // --- ASTUCE : Instance secondaire pour ne pas déconnecter le directeur ---
            const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
            
            // Création de l'utilisateur dans Firebase Auth
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
            const newUid = userCredential.user.uid;

            // Enregistrement des données dans la base de données (Realtime Database)
            await db.ref(`users/${newUid}`).set({
                name: nom,
                email: email,
                role: "secretaire",
                schoolId: currentSchoolId, // Elle est rattachée à ton école !
                dateCreation: new Date().toISOString()
            });

            // On ferme l'instance secondaire proprement
            await secondaryApp.delete();

            Swal.fire("Succès !", `Le compte de ${nom} a été créé. Elle peut maintenant se connecter avec son email.`, "success");

        } catch (error) {
            console.error(error);
            Swal.fire("Erreur", "Impossible de créer le compte : " + error.message, "error");
        }
    }
}
function ouvrirMenuParametres() {
    Swal.fire({
        title: 'Paramètres & Configuration',
        html: `
            <div style="text-align: left; margin-top: 15px;">
                <div class="menu-item" onclick="activerModeSombre()" style="display: flex; align-items: center; gap: 15px; padding: 12px; cursor: pointer; border-radius: 10px; transition: 0.2s;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: #2563eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fa-solid fa-moon" style="color: white; font-size: 18px;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 14px; color: #1e293b;">Mode Visuel</div>
                        <div style="font-size: 12px; color: #64748b;">Basculer entre mode Clair et Sombre</div>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 8px 0;">

                <div class="menu-item" onclick="preparerExportExcel()" style="display: flex; align-items: center; gap: 15px; padding: 12px; cursor: pointer; border-radius: 10px; transition: 0.2s;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fa-solid fa-file-excel" style="color: white; font-size: 18px;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 14px; color: #1e293b;">Sauvegarde Cloud</div>
                        <div style="font-size: 12px; color: #64748b;">Télécharger la base de données (Excel)</div>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 8px 0;">

                <div class="menu-item" onclick="ouvrirCentreAide()" style="display: flex; align-items: center; gap: 15px; padding: 12px; cursor: pointer; border-radius: 10px; transition: 0.2s;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: #ea580c; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fa-solid fa-shield-halved" style="color: white; font-size: 18px;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 14px; color: #1e293b;">Aide & Mentions Légales</div>
                        <div style="font-size: 12px; color: #64748b;">Guide, Vision et Confidentialité</div>
                    </div>
                </div>
            </div>
            
            <style>
                .menu-item:hover { background-color: #f1f5f9 !important; }
                .swal2-html-container { overflow: hidden !important; }
            </style>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: '380px'
    });
}
function activerModeSombre() {
    const htmlElement = document.documentElement;
    const isDark = htmlElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';

    // Appliquer le thème
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Notification de confirmation
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Mode ${newTheme === 'dark' ? 'Sombre' : 'Clair'} activé`,
        showConfirmButton: false,
        timer: 1500
    });
}
async function sauvegarderBaseDonneesExcel() {
    // 1. Récupération des IDs nécessaires
    const sId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;
    const year = anneeConsultation || "2025-2026"; // Utilise l'année sélectionnée dans ton dashboard

    if (!sId) {
        Swal.fire("Erreur", "Impossible de trouver l'ID de l'école. Reconnectez-vous.", "error");
        return;
    }

    // Affichage d'un chargement car Firebase peut mettre 1 ou 2 secondes
    Swal.fire({
        title: 'Génération du rapport...',
        text: 'Récupération des données sécurisées...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 2. Extraction des données depuis Firebase (en temps réel)
        const [snapEleves, snapPaiements] = await Promise.all([
            db.ref(`schools/${sId}/${year}/students`).once('value'),
            db.ref(`schools/${sId}/${year}/paiements`).once('value')
        ]);

        const paiementsRaw = [];
        snapPaiements.forEach(child => { paiementsRaw.push(child.val()); });

        const elevesData = [];
        snapEleves.forEach(child => {
            const el = child.val();
            
            // 3. Filtrer les paiements pour cet élève précis et lister les mois
            const sesPaiements = paiementsRaw.filter(p => p.matricule === el.matricule);
            
            // On récupère les noms des mois payés (ex: "Janvier, Février")
            const listeMois = sesPaiements
                .map(p => p.mois || "")
                .filter(m => m !== "")
                .join(" | ");

            // 4. Préparation de la ligne Excel
            elevesData.push({
                "Matricule": el.matricule || "N/A",
                "Nom": el.nom ? el.nom.toUpperCase() : "",
                "Prénom": el.prenom || "",
                "Classe": el.classe || "",
                "Sexe": el.sexe || "",
                "Scolarité Totale (FCFA)": parseFloat(el.scolarite || 0),
                "Total Payé (FCFA)": parseFloat(el.paye || 0),
                "Reste à Payer (FCFA)": parseFloat(el.scolarite || 0) - parseFloat(el.paye || 0),
                "Mois Enregistrés": listeMois || "Aucun paiement",
                "Parent": el.parent || "N/A",
                "Contact": el.contact || "N/A"
            });
        });

        if (elevesData.length === 0) {
            Swal.fire("Attention", "Aucune donnée trouvée pour l'année " + year, "warning");
            return;
        }

        // 5. Création du fichier Excel
        const feuille = XLSX.utils.json_to_sheet(elevesData);
        
        // Largeur automatique des colonnes pour que ce soit joli
        feuille['!cols'] = [
            {wch: 12}, {wch: 20}, {wch: 20}, {wch: 10}, {wch: 8}, 
            {wch: 20}, {wch: 15}, {wch: 15}, {wch: 35}, {wch: 20}, {wch: 15}
        ];

        const classeur = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(classeur, feuille, "Rapport EduPay");

        // 6. Téléchargement
        const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
        XLSX.writeFile(classeur, `Sauvegarde_${year}_exporté_le_${dateStr}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'Sauvegarde Terminée',
            text: `Le fichier Excel pour l'année ${year} est prêt.`,
            confirmButtonColor: '#2563eb'
        });

    } catch (error) {
        console.error("Erreur Export:", error);
        Swal.fire("Erreur", "La sauvegarde a échoué : " + error.message, "error");
    }
}

// L'alias indispensable pour ton bouton "Sauvegarde Cloud" dans le menu
window.preparerExportExcel = function() {
    sauvegarderBaseDonneesExcel();
};
function ouvrirCentreAide() {
    Swal.fire({
        title: 'Documentation EduPay Congo',
        width: '600px',
        html: `
            <div style="text-align: left; font-size: 13px; max-height: 450px; overflow-y: auto; padding-right: 10px; color: #334155;">
                
                <div style="background: #1a73e8; color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 16px;">EduPay Congo v1.2.5</h3>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Propulsé par <strong>LYS Ingénierie & Digital</strong></p>
                </div>

                <h4 style="color: #1a73e8; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">🚀 Notre Vision</h4>
                <p>EduPay Congo est né de la volonté de digitaliser l'éducation en République du Congo. Notre mission est de simplifier la gestion financière des établissements scolaires pour permettre aux éducateurs de se concentrer sur l'essentiel : l'enseignement.</p>

                <h4 style="color: #1a73e8; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">📖 Guide Utilisateur</h4>
                <details style="margin-bottom: 10px;">
                    <summary style="font-weight: bold; cursor: pointer;">Gestion des inscriptions</summary>
                    <p style="padding: 10px; background: #f8fafc; border-radius: 5px;">Chaque élève doit posséder un matricule unique. Pour inscrire, cliquez sur "Élèves" > "Ajouter". Les données sont synchronisées en temps réel sur le cloud.</p>
                </details>
                <details style="margin-bottom: 10px;">
                    <summary style="font-weight: bold; cursor: pointer;">Sécurité des archives</summary>
                    <p style="padding: 10px; background: #f8fafc; border-radius: 5px;">Le sélecteur d'année permet de basculer entre les bases de données historiques sans risquer de modifier l'année en cours.</p>
                </details>

                <details style="margin-bottom: 10px;">
                    <summary style="font-weight: bold; cursor: pointer;">Lecture des Tableaux de Bord (Analytics)</summary>
                    <p style="padding: 10px; background: #f8fafc; border-radius: 5px;">Le tableau de bord se met à jour instantanément après chaque action :<br><br>
                        • <strong>Recette du mois :</strong> Somme totale collectée sur le mois civil en cours.<br>
                        • <strong>Arriérés (Retards) :</strong> Somme totale des dettes que les parents doivent encore à l'école.<br>
                        • <strong>Graphiques :</strong> Ils vous permettent de comparer les entrées d'argent mois par mois.</p>
                </details>

                 <details style="margin-bottom: 10px;">
                    <summary style="font-weight: bold; cursor: pointer;">Encaisser un Paiement et Reçus</summary>
                    <p style="padding: 10px; background: #f8fafc; border-radius: 5px;">Dans le menu <strong>"Paiements"</strong>, utilisez la barre de recherche pour trouver l'élève par son nom ou matricule.<br><br>
                        • Cliquez sur <strong>"Encaisser"</strong>.<br>
                        • Sélectionnez le mois concerné (indispensable pour les rapports).<br>
                        • Après validation, le reçu PDF se génère automatiquement. Vous pouvez le réimprimer à tout moment depuis l'historique de l'élève.</p>
                </details>

                <details style="margin-bottom: 10px;">
                    <summary style="font-weight: bold; cursor: pointer;">Sauvegarde et Sécurité Cloud</summary>
                    <p style="padding: 10px; background: #f8fafc; border-radius: 5px;">Dans le menu <strong>"Paiements"</strong>Vos données sont stockées sur des serveurs sécurisés. <br><br>
                        • Utilisez la fonction <strong>"Sauvegarde Cloud"</strong> dans les paramètres pour télécharger un fichier Excel complet. <br>
                        • Ce fichier contient : Liste des élèves, Contacts parents, Total payé, Reste à payer et détail des mois payés. C'est votre double de sécurité physique.
                    </div></p>
                </details>









                <h4 style="color: #1a73e8; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">🛡️ Politique de Confidentialité</h4>
                <div style="background: #fff1f2; padding: 12px; border-radius: 8px; border: 1px solid #fecdd3;">
                    <p style="margin: 0; font-size: 12px;"><strong>Protection des données :</strong> Les informations des élèves et les historiques de paiements sont cryptés via le protocole SSL. LYS Ingénierie s'engage à ne jamais vendre ou partager ces données à des tiers.</p>
                    <p style="margin: 8px 0 0 0; font-size: 12px;"><strong>Droit d'accès :</strong> Conformément aux lois sur le numérique, l'établissement reste propriétaire exclusif de ses données. Vous pouvez exporter votre base via la "Sauvegarde Cloud" à tout moment.</p>
                </div>

                <div style="margin-top: 25px; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 10px; text-align: center;">
                    <p style="margin: 0; font-weight: bold;">Besoin d'une maintenance ?</p>
                    <p style="font-size: 12px; margin: 5px 0;">Équipe Technique LYS Ingénierie & Digital</p>
                    <a href="https://wa.me/242XXXXXXXXX" target="_blank" style="display: inline-block; background: #25d366; color: white; padding: 10px 20px; border-radius: 25px; text-decoration: none; font-weight: bold; margin-top: 10px;">
                        <i class="fa-brands fa-whatsapp"></i> Support Technique
                    </a>
                </div>

                <p style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px;">
                    © 2026 LYS Ingénierie & Digital - Tous droits réservés.
                </p>
            </div>
        `,
        confirmButtonText: 'Fermer la documentation',
        confirmButtonColor: '#1a73e8'
    });
}

// Fonction pour ouvrir le modal
async function ouvrirModalDepense() {
    document.getElementById('modalDepense').style.display = 'flex';
    
    try {
        const maintenant = new Date();
        const moisActuel = maintenant.getMonth() + 1;
        const anneeActuelle = maintenant.getFullYear();

        const recettesText = document.getElementById('monthRevenue')?.innerText || "0";
        const totalRecettes = parseInt(recettesText.replace(/\D/g, "")) || 0;
        const depensesRef = window.db.ref(`schools/lyce_excellence/depenses`);
        
        depensesRef.once('value', (snapshot) => {
            let sumSalaires = 0;
            let sumAutres = 0;
            let html = "";
            let dejaAfficheSalaire = false;

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const d = childSnapshot.val();
                    const m = Number(d.montant || 0);
                    const dateD = new Date(d.date);
                    const moisD = dateD.getMonth() + 1;
                    const anneeD = dateD.getFullYear();

                    if (moisD === moisActuel && anneeD === anneeActuelle) {
                        if (d.categorie === "Salaire") {
                            sumSalaires += m;
                        } else {
                            sumAutres += m;
                        }
                    }

                    // Construction du HTML de l'historique
                    if (d.categorie === "Salaire") {
                        if (!dejaAfficheSalaire) {
                            html = `
                            <div style="background:white; padding:15px; border-radius:12px; margin-bottom:10px; border:2px solid #4f46e5; background:#f8faff;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <span style="font-size:0.7em; background:#4f46e5; color:white; padding:2px 8px; border-radius:20px; font-weight:bold;">SALAIRES DU MOIS</span>
                                        <div style="font-weight:bold; color:#1e293b; margin-top:4px;">Personnel Enseignant</div>
                                    </div>
                                    <div style="font-weight:900; color:#d93025;" id="montantGlobalSalaire">-${sumSalaires.toLocaleString()} FCFA</div>
                                </div>
                                <button onclick="ouvrirListeProfesseurs()" style="margin-top:10px; width:100%; background:#4f46e5; color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:bold;">📋 Détails professeurs</button>
                            </div>` + html;
                            dejaAfficheSalaire = true;
                        }
                    } else if (moisD === moisActuel) {
                        html += `
                        <div style="background:white; padding:12px; border-radius:12px; margin-bottom:10px; border:1px solid #e2e8f0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <span style="font-size:0.7em; background:#f59e0b; color:white; padding:2px 8px; border-radius:20px; font-weight:bold;">${d.categorie}</span>
                                    <div style="font-weight:bold; color:#1e293b; margin-top:4px;">${d.motif}</div>
                                    <small style="color:gray;">${d.dateFr || ''}</small>
                                </div>
                                <div style="font-weight:900; color:#d93025;">-${m.toLocaleString()} FCFA</div>
                            </div>
                        </div>`;
                    }
                });
            }

            // --- CORRECTION DES IDs ICI ---
            // Vérifie si l'élément existe avant de changer le texte pour éviter l'erreur de console
            const elSalaires = document.getElementById('totalSalaires') || document.getElementById('totalSalairesModal');
            const elAutres = document.getElementById('totalAutres') || document.getElementById('totalAutresModal');
            const elSolde = document.getElementById('soldeInfo');
            const elHisto = document.getElementById('historiqueDepensesModal');

            if (elSalaires) elSalaires.innerText = sumSalaires.toLocaleString() + " FCFA";
            if (elAutres) elAutres.innerText = sumAutres.toLocaleString() + " FCFA";
            if (elHisto) elHisto.innerHTML = html || "<p style='text-align:center; color:gray; padding:20px;'>Aucune dépense ce mois-ci.</p>";
            
            const soldeFinal = totalRecettes - (sumSalaires + sumAutres);
            if (elSolde) elSolde.innerText = soldeFinal.toLocaleString() + " FCFA";
            
            if(dejaAfficheSalaire && document.getElementById('montantGlobalSalaire')) {
                document.getElementById('montantGlobalSalaire').innerText = "-" + sumSalaires.toLocaleString() + " FCFA";
            }
        });
    } catch (e) { console.error("Erreur dans ouvrirModalDepense:", e); }
}
async function validerDepense() {
    const motifElt = document.getElementById('motif');
    const montantElt = document.getElementById('montant');
    const categorieElt = document.getElementById('catDepense');

    const motif = motifElt.value;
    const montant = parseInt(montantElt.value);
    const categorie = categorieElt.value;

    if (!motif || !montant) {
        return Swal.fire({ icon: 'warning', title: 'Attention', text: 'Remplissez le motif et le montant.' });
    }

    try {
        const nouvelleDepenseRef = window.db.ref(`schools/lyce_excellence/depenses`).push();
        
        await nouvelleDepenseRef.set({
            motif: motif,
            montant: montant,
            categorie: categorie,
            date: new Date().toISOString(),
            dateFr: new Date().toLocaleDateString('fr-FR'),
            anneeScolaire: "2025-2026"
        });

        // Notification moderne et rapide
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });

        Toast.fire({
            icon: 'success',
            title: 'Dépense enregistrée'
        });

        // --- LA MAGIE EST ICI ---
        // 1. On vide les champs pour la saisie suivante
        motifElt.value = "";
        montantElt.value = "";
        
        // 2. On relance le calcul du solde et l'historique sans fermer le modal
        ouvrirModalDepense(); 

    } catch (error) {
        console.error("Erreur :", error);
        Swal.fire('Erreur', 'Problème de connexion', 'error');
    }
}
function ouvrirListeProfesseurs() {
    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';
    const conteneur = document.getElementById('contenuListeProfs');
    
    document.getElementById('modalListeProfs').style.display = 'flex';

    // .on permet de mettre à jour la liste automatiquement si on ajoute un prof
    window.db.ref(`schools/${schoolID}/professeurs`).on('value', (snap) => {
        let html = "";
        if (snap.exists()) {
            snap.forEach((child) => {
                const prof = child.val();
                html += `
                    <div onclick="ouvrirFicheProf('${prof.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#f8fafc; border-radius:12px; margin-bottom:10px; cursor:pointer; border:1px solid #e2e8f0;">
                        <div>
                            <div style="font-weight:bold; color:#1e293b;">${prof.nom}</div>
                            <small>📚 ${prof.matiere}</small>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:#10b981; font-weight:bold;">${prof.salaireJournalier} FCFA/j</div>
                            <span style="font-size:0.8em; color:#4f46e5;">Ouvrir la fiche →</span>
                        </div>
                    </div>`;
            });
            conteneur.innerHTML = html;
        } else {
            conteneur.innerHTML = "<p style='text-align:center;'>Aucun prof enregistré.</p>";
        }
    });
}
function fermerListeEtRevenir() {
    // 1. On cache la liste
    document.getElementById('modalListeProfs').style.display = 'none';
    
    // 2. On ré-affiche le menu de gestion des dépenses
    document.getElementById('modalDepense').style.display = 'flex';
}

function ouvrirModalAjoutProf() {
    document.getElementById('modalAddProf').style.display = 'flex';
}

async function enregistrerProfesseur() {
    const nom = document.getElementById('profNom').value;
    const matiere = document.getElementById('profMatiere').value;
    const salaireBase = document.getElementById('profSalaireJour').value;

    // Récupère l'école actuelle (ex: lyce_excellence)
    // IMPORTANT: Assure-toi que schoolID est bien défini dans ton app
    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence'; 

    if (!nom || !salaireBase) {
        return alert("Veuillez remplir le nom et le salaire par jour.");
    }

    try {
        const profRef = window.db.ref(`schools/${schoolID}/professeurs`).push();
        await profRef.set({
            id: profRef.key,
            nom: nom,
            matiere: matiere,
            salaireJournalier: parseInt(salaireBase),
            dateAjout: new Date().toLocaleDateString('fr-FR')
        });

        alert("Professeur enregistré !");
        document.getElementById('modalAddProf').style.display = 'none';
        
        // Reset des champs
        document.getElementById('profNom').value = "";
        document.getElementById('profMatiere').value = "";
        document.getElementById('profSalaireJour').value = "";

    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'enregistrement.");
    }
}
// On écoute le changement de catégorie
// On récupère l'élément une seule fois
const selectCat = document.getElementById('catDepense');

// On vérifie s'il existe avant de lui ajouter l'écouteur
if (selectCat) {
    selectCat.addEventListener('change', function() {
        const conteneur = document.getElementById('conteneurMotif'); 
        const categorie = this.value;
        const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';

        if (!conteneur) return; // Sécurité supplémentaire

        if (categorie === "Salaire") {
            conteneur.innerHTML = `<select id="motif" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;">
                                        <option>Chargement...</option>
                                   </select>`;
            
            window.db.ref(`schools/${schoolID}/professeurs`).once('value', (snapshot) => {
                let options = '<option value="">Choisir un professeur...</option>';
                snapshot.forEach((child) => {
                    const prof = child.val();
                    options += `<option value="Salaire ${prof.nom}">${prof.nom}</option>`;
                });
                const motifSelect = document.getElementById('motif');
                if (motifSelect) motifSelect.innerHTML = options;
            });
        } else {
            conteneur.innerHTML = `<input type="text" id="motif" placeholder="Précisez le motif..." style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1;">`;
        }
    });
}

async function ouvrirFicheProf(id) {
    profSelectionneId = id;
    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';
    
    // 1. Affichage des modals
    document.getElementById('modalFicheProf').style.display = 'flex';
    document.getElementById('modalListeProfs').style.display = 'none';

    // 2. Mise à jour de la date du jour sur la fiche
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateAujourdhui').innerText = new Date().toLocaleDateString('fr-FR', options);

    try {
        // 3. Récupération des infos du prof
        const snap = await window.db.ref(`schools/${schoolID}/professeurs/${id}`).once('value');
        const prof = snap.val();

        if (prof) {
            document.getElementById('ficheNomProf').innerText = prof.nom;
            document.getElementById('ficheMatiereProf').innerText = prof.matiere || "Enseignant";
            
            // 4. Lancement du calcul automatique (Jours pointés vs Salaire)
            actualiserCalculsFiche(id, prof.salaireJournalier);
        }
    } catch (e) {
        console.error("Erreur lors de l'ouverture de la fiche:", e);
    }
}
async function actualiserCalculsFiche(id, salaireJournalier) {
    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';
    const maintenant = new Date();
    const moisActuel = maintenant.getMonth() + 1; // Janvier = 1
    const anneeActuelle = maintenant.getFullYear();

    try {
        // On récupère tous les pointages du mois pour ce prof
        const pointagesSnap = await window.db.ref(`schools/${schoolID}/pointages`).once('value');
        let joursPresents = 0;

        pointagesSnap.forEach((jourSnap) => {
            const dateCle = jourSnap.key; // Format YYYY-MM-DD
            const [annee, mois] = dateCle.split('-');
            
            // On vérifie si c'est le bon mois/année et si le prof était présent
            if (parseInt(annee) === anneeActuelle && parseInt(mois) === moisActuel) {
                if (jourSnap.hasChild(id) && jourSnap.child(id).val().present === true) {
                    joursPresents++;
                }
            }
        });

        // Mise à jour de l'affichage sur la fiche
        const totalDu = joursPresents * salaireJournalier;
        document.getElementById('ficheJoursCount').innerText = joursPresents;
        document.getElementById('ficheTotalDu').innerText = totalDu.toLocaleString() + " FCFA";

    } catch (e) {
        console.error("Erreur calcul pointage:", e);
    }
}
function preparerPaiementDepuisFiche() {
    // 1. On récupère le montant calculé sur la fiche
    const montant = document.getElementById('ficheTotalDu').innerText.replace(/\D/g,'');
    const nom = document.getElementById('ficheNomProf').innerText;

    // 2. On ferme les modals de pointage
    document.getElementById('modalFicheProf').style.display = 'none';
    
    // 3. On remplit automatiquement le formulaire de dépense à gauche
    document.getElementById('catDepense').value = "Salaire";
    
    // On force le déclenchement du changement pour afficher le select
    document.getElementById('catDepense').dispatchEvent(new Event('change'));
    
    // Un petit délai pour laisser le temps au select de se charger
    setTimeout(() => {
        document.getElementById('motif').value = "Salaire " + nom;
        document.getElementById('montant').value = montant;
    }, 100);
}
async function pointerPresence() {
    if (!profSelectionneId) return;

    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD

    try {
        // On enregistre la présence
        await window.db.ref(`schools/${schoolID}/pointages/${today}/${profSelectionneId}`).set({
            present: true,
            timestamp: Date.now()
        });

        Swal.fire({
            title: "Pointé !",
            text: "Présence enregistrée pour aujourd'hui.",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
        });

        // RE-CALCUL IMMEDIAT : on récupère le salaire pour rafraîchir la fiche
        const snap = await window.db.ref(`schools/${schoolID}/professeurs/${profSelectionneId}`).once('value');
        actualiserCalculsFiche(profSelectionneId, snap.val().salaireJournalier);

    } catch (e) {
        console.error("Erreur pointage:", e);
        alert("Impossible d'enregistrer le pointage.");
    }
}


function changerMoisFiche() {
    const moisChoisi = document.getElementById('selectMoisFiche').value;
    const schoolID = localStorage.getItem('schoolID') || 'lyce_excellence';

    // On récupère le prof pour avoir son salaire journalier
    window.db.ref(`schools/${schoolID}/professeurs/${profSelectionneId}`).once('value', (snap) => {
        if (snap.exists()) {
            actualiserCalculsFiche(profSelectionneId, snap.val().salaireJournalier, parseInt(moisChoisi));
        }
    });
}
function ouvrirModalHistoriqueComplet() {
    const modal = document.getElementById('modalHistoriquePaiements');
    const tbody = document.getElementById('bodyHistoriqueComplet');
    
    // RÉCUPÉRATION EXACTE SELON TON CODE
    // On utilise la même logique que ta fonction loadDashboardData()
    const sId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;
    const yearToLoad = anneeConsultation; // Utilise l'année du sélecteur d'archive

    if (!sId) {
        console.error("ID École introuvable");
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red; padding:20px;">Erreur : ID École introuvable.</td></tr>';
        modal.style.display = 'flex';
        return;
    }

    // LE CHEMIN EXACT (Vérifié selon ton export Excel et loadDashboardData)
    // Note : Ton code existant pointe vers : schools/ID/ANNEE/paiements
    const path = `schools/${sId}/${yearToLoad}/paiements`;

    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">🔍 Chargement de l\'historique ' + yearToLoad + '...</td></tr>';

    // On utilise "db" qui est déjà défini dans ton dashboard.js
    db.ref(path).once('value', (snapshot) => {
        let rows = '';
        if (snapshot.exists()) {
            const data = [];
            snapshot.forEach((child) => {
                let p = child.val();
                data.push(p);
            });

            // Inverser pour voir les plus récents en premier
           data.reverse().forEach((p) => {
                // 1. RÉCUPÉRATION DES DONNÉES (Adaptée à ta structure Firebase)
                const date = p.date || '--/--/----';
                const nom = p.nomEleve || p.nom || 'Anonyme';
                const classe = p.classe || p.eleveClasse || '---';
                const montant = parseFloat(p.montantTotal || p.montant || 0);
                const mode = p.methode || p.mode || 'Espèces';
                
                // On récupère le motif (mois payé, libellé ou type de frais)
                const motif = p.motif || p.libelle || p.mois || "Scolarité";

                // 2. GÉNÉRATION DE LA LIGNE HTML
                rows += `
                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                    <td style="padding:12px; font-size:0.85em; color:#64748b;">${date}</td>
                    <td style="padding:12px; font-weight:bold; color:#1e293b;">${nom.toUpperCase()}</td>
                    <td style="padding:12px;"><span style="background:#eef2ff; color:#4f46e5; padding:4px 8px; border-radius:6px; font-size:0.8em; font-weight:bold;">${classe}</span></td>
                    <td style="padding:12px; color:#64748b; font-size:0.9em;">${motif}</td>
                    <td style="padding:12px; color:#10b981; font-weight:900;">${montant.toLocaleString('fr-FR')} FCFA</td>
                    <td style="padding:12px;"><span style="font-size:0.8em; background:#f1f5f9; padding:4px 10px; border-radius:20px; color:#475569;">${mode}</span></td>
                </tr>`;
            });
            tbody.innerHTML = rows;
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#64748b;">Aucune transaction trouvée pour l'année ${yearToLoad}.</td></tr>`;
        }
    }).catch(error => {
        console.error("Erreur historique:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red; padding:20px;">Erreur de chargement.</td></tr>';
    });
}

// Recherche dynamique (Nom ou Classe)
function filtrerTableauHistorique() {
    const input = document.getElementById('searchPaiementHistorique');
    const filter = input.value.toUpperCase();
    const tr = document.getElementById('bodyHistoriqueComplet').getElementsByTagName('tr');

    for (let i = 0; i < tr.length; i++) {
        const tdNom = tr[i].getElementsByTagName('td')[1]; // Colonne Nom
        const tdClasse = tr[i].getElementsByTagName('td')[2]; // Colonne Classe
        
        if (tdNom || tdClasse) {
            const txtNom = tdNom.textContent || tdNom.innerText;
            const txtClasse = tdClasse.textContent || tdClasse.innerText;
            
            if (txtNom.toUpperCase().indexOf(filter) > -1 || txtClasse.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}
async function imprimerHistoriqueComplet() {
    // 1. RÉCUPÉRATION DYNAMIQUE DU NOM DE L'ÉCOLE (Via son ID Firebase)
    const sId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;
    let ecoleNom = "Établissement Scolaire";
    
    try {
        // On récupère le nom configuré dans la base pour cette école précise
        const configSnap = await db.ref(`schools/${sId}/config/nom`).once('value');
        if (configSnap.exists()) {
            ecoleNom = configSnap.val();
        } else {
            // Repli sur le nom de l'utilisateur si la config n'a pas de nom
            ecoleNom = document.getElementById('userDisplay') ? document.getElementById('userDisplay').innerText : "Établissement";
        }
    } catch(e) { 
        console.error("Erreur récupération nom école:", e);
    }

    const annee = typeof anneeConsultation !== 'undefined' ? anneeConsultation : "2025-2026";
    const lignes = document.getElementById('bodyHistoriqueComplet').querySelectorAll('tr');
    
    if (lignes.length === 0 || (lignes.length === 1 && lignes[0].innerText.includes("Aucun"))) {
        Swal.fire("Liste vide", "Aucune transaction à imprimer.", "info");
        return;
    }

    // 2. Préparation des données et calcul des totaux
    let contenuTableau = "";
    let compteurLignes = 0;
    let sommeTotale = 0;

    lignes.forEach(tr => {
        if (tr.style.display !== "none") {
            contenuTableau += `<tr>${tr.innerHTML}</tr>`;
            compteurLignes++;
            
            // Le montant est maintenant à l'index 4 (5ème colonne) car le Motif est à l'index 3
            const tdMontant = tr.getElementsByTagName('td')[4]; 
            if (tdMontant) {
                const montantNum = parseFloat(tdMontant.innerText.replace(/[^0-9]/g, '')) || 0;
                sommeTotale += montantNum;
            }
        }
    });

    // 3. Génération du document
    const fenetreImpression = window.open('', '', 'height=800,width=1000');
    fenetreImpression.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Journal des Paiements - ${ecoleNom}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
                .header { text-align: center; border-bottom: 3px solid #1e293b; margin-bottom: 20px; padding-bottom: 10px; }
                .header h2 { margin: 0; color: #1e293b; text-transform: uppercase; }
                .info-bar { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; font-weight: bold; background: #f1f5f9; padding: 10px; border-radius: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 11px; }
                th { background-color: #f8fafc; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
                thead { display: table-header-group; }
                .total-box { margin-top: 20px; text-align: right; font-size: 16px; border-top: 2px solid #1e293b; padding-top: 10px; }
                .footer { position: fixed; bottom: 0; width: 100%; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 5px; }
                @media print {
                    body { padding: 20px; }
                    tr { page-break-inside: avoid; }
                    @page { margin: 1cm; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>${ecoleNom.toUpperCase()}</h2>
                <div style="font-size: 14px; margin-top: 5px;">Journal Complet des Transactions Financières</div>
            </div>
            <div class="info-bar">
                <span>ANNÉE SCOLAIRE : ${annee}</span>
                <span>NBRE DE PAIEMENTS : ${compteurLignes}</span>
                <span>DATE D'ÉDITION : ${new Date().toLocaleString('fr-FR')}</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Nom de l'élève</th>
                        <th>Classe</th>
                        <th>Motif / Libellé</th>
                        <th>Montant (FCFA)</th>
                        <th>Mode</th>
                    </tr>
                </thead>
                <tbody>${contenuTableau}</tbody>
            </table>
            <div class="total-box">
                <strong>TOTAL GÉNÉRAL : ${sommeTotale.toLocaleString('fr-FR')} FCFA</strong>
            </div>
            <div class="footer">Document officiel EduPay Congo - La gestion numérique de l'éducation.</div>
            <script>
                window.onload = function() { 
                    setTimeout(() => { window.print(); window.close(); }, 500);
                }
            </script>
        </body>
        </html>
    `);
    fenetreImpression.document.close();
}