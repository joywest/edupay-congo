// ==========================================
// 1. PLACE LE BLOC ICI (Tout en haut)
// ==========================================
const studentForm = document.getElementById('addStudentForm');
const studentsTableBody = document.getElementById('studentsTableBody');

let currentYear = "2025-2026";
let currentSchoolId = null;

function initialiserSaaS() {
    // 1. On vérifie la variable globale, puis le stockage local
    let sId = window.currentSchoolId || localStorage.getItem('currentSchoolId');

    // 2. Nettoyage : Si c'est "system" ou "null", on considère que c'est vide
    if (sId === "system" || sId === "null" || !sId) {
        sId = null;
    }

    if (sId && window.db) {
        currentSchoolId = sId;
        console.log("✅ École identifiée :", currentSchoolId);
        
        window.db.ref(`schools/${currentSchoolId}/config/currentYear`).on('value', (snapshot) => {
            currentYear = snapshot.exists() ? snapshot.val() : "2025-2026";
            console.log("📅 Année :", currentYear);
            if (typeof filterStudentsByClass === "function") filterStudentsByClass();
        });
    } else {
        // Si on est Super Admin et que ça bloque, c'est que l'ID n'est pas encore chargé
        console.log("⏳ Identification de l'école en cours... (ID actuel: " + sId + ")");
        setTimeout(initialiserSaaS, 1000); // On attend 1 seconde
    }
}
initialiserSaaS();



