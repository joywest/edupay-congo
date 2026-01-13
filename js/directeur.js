let directionDeconnectee = true; // Par défaut, tout est bloqué
// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCUtkYNEItc-sI9_IIyfzxVNnpN_gj7UEA",
    databaseURL: "https://gestion-paiements-ecole-default-rtdb.firebaseio.com",
    projectId: "gestion-paiements-ecole"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

window.onload = function() {
    // 1. GESTION DE LA DATE
    const afficherDate = () => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const aujourdhui = new Date().toLocaleDateString('fr-FR', options);
        
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            dateEl.innerText = aujourdhui.charAt(0).toUpperCase() + aujourdhui.slice(1);
        }
    };

    afficherDate();

    // 2. GESTION DE L'AUTHENTIFICATION ET DES DONNÉES
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            window.currentSchoolId = localStorage.getItem('currentSchoolId') || "lyce_excellence";
            
            // RÉCUPÉRATION DU NOM DE L'ÉCOLE
            db.ref(`schools/${window.currentSchoolId}/info/nom`).on('value', (snap) => {
                const nomEcole = snap.val() || "Lycée Excellence";
                const sideName = document.getElementById('schoolNameSidebar');
                if (sideName) {
                    sideName.innerText = nomEcole;
                }
                document.title = nomEcole + " | Rapport Financier";
            });

            // --- SÉCURITÉ CADENAS POUR LA SECRÉTAIRE ---
            db.ref(`users/${user.uid}`).once('value').then((snapshot) => {
                const userData = snapshot.val();
                if (userData && userData.role === 'secretaire') {
                    activerVerrouVisuel();
                } else {
                    chargerRapport();
                }
            });

        } else {
            window.location.href = "index.html";
        }
    });
};

