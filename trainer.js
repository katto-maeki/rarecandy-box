// trainer.js - VERSIÓN FINAL INTEGRADA Y CORREGIDA CON LOGS AUTOMÁTICOS
// ===================================================================

const TRAINER_META_KEY = "pokeTrainerMeta_v1";
const TRAINER_TABLE = "trainer_inventory";
const GAME_TABLE = "user_game_data";
const LOG_TABLE = "trainer_log"; // Añadido para prevenir futuros ReferenceError en deleteLogEntry

// CONFIGURACIÓN DE PRECIOS ACTUALIZADA
const ITEM_PRICES = {
  egg: 600, tradeToken: 150, evoStone: 300, friendship: 300, starCrystal: 350, 
  passport: 150, panquecito: 100, curry: 600, poke: 50, super: 100, ultra: 150, master: 300, 
};

// ETIQUETAS ACTUALIZADAS
const ITEM_LABELS_MAP = {
  egg: "Huevo Pokémon", tradeToken: "Ticket de Intercambio", evoStone: "Piedra Evolución", 
  friendship: "Pulsera Amistad", starCrystal: "Cristal Estelar", passport: "Pasaporte Regional", panquecito: "Panquecito", curry: "Curry", poke: "Poké Ball", 
  super: "Super Ball", ultra: "Ultra Ball", master: "Master Ball"
};

// ESTADO GLOBAL
let currentMeta = null;

const defaultMeta = {
  xp: 0, achievements: "", pokedex: "0", notes: "",
  economy: { biIncome: 0, savings: 0, spent: 0 },
  items: { egg: 0, tradeToken: 0, evoStone: 0, friendship: 0, starCrystal: 0, passport: 0, panquecito: 0, curry: 0 },
  balls: { poke: 0, super: 0, ultra: 0, master: 0 },
  lastUpdated: null,
};

