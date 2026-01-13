// js/frais.js

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formParamFrais');
    const tbody = document.getElementById('tbodyFrais');

    // --- 1. FONCTION DE CHARGEMENT ET VÉRIFICATION DES RÔLES ---
    window.initPage = () => {
        if (!tbody || !currentSchoolId) return;

        console.log("--- VÉRIFICATION DES DROITS ---");
        if (typeof currentUserData !== 'undefined' && currentUserData) {
            console.log("👤 Utilisateur :", currentUserData.name, "| 🔑 Rôle :", currentUserData.role);

            if (currentUserData.role === 'secretaire') {
                if (form) form.style.display = 'none';
            } else {
                if (form) form.style.display = 'block';
            }
        }

        const anneeParDefaut = "2025-2026"; 

        db.ref(`schools/${currentSchoolId}/${anneeParDefaut}/frais_scolaires`).on('value', (snapshot) => {
            tbody.innerHTML = ""; 
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const id = childSnapshot.key;
                    const data = childSnapshot.val();

                    let boutonPoubelle = "";
                    if (typeof currentUserData !== 'undefined' && currentUserData.role !== 'secretaire') {
                        boutonPoubelle = `<button onclick="supprimerFrais('${id}', '${data.annee}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 18px;">🗑️</button>`;
                    }

                    const row = `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 12px;">${data.annee}</td>
                            <td style="padding: 12px;"><strong>${data.classe}</strong></td>
                            <td style="padding: 12px;">${data.type} ${data.fractionnable ? ' (Mensuel)' : ''}</td>
                            <td style="padding: 12px;">${data.montant.toLocaleString()} FCFA</td>
                            <td style="padding: 12px;">${boutonPoubelle}</td>
                        </tr>`;
                    tbody.innerHTML += row;
                });
            } else {
                tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding: 20px;'>Aucun frais enregistré.</td></tr>";
            }
        });
    };

    // --- 2. ENREGISTRER UN NOUVEAU FRAIS ---
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!currentSchoolId) {
                Swal.fire("Erreur", "Session école non identifiée.", "error");
                return;
            }

            const idFrais = "FRAIS-" + Date.now();
            const anneeSelectionnee = document.getElementById('anneeFrais').value;
            
            // Sécurité : Récupération prudente des nouveaux éléments
            const elFraction = document.getElementById('fractionnable');
            const elMensualites = document.getElementById('nbMensualites');
            const elMin = document.getElementById('minVersement');

            const fraisData = {
                annee: anneeSelectionnee,
                classe: document.getElementById('classeFrais').value,
                type: document.getElementById('typeFrais').value,
                libelle: document.getElementById('libelleFrais').value,
                montant: parseFloat(document.getElementById('montantTotal').value) || 0,
                dateLimite: document.getElementById('dateLimite').value,
                
                // Nouveaux paramètres récupérés ici
                fractionnable: elFraction ? elFraction.checked : false,
                nbMensualites: elMensualites ? (parseInt(elMensualites.value) || 1) : 1,
                minVersement: elMin ? (parseFloat(elMin.value) || 0) : 0,
                
                statut: "Actif",
                schoolId: currentSchoolId 
            };

            db.ref(`schools/${currentSchoolId}/${anneeSelectionnee}/frais_scolaires/${idFrais}`).set(fraisData)
                .then(() => {
                    Swal.fire({ title: 'Succès', text: 'Configuration enregistrée !', icon: 'success' });
                    form.reset();
                })
                .catch(err => {
                    console.error("Erreur Firebase :", err);
                    Swal.fire("Erreur", "Problème de connexion.", "error");
                });
        });
    }

    if (typeof currentSchoolId !== 'undefined' && currentSchoolId) initPage();
});

// --- 3. SUPPRIMER UN FRAIS ---
function supprimerFrais(id, annee) {
    if (typeof currentUserData !== 'undefined' && currentUserData.role === 'secretaire') {
        Swal.fire("Interdit", "Action réservée à la direction.", "warning");
        return;
    }

    Swal.fire({
        title: 'Supprimer ?',
        text: "Cette action est irréversible.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Oui, supprimer'
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`schools/${currentSchoolId}/${annee}/frais_scolaires/${id}`).remove();
        }
    });
}