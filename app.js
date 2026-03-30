let currentSection = localStorage.getItem("currentSection") || "payroll";
let currentPayrollTab = localStorage.getItem("currentPayrollTab") || "monthly_pay";
let currentRightsTab = localStorage.getItem("currentRightsTab") || "resign_notice";
let remoteData = {};

const payrollTabs = {
  monthly_pay: "Paie mensuelle",
  advance_15n: "Avance 15N",
  monthly_bonus: "Prime mensuelle"
};

const rightsTabs = {
  resign_notice: "Démission avec préavis",
  resign_no_notice: "Démission sans préavis",
  dismissal_notice: "Licenciement avec préavis",
  holiday_bonus: "Majoration férié"
};

const advanceDates = {
  open: "2026-04-01",
  close: "2026-04-05"
};

const banks = [
  {
    key: "bmoi",
    label: "BMOI",
    logos: ["bmoi.png"]
  },
  {
    key: "mcb",
    label: "MCB",
    logos: ["mcb.png"]
  },
  {
    key: "bni_bred",
    label: "BNI / BRED",
    logos: ["bni.png", "bred.png"]
  },
  {
    key: "boa_microcred_acces",
    label: "BOA / Autres",
    logos: ["boa.png", "acces.png"]
  }
];

function formatAr(value) {
  const safeValue = Number(value || 0);
  return `${safeValue.toLocaleString("fr-FR")} Ar`;
}

function getStatusClass(value) {
  const v = String(value || "").toLowerCase();

  if (
    v === "ok" ||
    v === "positionné" ||
    v === "positionne" ||
    v === "payé" ||
    v === "paye"
  ) {
    return "state-done";
  }

  if (
    v.includes("attente") ||
    v.includes("cours") ||
    v.includes("traitement")
  ) {
    return "state-active";
  }

  return "state-todo";
}

function getProgress(data) {
  const step = String(data.currentStep || "").toLowerCase();
  const bmoi = String(data.bmoi || "").toLowerCase();

  if (bmoi === "ok" || bmoi === "positionné" || bmoi === "positionne") {
    return 100;
  }

  if (step.includes("préparation") || step.includes("preparation")) return 20;
  if (step.includes("daf")) return 40;
  if (step.includes("constat")) return 60;
  if (step.includes("sign")) return 80;
  if (step.includes("banque") || step.includes("virement")) return 90;

  return 0;
}

function isAdvanceOpen() {
  const data = remoteData["advance_15n"] || {};

  const open = data.openDate || advanceDates.open;
  const close = data.closeDate || advanceDates.close;

  const today = new Date();
  const openDate = new Date(open);
  const closeDate = new Date(close);

  today.setHours(0, 0, 0, 0);
  openDate.setHours(0, 0, 0, 0);
  closeDate.setHours(0, 0, 0, 0);

  return today >= openDate && today <= closeDate;
}

function renderMainTabs() {
  return `
    <div class="tabs main-tabs">
      <button class="tab-button ${currentSection === "payroll" ? "active" : ""}" data-section="payroll">
        Suivi de paie
      </button>
      <button class="tab-button ${currentSection === "rights" ? "active" : ""}" data-section="rights">
        Calculer son droit
      </button>
    </div>
  `;
}

function renderPayrollTabs() {
  return `
    <div class="tabs sub-tabs">
      ${Object.keys(payrollTabs).map(key => `
        <button class="tab-button ${key === currentPayrollTab ? "active" : ""}" data-payroll-tab="${key}">
          ${payrollTabs[key]}
          ${key === "advance_15n"
            ? `<span class="tab-badge ${isAdvanceOpen() ? "tab-open" : "tab-closed"}">${isAdvanceOpen() ? "Ouvert" : "Fermé"}</span>`
            : ""}
        </button>
      `).join("")}
    </div>
  `;
}

