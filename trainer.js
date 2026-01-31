// trainer.js
// =============================
// Config Trainer / Inventario
// =============================
const TRAINER_META_KEY = "pokeTrainerMeta_v1";
const TRAINER_TABLE = "trainer_inventory";
const GAME_TABLE = "user_game_data";

// CONFIGURACIÓN DE PRECIOS
const ITEM_PRICES = {
  egg: 600,
  rareCandy: 400,
  tradeToken: 150,
  evoStone: 300,
  friendship: 300,
  passport: 100,
  poke: 50,
  super: 100,
  ultra: 150
};

// Etiquetas
const ITEM_LABELS_MAP = {
  egg: "Huevo Pokémon",
  rareCandy: "Rare Candy",
  tradeToken: "Token Intercambio",
  evoStone: "Piedra Evolución",
  friendship: "Pulsera Amistad",
  passport: "Pasaporte Regional",
  poke: "Poké Ball",
  super: "Super Ball",
  ultra: "Ultra Ball"
};

if (!window.supabaseClient) console.error("supabaseClient no inicializado.");

// Helpers
function $(id) { return document.getElementById(id); }
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = String(value ?? "");
}
function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value ?? "";
}

// Estado Inicial
let currentMeta = null;
const defaultMeta = {
  xp: 0,
  achievements: "",
  pokedex: "",
  economy: {
    biIncome: 0,   // Ingreso
    savings: 0,    // Ahorro
    spent: 0       // Gastado
  },
  items: { egg: 0, rareCandy: 0, tradeToken: 0, evoStone: 0, friendship: 0, passport: 0 },
  balls: { poke: 0, super: 0, ultra: 0 },
  lastUpdated: null,
};

