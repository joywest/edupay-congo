const currentYear = "2025-2026";

window.onload = function() {
    // On attend que Firebase soit prêt
    setTimeout(() => {
        if(window.db) {
            // RÉCUPÉRATION DYNAMIQUE : On prend l'ID de l'école stocké au login
            // Si rien n'est stocké, on met "lyce_excellence" par défaut
            const schoolId = localStorage.getItem('currentSchoolId') || "lyce_excellence"; 
            console.log("🚀 Analyse dynamique lancée pour :", schoolId);
            chargerDonneesStatistiques(schoolId);
        } else {
            console.error("❌ Firebase n'est pas initialisé");
        }
    }, 1000);
};

async function chargerDonneesStatistiques(schoolId) {
    // --- BARRIÈRE DE SÉCURITÉ ---
    // On vérifie dans la session du navigateur si le code a été validé
    const estAutorise = sessionStorage.getItem('directionDebloquee');
    
    if (estAutorise !== 'true') {
        // Si non autorisé, on affiche un message d'erreur stylisé et on bloque Firebase
        const container = document.querySelector('.container') || document.body;
        container.innerHTML = `
            <div style="text-align:center; margin-top:100px; font-family:sans-serif; padding:20px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🔒</div>
                <h1 style="color:#ef4444;">Accès Restreint</h1>
                <p style="color:#666; font-size:18px;">Cette analyse détaillée est réservée à la Direction.</p>
                <p>Veuillez valider le code d'accès sur le rapport financier avant de consulter les graphiques.</p>
                <br>
                <button onclick="window.location.href='directeur.html'" 
                        style="padding:12px 25px; background:#8b5cf6; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.2);">
                    Retour au Rapport
                </button>
            </div>`;
        return; // ARRÊT TOTAL : On ne charge aucune donnée de Firebase
    }

    // --- LOGIQUE ORIGINALE ---
    try {
        const pathStudents = `schools/${schoolId}/${currentYear}/students`;
        const pathPaiements = `schools/${schoolId}/${currentYear}/paiements`;

        const studentsSnap = await window.db.ref(pathStudents).once('value');
        const paiementsSnap = await window.db.ref(pathPaiements).once('value');
        
        const students = studentsSnap.val() || {};
        const paiements = paiementsSnap.val() || {};

        analyser(students, paiements);
    } catch (error) {
        console.error("🔥 Erreur Firebase :", error);
    }
}

function analyser(students, paiements) {
    let filles = 0, garcons = 0;
    let totalDu = 0, totalPaye = 0;
    let modes = { "Cash": 0, "Mobile Money": 0 };
    let classes = {};

    // 1. Analyse des élèves
    Object.values(students).forEach(s => {
        // Genre
        const sexe = (s.sexe || "").toUpperCase();
        if (sexe === "F" || sexe === "FEMME") filles++; else garcons++;

        // Finances
        totalDu += parseFloat(s.scolariteTotale || 0);
        totalPaye += parseFloat(s.detailsFinanciers?.scolaritePayee || 0);

        // Classes
        const cl = s.classe || "Non défini";
        classes[cl] = (classes[cl] || 0) + 1;
    });

    // 2. Analyse des paiements
    Object.values(paiements).forEach(p => {
        const montant = parseFloat(p.montantTotal || 0);
        const methode = (p.methode || "").toLowerCase();
        if (methode.includes("mobile") || methode.includes("momo")) {
            modes["Mobile Money"] += montant;
        } else {
            modes["Cash"] += montant;
        }
    });

    // 3. Mise à jour Interface
    const taux = totalDu > 0 ? Math.round((totalPaye / totalDu) * 100) : 0;
    const tauxEl = document.getElementById('tauxGlobal');
    if(tauxEl) tauxEl.innerText = taux + "%";
    
    const ratioEl = document.getElementById('ratioGenre');
    if(ratioEl) ratioEl.innerText = `${filles} F / ${garcons} G`;

    // 4. Génération des graphiques
    genererGraphiques(filles, garcons, totalPaye, (totalDu - totalPaye), modes, classes);
}

function genererGraphiques(f, g, paye, reste, modes, classes) {
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateElement = document.getElementById('dateStat') || document.getElementById('currentDate');
    if (dateElement) {
        dateElement.innerText = "Situation au " + new Date().toLocaleDateString('fr-FR', optionsDate);
    }

    // CONFIGURATION POUR LES NOMBRES (Élèves) : stepSize 1 est OK ici
    const optCount = { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    };

    // CONFIGURATION POUR LES FINANCES (Argent) : PAS de stepSize 1
    const optMoney = { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: { 
            y: { 
                beginAtZero: true,
                ticks: {
                    callback: function(value) { return value.toLocaleString() + ' F'; }
                }
            } 
        }
    };

    // 1. Genre (Doughnut)
    new Chart(document.getElementById('chartGenre'), {
        type: 'doughnut',
        data: { labels: ['Filles', 'Garçons'], datasets: [{ data: [f, g], backgroundColor: ['#ff4d6d', '#4361ee'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Recouvrement (Pie)
    new Chart(document.getElementById('chartRecouvrement'), {
        type: 'pie',
        data: { labels: ['Encaissé', 'Impayé'], datasets: [{ data: [paye, reste], backgroundColor: ['#10b981', '#ef4444'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 3. Modes (Bar) - UTILISE optMoney (Argent)
    new Chart(document.getElementById('chartPaymentModes'), {
        type: 'bar',
        data: { 
            labels: ['Espèces', 'Mobile Money'], 
            datasets: [{ label: 'FCFA', data: [modes.Cash, modes["Mobile Money"]], backgroundColor: '#f59e0b' }] 
        },
        options: optMoney
    });

    // 4. Effectif par classe - UTILISE optCount (Nombre d'élèves)
    new Chart(document.getElementById('chartClasses'), {
        type: 'bar',
        data: { 
            labels: Object.keys(classes), 
            datasets: [{ 
                label: 'Nombre d\'élèves', 
                data: Object.values(classes), 
                backgroundColor: '#3f37c9' 
            }] 
        },
        options: optCount
    });
}