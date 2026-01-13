let currentYear = "2025-2026"; 
let allStudents = {}; 
let selectedMatricule = ""; 

// CETTE FONCTION SE LANCERA AUTOMATIQUEMENT GRACE A FIREBASE.JS
window.initPage = function() {
    const schoolId = window.currentSchoolId;
    console.log("🚀 Initialisation de la page Paiements pour :", schoolId);

    if (!schoolId) {
        console.error("Erreur : schoolId introuvable au démarrage.");
        return;
    }

    // 1. ÉCOUTER L'ANNÉE ACTIVE
    window.db.ref(`schools/${schoolId}/config/currentYear`).on('value', (snapshot) => {
        if (snapshot.exists()) {
            currentYear = snapshot.val();
        }
        chargerBaseEleves(schoolId); 
    });
};

function chargerBaseEleves(schoolId) {
    window.db.ref(`schools/${schoolId}/${currentYear}/students`).on('value', (snapshot) => {
        allStudents = snapshot.val() || {};
        const datalist = document.getElementById('studentsList');
        if (!datalist) return;
        
        datalist.innerHTML = ""; 
        console.log("✅ " + Object.keys(allStudents).length + " élèves chargés.");

        for (let id in allStudents) {
            let s = allStudents[id];
            let option = document.createElement('option');
            option.value = String(s.matricule); 
            option.text = `${s.nom.toUpperCase()} (${s.classe})`;
            datalist.appendChild(option);
        }
    });
}
function rechercheEleveAutomatique(valeur) {
    const infoBox = document.getElementById('infoEleveSelectionne');
    const recherche = valeur.trim().toUpperCase();
    
    let eleve = allStudents[recherche] || Object.values(allStudents).find(s => 
        (s.nom && s.nom.toUpperCase() === recherche) || (s.matricule && String(s.matricule) === recherche)
    );

    if (eleve) {
        selectedMatricule = String(eleve.matricule);
        document.getElementById('displayStudentName').innerText = eleve.nom.toUpperCase();
        document.getElementById('displayStudentClass').innerText = eleve.classe;
        
        const totalScolarite = parseFloat(eleve.scolariteTotale) || 90000; 
        const dejaPaye = parseFloat(eleve.detailsFinanciers?.scolaritePayee) || 0;
        let resteReel = totalScolarite - dejaPaye;

        document.getElementById('displayPaid').innerText = dejaPaye.toLocaleString() + " FCFA";
        document.getElementById('displayRest').innerText = resteReel.toLocaleString() + " FCFA";
        
        // CORRECTION VISIBILITÉ : On utilise du ROUGE vif pour la dette
        const restEl = document.getElementById('displayRest');
        if (resteReel > 0) {
            restEl.style.color = "#ef4444"; // ROUGE (très visible)
        } else {
            restEl.style.color = "#10b981"; // VERT
        }

        // --- INTELLIGENCE AJOUTÉE : Génération de la grille et reset montant ---
        genererGrilleMois(eleve); 
        document.getElementById('payScolarite').value = 0; 
        // -----------------------------------------------------------------------

        infoBox.style.display = "grid"; 
    } else {
        selectedMatricule = "";
        if(infoBox) infoBox.style.display = "none";
        
        // On vide la grille si aucun élève n'est trouvé
        const container = document.getElementById('listeMoisContainer');
        if(container) container.innerHTML = "";
    }
}

