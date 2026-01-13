// js/admin-dashboard.js

// 1. Vérification de sécurité au chargement
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const snap = await db.ref(`users/${user.uid}`).once('value');
            const userData = snap.val();

            if (userData && userData.role === 'super_admin') {
                console.log("✅ Accès Super Admin confirmé.");
                document.getElementById('adminUser').innerText = "Maître " + (userData.name || "Admin");
                chargerToutesLesEcoles();
                actualiserStats();
                ecouterNouveauxAmbassadeurs();
            } else {
                console.error("🚫 Accès refusé : Rôle insuffisant.");
                window.location.replace('index.html');
            }
        } catch (e) {
            console.error("❌ Erreur lors de la vérification du profil :", e);
        }
    } else {
        window.location.replace('index.html');
    }
});

// --- GESTION DES MODALS ---
window.ouvrirModal = function() {
    document.getElementById('modalCreation').style.display = 'flex';
};

window.fermerModal = function() {
    document.getElementById('modalCreation').style.display = 'none';
};

// 2. Charger la liste des écoles
function chargerToutesLesEcoles() {
    console.log("📡 Branchement sur le nœud /schools...");
    
    db.ref('schools').on('value', (snapshot) => {
        const tableBody = document.querySelector('#schoolsTable tbody');
        if (!tableBody) return;

        const data = snapshot.val();
        if (!data) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Aucun établissement enregistré.</td></tr>';
            return;
        }

        tableBody.innerHTML = "";

        snapshot.forEach((schoolSnap) => {
            const schoolId = schoolSnap.key;
            const schoolData = schoolSnap.val();
            const config = schoolData.config;
            const info = schoolData.info;

            if (config) {
                const expDate = new Date(config.expiration);
                const today = new Date();
                const diffTime = expDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                const statusColor = (config.statut === "bloqué" || diffDays < 0) ? "#ef4444" : "#22c55e";
                const anneeEnCours = config.currentYear || "2025-2026";

                // --- BOUTON WHATSAPP PERMANENT ---
                // --- BOUTON WHATSAPP AVEC LOGO OFFICIEL ---
               let waBtn = "";
               if (info && info.phone) {
                  const cleanPhone = info.phone.replace(/\s+/g, '').replace('+', '');
                  const waUrl = `https://wa.me/${cleanPhone}?text=Bonjour%20Directeur%20de%20${encodeURIComponent(info.nom)}`;
    
                 waBtn = `
                     <a href="${waUrl}" target="_blank" style="margin-right: 8px; transition: transform 0.2s; display: inline-block;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
                         alt="WhatsApp" 
                 style="width: 30px; height: 30px; vertical-align: middle;">
                             </a>
                      `;
                }
                
                const row = `
                    <tr>
                        <td>
                            <span class="school-link-btn" onclick="ouvrirAnalyse('${schoolId}', '${info ? info.nom.replace(/'/g, "\\'") : schoolId}')" style="color: #3b82f6; font-weight: bold; cursor: pointer; text-decoration: underline;">
                                ${info ? info.nom : schoolId}
                            </span>
                            <br><small style="color: #94a3b8;">${schoolId}</small>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background: #f0f4f8; padding: 3px 7px; border-radius: 4px; font-weight: bold; font-size: 12px; color: #1a73e8;">
                                    ${anneeEnCours}
                                </span>
                                <button class="btn-opt" onclick="modifierAnneeScolaire('${schoolId}', '${anneeEnCours}')" style="background:none; border:none; cursor:pointer; padding:0; font-size:14px;">✏️</button>
                            </div>
                        </td>
                        <td>${config.expiration || 'Non définie'}</td>
                        <td style="color: ${statusColor}; font-weight: bold;">
                            ${diffDays < 0 ? "Expiré" : diffDays + " j restants"}
                        </td>
                        <td>
                            <span style="padding: 4px 8px; border-radius: 4px; background: ${statusColor}; color: white; font-size: 11px;">
                                ${(config.statut || 'actif').toUpperCase()}
                            </span>
                        </td>
                        <td>
                            ${waBtn} <button class="btn-opt" onclick="prolongerEcole('${schoolId}')">➕ 30j</button>
                            <button class="btn-opt" onclick="toggleStatut('${schoolId}', '${config.statut}')">
                                ${config.statut === 'actif' ? '🚫' : '✅'}
                            </button>
                            <button class="btn-opt" onclick="supprimerEcole('${schoolId}', '${info ? info.nom : schoolId}')" style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca;">
                                🗑️
                            </button>
                        </td>
                    </tr>`;
                tableBody.innerHTML += row;
            }
        });
    });
}

