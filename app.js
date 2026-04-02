let currentSection = localStorage.getItem("currentSection") || "payroll";
let currentPayrollTab = localStorage.getItem("currentPayrollTab") || "monthly_pay";
let currentRightsTab = localStorage.getItem("currentRightsTab") || "resign_notice";
let currentAnnouncementFilter = localStorage.getItem("currentAnnouncementFilter") || "all";

let remoteData = {};
let announcements = [];
let submissionStatus = null;
let announcementComposerOpen = false;
let selectedPublicationType = "";
let editingAnnouncementId = null;
let announcementProfile = JSON.parse(localStorage.getItem("announcementProfile") || "null");
let lastSeenAnnouncementCreatedAt = localStorage.getItem("lastSeenAnnouncementCreatedAt") || "";
let lastSeenComplaintCreatedAt = localStorage.getItem("lastSeenComplaintCreatedAt") || "";
let reactionRegistry = JSON.parse(localStorage.getItem("announcementReactionRegistry") || "{}");

let calculatorSettings = {
  netRate: 0.87,
  workingDaysPerMonth: 26,
  monthlyHoursBase: 173.33,
  noticeRules: {
    default: 1,
    after5Years: 1.5,
    after10Years: 2
  },
  dismissalRules: {
    firstSegmentRate: 0.25,
    secondSegmentRate: 0.3333,
    firstSegmentLimit: 10
  },
  bonusNotes: {
    A_PLUS: 1.5,
    A: 1.2,
    B_PLUS: 1,
    B: 0.75,
    C: 0.35,
    B_MINUS: 0.15
  },
  holidayRates: [1, 1.5, 2]
};

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
  { key: "bmoi", label: "BMOI", logos: ["bmoi.png"] },
  { key: "mcb", label: "MCB", logos: ["mcb.png"] },
  { key: "bni_bred", label: "BNI / BRED", logos: ["bni.png", "bred.png"] },
  { key: "boa_microcred_acces", label: "BOA / Autres", logos: ["boa.png", "acces.png"] }
];

function formatAr(value) {
  const safeValue = Number(value || 0);
  return `${safeValue.toLocaleString("fr-FR")} Ar`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "-";

  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString("fr-FR");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR");
}

function toTimestamp(value) {
  if (!value) return 0;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function saveReactionRegistry() {
  localStorage.setItem("announcementReactionRegistry", JSON.stringify(reactionRegistry));
}

function mergeCalculatorSettings(remoteRules = {}) {
  calculatorSettings = {
    ...calculatorSettings,
    ...remoteRules,
    noticeRules: {
      ...calculatorSettings.noticeRules,
      ...(remoteRules.noticeRules || {})
    },
    dismissalRules: {
      ...calculatorSettings.dismissalRules,
      ...(remoteRules.dismissalRules || {})
    },
    bonusNotes: {
      ...calculatorSettings.bonusNotes,
      ...(remoteRules.bonusNotes || {})
    },
    holidayRates: Array.isArray(remoteRules.holidayRates) && remoteRules.holidayRates.length
      ? remoteRules.holidayRates
      : calculatorSettings.holidayRates
  };
}

function getStatusClass(value) {
  const v = String(value || "").toLowerCase();

  if (v === "ok" || v === "positionné" || v === "positionne" || v === "payé" || v === "paye") {
    return "state-done";
  }

  if (v.includes("attente") || v.includes("cours") || v.includes("traitement")) {
    return "state-active";
  }

  return "state-todo";
}

function getProgress(data) {
  const step = String(data.currentStep || "").toLowerCase().trim();
  const bmoi = String(data.bmoi || "").toLowerCase();

  if (
    step === "" ||
    step === "rien" ||
    step === "aucun" ||
    step === "non démarré" ||
    step === "non demarre"
  ) {
    return 0;
  }

  if (bmoi === "ok" || bmoi === "positionné" || bmoi === "positionne") {
    return 100;
  }

  if (step.includes("préparation") || step.includes("preparation")) return 20;
  if (step.includes("daf")) return 40;
  if (step.includes("constat")) return 60;
  if (step.includes("sign")) return 80;
  if (step.includes("banque") || step.includes("virement")) return 90;
  if (step.includes("positionné") || step.includes("positionne")) return 95;
  if (step.includes("terminé") || step.includes("termine")) return 100;

  return 0;
}

function getProgressTone(progress) {
  const value = Number(progress) || 0;
  if (value >= 70) return "good";
  if (value >= 30) return "medium";
  return "low";
}

function getBestPayrollTab() {
  const keys = Object.keys(payrollTabs);
  if (!keys.length) return null;

  let bestKey = keys[0];
  let bestProgress = getProgress(remoteData[bestKey] || {});

  keys.forEach((key) => {
    const currentProgress = getProgress(remoteData[key] || {});
    if (currentProgress > bestProgress) {
      bestProgress = currentProgress;
      bestKey = key;
    }
  });

  return bestKey;
}

function isAdvanceOpen() {
  const data = remoteData.advance_15n || {};
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

function getAnnouncementUnreadCounts() {
  const announcementSeenTs = toTimestamp(lastSeenAnnouncementCreatedAt);
  const complaintSeenTs = toTimestamp(lastSeenComplaintCreatedAt);

  return announcements.reduce((acc, item) => {
    const createdAtTs = toTimestamp(item.createdAt);

    if (item.type === "announcement" && createdAtTs > announcementSeenTs) {
      acc.announcements += 1;
    }

    if (item.type === "complaint" && createdAtTs > complaintSeenTs) {
      acc.complaints += 1;
    }

    return acc;
  }, { announcements: 0, complaints: 0 });
}

function markAnnouncementsAsSeen() {
  const latestAnnouncement = announcements
    .filter((item) => item.type === "announcement")
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))[0];

  const latestComplaint = announcements
    .filter((item) => item.type === "complaint")
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))[0];

  if (latestAnnouncement) {
    lastSeenAnnouncementCreatedAt = latestAnnouncement.createdAt;
    localStorage.setItem("lastSeenAnnouncementCreatedAt", latestAnnouncement.createdAt);
  }

  if (latestComplaint) {
    lastSeenComplaintCreatedAt = latestComplaint.createdAt;
    localStorage.setItem("lastSeenComplaintCreatedAt", latestComplaint.createdAt);
  }
}