// Visualización de Ítems Generales (La mochila parte 1)
const INVENTORY_ITEMS_VISUAL = [
  { key: "egg", label: "Huevo", iconUrl: "https://i.ibb.co/zV0rqtqp/Huevo-DP.png", countId: "item-egg" },
  { key: "rareCandy", label: "Rare Candy", iconUrl: "https://i.ibb.co/qYWj4L1G/Caramelo-raro.png", countId: "item-rare-candy" },
  { key: "tradeToken", label: "Token Intercambio", iconUrl: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png", countId: "item-trade-token" },
  { key: "evoStone", label: "Piedra Evolución", iconUrl: "https://i.ibb.co/Lyh4XR3/shiny-stone.png", countId: "item-evo-stone" },
  { key: "friendship", label: "Pulsera Amistad", iconUrl: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png", countId: "item-friendship" },
  { key: "passport", label: "Pasaporte Regional", iconUrl: "https://i.ibb.co/R4HdLphw/eon-ticket.png", countId: "item-passport" }, // <-- Icono sugerido (puedes cambiar la URL)
];

function buildInventoryList() {
  const list = $("inventory-list");
  if (!list) return;
  list.innerHTML = "";

  INVENTORY_ITEMS_VISUAL.forEach((item) => {
    const article = document.createElement("article");
    article.className = "inv-item";
    article.innerHTML = `
      <div class="inv-left">
        <img class="inv-icon item-icon" src="${item.iconUrl}" alt="${item.label}">
        <span class="inv-name">${item.label}</span>
      </div>
      <span class="inv-count">×<span id="${item.countId}">0</span></span>
    `;
    list.appendChild(article);
  });
}

// ================================
// Carga y Guardado
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
        economy: parsed.economy ? { ...defaultMeta.economy, ...parsed.economy } : { ...defaultMeta.economy },
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
      
      // Migración legacy
      if (typeof parsed.money === 'number' && !parsed.economy) {
         currentMeta.economy.savings = parsed.money;
         delete currentMeta.money;
      }
    } else {
      currentMeta = { ...defaultMeta, lastUpdated: new Date().toISOString() };
      await window.supabaseClient.from(TRAINER_TABLE).upsert(
        { user_id: userId, inventory: currentMeta, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    }
    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) {
    console.error("Error initTrainerMeta:", e);
    currentMeta = { ...defaultMeta };
  }
}

function loadMeta() {
  if (!currentMeta) {
    try {
      const raw = localStorage.getItem(TRAINER_META_KEY);
      currentMeta = raw ? JSON.parse(raw) : { ...defaultMeta };
    } catch { currentMeta = { ...defaultMeta }; }
  }
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
// Helpers Items
// ========================
function getItemCategory(key) {
  return ["poke", "super", "ultra"].includes(key) ? "balls" : "items";
}

function getItemCount(key) {
  return currentMeta[getItemCategory(key)][key] || 0;
}

function setItemCount(key, val) {
  currentMeta[getItemCategory(key)][key] = val;
}

// ========================
// Render UI
// ========================
function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function renderView() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "Entrenador";

  setText("trainer-name-display", trainerName.toUpperCase());
  setText("trainer-label", `Entrenador: ${trainerName}`);

  // Economía
  const eco = meta.economy;
  const available = (eco.savings + eco.biIncome) - eco.spent;

  setText("money-available", available.toLocaleString());
  setText("money-bi-income", eco.biIncome.toLocaleString());
  setText("money-savings", eco.savings.toLocaleString()); // Ahora se muestra explícitamente
  setText("money-spent", eco.spent.toLocaleString());

  // Otros
  setText("xp-value", meta.xp);
  setText("achievements-value", meta.achievements || "—");
  setText("pokedex-value", meta.pokedex || "—");

  // Inventario Items
  setText("item-egg", meta.items.egg);
  setText("item-rare-candy", meta.items.rareCandy);
  setText("item-trade-token", meta.items.tradeToken);
  setText("item-evo-stone", meta.items.evoStone);
  setText("item-friendship", meta.items.friendship);
  setText("item-passport", meta.items.passport);

  // Pokébolas
  setText("ball-poke", meta.balls.poke);
  setText("ball-super", meta.balls.super);
  setText("ball-ultra", meta.balls.ultra);

  setText("last-updated", formatDate(meta.lastUpdated));
}

// ========================
// Modal Gestión
// ========================
function renderModalItems() {
  const container = $("item-management-container");
  if(!container) return;
  container.innerHTML = "";

  const keys = ["egg", "rareCandy", "tradeToken", "evoStone", "friendship", "passport", "poke", "super", "ultra"];

  keys.forEach(key => {
    const row = document.createElement("div");
    row.className = "item-manager-row";
    
    const qty = getItemCount(key);
    const price = ITEM_PRICES[key] || 0;
    const label = ITEM_LABELS_MAP[key] || key;

    row.innerHTML = `
      <div>
        <div style="font-weight: bold; color: #4a5568;">${label}</div>
        <div style="font-size: 0.8em; color: #718096;">Precio: ₽${price}</div>
      </div>
      <div class="item-manager-controls">
        <span style="margin-right: 10px; font-weight:bold; font-size:1.1em; width: 30px; text-align:center;">${qty}</span>
        <button class="btn-tiny" style="color: #e53e3e; border-color: #feb2b2;" onclick="updateItemCount('${key}', -1, 'remove')"><i class="fa fa-minus"></i></button>
        <button class="btn-tiny" style="color: #3182ce; border-color: #90cdf4;" onclick="updateItemCount('${key}', 1, 'buy')">+ Comprar ($)</button>
        <button class="btn-tiny" style="color: #38a169; border-color: #9ae6b4;" onclick="updateItemCount('${key}', 1, 'obtain')">+ Regalo</button>
      </div>
    `;
    container.appendChild(row);
  });
}

window.updateItemCount = function(key, change, action) {
  const currentQty = getItemCount(key);
  if (change < 0 && currentQty <= 0) return;

  setItemCount(key, currentQty + change);

  if (action === 'buy') {
    currentMeta.economy.spent += (ITEM_PRICES[key] || 0) * change;
  }
  renderModalItems();
};

function openModal() {
  const meta = loadMeta();
  
  // Datos Básicos
  setValue("input-trainer-name", window.currentTrainerName || "");
  
  // Finanzas
  setValue("input-bi-income", meta.economy.biIncome);
  setValue("input-savings-readonly", meta.economy.savings);

  // Recursos
  setValue("input-xp", meta.xp);
  setValue("input-achievements", meta.achievements || "");
  
  // --- ACTUALIZACIÓN POKÉDEX AUTOMÁTICA ---
  const pokedexInput = $("input-pokedex");
  if (pokedexInput) {
    pokedexInput.value = meta.pokedex || "0";
    pokedexInput.disabled = true; // Bloquea la edición manual
    pokedexInput.style.backgroundColor = "#edf2f7"; // Indica visualmente que es solo lectura
    pokedexInput.style.cursor = "not-allowed";
    pokedexInput.title = "Este valor se calcula automáticamente según tus descubrimientos.";
  }

  // Renderizar lista de ítems (incluyendo el Pasaporte Regional)
  renderModalItems(); 
  
  // Mostrar el modal
  $("modal-edit")?.classList.remove("hidden");
}

function closeModal() {
  $("modal-edit")?.classList.add("hidden");
}

async function handleSave() {
  const meta = loadMeta();
  
  // Guardar nombre
  const newName = ($("input-trainer-name")?.value || "").trim();
  if (newName && window.currentUserId) {
     await window.supabaseClient.from(GAME_TABLE).upsert(
       { id: window.currentUserId, trainer_name: newName }, { onConflict: "id" }
     );
     window.currentTrainerName = newName;
  }

  // Guardar valores manuales
  const newIncome = parseInt($("input-bi-income")?.value, 10);
  meta.economy.biIncome = Number.isNaN(newIncome) ? 0 : newIncome;
  
  meta.xp = parseInt($("input-xp")?.value, 10) || 0;
  meta.achievements = ($("input-achievements")?.value || "").trim();
  
  meta.lastUpdated = new Date().toISOString();

  await saveMeta(meta);
  renderView();
  closeModal();
}

async function handleClosePeriod() {
  const eco = currentMeta.economy;
  const currentAvailable = (eco.savings + eco.biIncome) - eco.spent;

  if (confirm(`¿Cerrar bimestre?\n\nSaldo actual: ₽${currentAvailable}\nPasará a Ahorro y se reiniciará el ingreso/gasto.`)) {
    currentMeta.economy.savings = currentAvailable;
    currentMeta.economy.biIncome = 0;
    currentMeta.economy.spent = 0;
    currentMeta.lastUpdated = new Date().toISOString();
    await saveMeta(currentMeta);
    renderView();
  }
}

async function updateCapturedCountFromSupabase() {
  try {
    const { data } = await window.supabaseClient
      .from("user_game_data")
      .select("box_data, party_data")
      .eq("id", window.currentUserId)
      .maybeSingle();

    if (!data) return;
    let total = 0;
    if (Array.isArray(data.party_data)) total += data.party_data.filter(p => p).length;
    if (data.box_data?.boxes) {
       data.box_data.boxes.forEach(box => {
          if (Array.isArray(box)) total += box.filter(p => p).length;
       });
    }
    setText("captured-count", total);
  } catch (e) { console.error(e); }
}

document.addEventListener("DOMContentLoaded", async () => {
  buildInventoryList();
  const user = await initProtectedPage();
  if (!user) return;
  setupLogoutButton();
  await renderTrainerLabelFromGame();
  await initTrainerMeta();
  renderView();
  await updateCapturedCountFromSupabase();
  await updatePokedexCountFromDiscoveries();

  $("btn-edit-profile")?.addEventListener("click", openModal);
  $("btn-cancel-edit")?.addEventListener("click", closeModal);
  $("btn-save-edit")?.addEventListener("click", handleSave);
  $("btn-close-period")?.addEventListener("click", handleClosePeriod);
});

async function updatePokedexCountFromDiscoveries() {
  try {
    const supabase = window.supabaseClient;
    const trainerName = window.currentTrainerName; // Nombre del entrenador actual

    if (!supabase || !trainerName) return;

    // Consultamos la tabla de descubrimientos filtrando por el nombre del entrenador
    const { count, error } = await supabase
      .from("sorelle_discoveries")
      .select("*", { count: "exact", head: true })
      .eq("trainer_name", trainerName);

    if (error) throw error;

    // Actualizamos el número en la interfaz
    setText("pokedex-value", count || 0);
    
    // Opcional: Sincronizar con el objeto meta para que persista en el perfil
    if (currentMeta) {
        currentMeta.pokedex = String(count || 0);
    }
  } catch (e) {
    console.error("Error al contar descubrimientos de Pokédex:", e);
  }
}