// 3. Analyse Stratégique (La nouvelle fonction pour ton clic sur le nom)
window.ouvrirAnalyse = async function(id, nom) {
    const modal = document.getElementById('modalAnalyse');
    if (!modal) return;
    
    modal.style.display = 'flex';
    document.getElementById('analyseSchoolName').innerText = "Analyse : " + nom;
    
    // Reset affichage pendant le chargement
    document.getElementById('stratTotalEleves').innerText = "Chargement...";
    document.getElementById('stratTotalCash').innerText = "Chargement...";

    try {
        // Récupérer l'année en cours pour cette école
        const configSnap = await db.ref(`schools/${id}/config`).once('value');
        const currentYear = configSnap.val()?.currentYear || "2025-2026";

        // 1. Compter les élèves
        const snapEleves = await db.ref(`schools/${id}/${currentYear}/students`).once('value');
        const count = snapEleves.numChildren() || 0;
        document.getElementById('stratTotalEleves').innerText = count + " élèves";

        // 2. Calculer le CA encaissé par l'école
        const snapPay = await db.ref(`schools/${id}/${currentYear}/paiements`).once('value');
        let total = 0;
        snapPay.forEach(p => {
            total += parseFloat(p.val().montantTotal || 0);
        });
        document.getElementById('stratTotalCash').innerText = total.toLocaleString() + " FCFA";
        
        // 3. Calcul Gain Master (Exemple : Forfait fixe 50k ou 10% du CA)
        // Ici on garde ton affichage fixe ou on peut mettre un calcul
        document.getElementById('stratMasterGain').innerText = "50 000 FCFA";

    } catch (e) {
        console.error("Erreur analyse :", e);
        document.getElementById('stratTotalEleves').innerText = "Erreur";
    }
};

// --- LE RESTE DES FONCTIONS RESTE INCHANGÉ ---

