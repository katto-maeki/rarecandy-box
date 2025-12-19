// trainer.js
// =============================
// Config Trainer / Inventario
// =============================
const TRAINER_META_KEY = "pokeTrainerMeta_v1";

// Tablas en Supabase
const TRAINER_TABLE = "trainer_inventory";
const GAME_TABLE = "user_game_data"; // trainer_name vive aquí
const BOX_TABLE = "user_game_data";
const BOX_STATE_COLUMN = "box_data";

// ✅ NO redeclaramos supabase
if (!window.supabaseClient) {
  console.error(
    "supabaseClient no está inicializado. Verifica que el CDN de Supabase y core.js carguen antes de trainer.js."
  );
}

// =============================
// Helpers DOM seguros
// =============================
function $(id) {
  return document.getElementById(id);
}
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = String(value ?? "");
}
function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value ?? "";
}

// =============================
// Estado
// =============================
let currentMeta = null;

const defaultMeta = {
  money: 0,
  xp: 0,
  achievements: "",
  pokedex: "",
  items: {
    egg: 0,
    rareCandy: 0,
    tradeToken: 0,
    evoStone: 0,
    friendship: 0,
  },
  balls: {
    poke: 0,
    super: 0,
    ultra: 0,
  },
  lastUpdated: null,
};

// ========================
// Inventario visual
// ========================
const INVENTORY_ITEMS = [
  {
    key: "egg",
    label: "Huevo",
    iconUrl: "https://i.ibb.co/zV0rqtqp/Huevo-DP.png",
    countId: "item-egg",
  },
  {
    key: "rareCandy",
    label: "Rare Candy",
    iconUrl: "https://i.ibb.co/qYWj4L1G/Caramelo-raro.png",
    countId: "item-rare-candy",
  },
  {
    key: "tradeToken",
    label: "Token Intercambio",
    iconUrl: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png",
    countId: "item-trade-token",
  },
  {
    key: "evoStone",
    label: "Piedra Evolución",
    iconUrl: "https://i.ibb.co/Lyh4XR3/shiny-stone.png",
    countId: "item-evo-stone",
  },
  {
    key: "friendship",
    label: "Pulsera Amistad",
    iconUrl: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png",
    countId: "item-friendship",
  },
];

function buildInventoryList() {
  const list = $("inventory-list");
  if (!list) return;

  list.innerHTML = "";

  INVENTORY_ITEMS.forEach((item) => {
    const article = document.createElement("article");
    article.className = "inv-item";

    const left = document.createElement("div");
    left.className = "inv-left";

    const icon = document.createElement("img");
    icon.className = "inv-icon item-icon";
    icon.src = item.iconUrl;
    icon.alt = item.label;

    const nameSpan = document.createElement("span");
    nameSpan.className = "inv-name";
    nameSpan.textContent = item.label;

    const countSpan = document.createElement("span");
    countSpan.className = "inv-count";
    countSpan.innerHTML = `×<span id="${item.countId}">0</span>`;

    left.appendChild(icon);
    left.appendChild(nameSpan);

    article.appendChild(left);
    article.appendChild(countSpan);

    list.appendChild(article);
  });
}

// ================================
// Carga inicial desde Supabase
// ================================
async function initTrainerMeta() {
  try {
    const userId = window.currentUserId;
    if (!userId || !window.supabaseClient) return;

    const { data: invRow, error: invError } = await window.supabaseClient
      .from(TRAINER_TABLE)
      .select("inventory")
      .eq("user_id", userId)
      .maybeSingle();

    if (invError) {
      console.error("Error trayendo meta de Supabase:", invError);
    }

    if (invRow?.inventory) {
      const parsed = invRow.inventory;
      currentMeta = {
        ...defaultMeta,
        ...parsed,
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
    } else {
      currentMeta = { ...defaultMeta, lastUpdated: new Date().toISOString() };

      const { error: upsertError } = await window.supabaseClient
        .from(TRAINER_TABLE)
        .upsert(
          {
            user_id: userId,
            inventory: currentMeta,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        console.error("Error creando meta inicial en Supabase:", upsertError);
      }
    }

    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) {
    console.error("Error inesperado en initTrainerMeta:", e);
    currentMeta = { ...defaultMeta };
  }
}

function loadMeta() {
  if (!currentMeta) {
    try {
      const raw = localStorage.getItem(TRAINER_META_KEY);
      const parsed = raw ? JSON.parse(raw) : null;

      currentMeta = {
        ...defaultMeta,
        ...(parsed || {}),
        items: { ...defaultMeta.items, ...((parsed && parsed.items) || {}) },
        balls: { ...defaultMeta.balls, ...((parsed && parsed.balls) || {}) },
      };
    } catch (e) {
      console.error("Error cargando meta (fallback):", e);
      currentMeta = { ...defaultMeta };
    }
  }

  return {
    ...currentMeta,
    items: { ...currentMeta.items },
    balls: { ...currentMeta.balls },
  };
}

// Guarda en Supabase + copia local
async function saveMeta(meta) {
  const userId = window.currentUserId;
  if (!userId || !window.supabaseClient) return;

  currentMeta = {
    ...meta,
    items: { ...meta.items },
    balls: { ...meta.balls },
  };

  localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));

  try {
    const { error } = await window.supabaseClient.from(TRAINER_TABLE).upsert(
      {
        user_id: userId,
        inventory: currentMeta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) console.error("Error guardando meta en Supabase:", error);
  } catch (e) {
    console.error("Error inesperado al guardar meta en Supabase:", e);
  }
}

// ========================
// Contador de Pokémon
// ========================
async function updateCapturedCountFromSupabase() {
  try {
    const userId = window.currentUserId;
    if (!userId || !window.supabaseClient) return;

    // 🔥 Traer ambas columnas reales: box_data y party_data
    const { data, error } = await window.supabaseClient
      .from("user_game_data")
      .select("box_data, party_data")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error trayendo box_data/party_data:", error);
      return;
    }

    let total = 0;

    // 1) PARTY desde party_data
    if (Array.isArray(data?.party_data)) {
      total += data.party_data.filter((p) => p != null).length;
    }

    // 2) BOXES desde box_data.boxes
    const boxes = data?.box_data?.boxes;
    if (Array.isArray(boxes)) {
      boxes.forEach((box) => {
        if (Array.isArray(box)) {
          total += box.filter((p) => p != null).length;
        }
      });
    }

    setText("captured-count", total);
  } catch (e) {
    console.error("Error inesperado al contar pokémon:", e);
  }
}

