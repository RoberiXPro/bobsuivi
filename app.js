let currentTab = "monthly_pay";
let remoteData = {};

const flows = {
  monthly_pay: "Paie mensuelle",
  advance_15n: "Avance 15N",
  monthly_bonus: "Prime mensuelle"
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

function getStatusClass(value) {
  const v = String(value || "").toLowerCase();

  if (v === "ok" || v === "positionné" || v === "positionne" || v === "payé") {
    return "state-done";
  }

  if (v.includes("attente") || v.includes("cours") || v.includes("traitement")) {
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

function render() {
  const app = document.getElementById("app");
  const data = remoteData[currentTab] || {};
  const progress = getProgress(data);

  app.innerHTML = `
    <div class="app-shell">
      <h1>💰 Suivi des Paies</h1>

      <div class="tabs">
${Object.keys(flows).map(key => `
  <button class="tab-button ${key === currentTab ? "active" : ""}" data-tab="${key}">
    ${flows[key]}
    ${key === "advance_15n" ? `<span class="tab-badge">Ouvert · 05/04</span>` : ""}
  </button>
`).join("")}
      </div>

<div class="card hero-card">
  <div class="card-inner">
    <div class="hero-head">
      <div>
        <h2>${flows[currentTab]}</h2>
        <p class="hero-step">Étape actuelle : ${data.currentStep || "-"}</p>
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
    </div>
  `;

  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.getAttribute("data-tab");
      render();
    };
  });
}

function startApp() {
  db.collection("statuses").onSnapshot(snapshot => {
    const temp = {};
    snapshot.forEach(doc => {
      temp[doc.id] = doc.data();
    });

    remoteData = temp;
    render();
  });
}

startApp();