function toggleStudentForm() {
    const container = document.getElementById('studentFormContainer');
    if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function generateMatricule() {
    const year = new Date().getFullYear();
    try {
        const snapshot = await window.db.ref(`schools/${currentSchoolId}/${currentYear}/students`).once('value');
        const count = snapshot.numChildren() + 1;
        return `ELV-${year}-${count.toString().padStart(4, '0')}`;
    } catch (e) {
        return `ELV-${year}-${Math.floor(Math.random() * 9000) + 1000}`;
    }
}

if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!window.db || !currentSchoolId) { 
            Swal.fire("Erreur", "Session expirée", "error"); 
            return; 
        }

        const getV = (id) => document.getElementById(id)?.value || "";
        const getN = (id) => {
            const val = parseFloat(document.getElementById(id)?.value);
            return isNaN(val) ? 0 : val;
        };
        
        const nomEleve = getV('studentName');
        const classe = getV('studentClass');

        // --- RECHERCHE DU TARIF ---
       let scolariteConfiguee = 0;
        const fraisSnap = await window.db.ref(`schools/${currentSchoolId}/${currentYear}/frais_scolaires`).once('value');
        
        const classeEleve = (classe || "").toLowerCase().trim();
        
        fraisSnap.forEach(child => {
            const f = child.val();
            const typeFrais = (f.type || "").toLowerCase().trim();
            const classeFrais = (f.classe || "").toLowerCase().trim();

            // Comparaison propre pour éviter les erreurs de majuscules
            if (classeFrais === classeEleve && (typeFrais.includes("scolarit") || typeFrais === "scolarité")) {
                scolariteConfiguee = parseFloat(f.montant) || 0;
            }
        });

        // SECURITÉ : On bloque si le tarif n'existe pas pour éviter les "Retards" fantômes
        if (scolariteConfiguee === 0) {
            Swal.fire("Attention", `Le tarif de scolarité n'est pas configuré pour la classe ${classe}. Veuillez le créer dans l'onglet Frais Scolaires avant d'inscrire l'élève.`, "warning");
            return; // On arrête l'inscription ici
        }

       const v_inscription = getN('payInscription');
        const v_scolarite = getN('payScolarite');
        const v_examen = getN('payExamen');
        const v_uniforme = getN('payUniforme');
        
        const resteScolarite = Math.max(0, scolariteConfiguee - v_scolarite);
        const totalVerse = v_inscription + v_scolarite + v_examen + v_uniforme;
        
        const matricule = await generateMatricule();
        const dateJour = new Date().toLocaleDateString('fr-FR');

        let detailsDesignation = [];
        if(v_inscription > 0) detailsDesignation.push(`Inscr: ${v_inscription}F`);
        if(v_scolarite > 0)   detailsDesignation.push(`Scol: ${v_scolarite}F`);
        if(v_examen > 0)      detailsDesignation.push(`Exam: ${v_examen}F`);
        if(v_uniforme > 0)    detailsDesignation.push(`Unif: ${v_uniforme}F`);
        
        const libelleFinal = detailsDesignation.length > 0 ? detailsDesignation.join(" + ") : "Inscription simple";

        const updates = {};
        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}`] = {
            matricule: matricule,
            nom: nomEleve,
            photoBase64: studentPhotoBase64,
            sexe: getV('studentGender'),
            classe: classe,
            annee: currentYear,
            reste: resteScolarite,
            scolariteTotale: scolariteConfiguee,
            parent: getV('parentName'),
            tel: getV('parentPhone'),
            dateInscription: dateJour,
            schoolId: currentSchoolId,
            detailsFinanciers: {
                // On force la valeur 0 si le champ est vide pour éviter les erreurs NaN
                inscription: v_inscription || 0,
                examen: v_examen || 0,
                uniforme: v_uniforme || 0,
                scolaritePayee: v_scolarite || 0
            }
        };

        const idRecu = "REC-" + Date.now(); 
        if (totalVerse > 0) {
            updates[`schools/${currentSchoolId}/${currentYear}/paiements/${idRecu}`] = {
                id: idRecu,
                matricule: matricule,
                nomEleve: nomEleve,
                montantTotal: totalVerse,
                details: libelleFinal,
                mois: v_scolarite > 0 ? "Octobre" : "N/A", 
                date: dateJour,
                annee: currentYear,
                methode: document.getElementById('paymentMethod')?.value || "Cash"
            };
        }

        window.db.ref().update(updates)
    .then(() => {
        Swal.fire({
            title: "Succès",
            text: `Inscrit avec succès ! Reste à payer : ${resteScolarite} F`,
            icon: "success",
            confirmButtonText: "Imprimer le reçu"
        }).then((result) => {
            // 1. Impression si nécessaire
            if (totalVerse > 0 && typeof imprimerRecu === "function") imprimerRecu(idRecu); 
            
            // 2. Réinitialisation des textes
            studentForm.reset();

            // 3. --- AJOUTE CES LIGNES POUR LA PHOTO ---
            studentPhotoBase64 = null; // Vide la variable pour l'élève suivant
            if (imgPreview) imgPreview.src = ""; // Efface l'image de l'écran
            if (startBtn) startBtn.innerText = "📸 Prendre une photo"; // Remet le texte du bouton
            // ------------------------------------------

            toggleStudentForm();
            filterStudentsByClass();
        });
    })
    .catch(err => Swal.fire("Erreur", err.message, "error"));
    });
}
function supprimerPaiement(payKey, matricule, montant) {
    const payRef = window.db.ref(`schools/${currentSchoolId}/${currentYear}/paiements/${payKey}`);
    
    payRef.once('value').then(paySnap => {
        if (!paySnap.exists()) {
            Swal.fire("Erreur", "Reçu introuvable", "error");
            return;
        }

        const reçuData = paySnap.val();
        const motif = (reçuData.details || "").toUpperCase();
        const mt = Number(montant);

        Swal.fire({
            title: "Supprimer ce reçu ?",
            text: `Le montant de ${mt} F sera retiré du compte de l'élève.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            confirmButtonText: "Oui, supprimer",
            cancelButtonText: "Annuler"
        }).then((result) => {
            if (result.isConfirmed) {
                const studentRef = window.db.ref(`schools/${currentSchoolId}/${currentYear}/students/${matricule}`);
                
                studentRef.once('value').then(snap => {
                    if (snap.exists()) {
                        const s = snap.val();
                        const updates = {};

                        // 1. Supprimer le reçu
                        updates[`schools/${currentSchoolId}/${currentYear}/paiements/${payKey}`] = null;

                        // 2. Mettre à jour les totaux globaux (ceux qui apparaissent dans le tableau)
                        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/reste`] = (Number(s.reste) || 0) + mt;
                        
                        // On réajuste le "déjà payé" en évitant qu'il descende sous 0
                        const nouveauDejaPaye = Math.max(0, (Number(s.dejaPaye) || 0) - mt);
                        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/dejaPaye`] = nouveauDejaPaye;

                        // 3. Mettre à jour le détail financier (ce qui gère les ✅ dans le profil)
                        if (motif.includes("SCOL") || motif.includes("OCT") || motif.includes("MENSUALITÉ")) {
                            const ancienneScol = Number(s.detailsFinanciers?.scolaritePayee) || 0;
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/scolaritePayee`] = Math.max(0, ancienneScol - mt);
                        }

                        if (motif.includes("INSCR")) {
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/inscription`] = 0;
                        }
                        
                        // 4. Appliquer les changements
                        window.db.ref().update(updates).then(() => {
                            Swal.fire("Supprimé !", "La fiche élève a été mise à jour.", "success");
                            // Recharger la liste si la fonction existe
                            if (typeof chargerPaiements === "function") chargerPaiements(); 
                        });
                    }
                });
            }
        });
    });
}
async function filterStudentsByClass() {
    // 1. RÉCUPÉRATION STRICTEMENT DYNAMIQUE
    // On ne met pas de texte fixe comme "lyce_excellence" ici.
    // On récupère ce qui a été enregistré au login.
    const sId = localStorage.getItem('currentSchoolId');
    const cYear = currentYear || localStorage.getItem('currentYear') || "2025-2026"; 
    
    const tableBody = document.getElementById('studentsTableBody');

    // SÉCURITÉ : Si l'ID de l'école n'est pas encore là, on ne fait rien (on attend)
    if (!sId || sId === "system") {
        console.log("⏳ En attente de l'ID école réel...");
        return; 
    }

    if (!window.db || !tableBody) return;

    const selectedClass = document.getElementById('filterByClass')?.value || "all";
    const showOnlyDebtors = document.getElementById('onlyDebtors')?.checked;

    // LOG de contrôle pour toi dans la console
    console.log(`📡 Connexion au chemin : schools/${sId}/${cYear}/students`);

    // 2. RÉCUPÉRATION DES FRAIS
    const fraisSnap = await window.db.ref(`schools/${sId}/${cYear}/frais_scolaires`).once('value');
    const tousLesFrais = [];
    fraisSnap.forEach(f => tousLesFrais.push(f.val()));

    // 3. ÉCOUTE DES ÉLÈVES
    window.db.ref(`schools/${sId}/${cYear}/students`).on('value', (snapshot) => {
        tableBody.innerHTML = ""; 
        let count = 0;

        if (!snapshot.exists()) {
            console.warn(`⚠️ Aucun élève trouvé à : schools/${sId}/${cYear}/students`);
            const countDisp = document.getElementById('totalCountDisplay');
            if (countDisp) countDisp.innerText = "0 élève trouvé";
            return;
        }

        snapshot.forEach((child) => {
            const s = child.val();
           const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(s.nom || "Eleve")}&background=random&color=fff`;
            // --- CALCULS DE TARIFS ---
            let scolariteConfiguee = 0;
            tousLesFrais.forEach(f => {
                const classeTarif = (f.classe || "").toLowerCase().trim();
                const classeEleve = (s.classe || "").toLowerCase().trim();
                const typeFrais = (f.type || "").toLowerCase().trim();

                if (classeTarif === classeEleve && typeFrais.includes("scolarit")) {
                    scolariteConfiguee = parseFloat(f.montant);
                }
            });

            const totalScolarite = scolariteConfiguee || parseFloat(s.scolariteTotale) || 0;
            const dejaPaye = parseFloat(s.detailsFinanciers?.scolaritePayee) || 0;
            const resteReel = totalScolarite - dejaPaye;

            // --- FILTRAGE ET AFFICHAGE ---
            if ((selectedClass === "all" || s.classe === selectedClass) && (!showOnlyDebtors || resteReel > 0)) {
                count++;

                const status = resteReel <= 0 ? 
                    '<span style="color:#188038; background:#e6f4ea; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">À JOUR</span>' : 
                    `<span style="color:#d93025; background:#fce8e6; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">Dette: ${resteReel} F</span>`;
                
                const userRole = localStorage.getItem('userRole'); 
                let boutonSupprimerHtml = (userRole !== 'secretaire') ? 
                    `<button onclick="deleteStudent('${s.matricule}')" style="border:none; background:none; cursor:pointer; font-size: 16px; color: #e74c3c;">🗑️</button>` : "";

                tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="font-family: monospace; font-weight: bold; color: #7f8c8d;">${s.matricule}</td>
                    <td><a href="javascript:void(0)" onclick="voirProfil('${s.matricule}')" style="font-weight:700; color:#1a73e8; text-decoration:none;">${(s.nom || "").toUpperCase()}</a></td>
                    <td>${status}</td>
                    <td style="text-align: center;"><span style="background: #f1f3f4; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size:12px;">${s.sexe || 'N/A'}</span></td>
                    <td style="font-weight: 600;">${s.classe}</td>
                    <td>${s.parent || "N/A"}</td>
                    <td>${s.tel || 'N/A'}</td>
                    <td style="text-align: center;">
                        <div style="display: flex; justify-content: center; gap: 15px; align-items: center;">
                            <a href="https://wa.me/${s.tel}" target="_blank"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="26" height="26"></a>
                            ${boutonSupprimerHtml}
                        </div>
                    </td>
                </tr>`;
            }
        });

        const countDisp = document.getElementById('totalCountDisplay');
        if (countDisp) countDisp.innerText = count + " élève(s)";
    });
}
window.voirProfil = async function(m) {
    let scolariteConfiguee = 0;
    let montantExamen = 0;
    let montantUniforme = 0;
    
    // 1. Récupération des tarifs (Scolarité, Examen, Uniforme)
    const tarifSnap = await window.db.ref(`schools/${currentSchoolId}/${currentYear}/frais_scolaires`).once('value');
    
    // 2. Récupération des données de l'élève
    window.db.ref(`schools/${currentSchoolId}/${currentYear}/students/${m}`).once('value', (snap) => {
        const s = snap.val();
        if(!s) return;

        // Détection des tarifs selon la classe
        if (tarifSnap.exists()) {
            tarifSnap.forEach(child => {
                const f = child.val();
                const classeFrais = (f.classe || "").toLowerCase().trim();
                const classeEleve = (s.classe || "").toLowerCase().trim();
                const typeFrais = (f.type || "").toLowerCase().trim();

                if (classeFrais === classeEleve) {
                    if (typeFrais.includes("scolarit")) {
                        scolariteConfiguee = parseFloat(f.montant) || 0;
                    } else if (typeFrais.includes("examen")) {
                        montantExamen = parseFloat(f.montant) || 0;
                    } else if (typeFrais.includes("uniforme")) {
                        montantUniforme = parseFloat(f.montant) || 0;
                    }
                }
            });
        }

        // Calculs de scolarité
        const totalScolarite = scolariteConfiguee || parseFloat(s.scolariteTotale) || 0;
        let soldeDisponible = parseFloat(s.detailsFinanciers?.scolaritePayee) || 0;
        const mensuelle = totalScolarite > 0 ? Math.round(totalScolarite / 9) : 0;
        const vraiReste = totalScolarite - (parseFloat(s.detailsFinanciers?.scolaritePayee) || 0);

        // Construction du calendrier
        const moisNoms = ["Octobre", "Novembre", "Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin"];
        let htmlCalendrier = "";
        
        moisNoms.forEach((nom) => {
            let detailMois = "";
            let styleMois = "";
            if (soldeDisponible >= mensuelle) {
                detailMois = '✅ PAYÉ';
                styleMois = 'background: rgba(40, 167, 69, 0.1); border: 1px solid #28a745; color: #28a745;';
                soldeDisponible -= mensuelle;
            } else if (soldeDisponible > 0) {
                detailMois = `<span style="font-size:10px;">🟠 AVANCE</span><br>${soldeDisponible} F`;
                styleMois = 'background: rgba(255, 152, 0, 0.1); border: 1px solid #ff9800; color: #e65100;';
                soldeDisponible = 0;
            } else {
                detailMois = mensuelle + ' F';
                styleMois = 'background: #fff; border: 1px solid #eee; color: #444;';
            }
            htmlCalendrier += `<div style="${styleMois} border-radius: 12px; padding: 10px; text-align: center; display: flex; flex-direction: column; justify-content: center; min-height: 50px;"><div style="font-size: 9px; text-transform: uppercase; font-weight: bold; opacity: 0.8;">${nom}</div><div style="font-size: 12px; font-weight: bold; margin-top: 4px;">${detailMois}</div></div>`;
        });

        const pourcentage = totalScolarite > 0 ? Math.min(Math.round(((parseFloat(s.detailsFinanciers?.scolaritePayee) || 0) / totalScolarite) * 100), 100) : 0;

        // 3. AFFICHAGE (Le Swal avec les 4 boîtes)
        Swal.fire({
            width: '500px',
            showConfirmButton: false,
            html: `
                <div id="ficheAImprimer" style="text-align: left; font-family: 'Segoe UI', sans-serif; color: #333; padding: 10px;">
                    <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 20px;">
                        <img src="${s.photoBase64 || 'images/avatar.png'}" style="width: 80px; height: 80px; border-radius: 10px; object-fit: cover; border: 2px solid #1a73e8;">
                        <div>
                            <h2 style="margin: 0; font-size: 24px; color: #1a73e8;">${s.nom.toUpperCase()}</h2>
                            <span style="font-size: 13px; color: #777;">Matricule: ${s.matricule} • ${s.classe}</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 25px; background: #f9f9f9; padding: 15px; border-radius: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; font-size: 13px;">
                            <span>Progression Annuelle</span>
                            <span style="color: #28a745;">${pourcentage}%</span>
                        </div>
                        <div style="width: 100%; background: #e0e0e0; height: 8px; border-radius: 10px; overflow: hidden;">
                            <div style="width: ${pourcentage}%; background: linear-gradient(90deg, #28a745, #85e085); height: 100%; border-radius: 10px;"></div>
                        </div>
                    </div>

                    <p style="font-size: 14px; font-weight: bold; color: #555; margin-bottom: 12px;">📅 Échéancier Scolarité</p>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 25px;">
                        ${htmlCalendrier}
                    </div>

                    <p style="font-size: 14px; font-weight: bold; color: #555; margin-bottom: 12px;">📑 Frais Annexes & Solde</p>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px;">
                        <div style="background: #fff; padding: 10px; border-radius: 12px; border-left: 4px solid #ff9800; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <div style="font-size: 9px; color: #e65100; font-weight: bold;">INSCRIPTION</div>
                            <div style="font-size: 14px; font-weight: bold;">${s.detailsFinanciers?.inscription || 0} F</div>
                        </div>
                        <div style="background: #fce8e6; padding: 10px; border-radius: 12px; border-left: 4px solid #d93025; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <div style="font-size: 9px; color: #a50e0e; font-weight: bold;">RESTE SCOLARITÉ</div>
                            <div style="font-size: 14px; font-weight: bold; color: #d93025;">${vraiReste} F</div>
                        </div>
                        <div style="background: #fff; padding: 10px; border-radius: 12px; border-left: 4px solid #1a73e8; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <div style="font-size: 9px; color: #1a73e8; font-weight: bold;">EXAMEN</div>
                            <div style="font-size: 14px; font-weight: bold;">${s.detailsFinanciers?.examen || montantExamen} F</div>
                        </div>
                        <div style="background: #fff; padding: 10px; border-radius: 12px; border-left: 4px solid #10b981; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <div style="font-size: 9px; color: #059669; font-weight: bold;">UNIFORME</div>
                            <div style="font-size: 14px; font-weight: bold;">${s.detailsFinanciers?.uniforme || montantUniforme} F</div>
                        </div>
                    </div>

                    <div style="padding-top: 15px; border-top: 1px solid #eee; font-size: 13px;">
                        <b style="color: #555;">Parent:</b> ${s.parent || 'Non renseigné'}
                    </div>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
                    <button onclick="imprimerFicheScolaire()" style="background: #10b981; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;">🖨️ Imprimer la Fiche</button>
                    <button onclick="Swal.close()" style="background: #444; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;">FERMER</button>
                </div>
            `
        });
    });
};
function deleteStudent(m) {
    // --- SÉCURITÉ : VÉRIFICATION DU RÔLE ---
    if (localStorage.getItem('userRole') === 'secretaire') {
        Swal.fire({
            title: "Accès Refusé",
            text: "Seule la Direction peut supprimer un élève.",
            icon: "error",
            confirmButtonColor: "#ef4444"
        });
        return; // On stoppe tout ici
    }

    // --- PROCÉDURE DE SUPPRESSION NORMALE ---
    Swal.fire({ 
        title: "Supprimer ?", 
        icon: "warning", 
        showCancelButton: true, 
        confirmButtonText: "Oui",
        confirmButtonColor: "#d33" 
    }).then((r) => {
        if (r.isConfirmed) {
            window.db.ref(`schools/${currentSchoolId}/${currentYear}/students/${m}`).remove()
                .then(() => {
                    Swal.fire("Supprimé", "L'élève a été retiré de la base.", "success");
                })
                .catch(err => {
                    Swal.fire("Erreur", "Impossible de supprimer : " + err.message, "error");
                });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => { if(currentSchoolId) filterStudentsByClass(); });

window.imprimerFicheScolaire = async function() {
    // 1. On récupère les infos (Nom et Logo) dans 'config' OU 'info' pour être sûr à 100%
    const configSnap = await window.db.ref(`schools/${currentSchoolId}/config`).once('value');
    const infoSnap = await window.db.ref(`schools/${currentSchoolId}/info`).once('value');
    
    const config = configSnap.val() || {};
    const info = infoSnap.val() || {};

    // Priorité au nom trouvé dans 'info' (celui du SaaS) puis 'config'
    const nomEcole = info.nom || config.nom || 'ÉTABLISSEMENT SCOLAIRE';
    const logoURL = info.logo || config.logo || '';
    
    const logoImg = logoURL ? `<img src="${logoURL}" style="height: 60px; margin-bottom: 10px;">` : '';

    // 2. Préparation de la date du jour
    const dateAujourdhui = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // 3. On récupère le contenu du modal (l'ID ficheAImprimer)
    const contenu = document.getElementById('ficheAImprimer').innerHTML;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Fiche Scolaire - ${nomEcole}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; background: white; }
                .print-container { max-width: 800px; margin: auto; }
                .header-print { text-align: center; border-bottom: 2px solid #1a73e8; margin-bottom: 20px; padding-bottom: 10px; }
                .date-print { text-align: right; font-size: 12px; color: #666; margin-bottom: 20px; font-style: italic; }
                
                /* Forcer les couleurs à l'impression */
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                
                /* Réglage du calendrier pour le papier */
                div[style*="display: grid"] { 
                    display: grid !important; 
                    grid-template-columns: repeat(3, 1fr) !important; 
                    gap: 10px !important; 
                }
                div[style*="border-left"] { border: 1px solid #eee !important; border-left: 5px solid !important; }
            </style>
        </head>
        <body>
            <div class="print-container">
                <div class="header-print">
                    ${logoImg}
                    <h1 style="margin:0; color: #1a73e8; text-transform: uppercase;">${nomEcole}</h1>
                    <p style="margin: 5px 0; font-weight: bold;">FICHE DE SUIVI FINANCIER INDIVIDUEL</p>
                </div>

                <div class="date-print">Document édité le : ${dateAujourdhui}</div>

                ${contenu}

                <div style="margin-top: 60px; display: flex; justify-content: space-between;">
                    <div style="text-align:center; width: 230px; border-top: 1.5px solid #000; padding-top: 8px; font-weight: bold;">Signature de L'ecole</div>
                    <div style="text-align:center; width: 230px; border-top: 1.5px solid #000; padding-top: 8px; font-weight: bold;">Le Comptable / Cachet</div>
                </div>
            </div>
            <script>
                window.onload = function() { 
                    setTimeout(() => { window.print(); window.close(); }, 600); 
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
/** --- MODULE PHOTO WEBCAM --- **/
let studentPhotoBase64 = null; // Stockera la photo compressée

const video = document.getElementById('webcam');
const canvas = document.getElementById('photoCanvas');
const imgPreview = document.getElementById('imgPreview');
const startBtn = document.getElementById('startCamBtn');
const captBtn = document.getElementById('captureBtn');
const cameraArea = document.getElementById('cameraArea');

// 1. Démarrer la webcam
startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 300, height: 300, facingMode: "user" }, 
            audio: false 
        });
        video.srcObject = stream;
        cameraArea.style.display = 'block';
        captBtn.style.display = 'inline-block';
        startBtn.style.display = 'none';
    } catch (err) {
        Swal.fire('Erreur', 'Accès caméra refusé ou non supporté.', 'error');
    }
});

// 2. Capturer et Compresser (JPEG 0.6)
captBtn.addEventListener('click', () => {
    const context = canvas.getContext('2d');
    // On dessine l'image de la vidéo sur le canvas (150x150)
    context.drawImage(video, 0, 0, 150, 150);
    
    // Conversion en Base64 compressé pour économiser Firebase
    studentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6);
    
    // Affichage de l'aperçu
    imgPreview.src = studentPhotoBase64;
    
    // Arrêt de la caméra pour libérer les ressources
    const stream = video.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    
    cameraArea.style.display = 'none';
    captBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
    startBtn.innerText = "🔄 Recommencer";
});