// ========================
// Render
// ========================
function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function renderView() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "Entrenador";

  setText("trainer-name-display", trainerName.toUpperCase());
  setText("trainer-label", `Entrenador: ${trainerName}`);

  setText("money-value", meta.money);
  setText("xp-value", meta.xp);
  setText("achievements-value", meta.achievements || "—");
  setText("pokedex-value", meta.pokedex || "—");

  // Inventario
  setText("item-egg", meta.items.egg);
  setText("item-rare-candy", meta.items.rareCandy);
  setText("item-trade-token", meta.items.tradeToken);
  setText("item-evo-stone", meta.items.evoStone);
  setText("item-friendship", meta.items.friendship);

  // Pokébolas
  setText("ball-poke", meta.balls.poke);
  setText("ball-super", meta.balls.super);
  setText("ball-ultra", meta.balls.ultra);

  setText("last-updated", formatDate(meta.lastUpdated));
}

// ========================
// Modal
// ========================
function openModal() {
  const meta = loadMeta();

  setValue("input-trainer-name", window.currentTrainerName || "");
  setValue("input-money", meta.money);
  setValue("input-xp", meta.xp);
  setValue("input-achievements", meta.achievements || "");
  setValue("input-pokedex", meta.pokedex || "");

  setValue("input-egg", meta.items.egg);
  setValue("input-rare-candy", meta.items.rareCandy);
  setValue("input-trade-token", meta.items.tradeToken);
  setValue("input-evo-stone", meta.items.evoStone);
  setValue("input-friendship", meta.items.friendship);

  setValue("input-ball-poke", meta.balls.poke);
  setValue("input-ball-super", meta.balls.super);
  setValue("input-ball-ultra", meta.balls.ultra);

  $("modal-edit")?.classList.remove("hidden");
}

function closeModal() {
  $("modal-edit")?.classList.add("hidden");
}

function parseNonNegativeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

async function handleSave() {
  const meta = loadMeta();

  const userId = window.currentUserId;

  const newTrainerName = ($("input-trainer-name")?.value || "").trim();
  if (newTrainerName && userId && window.supabaseClient) {
    const { error } = await window.supabaseClient.from(GAME_TABLE).upsert(
      { id: userId, trainer_name: newTrainerName },
      { onConflict: "id" }
    );
    if (error) {
      console.error("Error guardando trainer_name:", error);
    } else {
      window.currentTrainerName = newTrainerName;
    }
  }

  meta.money = parseNonNegativeInt($("input-money")?.value, meta.money);
  meta.xp = parseNonNegativeInt($("input-xp")?.value, meta.xp);
  meta.achievements = ($("input-achievements")?.value || "").trim();
  meta.pokedex = ($("input-pokedex")?.value || "").trim();

  meta.items.egg = parseNonNegativeInt($("input-egg")?.value, meta.items.egg);
  meta.items.rareCandy = parseNonNegativeInt(
    $("input-rare-candy")?.value,
    meta.items.rareCandy
  );
  meta.items.tradeToken = parseNonNegativeInt(
    $("input-trade-token")?.value,
    meta.items.tradeToken
  );
  meta.items.evoStone = parseNonNegativeInt(
    $("input-evo-stone")?.value,
    meta.items.evoStone
  );
  meta.items.friendship = parseNonNegativeInt(
    $("input-friendship")?.value,
    meta.items.friendship
  );

  meta.balls.poke = parseNonNegativeInt(
    $("input-ball-poke")?.value,
    meta.balls.poke
  );
  meta.balls.super = parseNonNegativeInt(
    $("input-ball-super")?.value,
    meta.balls.super
  );
  meta.balls.ultra = parseNonNegativeInt(
    $("input-ball-ultra")?.value,
    meta.balls.ultra
  );

  meta.lastUpdated = new Date().toISOString();

  await saveMeta(meta);
  renderView();
  closeModal();
}

// ========================
// Init
// ========================
document.addEventListener("DOMContentLoaded", async () => {
  // ✅ Construir inventario visual ANTES de renderView
  buildInventoryList();

  // Proteger
  const user = await initProtectedPage();
  if (!user) return;

  // Logout
  setupLogoutButton();

  // Nombre entrenador desde Supabase
  await renderTrainerLabelFromGame();

  // Cargar inventario (Supabase) + render
  await initTrainerMeta();
  renderView();

  // Contador capturados
  await updateCapturedCountFromSupabase();

  // Listeners modal
  $("btn-edit-profile")?.addEventListener("click", openModal);
  $("btn-cancel-edit")?.addEventListener("click", closeModal);
  $("btn-save-edit")?.addEventListener("click", handleSave);
});