function renderRightsTabs() {
  return `
    <div class="tabs sub-tabs">
      ${Object.keys(rightsTabs).map(key => `
        <button class="tab-button ${key === currentRightsTab ? "active" : ""}" data-rights-tab="${key}">
          ${rightsTabs[key]}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPayrollView() {
  const data = remoteData[currentPayrollTab] || {};
  const progress = getProgress(data);

  return `
    ${renderPayrollTabs()}

    <div class="card hero-card">
      <div class="card-inner">
        <div class="hero-head">
          <div>
            <h2>${payrollTabs[currentPayrollTab]}</h2>
            <p class="hero-step">Étape actuelle : ${data.currentStep || "-"}</p>
            ${currentPayrollTab === "advance_15n" ? `
              <p class="advance-dates">
                Ouvert le : ${(remoteData["advance_15n"] && remoteData["advance_15n"].openDate) || advanceDates.open}<br>
                Fermé le : ${(remoteData["advance_15n"] && remoteData["advance_15n"].closeDate) || advanceDates.close}
              </p>
            ` : ""}
          </div>
          <div class="progress-badge">${progress}%</div>
        </div>

        <div class="progress-bar">
          <div class="progress-value" style="width:${progress}%"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-inner">
        <h3>Statut des virements</h3>

        ${banks.map(bank => `
          <div class="bank-row">
            <div class="bank-left">
              <div class="bank-logos">
                ${bank.logos.map(logo => `
                  <img src="${logo}" alt="${bank.label}" class="bank-logo">
                `).join("")}
              </div>
              <span class="bank-label">${bank.label}</span>
            </div>
            <span class="state-pill ${getStatusClass(data[bank.key])}">
              ${data[bank.key] || "En attente"}
            </span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRightsIntro() {
  const descriptions = {
    resign_notice: "Estimez votre STC en cas de démission avec préavis effectué.",
    resign_no_notice: "Estimez le solde compensé en cas de démission sans préavis.",
    dismissal_notice: "Calculez un STC indicatif en cas de licenciement avec préavis.",
    holiday_bonus: "Calculez la majoration estimée d’un jour férié travaillé."
  };

  return `
    <div class="card hero-card">
      <div class="card-inner">
        <div class="hero-head">
          <div>
            <h2>${rightsTabs[currentRightsTab]}</h2>
            <p class="hero-step">${descriptions[currentRightsTab]}</p>
          </div>
          <div class="rights-badge">RH</div>
        </div>
      </div>
    </div>
  `;
}

function renderRightsForm() {
  switch (currentRightsTab) {
    case "resign_notice":
      return `
        <div class="card">
          <div class="card-inner">
            <h3>Formulaire de calcul</h3>

            <div class="form-grid">
              <div class="form-group">
                <label for="salary">Salaire net mensuel (Ariary)</label>
                <input id="salary" type="number" min="0" placeholder="Ex : 2000000">
              </div>

              <div class="form-group">
                <label for="seniority">Ancienneté (en années)</label>
                <input id="seniority" type="number" min="0" step="0.1" placeholder="Ex : 5">
              </div>

              <div class="form-group">
                <label for="leaveDays">Jours de congés non pris (ouvrables)</label>
                <input id="leaveDays" type="number" min="0" placeholder="Ex : 10">
              </div>

              <div class="form-group">
                <label for="bonusNote">Note prime semestrielle</label>
                <select id="bonusNote">
                  <option value="0">Pas de prime</option>
                  <option value="1.5">A+ (150%)</option>
                  <option value="1.2">A (120%)</option>
                  <option value="1">B+ (100%)</option>
                  <option value="0.75">B (75%)</option>
                  <option value="0.35">C (35%)</option>
                  <option value="0.15">B- (15%)</option>
                </select>
                <small>Laissez sur “Pas de prime” si hors juin/décembre.</small>
              </div>
            </div>

            <button class="action-button" data-calc-action="resign_notice">
              Calculer le STC
            </button>
          </div>
        </div>
      `;

    case "resign_no_notice":
      return `
        <div class="card">
          <div class="card-inner">
            <h3>Formulaire de calcul</h3>

            <div class="form-grid">
              <div class="form-group">
                <label for="salary">Salaire net mensuel (Ariary)</label>
                <input id="salary" type="number" min="0" placeholder="Ex : 2000000">
              </div>

              <div class="form-group">
                <label for="seniority">Ancienneté (en années)</label>
                <input id="seniority" type="number" min="0" step="0.1" placeholder="Ex : 5">
              </div>

              <div class="form-group">
                <label for="leaveDays">Jours de congés non pris (ouvrables)</label>
                <input id="leaveDays" type="number" min="0" placeholder="Ex : 10">
              </div>

              <div class="form-group">
                <label for="bonusNote">Note de la dernière prime semestrielle</label>
                <select id="bonusNote">
                  <option value="0">Pas de prime / Non concerné</option>
                  <option value="1.5">A+ (150%)</option>
                  <option value="1.2">A (120%)</option>
                  <option value="1">B+ (100%)</option>
                  <option value="0.75">B (75%)</option>
                  <option value="0.35">C (35%)</option>
                  <option value="0.15">B- (15%)</option>
                </select>
                <small>Laissez sur “Pas de prime” si hors juin/décembre.</small>
              </div>
            </div>

            <button class="action-button danger" data-calc-action="resign_no_notice">
              Calculer le STC
            </button>
          </div>
        </div>
      `;

    case "dismissal_notice":
      return `
        <div class="card">
          <div class="card-inner">
            <h3>Formulaire de calcul</h3>

            <div class="form-grid">
              <div class="form-group">
                <label for="salary">Salaire net mensuel (Ariary)</label>
                <input id="salary" type="number" min="0" placeholder="Ex : 2000000">
              </div>

              <div class="form-group">
                <label for="seniority">Ancienneté (en années, ex : 8.5)</label>
                <input id="seniority" type="number" min="0" step="0.01" placeholder="Ex : 8.5">
              </div>

              <div class="form-group">
                <label for="leaveDays">Jours de congés non pris (ouvrables)</label>
                <input id="leaveDays" type="number" min="0" placeholder="Ex : 10">
              </div>

              <div class="form-group">
                <label for="bonusNote">Note de la dernière prime semestrielle</label>
                <select id="bonusNote">
                  <option value="0">Pas de prime / Non concerné</option>
                  <option value="1.5">A+ (150%)</option>
                  <option value="1.2">A (120%)</option>
                  <option value="1">B+ (100%)</option>
                  <option value="0.75">B (75%)</option>
                  <option value="0.35">C (35%)</option>
                  <option value="0.15">B- (15%)</option>
                </select>
                <small>Laissez sur “Pas de prime” si hors juin/décembre.</small>
              </div>
            </div>

            <button class="action-button info" data-calc-action="dismissal_notice">
              Calculer le STC
            </button>
          </div>
        </div>
      `;

    case "holiday_bonus":
      return `
        <div class="card">
          <div class="card-inner">
            <h3>Formulaire de calcul</h3>

            <div class="form-grid">
              <div class="form-group">
                <label for="salary">Salaire net mensuel (Ariary)</label>
                <input id="salary" type="number" min="0" placeholder="Ex : 2000000">
              </div>

              <div class="form-group">
                <label for="hoursWorked">Nombre d’heures travaillées</label>
                <input id="hoursWorked" type="number" min="0" step="0.1" placeholder="Ex : 8">
              </div>

              <div class="form-group">
                <label for="bonusRate">Pourcentage majoration</label>
                <select id="bonusRate">
                  <option value="1">100%</option>
                  <option value="1.5">150%</option>
                  <option value="2">200%</option>
                </select>
              </div>
            </div>

            <button class="action-button cyan" data-calc-action="holiday_bonus">
              Calculer ma majoration
            </button>
          </div>
        </div>
      `;

    default:
      return "";
  }
}

function renderRightsResultWrapper() {
  return `
    <div class="card result-card-shell">
      <div class="card-inner">
        <h3>Résultat</h3>
        <div id="rights-result" class="result-card empty">
          Remplissez le formulaire puis lancez le calcul.
        </div>
      </div>
    </div>
  `;
}

function renderRightsView() {
  return `
    ${renderRightsTabs()}
    ${renderRightsIntro()}
    ${renderRightsForm()}
    ${renderRightsResultWrapper()}
  `;
}

function render() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      <h1>💰 Suivi des Paies</h1>
      ${renderMainTabs()}
      ${currentSection === "payroll" ? renderPayrollView() : renderRightsView()}
      <div class="app-footer">© RoberiX 2026 — Plateforme RH unifiée</div>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-section]").forEach(btn => {
    btn.onclick = () => {
      currentSection = btn.getAttribute("data-section");
      localStorage.setItem("currentSection", currentSection);
      render();
    };
  });

  document.querySelectorAll("[data-payroll-tab]").forEach(btn => {
    btn.onclick = () => {
      currentPayrollTab = btn.getAttribute("data-payroll-tab");
      localStorage.setItem("currentPayrollTab", currentPayrollTab);
      render();
    };
  });

  document.querySelectorAll("[data-rights-tab]").forEach(btn => {
    btn.onclick = () => {
      currentRightsTab = btn.getAttribute("data-rights-tab");
      localStorage.setItem("currentRightsTab", currentRightsTab);
      render();
    };
  });

  document.querySelectorAll("[data-calc-action]").forEach(btn => {
    btn.onclick = () => {
      const action = btn.getAttribute("data-calc-action");
      performCalculation(action);
    };
  });
}

