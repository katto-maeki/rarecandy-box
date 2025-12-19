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

// ⚠️ NO redeclaramos supabase
if (!window.supabaseClient) {
  console.error(
    "supabaseClient no está inicializado. Verifica que el CDN de Supabase y core.js carguen antes de trainer.js."
  );
}

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

// ================================
// Carga inicial desde Supabase
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
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
    } else {
      currentMeta = {
        ...defaultMeta,
        lastUpdated: new Date().toISOString(),
      };

      await window.supabaseClient.from(TRAINER_TABLE).upsert(
        {
          user_id: userId,
          inventory: currentMeta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) {
    console.error("initTrainerMeta error:", e);
    currentMeta = { ...defaultMeta };
  }
}

function loadMeta() {
  if (!currentMeta) {
    const raw = localStorage.getItem(TRAINER_META_KEY);
    currentMeta = raw ? JSON.parse(raw) : { ...defaultMeta };
  }
  return JSON.parse(JSON.stringify(currentMeta));
}

async function saveMeta(meta) {
  const userId = window.currentUserId;
  if (!userId) return;

  currentMeta = meta;
  localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));

  await window.supabaseClient.from(TRAINER_TABLE).upsert(
    {
      user_id: userId,
      inventory: currentMeta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

// ========================
// Contador de Pokémon
// ========================
async function updateCapturedCountFromSupabase() {
  const userId = window.currentUserId;
  if (!userId) return;

  const { data } = await window.supabaseClient
    .from(BOX_TABLE)
    .select(BOX_STATE_COLUMN)
    .eq("id", userId)
    .maybeSingle();

  let total = 0;
  const state = data?.[BOX_STATE_COLUMN];

  if (state?.party) total += state.party.filter(Boolean).length;
  if (state?.boxes) {
    state.boxes.forEach((box) => {
      if (Array.isArray(box)) total += box.filter(Boolean).length;
    });
  }

  const el = document.getElementById("captured-count");
  if (el) el.textContent = total;
}

// ========================
// Render
// ========================
function renderView() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "Entrenador";

  document.getElementById("trainer-name-display").textContent =
    trainerName.toUpperCase();
  document.getElementById("trainer-label").textContent =
    `Entrenador: ${trainerName}`;

  document.getElementById("money-value").textContent = meta.money;
  document.getElementById("xp-value").textContent = meta.xp;
  document.getElementById("achievements-value").textContent =
    meta.achievements || "—";
  document.getElementById("pokedex-value").textContent = meta.pokedex || "—";

  document.getElementById("item-egg").textContent = meta.items.egg;
  document.getElementById("item-rare-candy").textContent = meta.items.rareCandy;
  document.getElementById("item-trade-token").textContent =
    meta.items.tradeToken;
  document.getElementById("item-evo-stone").textContent = meta.items.evoStone;
  document.getElementById("item-friendship").textContent =
    meta.items.friendship;

  document.getElementById("ball-poke").textContent = meta.balls.poke;
  document.getElementById("ball-super").textContent = meta.balls.super;
  document.getElementById("ball-ultra").textContent = meta.balls.ultra;

  document.getElementById("last-updated").textContent = meta.lastUpdated
    ? new Date(meta.lastUpdated).toLocaleDateString()
    : "—";
}

// ========================
// Modal
// ========================
function openModal() {
  const meta = loadMeta();
  document.getElementById("input-trainer-name").value =
    window.currentTrainerName || "";
  document.getElementById("input-money").value = meta.money;
  document.getElementById("input-xp").value = meta.xp;
  document.getElementById("input-achievements").value = meta.achievements || "";
  document.getElementById("input-pokedex").value = meta.pokedex || "";
  document.getElementById("modal-edit").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-edit").classList.add("hidden");
}

async function handleSave() {
  const meta = loadMeta();
  meta.money = Number(document.getElementById("input-money").value) || 0;
  meta.xp = Number(document.getElementById("input-xp").value) || 0;
  meta.achievements =
    document.getElementById("input-achievements").value.trim();
  meta.pokedex = document.getElementById("input-pokedex").value.trim();
  meta.lastUpdated = new Date().toISOString();

  const newTrainerName =
    document.getElementById("input-trainer-name").value.trim();

  if (newTrainerName && window.currentUserId) {
    await window.supabaseClient.from(GAME_TABLE).upsert(
      { id: window.currentUserId, trainer_name: newTrainerName },
      { onConflict: "id" }
    );
    window.currentTrainerName = newTrainerName;
  }

  await saveMeta(meta);
  renderView();
  closeModal();
}

// ========================
// Init
// ========================
document.addEventListener("DOMContentLoaded", async () => {
  const user = await initProtectedPage();
  if (!user) return;

  setupLogoutButton();
  await renderTrainerLabelFromGame();

  await initTrainerMeta();
  renderView();
  await updateCapturedCountFromSupabase();

  document
    .getElementById("btn-edit-profile")
    ?.addEventListener("click", openModal);
  document
    .getElementById("btn-cancel-edit")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-save-edit")
    ?.addEventListener("click", handleSave);
});