// --- FONCTION DE SÉCURITÉ (CADENAS) ---
function activerVerrouVisuel() {
    const elImpayes = document.getElementById('totalImpayes');
    if (elImpayes) elImpayes.innerHTML = "🔒 <i>Verrouillé</i>";

    const elTaux = document.getElementById('tauxRecouvrement');
    if (elTaux) elTaux.innerText = "🔒";

    const corps = document.getElementById('liste');
    if (corps) {
        corps.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:40px;">
                    <div style="background:#fff3cd; padding:20px; border-radius:10px; border:1px solid #ffeeba; display:inline-block;">
                        <h3 style="margin:0 0 10px 0; color:#856404;">🔒 Accès Restreint</h3>
                        <p style="margin-bottom:15px;">Le rapport financier est protégé par un code Direction.</p>
                        <button onclick="demanderCodeAcces()" style="background:#8b5cf6; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">
                            Saisir le Code de Déblocage
                        </button>
                    </div>
                </td>
            </tr>`;
    }
}

// --- FONCTION DE DÉBLOCAGE DYNAMIQUE ---
async function demanderCodeAcces() {
    // 1. RÉCUPÉRATION DE LA BASE (Correction de l'erreur 'ref')
    const database = window.db || (window.firebase ? window.firebase.database() : null);
    
    if (!database) {
        Swal.fire("Erreur", "Le système de base de données n'est pas prêt.", "error");
        return;
    }

    // 2. FORCE L'ID (Correction du 'system')
    let sId = localStorage.getItem('currentSchoolId');
    
    // Si c'est "system" ou vide, on force l'accès à ton école pour le test
    if (!sId || sId === "system" || sId === "null") {
        sId = "lyce_excellence"; 
    }

    const { value: passwordSaisi } = await Swal.fire({
        title: 'Validation Direction',
        input: 'password',
        inputLabel: 'Saisissez le mot de passe du Directeur',
        showCancelButton: true,
        confirmButtonColor: '#8b5cf6'
    });

    if (passwordSaisi) {
        try {
            // Chemin exact selon ta structure
            const cheminRoot = `schools/${sId}/config/codeDirection`;
            console.log("🔍 Tentative de connexion sur :", cheminRoot);

            const snap = await database.ref(cheminRoot).once('value');
            const codeCorrect = snap.val();

            if (codeCorrect && String(passwordSaisi).trim() === String(codeCorrect).trim()) {
                sessionStorage.setItem('directionDebloquee', 'true'); 
                Swal.fire("Accès Autorisé", "Données déverrouillées", "success");
                
                if (typeof chargerRapport === "function") {
                    chargerRapport(); 
                }
            } else {
                Swal.fire("Échec", "Le code de direction est incorrect.", "error");
            }
        } catch (error) {
            console.error("🔥 Erreur détaillée:", error);
            Swal.fire("Erreur", "Impossible de lire la base de données.", "error");
        }
    }
}
async function chargerRapport() {
    const dejaDebloque = sessionStorage.getItem('directionDebloquee');
    if (dejaDebloque === 'true') directionDeconnectee = false;
    if (directionDeconnectee) { activerVerrouVisuel(); return; }

    verifierStatutAppel();

    const schoolId = window.currentSchoolId || localStorage.getItem('currentSchoolId') || "lyce_excellence";
    const corps = document.getElementById('liste');
    const selectEl = document.getElementById('selectMois');
    const moisCible = selectEl ? selectEl.value : "all";
    const selectClasseEl = document.getElementById('selectClasse');
    const classeCible = selectClasseEl ? selectClasseEl.value.toLowerCase().trim() : "all";
    
    // On récupère le nom du mois (ex: "Janvier") pour le filtrage des paiements
    const moisTexteCible = selectEl ? selectEl.options[selectEl.selectedIndex].text.split(' ')[0] : "";

    try {
        const snapConfig = await db.ref(`schools/${schoolId}/config`).once('value');
        const config = snapConfig.val() || {};
        const anneeScolaire = config.currentYear || "2025-2026";

        // 1. RÉCUPÉRATION DES TARIFS ET PAIEMENTS
        const [snapFrais, snapPaiements, snapEleves] = await Promise.all([
            db.ref(`schools/${schoolId}/${anneeScolaire}/frais_scolaires`).once('value'),
            db.ref(`schools/${schoolId}/${anneeScolaire}/paiements`).once('value'),
            db.ref(`schools/${schoolId}/${anneeScolaire}/students`).once('value')
        ]);

        const dataFrais = snapFrais.val() || {};
        const dataPaiements = snapPaiements.val() || {};
        const dataEleves = snapEleves.val() || {};

        let tarifsScolarite = {};
        Object.values(dataFrais).forEach(f => {
            const typeFrais = (f.type || f.libelle || "").toLowerCase().trim();
            if (typeFrais.includes("scolarit")) {
                const cl = (f.classe || "").toLowerCase().trim();
                tarifsScolarite[cl] = parseFloat(f.montant || 0);
            }
        });

        // --- NOUVEAU : CALCUL DU TOTAL INSCRIPTIONS POUR LE BOUTON (MIS À JOUR ICI) ---
        let totalInscriptionsPeriode = 0;
        Object.values(dataPaiements).forEach(p => {
            if (typeof filtrerDate === "function" && filtrerDate(p, moisCible, moisTexteCible)) {
                if (classeCible === "all" || (p.classe || "").toLowerCase().trim() === classeCible) {
                    
                    // --- AJOUT DE LA DÉTECTION HYBRIDE ---
                    if (p.inscription !== undefined) {
                        // Si c'est un import Excel (champ direct)
                        totalInscriptionsPeriode += parseFloat(p.inscription || 0);
                    } else {
                        // Sinon on cherche dans le texte comme avant (Enregistrement manuel)
                        const match = String(p.details || "").match(/Inscr[:\s]*(\d+)/i);
                        if (match) {
                            totalInscriptionsPeriode += parseFloat(match[1]);
                        }
                    }
                }
            }
        });

        // 2. ANALYSE DES ÉLÈVES (TABLEAU)
        let totalTheoriqueGlobal = 0;
        let totalDejaPayeGlobal = 0;
        let html = "";
        const listeEleves = Object.values(dataEleves).sort((a,b) => (a.nom || "").localeCompare(b.nom || ""));

        listeEleves.forEach(el => {
            const clEleve = (el.classe || "").toLowerCase().trim();
            const tarifAttendu = tarifsScolarite[clEleve] || 0;
            const paye = parseFloat(el.detailsFinanciers?.scolaritePayee || 0);

            if (classeCible === "all" || clEleve === classeCible) {
                totalTheoriqueGlobal += tarifAttendu;
                totalDejaPayeGlobal += paye;

                const reste = Math.max(0, tarifAttendu - paye);
                const pourcentage = tarifAttendu > 0 ? Math.min(Math.round((paye / tarifAttendu) * 100), 100) : 0;

                const statut = reste <= 0 
                    ? `<span class="badge-money" style="background:#d1fae5; color:#065f46; padding:4px 8px; border-radius:10px; font-size:11px;">À JOUR</span>`
                    : `<span class="badge-money" style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:10px; font-size:11px;">DOIT: ${reste.toLocaleString()} F</span>`;

                html += `
                    <tr style="border-bottom: 1px solid #f0f0f0;">
                        <td style="color:#1a73e8; font-weight:600; padding:12px 8px;">${clEleve.toUpperCase()}</td>
                        <td style="padding:12px 8px;"><b>${(el.nom || 'Inconnu').toUpperCase()}</b></td>
                        <td style="padding:12px 8px;">
                            <div style="display:flex; justify-content:space-between; font-size:10px; color:#666; margin-bottom:4px;">
                                <span>Progression: ${pourcentage}%</span>
                                <span>${paye.toLocaleString()} / ${tarifAttendu.toLocaleString()} F</span>
                            </div>
                            <div style="width:100%; background:#eee; height:6px; border-radius:3px; overflow:hidden;">
                                <div style="width:${pourcentage}%; background:${pourcentage >= 100 ? '#2ecc71' : '#8b5cf6'}; height:100%;"></div>
                            </div>
                        </td>
                        <td style="padding:12px 8px; text-align:right;">${statut}</td>
                    </tr>`;
            }
        });

        // 3. MISE À JOUR VISUELLE (SANTÉ FINANCIÈRE + BOUTON)
        const detteReelle = totalTheoriqueGlobal - totalDejaPayeGlobal;
        const tauxGlobal = totalTheoriqueGlobal > 0 ? Math.round((totalDejaPayeGlobal / totalTheoriqueGlobal) * 100) : 0;

        if (document.getElementById('totalImpayes')) {
            document.getElementById('totalImpayes').innerText = Math.max(0, detteReelle).toLocaleString() + " FCFA";
        }
        if (document.getElementById('tauxRecouvrement')) {
            document.getElementById('tauxRecouvrement').innerText = tauxGlobal + "%";
        }
        if (document.getElementById('barreProgression')) {
            document.getElementById('barreProgression').style.width = tauxGlobal + "%";
        }

        // MISE À JOUR DU BOUTON INSCRIPTION
        if (document.getElementById('totalInscriptionsDashboard')) {
            document.getElementById('totalInscriptionsDashboard').innerText = totalInscriptionsPeriode.toLocaleString() + " F";
        }

        if (corps) {
            corps.innerHTML = html || `<tr><td colspan='4' style='text-align:center; padding:20px;'>Aucun élève trouvé pour cette sélection.</td></tr>`;
        }

    } catch (e) {
        console.error("Erreur dans chargerRapport :", e);
    }
}
function filtrerDate(p, moisCible, moisTexteCible) {
    if (moisCible === "all") return true;
    if (p.mois === moisTexteCible) return true;
    if (p.date && p.date.includes('/')) {
        const parties = p.date.split('/');
        return (parseInt(parties[1]) + "-" + parties[2]) === moisCible;
    }
    return false;
}

