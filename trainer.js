// trainer.js - VERSIÓN FINAL INTEGRADA Y CORREGIDA
// ===============================================

const TRAINER_META_KEY = "pokeTrainerMeta_v1";
const TRAINER_TABLE = "trainer_inventory";
const GAME_TABLE = "user_game_data";

// CONFIGURACIÓN DE PRECIOS
const ITEM_PRICES = {
  egg: 600, rareCandy: 150, tradeToken: 150, evoStone: 300,
  friendship: 300, passport: 100, poke: 50, super: 100, ultra: 150
};

// ETIQUETAS
const ITEM_LABELS_MAP = {
  egg: "Huevo Pokémon", rareCandy: "Rare Candy", tradeToken: "Token Intercambio",
  evoStone: "Piedra Evolución", friendship: "Pulsera Amistad", passport: "Pasaporte Regional",
  poke: "Poké Ball", super: "Super Ball", ultra: "Ultra Ball"
};

// ESTADO GLOBAL
let currentMeta = null;
let tempPurchases = {}; 
let tempGifts = {};     
let currentStep = 1; // 1: Inventario, 2: Resumen, 3: Perfil

const defaultMeta = {
  xp: 0, achievements: "", pokedex: "0",
  economy: { biIncome: 0, savings: 0, spent: 0 },
  items: { egg: 0, rareCandy: 0, tradeToken: 0, evoStone: 0, friendship: 0, passport: 0 },
  balls: { poke: 0, super: 0, ultra: 0 },
  lastUpdated: null,
};

const INVENTORY_ITEMS_VISUAL = [
  { key: "egg", label: "Huevo", iconUrl: "https://i.ibb.co/zV0rqtqp/Huevo-DP.png", countId: "item-egg" },
  { key: "rareCandy", label: "Rare Candy", iconUrl: "https://i.ibb.co/qYWj4L1G/Caramelo-raro.png", countId: "item-rare-candy" },
  { key: "tradeToken", label: "Token Intercambio", iconUrl: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png", countId: "item-trade-token" },
  { key: "evoStone", label: "Piedra Evolución", iconUrl: "https://i.ibb.co/Lyh4XR3/shiny-stone.png", countId: "item-evo-stone" },
  { key: "friendship", label: "Pulsera Amistad", iconUrl: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png", countId: "item-friendship" },
  { key: "passport", label: "Pasaporte Regional", iconUrl: "https://i.ibb.co/R4HdLphw/eon-ticket.png", countId: "item-passport" },
];

// HELPERS
function $(id) { return document.getElementById(id); }
function setText(id, value) { const el = $(id); if (el) el.textContent = String(value ?? ""); }
function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ""; }
function getItemCategory(key) { return ["poke", "super", "ultra"].includes(key) ? "balls" : "items"; }
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
        economy: { ...defaultMeta.economy, ...(parsed.economy || {}) },
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
    } else {
      currentMeta = { ...defaultMeta, lastUpdated: new Date().toISOString() };
      await saveMeta(currentMeta);
    }
    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) { console.error("Error initTrainerMeta:", e); currentMeta = { ...defaultMeta }; }
}

