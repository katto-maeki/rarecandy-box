// trainer.js - VERSIÓN FINAL INTEGRADA Y CORREGIDA CON LOGS AUTOMÁTICOS
// ===================================================================

const TRAINER_META_KEY = "pokeTrainerMeta_v1";
const TRAINER_TABLE = "trainer_inventory";
const GAME_TABLE = "user_game_data";
const LOG_TABLE = "trainer_log"; // Añadido para prevenir futuros ReferenceError en deleteLogEntry

// CONFIGURACIÓN DE PRECIOS ACTUALIZADA
const ITEM_PRICES = {
  egg: 600, tradeToken: 150, evoStone: 300, friendship: 300, 
  passport: 150, panquecito: 100, poke: 50, super: 100, ultra: 150, master: 300, 
};

// ETIQUETAS ACTUALIZADAS
const ITEM_LABELS_MAP = {
  egg: "Huevo Pokémon", tradeToken: "Ticket de Intercambio", evoStone: "Piedra Evolución", 
  friendship: "Pulsera Amistad", passport: "Pasaporte Regional", panquecito: "Panquecito", poke: "Poké Ball", 
  super: "Super Ball", ultra: "Ultra Ball", master: "Master Ball"
};

// ESTADO GLOBAL
let currentMeta = null;
let tempPurchases = {}; 
let tempGifts = {};     
let currentStep = 1; // 1: Inventario, 2: Resumen, 3: Perfil

const defaultMeta = {
  xp: 0, achievements: "", pokedex: "0", notes: "",
  economy: { biIncome: 0, savings: 0, spent: 0 },
  items: { egg: 0, tradeToken: 0, evoStone: 0, friendship: 0, passport: 0, panquecito: 0 },
  balls: { poke: 0, super: 0, ultra: 0, master: 0 },
  lastUpdated: null,
};

