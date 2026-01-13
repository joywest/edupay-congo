// --- VARIABLES GLOBALES ---
let currentYear = "2025-2026"; 
let currentSchoolId = null; 

// --- 1. DÉTECTION DYNAMIQUE DE L'ÉCOLE (SaaS Ready) ---
function detecterEcoleEtCharger() {
    // On récupère l'ID de l'école soit dans le localStorage, soit dans la variable globale window
    currentSchoolId = localStorage.getItem('currentSchoolId') || window.currentSchoolId;

    if (currentSchoolId && window.db) {
        console.log("✅ École identifiée pour les factures :", currentSchoolId);
        
        // Écouter l'année active pour cette école précise dans la config
        window.db.ref(`schools/${currentSchoolId}/config/currentYear`).on('value', (snapshot) => {
            if (snapshot.exists()) {
                currentYear = snapshot.val();
                console.log("📑 Année active chargée :", currentYear);
                chargerHistoriqueRecus(); 
            } else {
                // Si pas de config, on garde l'année par défaut et on charge
                chargerHistoriqueRecus();
            }
        });
    } else {
        // Si Firebase ou l'ID n'est pas prêt, on réessaie toutes les 500ms
        setTimeout(detecterEcoleEtCharger, 500);
    }
}

// Lancer la détection immédiatement
detecterEcoleEtCharger();