// GESTION DU BOUTON VALIDER
document.getElementById('formPaiement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // On récupère le schoolId de window
    const schoolId = window.currentSchoolId;

    if (!selectedMatricule || !allStudents[selectedMatricule]) { 
        Swal.fire("Attention", "Veuillez sélectionner un élève valide", "warning"); 
        return; 
    }

    const s = allStudents[selectedMatricule];
    const mois = document.getElementById('payMois').value;
    const modeRadio = document.querySelector('input[name="mode"]:checked');
    
    if (!modeRadio) {
        Swal.fire("Attention", "Choisissez un mode de paiement (Cash ou Mobile)", "warning");
        return;
    }

    let v_scol = parseFloat(document.getElementById('payScolarite').value) || 0;
    let v_ins = 0, v_uni = 0, v_exa = 0;

    if (mois === "Frais Divers / Inscription") {
        v_ins = parseFloat(document.getElementById('payInscrip').value) || 0;
        v_uni = parseFloat(document.getElementById('payUniforme').value) || 0;
        v_exa = parseFloat(document.getElementById('payExamen').value) || 0;
    }

    const montantTotalRecu = v_scol + v_ins + v_uni + v_exa;
    
    if (montantTotalRecu <= 0) { 
        Swal.fire("Erreur", "Le montant doit être supérieur à 0", "error"); 
        return; 
    }

    const idRecu = "REC-" + Date.now();
    const updates = {};
    const path = `schools/${schoolId}/${currentYear}/students/${selectedMatricule}`;

    const nScol = (parseFloat(s.detailsFinanciers?.scolaritePayee) || 0) + v_scol;
    const nIns  = (parseFloat(s.detailsFinanciers?.inscription) || 0) + v_ins;
    const nUni  = (parseFloat(s.detailsFinanciers?.uniforme) || 0) + v_uni;
    const nExa  = (parseFloat(s.detailsFinanciers?.examen) || 0) + v_exa;

    updates[`${path}/detailsFinanciers/scolaritePayee`] = nScol;
    updates[`${path}/detailsFinanciers/inscription`] = nIns;
    updates[`${path}/detailsFinanciers/uniforme`] = nUni;
    updates[`${path}/detailsFinanciers/examen`] = nExa;

    const totalScol = parseFloat(s.scolariteTotale) || 0;
    updates[`${path}/reste`] = totalScol - nScol;

   updates[`schools/${schoolId}/${currentYear}/paiements/${idRecu}`] = {
        id: idRecu,
        matricule: selectedMatricule,
        nomEleve: s.nom,
        classe: s.classe,
        montantTotal: montantTotalRecu,
        mois: mois,
        date: new Date().toLocaleDateString('fr-FR'),
        methode: modeRadio.value
    };

    // --- AJOUT CORRECTIF STATS ---
    // Ces lignes permettent de mettre à jour le tableau de bord automatiquement
    updates[`schools/${schoolId}/${currentYear}/stats/recetteJour`] = firebase.database.ServerValue.increment(montantTotalRecu);
    updates[`schools/${schoolId}/${currentYear}/stats/recetteMois`] = firebase.database.ServerValue.increment(montantTotalRecu);
    updates[`${path}/dejaPaye`] = (parseFloat(s.dejaPaye) || 0) + montantTotalRecu;
    // ----------------------------

    try {
        await window.db.ref().update(updates);
        
        // On affiche le message de succès
        Swal.fire({
            title: "Succès",
            text: "Paiement validé avec succès !",
            icon: "success",
            timer: 2000, // Le message disparaît seul après 2s
            showConfirmButton: false
        });

        // --- LOGIQUE SANS RECHARGER LA PAGE ---
        
        // 1. Réinitialiser les champs de saisie du formulaire
        document.getElementById('formPaiement').reset();
        
        // 2. Mettre à jour l'objet local 'allStudents' pour que le calcul soit juste 
        // si on sélectionne à nouveau le même élève immédiatement
        if(!allStudents[selectedMatricule].detailsFinanciers) allStudents[selectedMatricule].detailsFinanciers = {};
        allStudents[selectedMatricule].detailsFinanciers.scolaritePayee = nScol;
        allStudents[selectedMatricule].detailsFinanciers.inscription = nIns;
        allStudents[selectedMatricule].detailsFinanciers.uniforme = nUni;
        allStudents[selectedMatricule].detailsFinanciers.examen = nExa;
        // Mise à jour du dejaPaye local pour la cohérence
        allStudents[selectedMatricule].dejaPaye = (parseFloat(s.dejaPaye) || 0) + montantTotalRecu;

        // 3. Rafraîchir l'affichage des infos à l'écran
        // Cela mettra à jour les compteurs "Payé" et "Reste" instantanément
        rechercheEleveAutomatique(selectedMatricule);

        // 4. Remettre le focus sur la recherche pour l'élève suivant
        document.querySelector('input[list="studentsList"]').value = "";
        document.querySelector('input[list="studentsList"]').focus();

    } catch (err) { 
        Swal.fire("Erreur", err.message, "error"); 
    }
});

function genererGrilleMois(eleve) {
    const container = document.getElementById('listeMoisContainer');
    const moisNoms = ["Octobre", "Novembre", "Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin"];
    container.innerHTML = "";
    
    // Calcul du montant par mois (Total / 9)
    const totalScol = parseFloat(eleve.scolariteTotale) || 90000;
    const montantMensuel = Math.round(totalScol / 9);
    
    // On regarde combien de mois ont déjà été payés selon le solde
    let soldePaye = parseFloat(eleve.detailsFinanciers?.scolaritePayee) || 0;
    
    moisNoms.forEach(nom => {
        const div = document.createElement('div');
        div.className = 'mois-checkbox';
        
        if (soldePaye >= montantMensuel) {
            div.innerHTML = `${nom}<br><small>✅ Payé</small>`;
            div.classList.add('deja-paye');
            soldePaye -= montantMensuel;
        } else {
            div.innerText = nom;
            div.onclick = function() {
                this.classList.toggle('selected');
                calculerTotalSelection(montantMensuel);
            };
        }
        container.appendChild(div);
    });

    // Ajouter le bouton spécial "Frais Divers" à la fin
    const divDivers = document.createElement('div');
    divDivers.className = 'mois-checkbox';
    divDivers.style.gridColumn = "1 / -1"; // Prend toute la largeur
    divDivers.innerHTML = "🎁 Frais Divers / Inscription";
    divDivers.onclick = function() {
        this.classList.toggle('selected');
        toggleSpecialFees(this.classList.contains('selected'));
    };
    container.appendChild(divDivers);
}

function calculerTotalSelection(prixMensuel) {
    const selectionnes = document.querySelectorAll('.mois-checkbox.selected:not(:last-child)');
    const total = selectionnes.length * prixMensuel;
    document.getElementById('payScolarite').value = total;
    
    // On met à jour le champ caché payMois pour ton reçu
    const noms = Array.from(selectionnes).map(el => el.innerText.split('\n')[0]);
    document.getElementById('payMois').value = noms.join(', ');
}

function toggleSpecialFees(isOpened) {
    const extra = document.getElementById('extraFees');
    extra.style.display = isOpened ? "grid" : "none";
    if (isOpened) document.getElementById('payMois').value += " + Frais Divers";
}