// VISUALIZACIÓN DINÁMICA DE LA MOCHILA (mismos íconos que la Tienda, para consistencia visual)
const INVENTORY_ITEMS_VISUAL = [
  { key: "egg", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/mystery-egg.png" },
  { key: "tradeToken", iconUrl: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png" },
  { key: "evoStone", iconUrl: "https://i.ibb.co/Lyh4XR3/shiny-stone.png" },
  { key: "friendship", iconUrl: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png" },
  { key: "starCrystal", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/star-piece.png" },
  { key: "passport", iconUrl: "https://i.ibb.co/R4HdLphw/eon-ticket.png" },
  { key: "panquecito", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/lumiose-galette.png" },
  { key: "curry", iconUrl: "img/curry.png" },
  { key: "poke", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/poke-ball.png" },
  { key: "super", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/great-ball.png" },
  { key: "ultra", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/ultra-ball.png" },
  { key: "master", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/master-ball.png" },
];

// Cantidad de casillas vacías decorativas que se agregan al final del grid (estilo inventario RPG).
const INV_EMPTY_SLOT_COUNT = 10;

// ITEM_DESCRIPTIONS vive en core.js (compartido con la Tienda).

let selectedItemKey = null;

// HELPERS
function $(id) { return document.getElementById(id); }
function setText(id, value) { const el = $(id); if (el) el.textContent = String(value ?? ""); }
function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ""; }

// MODIFICADO: Ahora 'master' se reconoce automáticamente dentro de la categoría 'balls'
function getItemCategory(key) { return ["poke", "super", "ultra", "master"].includes(key) ? "balls" : "items"; }
function getItemCount(key) { return currentMeta[getItemCategory(key)][key] || 0; }
function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

// ================================
// SINCRONIZACIÓN CON SUPABASE
// ================================

async function initTrainerMeta() {
  try {
    const userId = window.currentUserId;
    if (!userId) return;

    localStorage.removeItem(TRAINER_META_KEY); 

    const { data: invRow } = await window.supabaseClient
      .from(TRAINER_TABLE)
      .select("inventory")
      .eq("user_id", userId)
      .maybeSingle();

    if (invRow?.inventory) {
      const parsed = invRow.inventory;
      currentMeta = {
        ...defaultMeta,
        ...parsed,
        achievements: parsed.achievements || "—",
        economy: { ...defaultMeta.economy, ...(parsed.economy || {}) },
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
    } else {
      currentMeta = { ...defaultMeta, lastUpdated: new Date().toISOString() };
      await saveMeta(currentMeta);
    }
    
    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) { 
    console.error("Error initTrainerMeta:", e); 
    const raw = localStorage.getItem(TRAINER_META_KEY);
    currentMeta = raw ? JSON.parse(raw) : { ...defaultMeta };
  }
}

async function openProfileModal() {
  await initTrainerMeta();
  await updatePokedexCountFromDiscoveries();

  const notesInput = $("input-inventory-notes");
  if (notesInput) {
    notesInput.value = currentMeta.notes || "";
    const updateCount = () => {
      const words = notesInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
      $("word-count-notes").textContent = `Palabras: ${words} / 60`;
      $("word-count-notes").style.color = words > 60 ? "#e53e3e" : "#718096";
    };
    notesInput.oninput = updateCount;
    updateCount();
  }

  $("modal-edit")?.classList.remove("hidden");
}

function loadMeta() {
  const raw = localStorage.getItem(TRAINER_META_KEY);
  if (raw) {
      currentMeta = JSON.parse(raw);
  }
  return currentMeta || { ...defaultMeta };
}

async function saveMeta(meta) {
  const userId = window.currentUserId;
  if (!userId) return;
  currentMeta = meta;
  localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  await window.supabaseClient.from(TRAINER_TABLE).upsert(
    { user_id: userId, inventory: currentMeta, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

// ========================
// GUARDADO FINAL CONTROLADO
// ========================

async function handleSave() {
  const meta = loadMeta();

  const notesInput = $("input-inventory-notes");
  const notesVal = notesInput ? notesInput.value.trim() : "";
  const wordCount = notesVal.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount > 60) {
    alert(`Las notas exceden el límite permitido (${wordCount}/60 palabras).`);
    return;
  }

  meta.notes = notesVal;
  meta.lastUpdated = new Date().toISOString();
  await saveMeta(meta);
  renderView();
  closeModal();
}

function renderView() {
    const meta = loadMeta() || defaultMeta; 
    const trainerName = window.currentTrainerName || "Entrenador";

    setText("trainer-name-display", trainerName.toUpperCase());
    setText("trainer-label", `Entrenador: ${trainerName}`);

    const eco = meta.economy || { savings: 0, biIncome: 0, spent: 0 };
    const available = (eco.savings + eco.biIncome) - eco.spent;

    setText("money-available", available.toLocaleString());
    setText("money-bi-income", eco.biIncome.toLocaleString());
    setText("money-spent", eco.spent.toLocaleString());
    setText("money-savings", eco.savings.toLocaleString());
    
    setText("xp-value", meta.xp ?? 0);
    setText("last-updated", formatDate(meta.lastUpdated));

    renderInventoryGrid();

    const mainNotesArea = $("inventory-notes-area");
    if (mainNotesArea) {
        mainNotesArea.value = meta.notes || "";
        mainNotesArea.readOnly = true;
    }
}

// ========================
// INVENTARIO: CUADRÍCULA ESTILO RPG
// ========================

function renderInventoryGrid() {
  const grid = $("inv-grid");
  if (!grid) return;

  grid.innerHTML = "";

  INVENTORY_ITEMS_VISUAL.forEach(i => {
    const qty = getItemCount(i.key);
    const slot = document.createElement("div");
    slot.className = "inv-slot inv-slot-item" + (qty <= 0 ? " inv-slot-empty-qty" : "") + (selectedItemKey === i.key ? " selected" : "");
    slot.dataset.key = i.key;
    slot.innerHTML = `
      <img class="inv-slot-icon" src="${i.iconUrl}" alt="${ITEM_LABELS_MAP[i.key]}" />
      <span class="inv-slot-badge">${qty}</span>
    `;
    slot.onclick = () => selectInventoryItem(i.key);
    grid.appendChild(slot);
  });

  for (let n = 0; n < INV_EMPTY_SLOT_COUNT; n++) {
    const empty = document.createElement("div");
    empty.className = "inv-slot inv-slot-empty";
    grid.appendChild(empty);
  }

  // Si el ítem seleccionado sigue existiendo, refrescamos su panel con la cantidad actualizada.
  if (selectedItemKey) selectInventoryItem(selectedItemKey);
}

function selectInventoryItem(key) {
  selectedItemKey = key;

  document.querySelectorAll("#inv-grid .inv-slot-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.key === key);
  });

  const item = INVENTORY_ITEMS_VISUAL.find(i => i.key === key);
  if (!item) return;

  const qty = getItemCount(key);

  $("inv-detail-empty")?.classList.add("hidden");
  $("inv-detail-content")?.classList.remove("hidden");

  const iconEl = $("inv-detail-icon");
  if (iconEl) { iconEl.src = item.iconUrl; iconEl.alt = ITEM_LABELS_MAP[key]; }

  setText("inv-detail-name", ITEM_LABELS_MAP[key]);
  setText("inv-detail-price", `₽${(ITEM_PRICES[key] || 0).toLocaleString()}`);
  setText("inv-detail-qty", qty);
  setText("inv-detail-desc", ITEM_DESCRIPTIONS[key] || "");

  const btnUse = $("btn-inv-use");
  if (btnUse) btnUse.disabled = qty <= 0;
}

async function handleUseItem() {
  if (!selectedItemKey) return;
  const key = selectedItemKey;
  const qty = getItemCount(key);
  if (qty <= 0) return;

  const label = ITEM_LABELS_MAP[key];
  if (!confirm(`¿Usar/descartar 1x ${label}? Se restará de tu inventario y no se puede deshacer.`)) return;

  const btnUse = $("btn-inv-use");
  if (btnUse) btnUse.disabled = true;

  try {
    const meta = loadMeta();
    const cat = getItemCategory(key);
    meta[cat][key] = Math.max(0, (meta[cat][key] || 0) - 1);
    meta.lastUpdated = new Date().toISOString();

    await saveMeta(meta);
    await window.supabaseClient.from(LOG_TABLE).insert({
      user_id: window.currentUserId,
      activity_type: "consume",
      activity_name: `1x ${label}`,
      money_reward: 0,
      xp_reward: 0,
    });

    renderView();
  } catch (e) {
    console.error("Error al usar/descartar el ítem:", e);
    alert("Ocurrió un error al actualizar tu inventario. Intenta nuevamente.");
    if (btnUse) btnUse.disabled = false;
  }
}

// ========================
// SINCRONIZACIONES EXTRA
// ========================

async function handleClosePeriod() {
  const meta = loadMeta();
  const userId = window.currentUserId;
  if (!userId) return;

  const totalIncome = meta.economy.biIncome || 0;
  const currentAvailable = (meta.economy.savings + meta.economy.biIncome) - meta.economy.spent;

  try {
    const { data: gameData } = await window.supabaseClient
      .from(GAME_TABLE)
      .select("box_data, party_data")
      .eq("id", userId)
      .maybeSingle();

    const typeCounts = {};
    if (gameData) {
      const allPkm = [];
      if (Array.isArray(gameData.party_data)) allPkm.push(...gameData.party_data.filter(p => p));
      if (gameData.box_data?.boxes) {
        gameData.box_data.boxes.forEach(box => {
          if (Array.isArray(box)) allPkm.push(...box.filter(p => p));
        });
      }

      // Igual que logQuery/hatchQuery: solo contamos lo agregado desde el
      // último cierre. Sin lastClosedAt (primer cierre) se cuenta todo.
      const cutoffDate = meta.economy.lastClosedAt ? new Date(meta.economy.lastClosedAt) : null;
      const hasValidCutoff = cutoffDate && !Number.isNaN(cutoffDate.getTime());

      allPkm.forEach(p => {
        if (!p || !Array.isArray(p.tipos) || !p.tipos[0]) return;
        if (hasValidCutoff) {
          const registered = p.registrationDate ? new Date(p.registrationDate) : null;
          if (!registered || Number.isNaN(registered.getTime()) || registered < cutoffDate) return;
        }
        const primaryType = p.tipos[0].toLowerCase().trim();
        typeCounts[primaryType] = (typeCounts[primaryType] || 0) + 1;
      });
    }

    let logQuery = window.supabaseClient
      .from("trainer_log")
      .select("activity_type")
      .eq("user_id", userId);

    if (meta.economy.lastClosedAt) {
      const startingDate = new Date(meta.economy.lastClosedAt);
      if (!Number.isNaN(startingDate.getTime())) {
        logQuery = logQuery.gte("created_at", startingDate.toISOString());
      }
    }

    const { data: logs } = await logQuery;

    const activityCounts = {};
    if (logs) {
      logs.forEach(log => {
        const actType = log.activity_type || "otros";
        activityCounts[actType] = (activityCounts[actType] || 0) + 1;
      });
    }

    let hatchQuery = window.supabaseClient
      .from("trainer_incubations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("hatched", true);

    if (meta.economy.lastClosedAt) {
      const startingDate = new Date(meta.economy.lastClosedAt);
      if (!Number.isNaN(startingDate.getTime())) {
        hatchQuery = hatchQuery.gte("hatch_date", startingDate.toISOString());
      }
    }

    const { count: hatchCount } = await hatchQuery;

    const typeNames = {
      encounter: "Encounter", safari: "Safari", quest: "Quest", pokedex_comu: "Pokédex Comu.",
      pokedex_legen: "Pokédex Leg.", pokewords: "Pokéwords", freemode: "Freemode",
      passport: "Passport", evolution_narrative: "Evolución", trade_narrative: "Intercambio",
      checkpoint: "Checkpoint", otros_manual: "Otros"
    };

    const typeStrings = [];
    Object.keys(typeCounts).forEach(t => {
      const typeLabel = t.charAt(0).toUpperCase() + t.slice(1);
      typeStrings.push(`Tipo ${typeLabel} (+${typeCounts[t]})`);
    });
    
    let typesInlineHTML = typeStrings.length > 0
      ? `<p style="color: #4a5568; line-height: 1.5; padding-left: 4px;">${typeStrings.join(', ')}</p>`
      : `<p style="color: #718096; font-style: italic; padding-left: 4px;">Ningún Pokémon registrado en cajas o equipo.</p>`;

    const actStrings = [];
    Object.keys(activityCounts).forEach(a => {
      const label = typeNames[a] || a;
      actStrings.push(`${label} (+${activityCounts[a]})`);
    });

    let actsInlineHTML = actStrings.length > 0
      ? `<p style="color: #4a5568; line-height: 1.5; padding-left: 4px;">${actStrings.join(', ')}</p>`
      : `<p style="color: #718096; font-style: italic; padding-left: 4px;">No has registrado actividades en este ciclo.</p>`;

    const itemStrings = [];
    if (meta.items) {
      Object.keys(meta.items).forEach(key => {
        const count = meta.items[key] || 0;
        if (count > 0) {
          const label = ITEM_LABELS_MAP[key] || key;
          itemStrings.push(`${label} (${count})`);
        }
      });
    }
    if (meta.balls) {
      Object.keys(meta.balls).forEach(key => {
        const count = meta.balls[key] || 0;
        if (count > 0) {
          const label = ITEM_LABELS_MAP[key] || key;
          itemStrings.push(`${label} (${count})`);
        }
      });
    }

    let itemsInlineHTML = itemStrings.length > 0
      ? `<p style="color: #4a5568; line-height: 1.5; padding-left: 4px;">${itemStrings.join(', ')}</p>`
      : `<p style="color: #718096; font-style: italic; padding-left: 4px;">Mochila vacía para el próximo bimestre.</p>`;

    const fechaTexto = meta.economy.lastClosedAt 
      ? `desde tu último corte el ${new Date(meta.economy.lastClosedAt).toLocaleDateString("es-ES")}` 
      : `Historial Completo Acumulado (Primer Cierre)`;

    const contentContainer = document.getElementById("period-summary-content");
    if (contentContainer) {
      contentContainer.innerHTML = `
        <p style="margin-bottom: 14px; color: #4b5563; font-size: 0.8rem;">Estadísticas recopiladas: <strong>${fechaTexto}</strong>.</p>
        
        <div style="background: #e6fffa; border: 1px solid #b2f5ea; padding: 12px 14px; border-radius: 12px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; color: #234e52; font-size: 0.8rem;">TOTAL INGRESO BIMESTRE:</span>
            <span style="font-weight: 800; color: #2b6cb0; font-size: 1rem; font-family: 'Press Start 2P', monospace;">₽${totalIncome.toLocaleString()}</span>
          </div>
          <div style="border-top: 1px dashed #b2f5ea; margin: 2px 0;"></div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; color: #234e52; font-size: 0.8rem;">SALDO TRANSFERIDO A AHORROS:</span>
            <span style="font-weight: 800; color: #0fb86b; font-size: 1.1rem; font-family: 'Press Start 2P', monospace;">₽${currentAvailable.toLocaleString()}</span>
          </div>
        </div>

        <h4 class="modal-subtitle" style="margin-bottom: 8px; color: #373b5c; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">📦 Pokémon por tipo principal</h4>
        <div style="margin-bottom: 16px;">${typesInlineHTML}</div>

        <h4 class="modal-subtitle" style="margin-bottom: 8px; color: #373b5c; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">📝 Actividades registradas</h4>
        <div style="margin-bottom: 16px;">${actsInlineHTML}</div>

        <h4 class="modal-subtitle" style="margin-bottom: 8px; color: #373b5c; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">🎒 Ítems disponibles de mochila</h4>
        <div style="margin-bottom: 16px;">${itemsInlineHTML}</div>

        <h4 class="modal-subtitle" style="margin-bottom: 6px; color: #373b5c; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">🥚 Incubación</h4>
        <p style="padding-left: 4px; margin-bottom: 16px; color: #4a5568;"><strong>Huevos pokémon eclosionados:</strong> ${hatchCount || 0}</p>
        
        <div style="border-top: 2px dashed #dac6f0; margin: 12px 0 8px 0;"></div>
      `;
    }

    const modalPeriod = document.getElementById("modal-period-summary");
    if (!modalPeriod) throw new Error("No se encontró el contenedor '#modal-period-summary' en el HTML.");
    
    modalPeriod.classList.remove("hidden");

    const btnCancel = document.getElementById("btn-cancel-period-summary");
    if (btnCancel) {
      btnCancel.onclick = () => { modalPeriod.classList.add("hidden"); };
    }

    // CORRECCIÓN AQUÍ: Declaramos y enlazamos btnConfirm usando el helper $() con el ID correcto del HTML
    const btnConfirm = $("btn-confirm-period-summary");
    if (btnConfirm) {
      btnConfirm.onclick = async () => {
        const finalSavings = currentAvailable; 

        meta.economy.savings = currentAvailable;
        meta.economy.biIncome = 0;
        meta.economy.spent = 0;
        meta.economy.lastClosedAt = new Date().toISOString();
        
        await saveMeta(meta);

        // COMPILAMOS EL RESUMEN EN UN OBJETO DETALLADO
        const closureSummary = {
          displayTitle: `Cierre de Bimestre (Ahorros acumulados: ₽${finalSavings.toLocaleString()})`,
          income: totalIncome,
          savings: finalSavings,
          types: typeStrings.length > 0 ? typeStrings.join(', ') : "Ningún Pokémon registrado",
          activities: actStrings.length > 0 ? actStrings.join(', ') : "No se registraron actividades",
          items: itemStrings.length > 0 ? itemStrings.join(', ') : "Mochila vacía",
          hatched: hatchCount || 0
        };

        // GUARDAMOS EL HISTORIAL DIRECTAMENTE EN FORMATO JSON
        await window.supabaseClient.from("trainer_log").insert({
          user_id: userId,
          activity_type: "bimonthly_close",
          activity_name: JSON.stringify(closureSummary), 
          money_reward: 0,
          xp_reward: 0
        });

        renderView();
        modalPeriod.classList.add("hidden");
        alert("¡Bimestre cerrado con éxito! Tus ahorros y la fecha de corte han sido actualizados.");
      };
    }

  } catch (err) {
    console.error("Error al generar el modal de cierre:", err);
    alert(`Error de ejecución: ${err.message}`);
  }
}

async function updateCapturedCountFromSupabase() {
  try {
    const { data } = await window.supabaseClient.from(GAME_TABLE).select("box_data, party_data").eq("id", window.currentUserId).maybeSingle();
    if (!data) return;
    let total = 0;
    if (Array.isArray(data.party_data)) total += data.party_data.filter(p => p).length;
    if (data.box_data?.boxes) {
       data.box_data.boxes.forEach(box => { if (Array.isArray(box)) total += box.filter(p => p).length; });
    }
    setText("captured-count", total);
  } catch (e) { console.error(e); }
}

async function updatePokedexCountFromDiscoveries() {
  try {
    const userId = window.currentUserId;
    if (!userId) return;

    // Cuenta por user_id (vínculo estable, sobrevive a cambios de username) y,
    // en paralelo, el respaldo por nombre para registros antiguos sin user_id.
    const trainerName = window.currentTrainerName;
    const [{ count: byId, error: errId }, { count: legacyCount, error: errName }] = await Promise.all([
      window.supabaseClient.from("sorelle_discoveries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      trainerName
        ? window.supabaseClient.from("sorelle_discoveries")
            .select("*", { count: "exact", head: true })
            .is("user_id", null)
            .eq("trainer_name", trainerName)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (errId) throw errId;
    if (errName) throw errName;

    const total = (byId || 0) + (legacyCount || 0);
    if (currentMeta) currentMeta.pokedex = String(total);
  } catch (e) { console.error(e); }
}

function handleCancel() { closeModal(); }

function closeModal() { $("modal-edit")?.classList.add("hidden"); }

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = $("btn-menu");
    const sideMenu = $("side-menu");
    const btnClose = $("btn-close-menu");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => { sideMenu.classList.remove("hidden"); };

        if (btnClose) {
            btnClose.onclick = () => { sideMenu.classList.add("hidden"); };
        }

        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) { sideMenu.classList.add("hidden"); }
        };
    }

    if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

// ==========================================
// INICIALIZACIÓN (DOMContentLoaded)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const user = await initProtectedPage();
    if (!user) return;

    await renderTrainerLabelFromGame();
    await initTrainerMeta();
    renderView();
    await Promise.all([updateCapturedCountFromSupabase(), updatePokedexCountFromDiscoveries()]);

    initHamburgerMenu();

    $("btn-edit-profile")?.addEventListener("click", openProfileModal);
    $("btn-cancel-edit")?.addEventListener("click", handleCancel);
    $("btn-save-edit")?.addEventListener("click", handleSave);
    $("btn-close-period")?.addEventListener("click", handleClosePeriod);
    $("btn-inv-use")?.addEventListener("click", handleUseItem);
});

window.deleteLogEntry = async function() {
    const id = document.getElementById("edit-log-id").value;

    if (!confirm("¿Eliminar actividad? Se restará el dinero y EXP de tu perfil.")) return;

    try {
        const { data: activity } = await window.supabaseClient
            .from(LOG_TABLE).select("money_reward, xp_reward").eq("id", id).single();

        const { data: invRow } = await window.supabaseClient
            .from(TRAINER_TABLE).select("inventory").eq("user_id", window.currentUserId).single();

        let meta = invRow.inventory;
        meta.economy.biIncome -= activity.money_reward;
        meta.xp -= activity.xp_reward;

        await window.supabaseClient.from(TRAINER_TABLE).upsert({ user_id: window.currentUserId, inventory: meta });
        await window.supabaseClient.from(LOG_TABLE).delete().eq("id", id);

        alert("¡Borrado con éxito!");
        closeEditModal();
        location.reload(); 

    } catch (err) {
        console.error("Error al borrar:", err);
        alert("No se pudo borrar el registro.");
    }
};