// VISUALIZACIÓN DINÁMICA DE LA MOCHILA
const INVENTORY_ITEMS_VISUAL = [
  { key: "egg", label: "Huevo", iconUrl: "https://i.ibb.co/zV0rqtqp/Huevo-DP.png", countId: "item-egg" },
  { key: "tradeToken", label: "Ticket de Intercambio", iconUrl: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png", countId: "item-trade-token" },
  { key: "evoStone", label: "Piedra Evolución", iconUrl: "https://i.ibb.co/Lyh4XR3/shiny-stone.png", countId: "item-evo-stone" },
  { key: "friendship", label: "Pulsera Amistad", iconUrl: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png", countId: "item-friendship" },
  { key: "passport", label: "Pasaporte Regional", iconUrl: "https://i.ibb.co/R4HdLphw/eon-ticket.png", countId: "item-passport" },
  { key: "panquecito", label: "Panquecito", iconUrl: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/lumiose-galette.png", countId: "item-panquecito" },
];

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
  
  currentStep = 3; 
  if ($("section-basic-data")) $("section-basic-data").style.display = "block";
  if ($("section-item-management")) $("section-item-management").style.display = "none";
  
  await updatePokedexCountFromDiscoveries();

  if ($("input-trainer-name")) {
    $("input-trainer-name").value = window.currentTrainerName || "";
    $("input-trainer-name").disabled = true; 
    $("input-trainer-name").style.background = "#edf2f7"; 
    $("input-trainer-name").style.cursor = "not-allowed";
  }
  
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

  $("btn-save-edit").textContent = "Guardar Perfil";
  $("btn-cancel-edit").textContent = "Cancelar";
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
// LÓGICA DE MODALES
// ========================

function openInventoryModal() {
  loadMeta();
  tempPurchases = {}; 
  tempGifts = {}; 
  currentStep = 1; 
  
  if ($("section-basic-data")) $("section-basic-data").style.display = "none";
  if ($("section-item-management")) $("section-item-management").style.display = "block";
  
  const helpText = $("item-help-text");
  if (helpText) helpText.style.display = "block";

  renderModalItems();
  
  $("btn-save-edit").textContent = "Siguiente";
  $("btn-cancel-edit").textContent = "Cancelar";
  
  $("modal-edit")?.classList.remove("hidden");
}

function renderModalItems() {
  const container = $("item-management-container");
  if(!container) return;
  container.innerHTML = "";
  
  Object.keys(ITEM_PRICES).forEach(key => {
    const row = document.createElement("div");
    row.className = "item-manager-row";
    
    const qtySelected = (tempPurchases[key] || 0) + (tempGifts[key] || 0);
    const qtyColor = qtySelected < 0 ? "#e53e3e" : (qtySelected > 0 ? "#3182ce" : "#2d3748");
    const qtyLabel = qtySelected > 0 ? `+${qtySelected}` : qtySelected;

    row.innerHTML = `
      <div>
        <div style="font-weight:bold;">${ITEM_LABELS_MAP[key]}</div>
        <div style="font-size:0.8em; color:#718096;">₽${ITEM_PRICES[key]}</div>
      </div>
      <div class="item-manager-controls">
        <span style="margin-right:10px; font-weight:bold; width:45px; text-align:center; color: ${qtyColor}; font-size: 1.1em;">
          ${qtyLabel}
        </span>
        <button class="btn-tiny" onclick="updateItemCount('${key}', -1, 'remove')" title="Gastar/Restar">－</button>
        <button class="btn-tiny" style="color:#3182ce;" onclick="updateItemCount('${key}', 1, 'buy')">+ Compra</button>
        <button class="btn-tiny" style="color:#38a169;" onclick="updateItemCount('${key}', 1, 'obtain')">+ Regalo</button>
      </div>`;
    container.appendChild(row);
  });
}

window.updateItemCount = function(key, change, action) {
  if (!tempPurchases[key]) tempPurchases[key] = 0;
  if (!tempGifts[key]) tempGifts[key] = 0;
  
  const currentInInventory = getItemCount(key); 
  const currentSessionTotal = tempPurchases[key] + tempGifts[key];
  
  if (change < 0 && (currentInInventory + currentSessionTotal + change) < 0) {
    alert(`No puedes gastar más de lo que tienes (${currentInInventory} disponibles).`);
    return;
  }

  if (action === 'buy') tempPurchases[key] += change;
  else if (action === 'obtain') tempGifts[key] += change;
  else if (action === 'remove') {
    if (tempPurchases[key] > 0) tempPurchases[key] += change;
    else tempGifts[key] += change; 
  }
  
  renderModalItems();
};

function showPurchaseSummary() {
  const container = $("item-management-container");
  if ($("item-help-text")) $("item-help-text").style.display = "none";
  
  currentStep = 2;
  $("btn-save-edit").textContent = "Confirmar y Guardar";
  $("btn-cancel-edit").textContent = "Atrás";

  let totalSpent = 0;
  let p_html = ""; let g_html = ""; let u_html = "";

  Object.keys(ITEM_LABELS_MAP).forEach(key => {
    const p = tempPurchases[key] || 0;
    const g = tempGifts[key] || 0;
    const netChange = p + g;

    if (p > 0) {
      const cost = p * ITEM_PRICES[key];
      totalSpent += cost;
      p_html += `<div>+ ${p} ${ITEM_LABELS_MAP[key]} (₽${cost})</div>`;
    }
    if (g > 0) {
      g_html += `<div style="color:#38a169;">+ ${g} ${ITEM_LABELS_MAP[key]} (Regalo)</div>`;
    }
    if (netChange < 0) {
      u_html += `<div style="color:#e53e3e;">- ${Math.abs(netChange)} ${ITEM_LABELS_MAP[key]}</div>`;
    }
  });

  container.innerHTML = `
    <h3 style="text-align:center; margin-bottom:15px;">Resumen de Movimientos</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.85em;">
      <div style="background:#ebf8ff; padding:10px; border-radius:8px;">
        <strong style="color: #3182ce;">ADQUISICIONES</strong>
        <div style="margin-top:5px;">${p_html || g_html ? p_html + g_html : "Ninguna"}</div>
      </div>
      <div style="background:#fff5f5; padding:10px; border-radius:8px;">
        <strong style="color: #c53030;">GASTO DE MOCHILA</strong>
        <div style="margin-top:5px;">${u_html || "Ninguno"}</div>
      </div>
    </div>
    <div style="grid-column: span 2; margin-top:15px; padding:12px; background:#2d3748; color:white; border-radius:8px; display:flex; justify-content:space-between; font-weight:bold;">
      <span>DINERO A DESCONTAR:</span><span>₽${totalSpent.toLocaleString()}</span>
    </div>`;
  
  container.dataset.totalSpent = totalSpent;
}

// ========================
// GUARDADO FINAL CONTROLADO
// ========================

async function handleSave() {
  const meta = loadMeta();
  const userId = window.currentUserId;
  const available = (meta.economy.savings + meta.economy.biIncome) - meta.economy.spent;

  if (currentStep === 1) {
    let totalTempSpent = 0;
    Object.keys(tempPurchases).forEach(key => {
      totalTempSpent += (tempPurchases[key] || 0) * (ITEM_PRICES[key] || 0);
    });

    if (totalTempSpent > available) {
      alert(`Saldo insuficiente. Faltan ₽${(totalTempSpent - available).toLocaleString()}`);
      return; 
    }
    showPurchaseSummary();

  } else {
    if (currentStep === 2) {
      const total = parseInt($("item-management-container").dataset.totalSpent) || 0;
      const logsToInsert = [];

      Object.keys(ITEM_LABELS_MAP).forEach(key => {
        const cat = getItemCategory(key);
        const p = tempPurchases[key] || 0;
        const g = tempGifts[key] || 0;

        meta[cat][key] += p + g;

        if (p > 0) {
          logsToInsert.push({
            user_id: userId,
            activity_type: "purchase",
            activity_name: `Mochila: Compró ${p}x ${ITEM_LABELS_MAP[key]}`,
            money_reward: -(p * ITEM_PRICES[key]),
            xp_reward: 0
          });
        }
        if (g > 0) {
          logsToInsert.push({
            user_id: userId,
            activity_type: "otros",
            activity_name: `Mochila: Recibió regalo de ${g}x ${ITEM_LABELS_MAP[key]}`,
            money_reward: 0,
            xp_reward: 0
          });
        }
        if ((p + g) < 0) {
          logsToInsert.push({
            user_id: userId,
            activity_type: "consume", 
            activity_name: `${Math.abs(p + g)}x ${ITEM_LABELS_MAP[key]}`,
            money_reward: 0,
            xp_reward: 0
          });
        }
      });
      
      meta.economy.spent += total;

      if (logsToInsert.length > 0) {
        await window.supabaseClient.from("trainer_log").insert(logsToInsert);
      }
    } 
    else if (currentStep === 3) {
      const notesInput = $("input-inventory-notes");
      const notesVal = notesInput ? notesInput.value.trim() : "";
      const wordCount = notesVal.split(/\s+/).filter(w => w.length > 0).length;
      
      if (wordCount > 60) {
        alert(`Las notas exceden el límite permitido (${wordCount}/60 palabras).`);
        return; 
      }

      meta.notes = notesVal; 
    }
    
    meta.lastUpdated = new Date().toISOString();
    await saveMeta(meta);
    renderView();
    closeModal();
  }
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

    if (meta.items) {
        INVENTORY_ITEMS_VISUAL.forEach(i => {
            setText(i.countId, meta.items[i.key] ?? 0);
        });
    }

    if (meta.balls) {
        setText("ball-poke", meta.balls.poke ?? 0);
        setText("ball-super", meta.balls.super ?? 0);
        setText("ball-ultra", meta.balls.ultra ?? 0);
        setText("ball-master", meta.balls.master ?? 0); 
    }

    const mainNotesArea = $("inventory-notes-area");
    if (mainNotesArea) {
        mainNotesArea.value = meta.notes || "";
        mainNotesArea.readOnly = true;
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
      encounter: "Encounter", quest: "Quest", pokedex_comu: "Pokédex Comu.",
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

function handleCancel() {
  if (currentStep === 2) {
    currentStep = 1; renderModalItems();
    $("btn-save-edit").textContent = "Siguiente";
    $("btn-cancel-edit").textContent = "Cancelar";
  } else closeModal();
}

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
    const list = $("inventory-list");
    if (list) {
        list.innerHTML = "";
        INVENTORY_ITEMS_VISUAL.forEach(i => {
            const art = document.createElement("article");
            art.className = "inv-item";
            art.innerHTML = `
                <div class="inv-left">
                    <img class="inv-icon" src="${i.iconUrl}"> 
                    <span class="inv-name">${i.label}</span>
                </div>
                <span class="inv-count">×<span id="${i.countId}">0</span></span>`;
            list.appendChild(art);
        });
    }

    const user = await initProtectedPage();
    if (!user) return;

    await renderTrainerLabelFromGame();
    await initTrainerMeta();
    renderView();
    await Promise.all([updateCapturedCountFromSupabase(), updatePokedexCountFromDiscoveries()]);

    initHamburgerMenu();

    $("btn-edit-profile")?.addEventListener("click", openProfileModal);
    $("btn-edit-inventory")?.addEventListener("click", openInventoryModal);
    $("btn-cancel-edit")?.addEventListener("click", handleCancel);
    $("btn-save-edit")?.addEventListener("click", handleSave);
    $("btn-close-period")?.addEventListener("click", handleClosePeriod);
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