function getNoticeMonths(seniority) {
  let notice = 1;
  if (seniority >= 10) notice = 2;
  else if (seniority >= 5) notice = 1.5;
  return notice;
}

function readCommonStcFields() {
  const salary = parseFloat(document.getElementById("salary")?.value);
  const seniority = parseFloat(document.getElementById("seniority")?.value);
  const leaveDays = parseInt(document.getElementById("leaveDays")?.value, 10);
  const bonusNote = parseFloat(document.getElementById("bonusNote")?.value);

  return { salary, seniority, leaveDays, bonusNote };
}

function setRightsResult(html, isError = false) {
  const result = document.getElementById("rights-result");
  if (!result) return;

  result.classList.remove("empty", "error");
  if (isError) {
    result.classList.add("error");
  }

  result.innerHTML = html;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function performCalculation(action) {
  switch (action) {
    case "resign_notice":
      calculateResignationWithNotice();
      break;
    case "resign_no_notice":
      calculateResignationWithoutNotice();
      break;
    case "dismissal_notice":
      calculateDismissalWithNotice();
      break;
    case "holiday_bonus":
      calculateHolidayBonus();
      break;
    default:
      break;
  }
}

function calculateResignationWithNotice() {
  const { salary, seniority, leaveDays, bonusNote } = readCommonStcFields();

  if (isNaN(salary) || isNaN(seniority) || isNaN(leaveDays) || isNaN(bonusNote)) {
    setRightsResult("<p>Veuillez remplir tous les champs correctement.</p>", true);
    return;
  }

  const notice = getNoticeMonths(seniority);
  const noticeSalary = salary * notice;
  const dailySalary = salary / 26;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;
  const grossTotal = noticeSalary + leaveCompensation + halfYearBonus;
  const netTotal = grossTotal * 0.87;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>🕒 Préavis estimé</span><strong>${notice} mois</strong></div>
      <div class="result-line"><span>🏖️ Indemnité congés (${leaveDays} jours)</span><strong>${formatAr(leaveCompensation)}</strong></div>
      <div class="result-line"><span>🎁 Prime semestrielle</span><strong>${formatAr(halfYearBonus)}</strong></div>
      <div class="result-line total"><span>💵 Total brut estimé</span><strong>${formatAr(grossTotal)}</strong></div>
      <div class="result-line total total-net"><span>💰 Total net estimé (87%)</span><strong>${formatAr(netTotal)}</strong></div>
    </div>
  `);
}

function calculateResignationWithoutNotice() {
  const { salary, seniority, leaveDays, bonusNote } = readCommonStcFields();

  if (isNaN(salary) || isNaN(seniority) || isNaN(leaveDays) || isNaN(bonusNote)) {
    setRightsResult("<p>Veuillez remplir tous les champs correctement.</p>", true);
    return;
  }

  const notice = getNoticeMonths(seniority);
  const dailySalary = salary / 26;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;

  const noticeDebt = salary * notice;
  const companyOwesGross = leaveCompensation + halfYearBonus;
  const companyOwesNet = companyOwesGross * 0.87;
  const noticeDebtNet = noticeDebt * 0.87;
  const compensatedBalance = companyOwesNet - noticeDebtNet;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>📅 Préavis non effectué</span><strong>${notice} mois</strong></div>
      <div class="result-line"><span>💼 Somme due à l’entreprise (brut)</span><strong>${formatAr(noticeDebt)}</strong></div>
      <div class="result-line"><span>🏖️ Congés + prime dus par l’entreprise (brut)</span><strong>${formatAr(companyOwesGross)}</strong></div>
      <div class="result-line total negative">
        <span>💸 Net à payer à l’entreprise</span>
        <strong>${compensatedBalance < 0 ? formatAr(Math.abs(compensatedBalance)) : "0 Ar"}</strong>
      </div>
      <div class="result-line total total-net">
        <span>💰 Net à recevoir</span>
        <strong>${compensatedBalance > 0 ? formatAr(compensatedBalance) : "0 Ar"}</strong>
      </div>
    </div>
  `);
}