async function calculerInscriptions() {
    // --- SÉCURITÉ AJOUTÉE ---
    // Vérifie si l'accès est verrouillé ET s'il n'y a pas d'autorisation en session
    if (directionDeconnectee && sessionStorage.getItem('directionDebloquee') !== 'true') {
        Swal.fire({
            icon: 'warning',
            title: 'Accès Verrouillé',
            text: 'Veuillez d\'abord déverrouiller le rapport financier avec le code Direction.',
            confirmButtonColor: '#8b5cf6'
        });
        return;
    }

    const schoolId = window.currentSchoolId || "lyce_excellence";
    const anneeScolaire = "2025-2026";

    try {
        const [snapP, snapE, snapF] = await Promise.all([
            db.ref(`schools/${schoolId}/${anneeScolaire}/paiements`).once('value'),
            db.ref(`schools/${schoolId}/${anneeScolaire}/students`).once('value'),
            db.ref(`schools/${schoolId}/${anneeScolaire}/frais_scolaires`).once('value')
        ]);

        const paiements = Object.values(snapP.val() || {});
        const eleves = snapE.val() || {};
        const tarifs = Object.values(snapF.val() || {});

        const overlay = document.createElement('div');
        overlay.id = "overlay-rapport";
        overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; z-index:9999; overflow-y:auto; padding:20px; font-family:'Inter', sans-serif;";

        let rowsHTML = "";
        let totalGlobal = 0;

       paiements.forEach(p => {
            // --- NOUVELLE LOGIQUE SÉCURISÉE (NE CASSE PAS L'ANCIEN) ---
            let montant = 0;
            
            if (p.inscription !== undefined) {
                // Si c'est un import Excel, on prend le chiffre direct
                montant = parseFloat(p.inscription || 0);
            } else {
                // SINON (C'est ton ancien code), on cherche dans le texte
                const match = String(p.details || "").match(/Inscr:\s*(\d+)/i);
                if (match) {
                    montant = parseFloat(match[1]);
                }
            }

            // Si un montant a été trouvé (soit par l'import, soit par le texte)
            if (montant > 0) {
                totalGlobal += montant;
                
                // Recherche de l'élève (ton code original continue ici...)
                const eleveId = Object.keys(eleves).find(id => 
                    eleves[id].nom === (p.nomEleve || p.nom) || 
                    (eleves[id].nom + " " + (eleves[id].prenom || "")) === (p.nomEleve || p.nom)
                );
                
                const classe = p.classe || (eleveId ? eleves[eleveId].classe : "Inconnue");
                const telParent = eleveId && eleves[eleveId].tel ? eleves[eleveId].tel : "-";

                rowsHTML += `
                    <tr class="row-inscription" data-classe="${classe.toLowerCase()}" data-montant="${montant}">
                        <td style="padding:12px; border-bottom:1px solid #eee;">${p.date}</td>
                        <td style="padding:12px; border-bottom:1px solid #eee;">
                            <a href="#" onclick="voirFicheDirecte('${eleveId}')" class="no-print" style="color:#1a73e8; font-weight:700; text-decoration:none;">
                                👤 ${(p.nomEleve || p.nom || 'Inconnu').toUpperCase()}
                            </a>
                            <span class="only-print" style="display:none;">${(p.nomEleve || p.nom || 'Inconnu').toUpperCase()}</span>
                        </td>
                        <td style="padding:12px; border-bottom:1px solid #eee;"><span class="badge-classe">${classe.toUpperCase()}</span></td>
                        <td style="padding:12px; border-bottom:1px solid #eee;">${telParent}</td>
                        <td style="padding:12px; border-bottom:1px solid #eee; font-weight:bold; text-align:right;">${montant.toLocaleString()} F</td>
                    </tr>`;
            }
        });

        overlay.innerHTML = `
            <div id="section-to-print" style="max-width:1150px; margin:auto; position:relative;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;" class="no-print">
                    <h2 style="margin:0;">📈 Registre des Frais d'Inscription</h2>
                    <div style="display:flex; gap:10px;">
                        <button onclick="imprimerRegistreInscriptions()" style="background:#2ecc71; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:8px;">🖨️ Imprimer la liste</button>
                        <button onclick="document.getElementById('overlay-rapport').remove()" style="background:#333; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;">✖ Fermer</button>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px; margin-bottom:25px;">
                    <div style="background:#1a73e8; color:white; padding:20px; border-radius:15px;" id="card-total">
                        <small style="opacity:0.9;">MONTANT TOTAL ENCAISSÉ</small>
                        <h1 id="total-dynamique" style="margin:5px 0; font-size:32px;">${totalGlobal.toLocaleString()} FCFA</h1>
                    </div>
                    
                    <div style="background:#fff; border:1px solid #ddd; padding:20px; border-radius:15px; display:flex; align-items:center; gap:15px;" class="no-print">
                        <div style="flex-grow:1;">
                            <label style="display:block; font-size:12px; font-weight:bold; color:#666; margin-bottom:5px;">FILTRER PAR CLASSE :</label>
                            <select id="select-classe-print" onchange="filtrerInscriptionsExpert(this.value)" style="width:100%; padding:12px; border-radius:8px; border:1px solid #ccc;">
                                <option value="all">Toutes les classes (Global)</option>
                                <optgroup label="Primaire">
                                    <option value="cp1">CP1</option><option value="cp2">CP2</option>
                                    <option value="ce1">CE1</option><option value="ce2">CE2</option>
                                    <option value="cm1">CM1</option><option value="cm2">CM2</option>
                                </optgroup>
                                <optgroup label="Collège">
                                    <option value="6eme">6ème</option><option value="5eme">5ème</option>
                                    <option value="4eme">4ème</option><option value="3eme">3ème</option>
                                </optgroup>
                                <optgroup label="Lycée">
                                    <option value="seconde">Seconde</option><option value="premiere">Première</option>
                                    <option value="terminale">Terminale</option>
                                </optgroup>
                            </select>
                        </div>
                    </div>
                </div>

                <table id="table-registre" style="width:100%; border-collapse:collapse; background:white; border-radius:12px; overflow:hidden; border:1px solid #eee;">
                    <thead style="background:#f1f3f4; text-align:left;">
                        <tr>
                            <th style="padding:15px;">Date</th>
                            <th style="padding:15px;">Élève</th>
                            <th style="padding:15px;">Classe</th>
                            <th style="padding:15px;">Contact Parent</th>
                            <th style="padding:15px; text-align:right;">Montant</th>
                        </tr>
                    </thead>
                    <tbody id="body-inscr">${rowsHTML}</tbody>
                </table>
            </div>

            <div id="modal-fiche-eleve" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10001; align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div id="contenu-fiche" style="background:white; width:90%; max-width:480px; border-radius:20px; padding:25px; position:relative; max-height:90vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                </div>
            </div>

            <style>
                @media print {
                    body * { visibility: hidden; }
                    #section-to-print, #section-to-print * { visibility: visible; }
                    #section-to-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                    .only-print { display: inline !important; }
                    .badge-classe { border: 1px solid #ccc !important; background: transparent !important; color: black !important; }
                    #card-total { background: #f8f9fa !important; color: black !important; border: 2px solid #333 !important; }
                    #total-dynamique { color: black !important; }
                    #modal-fiche-eleve { display:none !important; }
                }
                .badge-classe { background:#e8f0fe; color:#1a73e8; padding:5px 12px; border-radius:20px; font-size:11px; font-weight:800; }
                .row-inscription:hover { background:#f9f9f9; }
            </style>
        `;

        document.body.appendChild(overlay);
        window.currentDataEleves = eleves;
        window.currentTarifs = tarifs;

    } catch (e) { 
        console.error(e); 
        Swal.fire("Erreur", "Impossible de charger le registre.", "error");
    }
}