function loadMeta() {
  const raw = localStorage.getItem(TRAINER_META_KEY);
  currentMeta = raw ? JSON.parse(raw) : (currentMeta || { ...defaultMeta });
  return currentMeta;
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

async function openProfileModal() {
  loadMeta();
  currentStep = 3; 
  
  // 1. Alternar visibilidad: Mostrar Perfil, ocultar Inventario
  if ($("section-basic-data")) $("section-basic-data").style.display = "block";
  if ($("section-item-management")) $("section-item-management").style.display = "none";
  
  // 2. Sincronizar Pokédex desde la base de datos antes de mostrar
  await updatePokedexCountFromDiscoveries();

  // 3. Poblar datos de perfil (Logros se omiten para edición manual)
  setValue("input-trainer-name", window.currentTrainerName || "");
  setValue("input-bi-income", currentMeta.economy.biIncome);
  setValue("input-savings-readonly", currentMeta.economy.savings);
  setValue("input-xp", currentMeta.xp);
  
  // 4. Configurar campo automático de Pokédex
  const px = $("input-pokedex");
  if (px) { 
    px.value = currentMeta.pokedex || "0"; 
    px.readOnly = true; 
    px.style.backgroundColor = "#edf2f7"; 
    px.style.cursor = "not-allowed";
  }

  // 5. Ajustar botones del footer
  $("btn-save-edit").textContent = "Guardar Perfil";
  $("btn-cancel-edit").textContent = "Cancelar";
  
  $("modal-edit")?.classList.remove("hidden");
}

function openInventoryModal() {
  loadMeta();
  // Limpiamos selecciones previas
  tempPurchases = {}; 
  tempGifts = {}; 
  currentStep = 1; 
  
  // 1. Alternar visibilidad: Ocultar perfil, mostrar inventario
  if ($("section-basic-data")) $("section-basic-data").style.display = "none";
  if ($("section-item-management")) $("section-item-management").style.display = "block";
  
  // 2. Mostrar texto de ayuda
  const helpText = $("item-help-text");
  if (helpText) helpText.style.display = "block";

  // 3. Dibujar la lista de ítems (conteo desde cero)
  renderModalItems();
  
  // 4. Ajustar botones del footer
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
    
    // Solo mostramos la suma de lo que el usuario está haciendo en esta sesión
    const qtySelected = (tempPurchases[key] || 0) + (tempGifts[key] || 0);
    
    // Estilos dinámicos: Rojo si resta, Azul si suma
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
  
  // VALIDACIÓN: No permitir gastar más de lo que el usuario posee en total
  if (change < 0 && (currentInInventory + currentSessionTotal + change) < 0) {
    alert(`No puedes gastar más de lo que tienes (${currentInInventory} disponibles).`);
    return;
  }

  if (action === 'buy') tempPurchases[key] += change;
  else if (action === 'obtain') tempGifts[key] += change;
  else if (action === 'remove') {
    // Si presiona el botón "－", intentamos reducir primero compras temporales, luego regalos/gasto
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
    <div style="margin-top:15px; padding:12px; background:#2d3748; color:white; border-radius:8px; display:flex; justify-content:space-between; font-weight:bold;">
      <span>DINERO A DESCONTAR:</span><span>₽${totalSpent.toLocaleString()}</span>
    </div>`;
  
  container.dataset.totalSpent = totalSpent;
}

// ========================
// GUARDADO FINAL
// ========================

async function handleSave() {
  const meta = loadMeta();
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
      Object.keys(ITEM_LABELS_MAP).forEach(key => {
        const cat = getItemCategory(key);
        meta[cat][key] += (tempPurchases[key] || 0) + (tempGifts[key] || 0);
      });
      meta.economy.spent += total;
    } 
    else if (currentStep === 3) {
      const newName = ($("input-trainer-name")?.value || "").trim();
      if (newName && window.currentUserId) {
        await window.supabaseClient.from(GAME_TABLE).upsert({ id: window.currentUserId, trainer_name: newName }, { onConflict: "id" });
        window.currentTrainerName = newName;
      }
      meta.economy.biIncome = parseInt($("input-bi-income")?.value) || 0;
      meta.xp = parseInt($("input-xp")?.value) || 0;
      meta.achievements = ($("input-achievements")?.value || "").trim();
      // NO leemos pokedex del input para evitar el error del "1"
    }
    
    meta.lastUpdated = new Date().toISOString();
    await saveMeta(meta);
    renderView();
    closeModal();
  }
}

function renderView() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "Entrenador";

  setText("trainer-name-display", trainerName.toUpperCase());
  setText("trainer-label", `Entrenador: ${trainerName}`);

  const available = (meta.economy.savings + meta.economy.biIncome) - meta.economy.spent;
  setText("money-available", available.toLocaleString());
  setText("money-bi-income", meta.economy.biIncome.toLocaleString());
  setText("money-spent", meta.economy.spent.toLocaleString());
  setText("money-savings", meta.economy.savings.toLocaleString());
  
  setText("xp-value", meta.xp);
  setText("achievements-value", meta.achievements || "—");
  setText("pokedex-value", meta.pokedex || "0");

  INVENTORY_ITEMS_VISUAL.forEach(i => setText(i.countId, meta.items[i.key]));
  setText("ball-poke", meta.balls.poke);
  setText("ball-super", meta.balls.super);
  setText("ball-ultra", meta.balls.ultra);
  setText("last-updated", formatDate(meta.lastUpdated));
}

// ========================
// SINCRONIZACIONES EXTRA
// ========================

async function handleClosePeriod() {
  const meta = loadMeta();
  const currentAvailable = (meta.economy.savings + meta.economy.biIncome) - meta.economy.spent;
  if (confirm(`¿Cerrar bimestre? El saldo de ₽${currentAvailable} pasará a Ahorros.`)) {
    meta.economy.savings = currentAvailable;
    meta.economy.biIncome = 0;
    meta.economy.spent = 0;
    await saveMeta(meta);
    renderView();
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
    const trainerName = window.currentTrainerName;
    if (!trainerName) return;
    const { count, error } = await window.supabaseClient.from("sorelle_discoveries").select("*", { count: "exact", head: true }).eq("trainer_name", trainerName);
    if (error) throw error;
    if (currentMeta) currentMeta.pokedex = String(count || 0);
    setText("pokedex-value", count || 0);
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

document.addEventListener("DOMContentLoaded", async () => {
  const list = $("inventory-list");
  if (list) {
    list.innerHTML = "";
    INVENTORY_ITEMS_VISUAL.forEach(i => {
      const art = document.createElement("article");
      art.className = "inv-item";
      art.innerHTML = `<div class="inv-left"><img class="inv-icon" src="${i.iconUrl}"> <span class="inv-name">${i.label}</span></div>
                       <span class="inv-count">×<span id="${i.countId}">0</span></span>`;
      list.appendChild(art);
    });
  }
  const user = await initProtectedPage();
  if (!user) return;
  setupLogoutButton();
  await renderTrainerLabelFromGame();
  await initTrainerMeta();
  renderView();
  await updateCapturedCountFromSupabase();
  await updatePokedexCountFromDiscoveries();

  $("btn-edit-profile")?.addEventListener("click", openProfileModal);
  $("btn-edit-inventory")?.addEventListener("click", openInventoryModal);
  $("btn-cancel-edit")?.addEventListener("click", handleCancel);
  $("btn-save-edit")?.addEventListener("click", handleSave);
  $("btn-close-period")?.addEventListener("click", handleClosePeriod);
});