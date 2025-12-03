// simulador.js
// =============================
// Configuración
// =============================

// Actividades del simulador
const ACTIVITIES = [
  { id: "prompts", name: "Poke-words (Disparadores)", exp: 100 },
  { id: "encounter", name: "Encounter (Apariciones)", exp: 80 },
  { id: "passport", name: "Passport (Ubicaciones)", exp: 80 },
  { id: "freemode", name: "Freemode (Libres)", exp: 80 },
  { id: "quest", name: "Quest (Misiones)", exp: 80 },
];

// =============================
// Render de filas
// =============================
function buildRows() {
  const container = document.getElementById("sim-rows");
  if (!container) return;

  container.innerHTML = "";

  ACTIVITIES.forEach((act) => {
    const row = document.createElement("div");
    row.className = "sim-row";

    // Actividad
    const colActivity = document.createElement("span");
    colActivity.className = "col-activity";
    colActivity.textContent = act.name;

    // EXP por post
    const colExp = document.createElement("span");
    colExp.className = "col-exp";
    colExp.textContent = `${act.exp} EXP`;

    // Cantidad (input)
    const colCount = document.createElement("span");
    colCount.className = "col-count";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = "0";
    input.id = `qty-${act.id}`;
    input.className = "sim-qty-input";

    colCount.appendChild(input);

    // Subtotal
    const colSubtotal = document.createElement("span");
    colSubtotal.className = "col-subtotal";
    colSubtotal.id = `sub-${act.id}`;
    colSubtotal.textContent = "0";

    row.appendChild(colActivity);
    row.appendChild(colExp);
    row.appendChild(colCount);
    row.appendChild(colSubtotal);

    container.appendChild(row);

    // Cada vez que cambia el input, recalculamos
    input.addEventListener("input", () => {
      if (parseInt(input.value, 10) < 0 || isNaN(parseInt(input.value, 10))) {
        input.value = "0";
      }
      updateTotals();
    });
  });
}

// =============================
// Lógica de cálculo
// =============================
function updateTotals() {
  let totalExp = 0;
  let totalPosts = 0;

  ACTIVITIES.forEach((act) => {
    const qtyEl = document.getElementById(`qty-${act.id}`);
    const subEl = document.getElementById(`sub-${act.id}`);
    if (!qtyEl || !subEl) return;

    const qty = parseInt(qtyEl.value, 10) || 0;
    const subtotal = qty * act.exp;

    subEl.textContent = subtotal.toString();

    totalExp += subtotal;
    totalPosts += qty;
  });

  // 30 EXP por post que van directo a la trainer card
  const trainerCardExp = totalPosts * 30;

  // EXP libre para asignar
  const assignableExp = Math.max(0, totalExp - trainerCardExp);

  // Actualizar pastillas
  const totalSpan = document.getElementById("total-exp");
  const trainerSpan = document.getElementById("trainer-exp");
  const assignSpan = document.getElementById("assign-exp");

  if (totalSpan) totalSpan.textContent = totalExp.toString();
  if (trainerSpan) trainerSpan.textContent = trainerCardExp.toString();
  if (assignSpan) assignSpan.textContent = assignableExp.toString();
}

function resetSimulator() {
  ACTIVITIES.forEach((act) => {
    const qtyEl = document.getElementById(`qty-${act.id}`);
    if (qtyEl) qtyEl.value = "0";
  });
  updateTotals();
}

// =============================
// Eventos propios del simulador
// =============================
function setupSimulatorEvents() {
  const resetBtn = document.getElementById("btn-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resetSimulator();
    });
  }

  // --- TOGGLE DE TABLAS INFORMATIVAS ---
  const infoTabs = document.querySelectorAll(".info-tab");
  const infoTables = document.querySelectorAll(
    ".info-table-container .info-table"
  );

  infoTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;

      // activar/desactivar botón
      infoTabs.forEach((b) => b.classList.remove("info-tab-active"));
      btn.classList.add("info-tab-active");

      // mostrar tabla seleccionada
      infoTables.forEach((table) => {
        if (table.id === targetId) {
          table.classList.remove("hidden");
        } else {
          table.classList.add("hidden");
        }
      });
    });
  });
}

// =============================
// Inicialización con core.js
// =============================
document.addEventListener("DOMContentLoaded", async () => {
  // 1) Proteger página y obtener usuario
  const user = await initProtectedPage();
  if (!user) return; // ya te redirigió al login

  // 2) Pintar nombre de entrenador desde user_game_data
  await renderTrainerLabelFromGame();

  // 3) Configurar botón de logout común
  setupLogoutButton();

  // 4) Lógica propia del simulador
  buildRows();
  updateTotals();
  setupSimulatorEvents();
});