async function creerEcoleEtDirecteur() {
    // 1. On récupère les valeurs du formulaire IMMÉDIATEMENT
    const schoolName = document.getElementById('newSchoolName').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value; 
    const phone = document.getElementById('adminPhone').value.trim();
    const dateExpManual = document.getElementById('newExpDate').value;
    const logoUrl = document.getElementById('schoolLogoUrl') ? document.getElementById('schoolLogoUrl').value.trim() : "";

    // 2. Vérifications de base
    if (!schoolName || !email || !pass || !dateExpManual) {
        Swal.fire("Incomplet", "Remplissez tous les champs.", "warning");
        return;
    }

    if (pass.length < 6) {
        Swal.fire("Sécurité", "Le mot de passe doit faire au moins 6 caractères.", "error");
        return;
    }

    // Génération de l'ID unique pour l'école
    const schoolId = schoolName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-]+/g, '');

    Swal.fire({ title: 'Création en cours...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    // --- TECHNIQUE SECONDAIRE POUR GARDER LA SESSION ADMIN ---
    // On crée une instance "fantôme" de Firebase pour créer le compte du directeur
    let secondaryApp;
    try {
        secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
    } catch (e) {
        // Au cas où l'instance existe déjà
        secondaryApp = firebase.app("Secondary");
    }

    try {
        // 3. Vérifier si l'école existe déjà dans la base
        const check = await db.ref(`schools/${schoolId}`).once('value');
        if (check.exists()) throw new Error("Cet identifiant d'école existe déjà.");

        // 4. Créer le compte Auth avec l'instance secondaire (ne nous déconnecte pas)
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const uid = userCredential.user.uid;

        // 5. Préparer les données pour la base
        const updates = {};
        // Création du profil utilisateur
        updates[`users/${uid}`] = { 
            name: "Directeur " + schoolName, 
            role: "admin", 
            schoolId: schoolId, 
            email: email 
        };
        // Création des infos de l'école
        updates[`schools/${schoolId}/info`] = { 
            nom: schoolName, 
            adminEmail: email, 
            phone: phone,
            dateCreation: new Date().toISOString(), 
            logo: logoUrl 
        };
        // Création de la config (utilisée par ton tableau de bord)
        updates[`schools/${schoolId}/config`] = { 
            expiration: dateExpManual, 
            statut: "actif", 
            currentYear: "2025-2026", 
            logo: logoUrl,
            codeDirection: pass 
        };

        // 6. Envoi vers la base (Ici on utilise l'instance principale 'db')
        await db.ref().update(updates);

        // 7. Nettoyage : On déconnecte et on supprime l'instance secondaire
        await secondaryApp.auth().signOut();
        await secondaryApp.delete();

        Swal.fire("Succès", `L'établissement ${schoolName} a été créé avec succès !`, "success");
        fermerModal();

    } catch (error) {
        console.error("Erreur détaillée:", error);
        
        // Si l'instance secondaire a été créée, on essaie de la nettoyer en cas d'erreur
        if (secondaryApp) await secondaryApp.delete().catch(() => {});

        Swal.fire("Erreur", error.message, "error");
    }
}

window.prolongerEcole = (id) => {
    const ref = db.ref(`schools/${id}/config/expiration`);
    ref.once('value', (snap) => {
        let current = new Date(snap.val() || new Date());
        current.setDate(current.getDate() + 30);
        ref.set(current.toISOString().split('T')[0]);
    });
};

window.toggleStatut = (id, currentStatus) => {
    const newStatus = currentStatus === 'actif' ? 'bloqué' : 'actif';
    db.ref(`schools/${id}/config/statut`).set(newStatus);
};

window.supprimerEcole = (id, nom) => {
    Swal.fire({
        title: `Supprimer ${nom} ?`,
        text: "Action irréversible !",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Supprimer'
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`schools/${id}`).remove()
                .then(() => Swal.fire("Supprimé", "", "success"))
                .catch(err => Swal.fire("Erreur", err.message, "error"));
        }
    });
};

window.modifierAnneeScolaire = (schoolId, currentYear) => {
    Swal.fire({
        title: 'Changement d\'année',
        input: 'text',
        inputValue: currentYear,
        showCancelButton: true,
        confirmButtonText: 'Confirmer',
        inputValidator: (value) => { if (!value) return 'Champ obligatoire !' }
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`schools/${schoolId}/config/currentYear`).set(result.value);
        }
    });
};

function actualiserStats() {
    db.ref('schools').on('value', snap => {
        const schools = snap.val() || {};
        const total = Object.keys(schools).length;
        let actifs = 0; let alertes = 0; const today = new Date();
        Object.values(schools).forEach(s => {
            if (s.config) {
                if (s.config.statut === "actif") actifs++;
                const exp = new Date(s.config.expiration);
                if ((exp - today) / 86400000 <= 7) alertes++;
            }
        });
        if(document.getElementById('totalSchools')) document.getElementById('totalSchools').innerText = total;
        if(document.getElementById('activeSubs')) document.getElementById('activeSubs').innerText = actifs;
        if(document.getElementById('alertSubs')) document.getElementById('alertSubs').innerText = alertes;
    });
}

window.logoutMaster = function() {
    auth.signOut().then(() => window.location.replace('index.html'));
};

window.alertePasEncoreDispo = function() {
    Swal.fire("Accès à distance", "Le mode observation sera disponible prochainement.", "info");
};

// 1. Gestion des onglets
function switchTab(tabName) {
    const sectionEcoles = document.querySelector('.panel-header').parentElement; // Ton contenu actuel
    const sectionAmbassadeurs = document.getElementById('sectionAmbassadeurs');
    const schoolsTable = document.getElementById('schoolsTable');

    if (tabName === 'ambassadeurs') {
        // Masquer les écoles, afficher les ambassadeurs
        document.querySelector('.panel-header').style.display = 'none';
        schoolsTable.style.display = 'none';
        sectionAmbassadeurs.style.display = 'block';
        
        document.getElementById('tabAmbassadeurs').classList.add('active');
        document.getElementById('tabEcoles').classList.remove('active');
        
        chargerAmbassadeurs(); // Charger les données
    } else {
        // Retour aux écoles
        document.querySelector('.panel-header').style.display = 'flex';
        schoolsTable.style.display = 'table';
        sectionAmbassadeurs.style.display = 'none';
        
        document.getElementById('tabEcoles').classList.add('active');
        document.getElementById('tabAmbassadeurs').classList.remove('active');
    }
}