/** * IMPORTANT : Dans ta fonction d'enregistrement (souvent addStudentForm.onsubmit), 
 * assure-toi d'inclure "photoBase64: studentPhotoBase64" dans l'objet envoyé à Firebase.
 **/
/** --- MODULE DE RECHERCHE RAPIDE --- **/
window.searchStudent = function() {
    const input = document.getElementById('searchStudent').value.toUpperCase();
    const tableBody = document.getElementById('studentsTableBody');
    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        // La colonne 1 contient le Nom de l'élève
        const nameCell = rows[i].getElementsByTagName('td')[1];
        
        if (nameCell) {
            const txtValue = nameCell.textContent || nameCell.innerText;
            if (txtValue.toUpperCase().indexOf(input) > -1) {
                rows[i].style.display = ""; // Affiche la ligne
            } else {
                rows[i].style.display = "none"; // Cache la ligne
            }
        }
    }
}
// N'oublie pas d'ajouter <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script> dans ton <head>

function traiterFichierExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // On transforme l'Excel en liste d'objets
        const rows = XLSX.utils.sheet_to_json(firstSheet);
        lancerImportation(rows);
    };
    reader.readAsArrayBuffer(file);
}
async function lancerImportation(rows) {
    console.log("Données reçues de l'Excel:", rows); // DEBUG
    
    if (!currentSchoolId || !currentYear) {
        Swal.fire("Erreur", "ID école ou Année manquante", "error");
        return;
    }

    // On s'assure que les lignes ne sont pas vides
    let rowsToProcess = rows.filter(row => row.Nom || row.Matricule);
    
    if (rowsToProcess.length === 0) {
        Swal.fire("Attention", "Le fichier Excel semble vide ou les colonnes 'Nom' ou 'Matricule' sont mal nommées", "warning");
        return;
    }

    const updates = {};
    const dateJour = new Date().toLocaleDateString('fr-FR');
    const timestampJour = Date.now();
    let count = 0;

    try {
        rowsToProcess.forEach((row, index) => {
            // Utilisation du Matricule de l'Excel ou génération
            let mat = row.Matricule ? String(row.Matricule) : `ELV-${currentYear.split('-')[0]}-${timestampJour.toString().slice(-4)}${index}`;

            // Conversion forcée en nombres pour éviter les erreurs
            const sTotale = parseFloat(row.Scolarite_Totale) || 0;
            const payeInscrip = parseFloat(row.Inscription_Deja_Paye) || 0;
            const payeScolarite = parseFloat(row.Scolarite_Deja_Paye) || 0;
            
            const totalGlobal = payeInscrip + payeScolarite;
            const calculReste = sTotale - payeScolarite;

            // 1. FICHE ÉLÈVE
            updates[`schools/${currentSchoolId}/${currentYear}/students/${mat}`] = {
                matricule: mat,
                nom: String(row.Nom || "").toUpperCase(),
                classe: row.Classe || "",
                sexe: row.Sexe || "",
                parent: row.Parent || "",
                tel: row.Tel || "",
                schoolId: currentSchoolId,
                annee: currentYear,
                dateInscription: dateJour,
                scolariteTotale: sTotale,
                dejaPaye: totalGlobal, 
                reste: calculReste,    
                detailsFinanciers: {
                    inscription: payeInscrip,
                    scolaritePayee: payeScolarite,
                    examen: parseFloat(row.Examen) || 0,
                    uniforme: parseFloat(row.Uniforme) || 0
                }
            };

            // 2. TRANSACTION (Pour le graphique)
            if (totalGlobal > 0) {
                const paiementId = `PAY-IMPORT-${timestampJour}-${index}`;
                updates[`schools/${currentSchoolId}/${currentYear}/paiements/${paiementId}`] = {
                    id: paiementId,
                    matricule: mat,
                    nom: String(row.Nom || "").toUpperCase(),
                    classe: row.Classe || "",
                    date: dateJour,
                    timestamp: timestampJour,
                    type: "Importation",
                    methode: "Espèces",
                    montant: totalGlobal,
                    inscription: payeInscrip,
                    scolarite: payeScolarite
                };
            }
            count++;
        });

        console.log("Updates prêts à être envoyés:", updates); // DEBUG

        await window.db.ref().update(updates);
        
        Swal.fire("Succès", `${count} élèves importés avec statistiques !`, "success");
        
        if(typeof chargerListeEleves === "function") chargerListeEleves();
        if(typeof loadDashboardData === "function") loadDashboardData();
        
    } catch (error) {
        console.error("Erreur détaillée:", error);
        Swal.fire("Erreur technique", error.message, "error");
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