function renderMainTabs() {
  const unread = getAnnouncementUnreadCounts();

  return `
    <div class="tabs main-tabs no-horizontal-scroll">
      <button class="tab-button ${currentSection === "payroll" ? "active" : ""}" data-section="payroll">
        Suivi de paie
      </button>

      <button class="tab-button ${currentSection === "rights" ? "active" : ""}" data-section="rights">
        Calculer son droit
      </button>

      <button class="tab-button main-notif-tab ${currentSection === "announcements" ? "active" : ""}" data-section="announcements">
        <span>Annonces & Infos</span>
        <span class="main-tab-notif main-tab-notif-announcement ${unread.announcements > 0 ? "show" : ""}">
          ${unread.announcements}
        </span>
        <span class="main-tab-notif main-tab-notif-complaint ${unread.complaints > 0 ? "show" : ""}">
          ${unread.complaints}
        </span>
      </button>
    </div>
  `;
}

function renderPayrollTabs() {
  const bestTab = getBestPayrollTab();

  return `
    <div class="tabs sub-tabs no-horizontal-scroll">
      ${Object.keys(payrollTabs).map((key) => {
        const tabData = remoteData[key] || {};
        const tabProgress = getProgress(tabData);
        const tone = getProgressTone(tabProgress);
        const isBest = key === bestTab;

        return `
          <button class="tab-button ${key === currentPayrollTab ? "active" : ""} ${isBest ? "tab-best" : ""}" data-payroll-tab="${key}">
            <span class="tab-label-wrap">
              <span>${payrollTabs[key]}</span>
              ${key === "advance_15n"
                ? `<span class="tab-badge ${isAdvanceOpen() ? "tab-open" : "tab-closed"}">${isAdvanceOpen() ? "Ouvert" : "Fermé"}</span>`
                : ""}
            </span>
            <span class="tab-progress-chip progress-${tone}">
              ${tabProgress}%
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderRightsTabs() {
  return `
    <div class="tabs sub-tabs no-horizontal-scroll">
      ${Object.keys(rightsTabs).map((key) => `
        <button class="tab-button ${key === currentRightsTab ? "active" : ""}" data-rights-tab="${key}">
          ${rightsTabs[key]}
        </button>
      `).join("")}
    </div>
  `;
}

function renderAnnouncementFilters() {
  return `
    <div class="tabs filter-tabs no-horizontal-scroll">
      <button class="tab-button ${currentAnnouncementFilter === "all" ? "active" : ""}" data-announcement-filter="all">
        Tout
      </button>
      <button class="tab-button ${currentAnnouncementFilter === "announcement" ? "active" : ""}" data-announcement-filter="announcement">
        Annonces
      </button>
      <button class="tab-button ${currentAnnouncementFilter === "complaint" ? "active" : ""}" data-announcement-filter="complaint">
        Plaintes validées
      </button>
    </div>
  `;
}
function renderCircularProgress(progress) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const degrees = safeProgress * 3.6;
  const tone = getProgressTone(safeProgress);

  return `
    <div
      class="progress-ring progress-${tone}"
      style="--progress-deg: ${degrees}deg; --target-progress: ${safeProgress};"
      aria-label="Progression ${safeProgress}%"
    >
      <div class="progress-ring-inner">
        <span class="progress-ring-value" data-progress-value="${safeProgress}">0%</span>
      </div>
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
                Ouvert le : ${(remoteData.advance_15n && remoteData.advance_15n.openDate) || advanceDates.open}<br>
                Fermé le : ${(remoteData.advance_15n && remoteData.advance_15n.closeDate) || advanceDates.close}
              </p>
            ` : ""}
          </div>
          ${renderCircularProgress(progress)}
        </div>

        <div class="progress-summary">
          <div class="progress-summary-text">
            Progression actuelle estimée : <strong>${progress}%</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-inner">
        <h3>Statut des virements</h3>

        ${banks.map((bank) => `
          <div class="bank-row">
            <div class="bank-left">
              <div class="bank-logos">
                ${bank.logos.map((logo) => `
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

function renderBonusNoteOptions(includeEmptyLabel = "Pas de prime") {
  const notes = calculatorSettings.bonusNotes || {};

  const options = [
    { label: includeEmptyLabel, value: 0 },
    { label: `A+ (${Math.round((notes.A_PLUS ?? 1.5) * 100)}%)`, value: notes.A_PLUS ?? 1.5 },
    { label: `A (${Math.round((notes.A ?? 1.2) * 100)}%)`, value: notes.A ?? 1.2 },
    { label: `B+ (${Math.round((notes.B_PLUS ?? 1) * 100)}%)`, value: notes.B_PLUS ?? 1 },
    { label: `B (${Math.round((notes.B ?? 0.75) * 100)}%)`, value: notes.B ?? 0.75 },
    { label: `C (${Math.round((notes.C ?? 0.35) * 100)}%)`, value: notes.C ?? 0.35 },
    { label: `B- (${Math.round((notes.B_MINUS ?? 0.15) * 100)}%)`, value: notes.B_MINUS ?? 0.15 }
  ];

  return options.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("");
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
                  ${renderBonusNoteOptions("Pas de prime")}
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
                  ${renderBonusNoteOptions("Pas de prime / Non concerné")}
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
                  ${renderBonusNoteOptions("Pas de prime / Non concerné")}
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
                  ${(calculatorSettings.holidayRates || [1, 1.5, 2]).map((rate) => `
                    <option value="${rate}">${rate * 100}%</option>
                  `).join("")}
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

function getFeaturedAnnouncement() {
  if (!announcements.length) return null;

  const sorted = [...announcements].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

  const urgentComplaint = sorted.find((item) => item.type === "complaint" && item.isUrgent);
  if (urgentComplaint) return urgentComplaint;

  const urgentAnnouncement = sorted.find((item) => item.type === "announcement" && item.isUrgent);
  if (urgentAnnouncement) return urgentAnnouncement;

  const pinnedComplaint = sorted.find((item) => item.type === "complaint" && item.isPinned);
  if (pinnedComplaint) return pinnedComplaint;

  const pinnedAnnouncement = sorted.find((item) => item.type === "announcement" && item.isPinned);
  if (pinnedAnnouncement) return pinnedAnnouncement;

  return sorted[0];
}

function getFilteredAnnouncements() {
  if (currentAnnouncementFilter === "all") return announcements;
  return announcements.filter((item) => item.type === currentAnnouncementFilter);
}

function getCurrentUserReaction(announcementId) {
  if (!announcementProfile || !announcementId) return null;

  const userKey = `${String(announcementProfile.initial || "").trim().toLowerCase()}__${String(announcementProfile.matricule || "").trim().toLowerCase()}__${String(announcementProfile.pseudo || "").trim().toLowerCase()}`;
  const key = `${announcementId}__${userKey}`;
  return reactionRegistry[key] || null;
}

function setCurrentUserReaction(announcementId, reactionType) {
  if (!announcementProfile || !announcementId) return;

  const userKey = `${String(announcementProfile.initial || "").trim().toLowerCase()}__${String(announcementProfile.matricule || "").trim().toLowerCase()}__${String(announcementProfile.pseudo || "").trim().toLowerCase()}`;
  const key = `${announcementId}__${userKey}`;

  if (reactionType) {
    reactionRegistry[key] = reactionType;
  } else {
    delete reactionRegistry[key];
  }

  saveReactionRegistry();
}

function renderAnnouncementReactions(item) {
  const reactions = item.reactions || {};
  const isComplaint = item.type === "complaint";
  const currentReaction = getCurrentUserReaction(item.id);

  if (isComplaint) {
    return `
      <div class="announcement-reactions">
return `
  <div class="announcement-reactions complaint-reactions">
    <button class="reaction-button support ${currentReaction === "support" ? "selected" : ""}" data-reaction-type="support" data-announcement-id="${item.id}">
      🛡️ Je soutiens <span>${reactions.support || 0}</span>
    </button>
    <button class="reaction-button neutral ${currentReaction === "no_support" ? "selected" : ""}" data-reaction-type="no_support" data-announcement-id="${item.id}">
      ◌ Pas concerné <span>${reactions.no_support || 0}</span>
    </button>
  </div>
`;
        <button class="reaction-button alt ${currentReaction === "no_support" ? "selected" : ""}" data-reaction-type="no_support" data-announcement-id="${item.id}">
          Pas concerné <span>${reactions.no_support || 0}</span>
        </button>
      </div>
    `;
  }

return `
  <div class="announcement-reactions">
    <button class="reaction-button icon ${currentReaction === "like" ? "selected" : ""}" data-reaction-type="like" data-announcement-id="${item.id}">
      👍 <span>${reactions.like || 0}</span>
    </button>
    <button class="reaction-button icon alt ${currentReaction === "dislike" ? "selected" : ""}" data-reaction-type="dislike" data-announcement-id="${item.id}">
      👎 <span>${reactions.dislike || 0}</span>
    </button>
  </div>
`;
}

function isAnnouncementOwner(item) {
  if (!announcementProfile || !item) return false;

  return (
    String(item.employeeInitial || "").trim().toLowerCase() === String(announcementProfile.initial || "").trim().toLowerCase() &&
    String(item.employeeMatricule || "").trim().toLowerCase() === String(announcementProfile.matricule || "").trim().toLowerCase() &&
    String(item.publicationPseudo || "").trim().toLowerCase() === String(announcementProfile.pseudo || "").trim().toLowerCase()
  );
}

function renderAnnouncementEditForm(item) {
  if (editingAnnouncementId !== item.id) return "";

  return `
    <div class="announcement-inline-editor">
      <div class="form-grid">
        <div class="form-group full">
          <label for="editAnnouncementTitle">Titre</label>
          <input id="editAnnouncementTitle" type="text" maxlength="120" value="${escapeHtml(item.title || "")}">
        </div>

        <div class="form-group full">
          <label for="editAnnouncementContent">Contenu</label>
          <textarea id="editAnnouncementContent" rows="5">${escapeHtml(item.content || "")}</textarea>
        </div>
      </div>

      <div class="announcement-actions owner-actions">
        <button class="announcement-action-button save" data-save-announcement="${item.id}">
          Enregistrer
        </button>
        <button class="announcement-action-button cancel" data-cancel-edit-announcement="true">
          Annuler
        </button>
      </div>
    </div>
  `;
}

function renderAnnouncementCard(item) {
  const isComplaint = item.type === "complaint";
 const badge = isComplaint ? "🚨 Plainte" : "📢 Annonce";
  const extraClass = isComplaint ? "announcement-card complaint-card" : "announcement-card";
  const isOwner = isAnnouncementOwner(item);

  return `
    <div class="${extraClass}">
      <div class="announcement-card-head">
        <span class="announcement-badge ${isComplaint ? "warning" : "info"}">${badge}</span>
        <span class="announcement-date">${formatDate(item.createdAt)}</span>
      </div>

      <h3>${escapeHtml(item.title || "")}</h3>
      <p>${escapeHtml(item.content || "").replace(/\n/g, "<br>")}</p>

      <div class="announcement-meta">
        Publié par : <strong>${escapeHtml(item.publicationPseudo || "Anonyme")}</strong>
        ${item.isUrgent ? `<span class="inline-urgent-badge">Urgent</span>` : ""}
        ${item.isPinned ? `<span class="inline-pinned-badge">Épinglé</span>` : ""}
      </div>

      ${renderAnnouncementReactions(item)}

      <div class="announcement-actions ${isOwner ? "owner-actions" : ""}">
        ${
          isOwner
            ? `
              <button class="announcement-action-button edit" data-edit-announcement="${item.id}">
                Modifier
              </button>
              <button class="announcement-action-button delete" data-delete-announcement="${item.id}">
                Supprimer
              </button>
            `
            : `
              <button class="report-button" data-report-announcement="${item.id}">
                Signaler
              </button>
            `
        }
      </div>

      ${isOwner ? renderAnnouncementEditForm(item) : ""}
    </div>
  `;
}

function renderAnnouncementIdentityGate() {
  return `
    <div class="card">
      <div class="card-inner">
        <h3>Avant d’entrer dans Annonces & Infos</h3>
        <p class="hero-step">
          Renseignez vos informations une seule fois pour publier plus rapidement ensuite.
          Votre identité réelle ne sera pas affichée publiquement.
          Seul votre pseudo pourra apparaître publiquement.
        </p>

        <div class="form-grid">
          <div class="form-group">
            <label for="identityInitial">Initial</label>
            <input id="identityInitial" type="text" maxlength="10" placeholder="Ex : ROB" value="${escapeHtml(announcementProfile?.initial || "")}">
          </div>

          <div class="form-group">
            <label for="identityMatricule">Numéro matricule</label>
            <input id="identityMatricule" type="text" maxlength="30" placeholder="Ex : 417 ou S0417" value="${escapeHtml(announcementProfile?.matricule || "")}">
          </div>

          <div class="form-group full">
            <label for="identityPseudo">Pseudo public</label>
            <input id="identityPseudo" type="text" maxlength="40" placeholder="Ex : Tigre Rose" value="${escapeHtml(announcementProfile?.pseudo || "")}">
          </div>
        </div>

        <button class="action-button cyan" data-save-announcement-profile="true">
          Continuer
        </button>
      </div>
    </div>
  `;
}

function renderAnnouncementComposer() {
  const typeSelected = selectedPublicationType === "announcement" || selectedPublicationType === "complaint";

  return `
    <div class="card composer-card">
      <div class="card-inner">
        <h3>${editingAnnouncementId ? "Modifier votre publication" : "Publier"}</h3>

        <div class="publish-choice-grid">
          <button class="publish-choice ${selectedPublicationType === "announcement" ? "active" : ""}" data-publication-type="announcement">
            <span class="publish-choice-icon">📢</span>
            <span class="publish-choice-title">Publier une annonce</span>
          </button>

          <button class="publish-choice complaint ${selectedPublicationType === "complaint" ? "active" : ""}" data-publication-type="complaint">
            <span class="publish-choice-icon">⚠️</span>
            <span class="publish-choice-title">Publier une plainte</span>
          </button>
        </div>

        ${
          typeSelected
            ? `
              <div class="form-grid composer-form">
                <div class="form-group full">
                  <label for="submissionTitle">Titre</label>
                  <input id="submissionTitle" type="text" maxlength="120" placeholder="Titre de votre publication">
                </div>

                <div class="form-group full">
                  <label for="submissionContent">${selectedPublicationType === "complaint" ? "Message de la plainte" : "Message de l’annonce"}</label>
                  <textarea id="submissionContent" rows="6" placeholder="${selectedPublicationType === "complaint" ? "Expliquez clairement votre plainte" : "Rédigez votre annonce"}"></textarea>
                </div>
              </div>

              <button class="action-button cyan" data-submit-publication="true">
                ${selectedPublicationType === "announcement" ? "Publier maintenant" : "Envoyer pour validation"}
              </button>

              <p class="hero-step">
                ${
                  selectedPublicationType === "announcement"
                    ? "Votre annonce sera publiée immédiatement. Votre identité réelle ne sera pas affichée publiquement. Seul votre pseudo sera visible."
                    : "Votre plainte sera envoyée à l’administrateur pour validation. Votre identité réelle ne sera pas affichée publiquement."
                }
              </p>
            `
            : ""
        }

        ${
          submissionStatus
            ? `<div class="submission-feedback">${escapeHtml(submissionStatus)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderAnnouncementsHero() {
  const featured = getFeaturedAnnouncement();

  if (!featured) {
    return `
      <div class="card hero-card">
        <div class="card-inner">
          <div class="hero-head">
            <div>
              <h2>Annonces & Infos</h2>
              <p class="hero-step">Aucune publication disponible pour le moment.</p>
            </div>
            <button class="action-button cyan hero-publish-button" data-toggle-composer="true">
              Publier
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const isComplaint = featured.type === "complaint";
const title = featured.isUrgent
  ? (isComplaint ? "🚨 Plainte urgente" : "📢 Annonce urgente")
  : (isComplaint ? "🚨 Plainte mise en avant" : "📢 Annonce du jour");

  return `
    <div class="card hero-card ${isComplaint ? "hero-warning" : ""} ${featured.isUrgent ? "hero-urgent" : ""}">
      <div class="card-inner">
        <div class="hero-head">
          <div>
            <h2>${title}</h2>
            <p class="hero-step">${escapeHtml(featured.title || "")}</p>
            <p class="hero-step">
              Publié par : <strong>${escapeHtml(featured.publicationPseudo || "Anonyme")}</strong>
              ${featured.isUrgent ? `<span class="hero-inline-badge urgent">Urgent</span>` : ""}
              ${featured.isPinned ? `<span class="hero-inline-badge pinned">Épinglé</span>` : ""}
            </p>
          </div>
          <button class="action-button cyan hero-publish-button" data-toggle-composer="true">
            Publier
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAnnouncementsView() {
  if (!announcementProfile) {
    return renderAnnouncementIdentityGate();
  }

  const filtered = getFilteredAnnouncements();

  return `
    ${renderAnnouncementsHero()}
    ${announcementComposerOpen ? renderAnnouncementComposer() : ""}
    ${renderAnnouncementFilters()}

    <div class="card">
      <div class="card-inner">
        <h3>Publications visibles</h3>
        <div class="announcement-list">
          ${
            filtered.length
              ? filtered.map(renderAnnouncementCard).join("")
              : `<div class="empty-state">Aucune publication trouvée pour ce filtre.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function render() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      <h1>${
        currentSection === "payroll"
          ? "💰 Suivi des Paies"
          : currentSection === "rights"
            ? "📊 Calculer son droit"
            : "📢 Annonces & Infos"
      }</h1>

      ${renderMainTabs()}

      ${
        currentSection === "payroll"
          ? renderPayrollView()
          : currentSection === "rights"
            ? renderRightsView()
            : renderAnnouncementsView()
      }

      <div class="app-footer">© RoberiX 2026 — Plateforme RH unifiée</div>
    </div>
  `;

  bindEvents();
}

function animateProgressRings() {
  const values = document.querySelectorAll("[data-progress-value]");

  values.forEach((el) => {
    const target = Number(el.getAttribute("data-progress-value")) || 0;
    let current = 0;
    const duration = 900;
    const stepTime = 16;
    const increment = Math.max(1, Math.ceil(target / (duration / stepTime)));

    el.textContent = "0%";

    const timer = setInterval(() => {
      current += increment;

      if (current >= target) {
        current = target;
        clearInterval(timer);
      }

      el.textContent = `${current}%`;
    }, stepTime);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-section]").forEach((btn) => {
    btn.onclick = () => {
      currentSection = btn.getAttribute("data-section");
      localStorage.setItem("currentSection", currentSection);

      if (currentSection === "announcements") {
        markAnnouncementsAsSeen();
      } else {
        announcementComposerOpen = false;
        selectedPublicationType = "";
        submissionStatus = null;
        editingAnnouncementId = null;
      }

      render();
    };
  });

  document.querySelectorAll("[data-payroll-tab]").forEach((btn) => {
    btn.onclick = () => {
      currentPayrollTab = btn.getAttribute("data-payroll-tab");
      localStorage.setItem("currentPayrollTab", currentPayrollTab);
      render();
    };
  });

  document.querySelectorAll("[data-rights-tab]").forEach((btn) => {
    btn.onclick = () => {
      currentRightsTab = btn.getAttribute("data-rights-tab");
      localStorage.setItem("currentRightsTab", currentRightsTab);
      render();
    };
  });

  document.querySelectorAll("[data-announcement-filter]").forEach((btn) => {
    btn.onclick = () => {
      currentAnnouncementFilter = btn.getAttribute("data-announcement-filter");
      localStorage.setItem("currentAnnouncementFilter", currentAnnouncementFilter);
      render();
    };
  });

  document.querySelectorAll("[data-calc-action]").forEach((btn) => {
    btn.onclick = () => {
      const action = btn.getAttribute("data-calc-action");
      performCalculation(action);
    };
  });

  document.querySelectorAll("[data-reaction-type][data-announcement-id]").forEach((btn) => {
    btn.onclick = () => {
      reactToAnnouncement(
        btn.getAttribute("data-announcement-id"),
        btn.getAttribute("data-reaction-type")
      );
    };
  });

  document.querySelectorAll("[data-save-announcement-profile]").forEach((btn) => {
    btn.onclick = () => {
      saveAnnouncementProfile();
    };
  });

  document.querySelectorAll("[data-toggle-composer]").forEach((btn) => {
    btn.onclick = () => {
      announcementComposerOpen = !announcementComposerOpen;

      if (!announcementComposerOpen) {
        selectedPublicationType = "";
        submissionStatus = null;
      }

      render();
    };
  });

  document.querySelectorAll("[data-publication-type]").forEach((btn) => {
    btn.onclick = () => {
      selectedPublicationType = btn.getAttribute("data-publication-type");
      submissionStatus = null;
      render();
    };
  });

  document.querySelectorAll("[data-submit-publication]").forEach((btn) => {
    btn.onclick = () => {
      submitPublication();
    };
  });

  document.querySelectorAll("[data-report-announcement]").forEach((btn) => {
    btn.onclick = () => {
      reportAnnouncement(btn.getAttribute("data-report-announcement"));
    };
  });

  document.querySelectorAll("[data-edit-announcement]").forEach((btn) => {
    btn.onclick = () => {
      editingAnnouncementId = btn.getAttribute("data-edit-announcement");
      render();
    };
  });

  document.querySelectorAll("[data-cancel-edit-announcement]").forEach((btn) => {
    btn.onclick = () => {
      editingAnnouncementId = null;
      render();
    };
  });

  document.querySelectorAll("[data-save-announcement]").forEach((btn) => {
    btn.onclick = () => {
      saveEditedAnnouncement(btn.getAttribute("data-save-announcement"));
    };
  });

  document.querySelectorAll("[data-delete-announcement]").forEach((btn) => {
    btn.onclick = () => {
      deleteOwnAnnouncement(btn.getAttribute("data-delete-announcement"));
    };
  });

  animateProgressRings();
}

function saveAnnouncementProfile() {
  const initial = String(document.getElementById("identityInitial")?.value || "").trim();
  const matricule = String(document.getElementById("identityMatricule")?.value || "").trim();
  const pseudo = String(document.getElementById("identityPseudo")?.value || "").trim();

  if (!initial || !matricule || !pseudo) {
    alert("Veuillez remplir Initial, Matricule et Pseudo public.");
    return;
  }

  announcementProfile = { initial, matricule, pseudo };
  localStorage.setItem("announcementProfile", JSON.stringify(announcementProfile));
  render();
}

function getNoticeMonths(seniority) {
  const rules = calculatorSettings.noticeRules || {};
  let notice = Number(rules.default ?? 1);

  if (seniority >= 10) {
    notice = Number(rules.after10Years ?? 2);
  } else if (seniority >= 5) {
    notice = Number(rules.after5Years ?? 1.5);
  }

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

  const workingDays = Number(calculatorSettings.workingDaysPerMonth || 26);
  const netRate = Number(calculatorSettings.netRate || 0.87);

  const dailySalary = salary / workingDays;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;
  const grossTotal = noticeSalary + leaveCompensation + halfYearBonus;
  const netTotal = grossTotal * netRate;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>🕒 Préavis estimé</span><strong>${notice} mois</strong></div>
      <div class="result-line"><span>🏖️ Indemnité congés (${leaveDays} jours)</span><strong>${formatAr(leaveCompensation)}</strong></div>
      <div class="result-line"><span>🎁 Prime semestrielle</span><strong>${formatAr(halfYearBonus)}</strong></div>
      <div class="result-line total"><span>💵 Total brut estimé</span><strong>${formatAr(grossTotal)}</strong></div>
      <div class="result-line total total-net"><span>💰 Total net estimé (${Math.round(netRate * 100)}%)</span><strong>${formatAr(netTotal)}</strong></div>
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

  const workingDays = Number(calculatorSettings.workingDaysPerMonth || 26);
  const netRate = Number(calculatorSettings.netRate || 0.87);

  const dailySalary = salary / workingDays;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;

  const noticeDebt = salary * notice;
  const companyOwesGross = leaveCompensation + halfYearBonus;
  const companyOwesNet = companyOwesGross * netRate;
  const noticeDebtNet = noticeDebt * netRate;
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

  const workingDays = Number(calculatorSettings.workingDaysPerMonth || 26);
  const netRate = Number(calculatorSettings.netRate || 0.87);
  const dismissalRules = calculatorSettings.dismissalRules || {};

  const firstSegmentRate = Number(dismissalRules.firstSegmentRate ?? 0.25);
  const secondSegmentRate = Number(dismissalRules.secondSegmentRate ?? 0.3333);
  const firstSegmentLimit = Number(dismissalRules.firstSegmentLimit ?? 10);

  const dailySalary = salary / workingDays;
  const leaveCompensation = leaveDays * dailySalary;
  const halfYearBonus = bonusNote > 0 ? salary * bonusNote : 0;

  let dismissalCompensation = 0;
  if (seniority >= 1) {
    if (seniority <= firstSegmentLimit) {
      dismissalCompensation = (salary * firstSegmentRate) * seniority;
    } else {
      const firstPart = (salary * firstSegmentRate) * firstSegmentLimit;
      const secondPart = (salary * secondSegmentRate) * (seniority - firstSegmentLimit);
      dismissalCompensation = firstPart + secondPart;
    }
  }

  const grossTotal = noticeSalary + leaveCompensation + halfYearBonus + dismissalCompensation;
  const netTotal = grossTotal * netRate;

  setRightsResult(`
    <div class="result-lines">
      <div class="result-line"><span>📆 Préavis</span><strong>${notice} mois</strong></div>
      <div class="result-line"><span>📩 Préavis payé</span><strong>${formatAr(noticeSalary)}</strong></div>
      <div class="result-line"><span>🏖️ Indemnité congés (${leaveDays} jours)</span><strong>${formatAr(leaveCompensation)}</strong></div>
      <div class="result-line"><span>🎁 Prime semestrielle</span><strong>${formatAr(halfYearBonus)}</strong></div>
      <div class="result-line"><span>⚖️ Indemnité de licenciement</span><strong>${formatAr(dismissalCompensation)}</strong></div>
      <div class="result-line total"><span>💵 Total brut</span><strong>${formatAr(grossTotal)}</strong></div>
      <div class="result-line total total-net"><span>💰 Total net estimé (${Math.round(netRate * 100)}%)</span><strong>${formatAr(netTotal)}</strong></div>
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

  const monthlyHoursBase = Number(calculatorSettings.monthlyHoursBase || 173.33);
  const hourlyRate = salary / monthlyHoursBase;
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

async function reactToAnnouncement(announcementId, reactionType) {
  if (typeof db === "undefined" || !announcementProfile) return;

  try {
    const ref = db.collection("announcements").doc(announcementId);
    const previousReaction = getCurrentUserReaction(announcementId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) return;

      const data = doc.data() || {};
      const reactions = { ...(data.reactions || {}) };

      if (previousReaction === reactionType) {
        reactions[reactionType] = Math.max(0, Number(reactions[reactionType] || 0) - 1);
        transaction.update(ref, { reactions });
        return;
      }

      if (previousReaction) {
        reactions[previousReaction] = Math.max(0, Number(reactions[previousReaction] || 0) - 1);
      }

      reactions[reactionType] = Number(reactions[reactionType] || 0) + 1;
      transaction.update(ref, { reactions });
    });

    if (previousReaction === reactionType) {
      setCurrentUserReaction(announcementId, null);
    } else {
      setCurrentUserReaction(announcementId, reactionType);
    }
  } catch (error) {
    console.error("Erreur réaction publication :", error);
  }
}

async function submitPublication() {
  if (!announcementProfile) {
    submissionStatus = "Votre profil Annonces & Infos est introuvable.";
    render();
    return;
  }

  if (!selectedPublicationType) {
    submissionStatus = "Choisissez d’abord Annonce ou Plainte.";
    render();
    return;
  }

  const title = String(document.getElementById("submissionTitle")?.value || "").trim();
  const content = String(document.getElementById("submissionContent")?.value || "").trim();

  if (!title || !content) {
    submissionStatus = "Veuillez remplir le titre et le message.";
    render();
    return;
  }

  if (typeof db === "undefined") {
    submissionStatus = "Configuration Firebase introuvable.";
    render();
    return;
  }

  try {
    const now = new Date().toISOString();

    const basePayload = {
      type: selectedPublicationType,
      title,
      content,
      employeeInitial: announcementProfile.initial,
      employeeMatricule: announcementProfile.matricule,
      publicationPseudo: announcementProfile.pseudo,
      createdAt: now
    };

    if (selectedPublicationType === "announcement") {
      await db.collection("announcements").add({
        ...basePayload,
        visibility: "public",
        isReported: false,
        isPinned: false,
        isUrgent: false,
        approvedAt: now,
        approvedBy: "self",
        reactions: {
          like: 0,
          dislike: 0
        }
      });

      submissionStatus = "Votre annonce a été publiée immédiatement.";
      currentAnnouncementFilter = "announcement";
      localStorage.setItem("currentAnnouncementFilter", currentAnnouncementFilter);
      lastSeenAnnouncementCreatedAt = now;
      localStorage.setItem("lastSeenAnnouncementCreatedAt", now);
    } else {
      await db.collection("submission_queue").add({
        ...basePayload,
        status: "pending"
      });

      submissionStatus = "Votre plainte a bien été envoyée pour validation admin.";
    }

    announcementComposerOpen = false;
    selectedPublicationType = "";
    render();
  } catch (error) {
    submissionStatus = "Erreur lors de la publication. Réessayez.";
    render();
    console.error("Erreur soumission publication :", error);
  }
}

async function reportAnnouncement(announcementId) {
  const confirmed = confirm("Voulez-vous vraiment signaler cette publication ?");
  if (!confirmed) return;

  if (typeof db === "undefined") {
    alert("Configuration Firebase introuvable.");
    return;
  }

  try {
    await db.collection("announcements").doc(announcementId).set({
      isReported: true,
      visibility: "hidden",
      reportedAt: new Date().toISOString()
    }, { merge: true });

    submissionStatus = "La publication a été signalée et masquée automatiquement.";
    render();
  } catch (error) {
    console.error("Erreur signalement publication :", error);
    alert("Erreur lors du signalement. Réessayez.");
  }
}

async function saveEditedAnnouncement(announcementId) {
  if (typeof db === "undefined") return;

  const title = String(document.getElementById("editAnnouncementTitle")?.value || "").trim();
  const content = String(document.getElementById("editAnnouncementContent")?.value || "").trim();

  if (!title || !content) {
    alert("Veuillez remplir le titre et le contenu.");
    return;
  }

  const target = announcements.find((item) => item.id === announcementId);
  if (!target || !isAnnouncementOwner(target)) {
    alert("Vous ne pouvez pas modifier cette publication.");
    return;
  }

  try {
    await db.collection("announcements").doc(announcementId).set({
      title,
      content,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    editingAnnouncementId = null;
    submissionStatus = "Votre publication a été modifiée.";
    render();
  } catch (error) {
    console.error("Erreur modification publication :", error);
    alert("Erreur lors de la modification. Réessayez.");
  }
}

async function deleteOwnAnnouncement(announcementId) {
  if (typeof db === "undefined") return;

  const target = announcements.find((item) => item.id === announcementId);
  if (!target || !isAnnouncementOwner(target)) {
    alert("Vous ne pouvez pas supprimer cette publication.");
    return;
  }

  const confirmed = confirm("Voulez-vous vraiment supprimer cette publication ?");
  if (!confirmed) return;

  try {
    await db.collection("announcements").doc(announcementId).delete();
    submissionStatus = "Votre publication a été supprimée.";
    editingAnnouncementId = null;
    render();
  } catch (error) {
    console.error("Erreur suppression publication :", error);
    alert("Erreur lors de la suppression. Réessayez.");
  }
}

function renderSafe() {
  try {
    if (currentSection === "announcements") {
      markAnnouncementsAsSeen();
    }
    render();
  } catch (error) {
    console.error("Erreur render :", error);
  }
}

function startRealtimeListeners() {
  if (typeof db === "undefined") {
    render();
    return;
  }

  db.collection("statuses").onSnapshot((snapshot) => {
    const next = {};
    snapshot.forEach((doc) => {
      next[doc.id] = doc.data() || {};
    });
    remoteData = next;
    renderSafe();
  }, () => {
    renderSafe();
  });

  db.collection("calculator_settings").doc("rules").onSnapshot((doc) => {
    if (doc.exists) {
      mergeCalculatorSettings(doc.data() || {});
    }
    renderSafe();
  }, () => {
    renderSafe();
  });

  db.collection("announcements").onSnapshot((snapshot) => {
    announcements = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((item) => item.visibility !== "hidden" && item.isReported !== true)
      .sort((a, b) => {
        const aUrgent = a.isUrgent ? 1 : 0;
        const bUrgent = b.isUrgent ? 1 : 0;
        if (aUrgent !== bUrgent) return bUrgent - aUrgent;

        const aPinned = a.isPinned ? 1 : 0;
        const bPinned = b.isPinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;

        return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      });

    renderSafe();
  }, () => {
    renderSafe();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  startRealtimeListeners();
  render();
});