// FONCTION D'IMPRESSION SPÉCIFIQUE
function imprimerRegistreInscriptions() {
    const titreClasse = document.getElementById('select-classe-print').value.toUpperCase();
    const dateAppel = new Date().toLocaleDateString();
    
    // On peut même ajouter un petit titre temporaire pour l'impression
    const originalTitle = document.title;
    document.title = `Rapport_Inscriptions_${titreClasse}_${dateAppel}`;
    
    window.print();
    
    document.title = originalTitle;
}

// FILTRAGE INTELLIGENT + MISE À JOUR DU TOTAL
function filtrerInscriptionsExpert(classe) {
    const rows = document.querySelectorAll('.row-inscription');
    let nouveauTotal = 0;

    rows.forEach(row => {
        const rowClasse = row.getAttribute('data-classe');
        const montant = parseFloat(row.getAttribute('data-montant'));

        if (classe === "all" || rowClasse === classe.toLowerCase()) {
            row.style.display = "";
            nouveauTotal += montant;
        } else {
            row.style.display = "none";
        }
    });

    document.getElementById('total-dynamique').innerText = nouveauTotal.toLocaleString() + " FCFA";
}
function voirFicheDirecte(id) {
    const el = window.currentDataEleves[id];
    
    if (!el) {
        console.error("Élève non trouvé:", id);
        return Swal.fire("Erreur", "Données élève introuvables", "error");
    }

    const modal = document.getElementById('modal-fiche-eleve');
    const contenu = document.getElementById('contenu-fiche');
    
    // --- RÉCUPÉRATION FLEXIBLE DES DONNÉES (Racine ou detailsFinanciers) ---
    const det = el.detailsFinanciers || {};
    
    // On cherche la valeur soit dans l'objet direct, soit dans detailsFinanciers
    const scolaritePayee = parseFloat(el.scolaritePayee || det.scolaritePayee || 0);
    const tarifScol = parseFloat(el.scolariteTotale || det.scolariteTotale || 0);
    const uniformeMontant = parseFloat(el.uniforme || det.uniformePaye || det.uniforme || 0);
    const examenMontant = parseFloat(el.examenPaye || det.examenPaye || 0);
    
    const nomParent = el.parent || det.parent || "Non renseigné";
    const telParent = el.tel || det.tel || "-";
    
    // Calcul du reste et de la progression
    const resteScolarite = Math.max(0, tarifScol - scolaritePayee);
    const progression = tarifScol > 0 ? Math.min(100, Math.round((scolaritePayee / tarifScol) * 100)) : 0;

    // --- ÉCHÉANCIER (9 MOIS) ---
    const mensualite = tarifScol / 9;
    const moisNoms = ['Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
    let echeancierHTML = "";
    let cumulPaiement = scolaritePayee;

    moisNoms.forEach(mois => {
        let statutMois = "";
        // On utilise une marge de 100 F pour les arrondis de division
        if (mensualite > 0 && cumulPaiement >= (mensualite - 100)) { 
            statutMois = `<span style="color:#27ae60; font-weight:bold;">✅ PAYÉ</span>`;
            cumulPaiement -= mensualite;
        } else if (cumulPaiement > 500) {
            statutMois = `<span style="color:#f39c12; font-weight:bold;">AVANCE: ${Math.round(cumulPaiement).toLocaleString()} F</span>`;
            cumulPaiement = 0;
        } else {
            statutMois = `<span style="color:#e74c3c; font-weight:bold;">${Math.round(mensualite).toLocaleString()} F</span>`;
            cumulPaiement = 0;
        }
        echeancierHTML += `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:5px 0;"><span>${mois}</span><span>${statutMois}</span></div>`;
    });

    contenu.innerHTML = `
        <div style="text-align:center; border-bottom:3px solid #1a73e8; padding-bottom:15px; margin-bottom:20px;">
            <h2 style="margin:0; color:#1a73e8;">${(el.nom || '').toUpperCase()}</h2>
            <p style="color:#555; margin:5px 0;">Matricule: <b>${el.matricule || id}</b> • <span class="badge-classe">${(el.classe || 'N/A').toUpperCase()}</span></p>
        </div>

        <div style="margin-bottom:25px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <span style="font-size:13px; font-weight:bold;">Scolarité (${scolaritePayee.toLocaleString()} / ${tarifScol.toLocaleString()} F)</span>
                <span style="color:#2ecc71; font-weight:800; font-size:18px;">${progression}%</span>
            </div>
            <div style="width:100%; background:#eee; height:12px; border-radius:10px; margin-top:5px; overflow:hidden;">
                <div style="width:${progression}%; background:#2ecc71; height:100%;"></div>
            </div>
        </div>

        <div style="background:#f9f9f9; border-radius:12px; padding:15px; margin-bottom:20px; border:1px solid #eee;">
            <h4 style="margin:0 0 10px 0; font-size:14px;">📅 Détails de la Scolarité</h4>
            <div style="font-size:12px;">${echeancierHTML}</div>
        </div>

        <div style="background:white; border:1px solid #eee; border-radius:12px; padding:15px;">
            <h4 style="margin:0 0 10px 0; font-size:14px;">📑 Autres Frais & Solde</h4>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                <span>FRAIS D'INSCRIPTION</span> 
                <b style="color:#27ae60;">✅ PAYÉ</b>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                <span>UNIFORME / TENUE</span> 
                <b style="color:${uniformeMontant > 0 ? '#27ae60' : '#e74c3c'}">${uniformeMontant > 0 ? '✅ PAYÉ' : '❌ NON PAYÉ'}</b>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                <span>FRAIS D'EXAMENS</span> 
                <b style="color:${examenMontant > 0 ? '#27ae60' : '#e74c3c'}">${examenMontant > 0 ? examenMontant.toLocaleString() + ' F' : '❌ NON PAYÉ'}</b>
            </div>

            <div style="margin-top:10px; padding-top:10px; border-top:2px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold;">RESTE À PAYER</span>
                <b style="color:${resteScolarite === 0 ? '#27ae60' : '#e74c3c'}; font-size:22px;">${resteScolarite.toLocaleString()} F</b>
            </div>

            <div style="margin-top:15px; font-size:13px; color:#444; background:#f0f7ff; padding:10px; border-radius:8px; border-left:4px solid #1a73e8;">
                <p style="margin:0;">👤 Parent: <b style="color:#333;">${nomParent.toUpperCase()}</b></p>
                <p style="margin:5px 0 0 0;">📞 Contact: <b style="color:#333;">${telParent}</b></p>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:25px;" class="no-print">
            <button onclick="window.print()" style="background:#34495e; color:white; border:none; padding:14px; border-radius:10px; cursor:pointer; font-weight:bold;">🖨️ Imprimer</button>
            <button onclick="document.getElementById('modal-fiche-eleve').style.display='none'" style="background:#f1f3f4; color:#333; border:none; padding:14px; border-radius:10px; cursor:pointer; font-weight:bold;">FERMER</button>
        </div>
    `;

    modal.style.display = "flex";
}
async function ouvrirHistoriqueMensuel() {
    // 1. Sécurité Accès Direction
    const dejaDebloque = sessionStorage.getItem('directionDebloquee');
    if (directionDeconnectee && dejaDebloque !== 'true') {
        return Swal.fire("Accès Verrouillé", "Veuillez saisir le code direction pour accéder aux finances.", "warning");
    }

    const schoolId = window.currentSchoolId || localStorage.getItem('currentSchoolId') || "lyce_excellence";
    const anneeScolaire = "2025-2026";
    
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const ordreScolaire = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];

    try {
        const snap = await db.ref(`schools/${schoolId}/${anneeScolaire}/paiements`).once('value');
        const dataPaiements = snap.val() || {};
        const paiements = Object.values(dataPaiements);

        // Objet de regroupement
        const historique = {};

       paiements.forEach(p => {
            // --- A. DÉTERMINATION DU MOIS RÉEL (Basé sur la date du reçu) ---
            let moisLabel = "";
            if (p.date && p.date.includes('/')) {
                const parties = p.date.split('/');
                if (parties.length === 3) {
                    const indexMois = parseInt(parties[1]) - 1; // 01 -> 0
                    moisLabel = moisNoms[indexMois];
                }
            }
            
            // Repli sur le champ mois si la date est corrompue
            if (!moisLabel) moisLabel = p.mois || "Inconnu";

            // Initialisation du mois dans l'objet s'il n'existe pas
            if (!historique[moisLabel]) {
                historique[moisLabel] = { inscriptions: 0, scolarite: 0, total: 0 };
            }

            // --- B. EXTRACTION INTELLIGENTE DES MONTANTS ---
            const montantDuTicket = parseFloat(p.montantTotal || p.montant || 0);
            
            let partInscr = 0;
            let partScol = 0;

            // --- AJOUT SÉCURISÉ POUR LES DONNÉES IMPORTÉES ---
            if (p.inscription !== undefined || p.scolarite !== undefined) {
                // Si les champs numériques existent (Importation), on les utilise directement
                partInscr = parseFloat(p.inscription || 0);
                partScol = parseFloat(p.scolarite || 0);
            } else {
                // SINON, on garde ta logique originale par texte (Regex)
                const detailsTexte = String(p.details || "");

                // Extraction Inscription (ex: "Inscr: 15000F")
                const matchInscr = detailsTexte.replace(/\s/g, '').match(/Inscr:(\d+)/i);
                if (matchInscr) {
                    partInscr = parseFloat(matchInscr[1]);
                }

                // Extraction Scolarité (ex: "Scol: 35000F")
                const matchScol = detailsTexte.replace(/\s/g, '').match(/Scol:(\d+)/i);
                if (matchScol) {
                    partScol = parseFloat(matchScol[1]);
                } else {
                    // SI LE MOT "Scol:" EST ABSENT
                    partScol = montantDuTicket - partInscr;
                }
            }

            // --- C. ACCUMULATION ---
            historique[moisLabel].inscriptions += partInscr;
            historique[moisLabel].scolarite += partScol;
            historique[moisLabel].total += montantDuTicket;
        });

        // --- D. CONSTRUCTION DU HTML (Interface Moderne) ---
        let htmlHistorique = `
            <div style="text-align:left; font-family:'Inter', sans-serif; color: #1e293b;">
                <p style="font-size: 13px; color: #64748b; margin-bottom: 20px; border-left: 3px solid #8b5cf6; padding-left: 10px;">
                    Résumé des encaissements réels par mois pour l'exercice ${anneeScolaire}.
                </p>
                <div style="display:flex; flex-direction:column; gap:12px;">
        `;

        let totalAnnuelsEncaisse = 0;

        ordreScolaire.forEach(m => {
            if (historique[m]) {
                const h = historique[m];
                totalAnnuelsEncaisse += h.total;

                htmlHistorique += `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div>
                            <h4 style="margin: 0; color: #1e293b; font-size: 15px; font-weight: 700;">${m.toUpperCase()}</h4>
                            <div style="margin-top: 4px; font-size: 12px; color: #64748b;">
                                <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">Inscr: <b>${h.inscriptions.toLocaleString()} F</b></span>
                                <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-left:5px;">Scol: <b>${h.scolarite.toLocaleString()} F</b></span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <span style="display: block; font-weight: 800; color: #8b5cf6; font-size: 18px;">${h.total.toLocaleString()} F</span>
                            <span style="font-size: 10px; font-weight: 900; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px;">✅ Encaissé</span>
                        </div>
                    </div>
                `;
            }
        });

        htmlHistorique += `
                </div>
                <div style="margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 12px; border: 2px dashed #cbd5e1; text-align: center;">
                    <small style="color: #64748b; text-transform: uppercase; font-weight: bold;">Cumul Total Annuel</small>
                    <div style="font-size: 24px; font-weight: 900; color: #1e293b;">${totalAnnuelsEncaisse.toLocaleString()} FCFA</div>
                </div>
            </div>
        `;

        // Affichage final avec SweetAlert2
        Swal.fire({
            title: '<span style="font-size:18px;">📅 HISTORIQUE FINANCIER</span>',
            html: htmlHistorique,
            width: '500px',
            showCloseButton: true,
            showConfirmButton: false,
            background: '#fff',
            customClass: {
                popup: 'rounded-20'
            }
        });

    } catch (error) {
        console.error("Erreur Historique:", error);
        Swal.fire("Erreur", "Impossible de compiler les données financières.", "error");
    }
}
function imprimerRapport() { window.print(); }
function logout() {
    Swal.fire({
        title: 'Déconnexion',
        text: "Voulez-vous vraiment vous déconnecter ?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Oui, quitter',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            firebase.auth().signOut().then(() => {
                // IMPORTANT : On vide tout pour que le code direction soit oublié
                sessionStorage.clear(); 
                localStorage.removeItem('currentSchoolId'); 
                window.location.href = "index.html";
            }).catch((error) => {
                console.error("Erreur de déconnexion:", error);
            });
        }
    });
}
async function verifierStatutAppel() {
    const schoolId = window.currentSchoolId || localStorage.getItem('currentSchoolId') || "lyce_excellence";
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD (identique à presences.html)
    const statusEl = document.getElementById('statusAppel');
    const dotEl = document.getElementById('dotAppel');

    if (!statusEl) return;

    try {
        // CORRECTION : On pointe sur "presences" avec un "s"
        const snap = await db.ref(`schools/${schoolId}/presences/${today}`).once('value');
        const data = snap.val();

        if (!data) {
            statusEl.innerHTML = "Pas encore fait";
            if (dotEl) dotEl.style.backgroundColor = "#dc2626"; // Rouge
            return;
        }

        const classesFaites = Object.keys(data).length;
        statusEl.innerHTML = `${classesFaites} classes faites`;
        if (dotEl) dotEl.style.backgroundColor = "#059669"; // Vert
        
    } catch (error) {
        console.error("Erreur statut appel:", error);
    }
}