// --- 2. CHARGEMENT DE L'HISTORIQUE ---
function chargerHistoriqueRecus() {
    const tbody = document.getElementById('listRecus'); 
    if (!tbody || !currentSchoolId) return;

    const path = `schools/${currentSchoolId}/${currentYear}/paiements`;
    
    window.db.ref(path).on('value', (snapshot) => {
        tbody.innerHTML = ""; 
        
        if (!snapshot.exists()) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">Aucun reçu trouvé.</td></tr>`;
            return;
        }

        let recusArray = [];
        snapshot.forEach((childSnapshot) => {
            const r = childSnapshot.val(); 
            r.key = childSnapshot.key;
            recusArray.push(r);
        });

        recusArray.reverse().forEach((r) => {
            const montantAffiche = Number(r.montantTotal || r.montant || 0);
            const motifAffiche = r.details || r.designation || r.mois || 'Frais Divers';

            // --- SÉCURITÉ RÔLE : SEUL LE DIRECTEUR OU L'ADMIN VOIT LA POUBELLE ---
            // On vérifie le rôle stocké (souvent dans localStorage au moment du login)
            const roleUtilisateur = localStorage.getItem('userRole') || window.roleActuel;
            
            let btnSupprimer = "";
            if (roleUtilisateur === 'directeur' || roleUtilisateur === 'admin') {
                btnSupprimer = `
                    <button onclick="supprimerPaiement('${r.key}', '${r.matricule}', ${montantAffiche})" 
                            style="background: #fee2e2; color: #dc2626; border: none; padding: 10px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;"
                            onmouseover="this.style.background='#fecaca'" onmouseout="this.style.background='#fee2e2'">
                        <span style="font-size: 16px;">🗑️</span>
                    </button>`;
            }

            tbody.innerHTML += `
                <tr data-classe="${r.classe || ''}" data-date="${r.date || ''}" data-montant="${montantAffiche}" 
                    style="border-bottom: 1px solid #f1f5f9; transition: 0.3s;" 
                    onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
                    
                    <td style="padding: 16px; font-size: 13px; color: #64748b;">${r.date || '---'}</td>
                    <td style="padding: 16px;">
                        <span style="background: #eff6ff; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 11px; border: 1px solid #dbeafe;">
                            ${r.id || r.key.substring(0, 8)}
                        </span>
                    </td>
                    <td style="padding: 16px;">
                        <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${r.nomEleve || r.nom || ''}</div>
                        <div style="font-size: 11px; color: #94a3b8;">${r.matricule}</div>
                    </td>
                    <td style="padding: 16px; text-align: right; font-weight: 800; color: #0f172a;">${montantAffiche.toLocaleString()} F</td>
                    <td style="padding: 16px;">
                        <span style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                            ${r.methode || r.mode || 'Cash'}
                        </span>
                    </td>
                    <td style="padding: 16px; color: #64748b; font-size: 13px;">${motifAffiche}</td>
                    <td style="padding: 16px; display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
                        <button onclick="imprimerRecu('${r.key}')" 
                                style="background: white; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 600; color: #334155; transition: 0.2s;"
                                onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'">
                            <span>🖨️</span> <span style="font-size: 13px;">Imprimer</span>
                        </button>
                        ${btnSupprimer}
                    </td>
                </tr>`;
        });
        
        filtrerRecus();
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
        const motif = (reçuData.details || reçuData.designation || "").toUpperCase();

        Swal.fire({
            title: "⚠️ Supprimer ce reçu ?",
            text: `Le paiement de ${montant} F sera retiré du compte de l'élève.`,
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

                        // 1. Supprimer le reçu définitivement
                        updates[`schools/${currentSchoolId}/${currentYear}/paiements/${payKey}`] = null;

                        // 2. CORRECTION DES MONTANTS (Selon tes noms de champs)
                        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/reste`] = (Number(s.reste) || 0) + Number(montant);
                        
                        // Si c'est de la scolarité, on diminue le champ scolaritePayee
                        if (motif.includes("SCOLARITÉ") || motif.includes("MENSUALITÉ")) {
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/scolaritePayee`] = (Number(s.scolaritePayee) || 0) - Number(montant);
                        }

                        // 3. CORRECTION DES FRAIS ANNEXES (detailsFinanciers)
                        if (motif.includes("INSCRIPTION")) {
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/inscription`] = 0;
                        }
                        if (motif.includes("UNIFORME")) {
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/uniforme`] = 0;
                        }
                        if (motif.includes("EXAMEN")) {
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/examen`] = 0;
                        }

                        // Appliquer les changements
                        window.db.ref().update(updates).then(() => {
                            Swal.fire("Supprimé !", "Le compte de l'élève a été recalculé.", "success");
                        });
                    }
                });
            }
        });
    });
}
// --- 3. FONCTION DE FILTRAGE ---
function filtrerRecus() {
    const nomSearch = document.getElementById('filterNom').value.toUpperCase();
    const classeSearch = document.getElementById('filterClasse').value;
    const dateSearch = document.getElementById('filterDate').value;
    
    const table = document.getElementById("listRecus"); 
    const rows = table.getElementsByTagName("tr");
    
    let cumulArgent = 0;
    let nbRecus = 0;

    for (let i = 0; i < rows.length; i++) {
        if (rows[i].cells.length < 2) continue;

        const textLigne = rows[i].innerText.toUpperCase();
        const rowDate = rows[i].getAttribute('data-date') || ""; 
        const rowClasse = rows[i].getAttribute('data-classe') || "";
        const rowMontant = parseInt(rows[i].getAttribute('data-montant')) || 0;

        const matchNom = textLigne.indexOf(nomSearch) > -1;
        const matchClasse = (classeSearch === "") || (rowClasse === classeSearch);
        const matchDate = (dateSearch === "") || (rowDate.includes(dateSearch.split('-').reverse().join('/')));

        if (matchNom && matchClasse && matchDate) {
            rows[i].style.display = "";
            cumulArgent += rowMontant;
            nbRecus++;
        } else {
            rows[i].style.display = "none";
        }
    }

    const divTotal = document.getElementById("montantTotalFiltré");
    if (divTotal) {
        divTotal.innerHTML = `
            <div style="font-size: 13px; color: #64748b; font-weight: 600;">${nbRecus} reçu(s) trouvé(s)</div>
            <div style="font-size: 22px; font-weight: 900; color: #1e40af; margin-top: 2px;">${cumulArgent.toLocaleString()} FCFA</div>
        `;
    }
}
// --- FONCTION UTILITAIRE : Conversion Chiffres en Lettres ---
function nombreEnLettres(montant) {
    const unites = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
    const dizaines = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingt", "quatre-vingt-dix"];
    
    if (montant === 0) return "zéro";
    if (montant < 1000) return "---"; // Simplifié pour les gros montants scolaires
    
    // Note : Pour un système SaaS complet, on utilise souvent une librairie, 
    // mais voici une mention standard pour ton reçu :
    return montant.toLocaleString() + " Francs CFA"; 
}

// --- 4. FONCTION D'IMPRESSION PROFESSIONNELLE ET INTELLIGENTE ---
function imprimerRecu(key) {
    if (!currentSchoolId) return;

    window.db.ref(`schools/${currentSchoolId}/info`).once('value', (snapInfo) => {
        if (!snapInfo.exists()) {
            Swal.fire("Erreur", "Infos école introuvables.", "error");
            return;
        }
        const info = snapInfo.val() || {};
        const nomEcole = info.nom ? info.nom.toUpperCase() : "ÉTABLISSEMENT SCOLAIRE";
        const logoEcole = info.logo || "";

        window.db.ref(`schools/${currentSchoolId}/${currentYear}/paiements/${key}`).once('value', (snapP) => {
            if (!snapP.exists()) {
                Swal.fire("Erreur", "Ce reçu n'existe plus.", "error");
                return;
            }
            const p = snapP.val();

            window.db.ref(`schools/${currentSchoolId}/${currentYear}/students/${p.matricule}`).once('value', (snapS) => {
                const s = snapS.val() || { reste: 0 };

                const montantVerseCeJour = parseInt(p.montantTotal || p.montant || 0);
                const resteGlobalAnnuel = parseInt(s.reste) || 0;
                const designationBrute = (p.details || p.designation || "Paiement Scolarité").toUpperCase();
                
                const moisListe = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
                let moisDetecte = p.mois || "Non précisé";
                if (moisDetecte === "Non précisé") {
                    moisListe.forEach(m => { if (designationBrute.includes(m)) moisDetecte = m; });
                }

                const montantTheoriqueMois = parseInt(p.montantDuMois || s.fraisMensuels || 0);
                const resteSurMois = montantTheoriqueMois > 0 ? (montantTheoriqueMois - montantVerseCeJour) : 0;
                const estInscription = designationBrute.includes("INSCRIPTION");
// --- LOGIQUE DU LIEN QR CODE (Version Corrigée) ---

// --- CONFIGURATION WEB (GITHUB & PRODUCTION) ---
// window.location.origin détectera automatiquement l'adresse du site GitHub
const currentUrl = window.location.origin; 
const pageParent = "parent.html"; 

// Construction du lien dynamique
const qrData = `${currentUrl}/${pageParent}?id=${currentSchoolId}&mat=${p.matricule}`;

const qrContainer = document.createElement("div");
new QRCode(qrContainer, { 
    text: qrData, 
    width: 128, 
    height: 128,
    correctLevel: QRCode.CorrectLevel.L 
});

                setTimeout(() => {
                    const qrDataUrl = qrContainer.querySelector("canvas") ? qrContainer.querySelector("canvas").toDataURL() : "";
                    
                    const win = window.open('', '', 'height=850,width=750');
                    win.document.write(`
                        <html>
                        <head>
                            <title>Reçu ${p.id || key}</title>
                            <style>
                                body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; color: #1e293b; background:#f8fafc; }
                                .ticket { background: white; border: 1px solid #e2e8f0; padding: 40px; max-width: 650px; margin: auto; position: relative; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-top: 12px solid #1a73e8; overflow: hidden; }
                                .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 120px; color: rgba(22, 163, 74, 0.05); font-weight: 900; pointer-events: none; z-index: 0; }
                                .header { text-align: center; margin-bottom: 30px; position: relative; z-index: 1; }
                                .logo { max-height: 80px; margin-bottom: 10px; }
                                .school-name { color: #1e40af; font-size: 26px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
                                .info-grid { display: flex; justify-content: space-between; margin: 25px 0; font-size: 14px; border-top: 1px solid #f1f5f9; padding-top: 20px; position: relative; z-index: 1; }
                                .table { width: 100%; border-collapse: collapse; margin: 20px 0; position: relative; z-index: 1; }
                                .table th { text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding: 12px; }
                                .table td { padding: 15px 12px; border-bottom: 1px solid #f1f5f9; }
                                .total-zone { background: #f8fafc; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0; border: 1px solid #e2e8f0; position: relative; z-index: 1; }
                                .en-lettres { font-size: 12px; font-style: italic; color: #475569; margin-top: 10px; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
                                .reste-box { background: ${estInscription ? '#f0fdf4' : '#fef2f2'}; color: ${estInscription ? '#166534' : '#991b1b'}; font-weight: 800; text-align: center; padding: 15px; border: 2px dashed ${estInscription ? '#bbf7d0' : '#fecaca'}; border-radius: 12px; position: relative; z-index: 1; }
                                .footer { display:flex; justify-content:space-between; margin-top:50px; font-size:12px; position: relative; z-index: 1; }
                                .signature-box { text-align:center; width:180px; border-top:1px solid #cbd5e1; padding-top:10px; color:#475569; }
                                .qr-code-zone { position: absolute; top: 15px; right: 15px; text-align:center; }
                                .qr-code-zone img { width: 85px; height: 85px; border: 1px solid #eee; padding: 2px; background: white; }
                                .qr-label { font-size: 8px; color: #94a3b8; display: block; margin-top: 2px; }
                            </style>
                        </head>
                        <body>
                            <div class="ticket">
                                <div class="qr-code-zone">
                                    <img src="${qrDataUrl}">
                                    <span class="qr-label">Scanner pour suivi</span>
                                </div>
                                <div class="watermark">PAYÉ</div>
                                
                                <div class="header">
                                    ${logoEcole ? `<img src="${logoEcole}" class="logo">` : ''}
                                    <h1 class="school-name">${nomEcole}</h1>
                                    <p style="font-size:13px; font-weight:600; color: #64748b; margin-top:5px;">REÇU OFFICIEL DE PAIEMENT</p>
                                    <p style="font-size:11px; margin:0; color: #94a3b8;">N° Transaction : ${p.id || key}</p>
                                </div>

                                <div class="info-grid">
                                    <div>
                                        <span style="color: #94a3b8; font-size: 11px; font-weight:700; text-transform:uppercase;">Élève</span><br>
                                        <strong style="font-size:16px; color:#0f172a;">${(p.nomEleve || s.nom || '---').toUpperCase()}</strong><br>
                                        <span style="color: #64748b;">Matricule : <strong>${p.matricule}</strong></span><br>
                                        <span style="color: #64748b;">Classe : <strong>${p.classe || s.classe || '---'}</strong></span>
                                    </div>
                                    <div style="text-align: right;">
                                        <span style="color: #94a3b8; font-size: 11px; font-weight:700; text-transform:uppercase;">Date & Mode</span><br>
                                        <strong style="color:#0f172a;">${p.date}</strong><br>
                                        <span style="color: #64748b;">Mode : ${p.methode || "Espèces"}</span>
                                    </div>
                                </div>

                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Désignation des Frais</th>
                                            <th style="text-align:right">Montant Payé</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>
                                                <strong style="color:#1a73e8">${designationBrute}</strong><br>
                                                <small style="color:#64748b">Période : ${moisDetecte} | Année : ${currentYear}</small>
                                                ${resteSurMois > 0 ? `<br><small style="color:#ef4444;">⚠️ Reliquat sur mois: ${resteSurMois.toLocaleString()} F</small>` : ''}
                                            </td>
                                            <td style="text-align:right; font-weight:800; font-size:18px; color:#1e293b;">
                                                ${montantVerseCeJour.toLocaleString()} F
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div class="total-zone">
                                    <div style="font-size:11px; color:#64748b; font-weight:700;">SOMME VERSÉE CE JOUR</div>
                                    <div style="font-size:32px; font-weight:900; color: #1a73e8;">${montantVerseCeJour.toLocaleString()} <span style="font-size:16px">FCFA</span></div>
                                    <div class="en-lettres">
                                        Arrêté le présent reçu à la somme de : <br>
                                        <strong>${montantVerseCeJour.toLocaleString()} Francs CFA</strong>
                                    </div>
                                </div>

                                <div class="reste-box">
                                    ${estInscription ? '✅ INSCRIPTION COMPLÈTE' : `RESTE À RECOUVRER (ANNUEL) : ${resteGlobalAnnuel.toLocaleString()} FCFA`}
                                </div>

                                <div class="footer">
                                    <div class="signature-box">La Comptabilité</div>
                                    <div class="signature-box">Le Parent d'Élève</div>
                                </div>
                                
                                <p style="text-align:center; font-size:10px; color:#94a3b8; margin-top:40px; font-style:italic;">
                                    Document authentique généré numériquement le ${new Date().toLocaleString()}
                                </p>
                            </div>
                            <script>
                                window.onload = function() { 
                                    setTimeout(() => { window.print(); window.close(); }, 700);
                                };
                            <\/script>
                        </body>
                        </html>
                    `);
                    win.document.close();
                }, 300);
            });
        });
    });
}
// --- FONCTION A : FILTRAGE INTELLIGENT ET CALCUL DE SOMME ---
function filtrerRecus() {
    const nomSearch = document.getElementById('filterNom').value.toUpperCase();
    const classeSearch = document.getElementById('filterClasse').value;
    const dateSearch = document.getElementById('filterDate').value;
    
    const table = document.getElementById("listRecus"); // Vérifie bien que c'est le bon ID
    const rows = table.getElementsByTagName("tr");
    
    let cumul = 0;
    let nombreRecus = 0; // <--- On ajoute le compteur ici

    for (let i = 0; i < rows.length; i++) {
        // On ignore les lignes vides ou messages d'erreur
        if (rows[i].cells.length < 2) continue;

        const textNom = rows[i].innerText.toUpperCase();
        const rowDate = rows[i].getAttribute('data-date') || ""; 
        const rowClasse = rows[i].getAttribute('data-classe') || "";
        const rowMontant = parseInt(rows[i].getAttribute('data-montant')) || 0;

        const matchNom = textNom.indexOf(nomSearch) > -1;
        const matchClasse = classeSearch === "" || rowClasse === classeSearch;
        const matchDate = dateSearch === "" || rowDate.includes(dateSearch.split('-').reverse().join('/'));

        if (matchNom && matchClasse && matchDate) {
            rows[i].style.display = "";
            cumul += rowMontant;
            nombreRecus++; // <--- On augmente le nombre de reçus trouvés
        } else {
            rows[i].style.display = "none";
        }
    }

    // MISE À JOUR DE L'AFFICHAGE (Montant + Nombre)
    const affichage = document.getElementById("montantTotalFiltré");
    if (affichage) {
        affichage.innerHTML = `
            <span style="font-size: 14px; color: #64748b;">${nombreRecus} reçu(s) trouvé(s)</span><br>
            <span style="font-size: 20px; font-weight: bold; color: #1e40af;">${cumul.toLocaleString()} FCFA</span>
        `;
    }
}

// --- FONCTION B : SUPPRESSION SÉCURISÉE (ADMIN SEULEMENT) ---
function supprimerPaiement(payKey, matricule, montant) {
    // Vérification de sécurité
    const roleUtilisateur = localStorage.getItem('userRole') || window.roleActuel;
    if (roleUtilisateur !== 'directeur' && roleUtilisateur !== 'admin') {
        Swal.fire("Accès Interdit", "Seul le directeur peut annuler un paiement.", "error");
        return;
    }

    // 1. On récupère d'abord le motif du reçu pour savoir s'il faut déduire de la scolarité
    window.db.ref(`schools/${currentSchoolId}/${currentYear}/paiements/${payKey}`).once('value').then(paySnap => {
        if (!paySnap.exists()) {
            Swal.fire("Erreur", "Ce reçu n'existe plus.", "error");
            return;
        }

        const pData = paySnap.val();
        const motif = (pData.mois || pData.details || "").toUpperCase();
        const mt = Number(montant);

        Swal.fire({
            title: "Annuler ce paiement ?",
            text: `Le montant de ${mt.toLocaleString()} F sera réajouté à la dette de l'élève.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            confirmButtonText: "Oui, supprimer",
            cancelButtonText: "Annuler"
        }).then((result) => {
            if (result.isConfirmed) {
                const studentRef = window.db.ref(`schools/${currentSchoolId}/${currentYear}/students/${matricule}`);
                
                studentRef.once('value').then(snap => {
                    if(snap.exists()){
                        const s = snap.val();
                        const updates = {};

                        // A. SUPPRIMER LE REÇU
                        updates[`schools/${currentSchoolId}/${currentYear}/paiements/${payKey}`] = null;

                        // B. RECTIFIER LES TOTAUX ÉLÈVE
                        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/reste`] = (Number(s.reste) || 0) + mt;
                        updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/dejaPaye`] = Math.max(0, (Number(s.dejaPaye) || 0) - mt);

                        // C. RECTIFIER LA SCOLARITÉ (Le dossier qui gère les ✅)
                        // On vérifie si le motif du reçu concerne la scolarité ou un mois
                        const estScolarite = motif.includes("SCOL") || motif.includes("OCT") || motif.includes("NOV") || 
                                           motif.includes("DEC") || motif.includes("JANV") || motif.includes("FEV") || 
                                           motif.includes("MAR") || motif.includes("AVR") || motif.includes("MAI") || motif.includes("JUIN");

                        if (estScolarite) {
                            const ancienneScol = Number(s.detailsFinanciers?.scolaritePayee) || 0;
                            updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/scolaritePayee`] = Math.max(0, ancienneScol - mt);
                        }

                        // D. RECTIFIER LES FRAIS ANNEXES
                        if (motif.includes("INSCRIPTION")) updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/inscription`] = 0;
                        if (motif.includes("UNIFORME")) updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/uniforme`] = 0;
                        if (motif.includes("EXAMEN")) updates[`schools/${currentSchoolId}/${currentYear}/students/${matricule}/detailsFinanciers/examen`] = 0;

                        // E. METTRE À JOUR LE TABLEAU DE BORD (Stats globales)
                        updates[`schools/${currentSchoolId}/${currentYear}/stats/recetteJour`] = firebase.database.ServerValue.increment(-mt);
                        updates[`schools/${currentSchoolId}/${currentYear}/stats/recetteMois`] = firebase.database.ServerValue.increment(-mt);

                        // APPLICATION FINALE
                        window.db.ref().update(updates).then(() => {
                            Swal.fire("Supprimé", "La fiche élève et le tableau de bord ont été mis à jour.", "success");
                        }).catch(err => {
                            console.error(err);
                            Swal.fire("Erreur", "Problème lors de la mise à jour.", "error");
                        });
                    }
                });
            }
        });
    });
}