function calculateDismissalWithNotice() {
  const { salary, seniority, leaveDays, bonusNote } = readCommonStcFields();

  if (isNaN(salary) || isNaN(seniority) || isNaN(leaveDays) || isNaN(bonusNote)) {
    setRightsResult("<p>Veuillez remplir tous les champs correctement.</p>", true);
    return;
  }

  const notice = getNoticeMonths(seniority);
  const noticeSalary = salary * notice;
  const dailySalary = salary / 26;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;

  let dismissalCompensation = 0;
  if (seniority >= 1) {
    if (seniority <= 10) {
      dismissalCompensation = (salary / 4) * seniority;
    } else {
      const firstPart = (salary / 4) * 10;
      const secondPart = (salary / 3) * (seniority - 10);
      dismissalCompensation = firstPart + secondPart;
    }
  }

  const grossTotal = noticeSalary + leaveCompensation + halfYearBonus + dismissalCompensation;
  const netTotal = grossTotal * 0.87;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>📆 Préavis</span><strong>${notice} mois</strong></div>
      <div class="result-line"><span>📩 Préavis payé</span><strong>${formatAr(noticeSalary)}</strong></div>
      <div class="result-line"><span>🏖️ Indemnité congés (${leaveDays} jours)</span><strong>${formatAr(leaveCompensation)}</strong></div>
      <div class="result-line"><span>🎁 Prime semestrielle</span><strong>${formatAr(halfYearBonus)}</strong></div>
      <div class="result-line"><span>⚖️ Indemnité de licenciement</span><strong>${formatAr(dismissalCompensation)}</strong></div>
      <div class="result-line total"><span>💵 Total brut</span><strong>${formatAr(grossTotal)}</strong></div>
      <div class="result-line total total-net"><span>💰 Total net estimé (87%)</span><strong>${formatAr(netTotal)}</strong></div>
      <div class="result-note">
        ⚠️ Vérifiez votre contrat ou convention collective pour confirmer les droits applicables.
      </div>
    </div>
  `);
}

function calculateHolidayBonus() {
  const salary = parseFloat(document.getElementById("salary")?.value);
  const hoursWorked = parseFloat(document.getElementById("hoursWorked")?.value);
  const bonusRate = parseFloat(document.getElementById("bonusRate")?.value);

  if (isNaN(salary) || isNaN(hoursWorked) || isNaN(bonusRate)) {
    setRightsResult("<p>Veuillez remplir tous les champs correctement.</p>", true);
    return;
  }

  const hourlyRate = salary / 173.33;
  const amount = Math.ceil((hourlyRate * hoursWorked * bonusRate) / 100) * 100;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>💰 Salaire horaire</span><strong>${hourlyRate.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ar</strong></div>
      <div class="result-line"><span>⏱️ Heures travaillées</span><strong>${hoursWorked} h</strong></div>
      <div class="result-line"><span>⚡ Majoration</span><strong>${bonusRate * 100}%</strong></div>
      <div class="result-line total total-net"><span>💵 Votre majoration est</span><strong>${formatAr(amount)}</strong></div>
    </div>
  `);
}

function startApp() {
  if (typeof db === "undefined") {
    render();
    return;
  }

  db.collection("statuses").onSnapshot(snapshot => {
    const temp = {};

    snapshot.forEach(doc => {
      temp[doc.id] = doc.data();
    });

    remoteData = temp;
    render();
  }, () => {
    render();
  });
}

startApp();