// Fonction pour voir le détail quand on clique sur le bouton
async function verifierDetailsAppel() {
    const schoolId = window.currentSchoolId || localStorage.getItem('currentSchoolId') || "lyce_excellence";
    const today = new Date().toISOString().split('T')[0];

    try {
        // 1. RÉCUPÉRER TOUTES LES CLASSES POSSIBLES (On regarde dans les élèves de l'année en cours)
        const snapEleves = await db.ref(`schools/${schoolId}/2025-2026/students`).once('value');
        let toutesLesClasses = new Set();
        
        if (snapEleves.exists()) {
            snapEleves.forEach(child => {
                const classe = child.val().classe;
                if (classe) toutesLesClasses.add(classe.trim());
            });
        }

        // 2. RÉCUPÉRER LES APPELS DÉJÀ FAITS
        const snapAppels = await db.ref(`schools/${schoolId}/presences/${today}`).once('value');
        const appelsDuJour = snapAppels.val() || {};

        // 3. CONSTRUIRE LA LISTE (Triée par nom de classe)
        let htmlClasses = '<div style="max-height: 400px; overflow-y: auto; padding: 10px;">';
        const listeTriee = Array.from(toutesLesClasses).sort();

        if (listeTriee.length === 0) {
            htmlClasses += `<p style="color:red">Aucune classe configurée dans la base.</p>`;
        }

        listeTriee.forEach(nomClasse => {
            // On vérifie si la classe existe dans les appels du jour
            const estFait = appelsDuJour[nomClasse] ? true : false;
            
            const couleurBadge = estFait ? "#d1fae5" : "#fee2e2";
            const couleurTexte = estFait ? "#065f46" : "#991b1b";
            const statutTexte = estFait ? "✅ PASSÉ" : "⏳ EN ATTENTE";

            htmlClasses += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <span style="font-weight: bold; color: #1e293b; font-size: 14px;">${nomClasse.toUpperCase()}</span>
                    <span style="background: ${couleurBadge}; color: ${couleurTexte}; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; min-width: 90px; text-align: center;">
                        ${statutTexte}
                    </span>
                </div>
            `;
        });

        htmlClasses += '</div>';

        Swal.fire({
            title: 'Statut des Appels',
            html: htmlClasses,
            width: '400px',
            confirmButtonText: 'Fermer',
            confirmButtonColor: '#1a73e8',
            customClass: { popup: 'rounded-lg' }
        });

    } catch (e) {
        console.error("Erreur détails appel:", e);
        Swal.fire("Erreur", "Impossible de charger la liste des classes.", "error");
    }
}