// 2. Récupération des candidats depuis Firebase
/**
 * GESTION DES AMBASSADEURS
 */

// Ouvrir la fenêtre modale
function ouvrirGestionAmbassadeurs() {
    document.getElementById('modalAmbassadeurs').style.display = 'flex';
    chargerAmbassadeurs();
}

// Fermer la fenêtre modale
function fermerModalAmbassadeurs() {
    document.getElementById('modalAmbassadeurs').style.display = 'none';
}

// Récupérer et afficher les candidats
function chargerAmbassadeurs() {
    const list = document.getElementById('ambassadeursList');
    if(!list) return;

    db.ref('candidats_ambassadeurs').on('value', (snapshot) => {
        list.innerHTML = '';
        
        if (!snapshot.exists()) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Aucune candidature.</td></tr>';
            return;
        }

        snapshot.forEach((child) => {
            const data = child.val();
            const id = child.key;
            const phoneClean = data.whatsapp ? data.whatsapp.replace(/\D/g, '') : '';

            list.innerHTML += `
                <tr>
                    <td style="font-size: 11px;">${new Date(data.dateCandidature).toLocaleDateString()}</td>
                    <td><b>${data.nom}</b></td>
                    <td style="font-size: 12px;">${data.ville} / ${data.quartier}</td>
                    <td><a href="https://wa.me/${phoneClean}" target="_blank" style="color:green; font-weight:bold; text-decoration:none;">WhatsApp</a></td>
                    <td>
                        <button onclick="voirPitch(\`${(data.pitch || "").replace(/'/g, "&apos;")}\`)" style="cursor:pointer;">💡 Pitch</button>
                        <a href="${data.cvUrl}" target="_blank" style="margin-left:5px; color:blue;">📄 Voir CV</a>
                    </td>
                    <td>
                        <select onchange="updateStatutAmbassadeur('${id}', this.value)">
                            <option value="Nouveau" ${data.statut === 'Nouveau' ? 'selected' : ''}>Nouveau</option>
                            <option value="Retenu" ${data.statut === 'Retenu' ? 'selected' : ''}>Retenu</option>
                            <option value="Refusé" ${data.statut === 'Refusé' ? 'selected' : ''}>Refusé</option>
                        </select>
                    </td>
                </tr>`;
        });
    });
}
// Voir la motivation du candidat
function voirPitch(pitch) {
    Swal.fire({
        title: 'Motivation du candidat',
        text: pitch,
        icon: 'info',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Fermer'
    });
}

// Mettre à jour le statut dans Firebase
function updateStatutAmbassadeur(id, newStatus) {
    db.ref(`candidats_ambassadeurs/${id}`).update({ statut: newStatus })
    .then(() => {
        Swal.fire({ 
            title: 'Statut mis à jour !', 
            icon: 'success', 
            toast: true, 
            position: 'top-end', 
            showConfirmButton: false, 
            timer: 2000 
        });
    });
}
// Fonction pour compter les nouveaux candidats et afficher le badge rouge
function ecouterNouveauxAmbassadeurs() {
    db.ref('candidats_ambassadeurs').on('value', snap => {
        let count = 0;
        snap.forEach(c => { 
            if(c.val().statut === "Nouveau") count++; 
        });
        const badge = document.getElementById('badgeAmbassadeur');
        if(badge) {
            badge.innerText = count;
            badge.style.display = count > 0 ? 'block' : 'none';
        }
    });
}

// Fonction pour changer le statut (quand tu cliques sur le menu déroulant)
window.updateStatutAmbassadeur = function(id, newStatus) {
    db.ref(`candidats_ambassadeurs/${id}`).update({ statut: newStatus })
      .then(() => {
          Swal.fire({ title: 'Statut mis à jour', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
      });
};