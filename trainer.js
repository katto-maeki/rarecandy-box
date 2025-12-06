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

// 👇 Cliente Supabase
const supabase = window.supabaseClient || window.supabase;
if (!supabase) {
  console.error(
    "Supabase no está inicializado. Asegúrate de cargar el CDN de Supabase y luego core.js antes de trainer.js."
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
    if (!userId) {
      console.error("initTrainerMeta: no hay currentUserId (¿core.js cargó?)"); //
      return;
    }

    // Leer sólo inventario; el nombre de entrenador ya viene de core.js
    const { data: invRow, error: invError } = await supabase
      .from(TRAINER_TABLE)
      .select("inventory")
      .eq("user_id", userId)
      .maybeSingle();

    if (invError) {
      console.error("Error trayendo meta de Supabase:", invError); //"Error trayendo meta de Supabase:"
    }

    if (invRow && invRow.inventory) {
      const parsed = invRow.inventory;
      currentMeta = {
        ...defaultMeta,
        ...parsed,
        items: { ...defaultMeta.items, ...(parsed.items || {}) },
        balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
      };
      console.log(
        "initTrainerMeta: inventario cargado desde Supabase",
        currentMeta
      );
    } else {
      // No hay registro en trainer_inventory → crear uno con defaultMeta
      currentMeta = {
        ...defaultMeta,
        lastUpdated: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase.from(TRAINER_TABLE).upsert(
        {
          user_id: userId,
          inventory: currentMeta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertError) {
        console.error("Error creando meta inicial en Supabase:", upsertError);
      } else {
        console.log("initTrainerMeta: meta inicial creado en Supabase");
      }
    }

    // Copia local sólo para compatibilidad (evoluciones en caja, etc.)
    localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));
  } catch (e) {
    console.error("Error inesperado en initTrainerMeta:", e);
    currentMeta = { ...defaultMeta };
  }
}

// Devuelve una copia del meta en memoria
function loadMeta() {
  if (!currentMeta) {
    try {
      const raw = localStorage.getItem(TRAINER_META_KEY);
      if (!raw) {
        currentMeta = { ...defaultMeta };
      } else {
        const parsed = JSON.parse(raw);
        currentMeta = {
          ...defaultMeta,
          ...parsed,
          items: { ...defaultMeta.items, ...(parsed.items || {}) },
          balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
        };
      }
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
  if (!userId) {
    console.warn("saveMeta: no hay currentUserId.");
    return;
  }

  currentMeta = {
    ...meta,
    items: { ...meta.items },
    balls: { ...meta.balls },
  };

  // Copia local (para cajapkm y evoluciones)
  localStorage.setItem(TRAINER_META_KEY, JSON.stringify(currentMeta));

  try {
    const { error } = await supabase.from(TRAINER_TABLE).upsert(
      {
        user_id: userId,
        inventory: currentMeta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Error guardando meta en Supabase:", error);
    } else {
      console.log("saveMeta: meta guardado en Supabase", currentMeta);
    }
  } catch (e) {
    console.error("Error inesperado al guardar meta en Supabase:", e);
  }
}

// ========================
// Caja desde Supabase (contador)
// ========================
async function updateCapturedCountFromSupabase() {
  try {
    const userId = window.currentUserId;
    if (!userId) {
      console.error(
        "updateCapturedCountFromSupabase: no hay currentUserId (¿core.js cargó?)"
      );
      return;
    }

    const { data, error } = await supabase
      .from(BOX_TABLE)
      .select(BOX_STATE_COLUMN)
      .eq("id", userId) // en user_game_data la PK es "id"
      .limit(1);

    if (error) {
      console.error("Error trayendo caja desde Supabase:", error);
      return;
    }

    const row = data && data.length > 0 ? data[0] : null;
    if (!row || !row[BOX_STATE_COLUMN]) {
      console.warn("No se encontró box_data en Supabase para este usuario.");
      return;
    }

    const state = row[BOX_STATE_COLUMN];
    console.log("box_data recibido desde Supabase:", state);

    let total = 0;

    // -----------------------
    // 1) PARTY (equipo actual)
    // -----------------------
    let partyFromState = null;

    if (Array.isArray(state.party)) {
      partyFromState = state.party;
    } else if (Array.isArray(state.partySlots)) {
      // por si usaste otro nombre en el guardado
      partyFromState = state.partySlots;
    }

    if (partyFromState) {
      total += partyFromState.filter((p) => p != null).length;
    } else {
      // Fallback: si Supabase no trae party, usamos sólo la party del localStorage
      try {
        const raw = localStorage.getItem("pokeBoxState_v1");
        if (raw) {
          const localState = JSON.parse(raw);
          if (Array.isArray(localState.party)) {
            total += localState.party.filter((p) => p != null).length;
            console.warn(
              "Party tomada desde localStorage porque no se encontró en Supabase"
            );
          }
        }
      } catch (e) {
        console.error("Error leyendo party desde localStorage:", e);
      }
    }

    // -----------------------
    // 2) BOXES (cajas)
    // -----------------------
    let boxesFromState = null;

    if (Array.isArray(state.boxes)) {
      boxesFromState = state.boxes;
    } else if (Array.isArray(state.boxGrid)) {
      boxesFromState = state.boxGrid;
    }

    if (boxesFromState) {
      boxesFromState.forEach((box) => {
        if (Array.isArray(box)) {
          total += box.filter((p) => p != null).length;
        }
      });
    }

    // -----------------------
    // 3) Pintar el resultado
    // -----------------------
    const capturedEl = document.getElementById("captured-count");
    if (capturedEl) {
      capturedEl.textContent = total;
    }

    console.log("updateCapturedCountFromSupabase: total capturados =", total);
  } catch (e) {
    console.error("Error inesperado al contar pokémon desde Supabase:", e);
  }
}

// Fallback viejo (por si aún se usa localStorage en algún lado)
function countCapturedPokemonFallback() {
  try {
    const raw = localStorage.getItem("pokeBoxState_v1");
    if (!raw) return 0;
    const state = JSON.parse(raw);

    let total = 0;

    if (Array.isArray(state.party)) {
      total += state.party.filter((p) => p != null).length;
    }
    if (Array.isArray(state.boxes)) {
      state.boxes.forEach((box) => {
        if (Array.isArray(box)) {
          total += box.filter((p) => p != null).length;
        }
      });
    }

    return total;
  } catch (e) {
    console.error("Error contando pokémon (fallback local):", e);
    return 0;
  }
}

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

function renderView() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "Entrenador";

  const headerName = document.getElementById("trainer-name-display");
  if (headerName) {
    headerName.textContent = trainerName.toUpperCase();
  }

  const label = document.getElementById("trainer-label");
  if (label) label.textContent = `Entrenador: ${trainerName}`;

  // Aquí dejamos el contador como fallback local por si tarda Supabase;
  // luego updateCapturedCountFromSupabase lo sobreescribe.
  const capturedEl = document.getElementById("captured-count");
  if (capturedEl) capturedEl.textContent = "…"; // placeholder mientras carga Supabase

  const moneyEl = document.getElementById("money-value");
  if (moneyEl) moneyEl.textContent = meta.money;

  const xpEl = document.getElementById("xp-value");
  if (xpEl) xpEl.textContent = meta.xp;

  const achievementsEl = document.getElementById("achievements-value");
  if (achievementsEl) {
    achievementsEl.textContent = meta.achievements || "—";
  }

  const pokedexEl = document.getElementById("pokedex-value");
  if (pokedexEl) {
    pokedexEl.textContent = meta.pokedex || "—";
  }

  const eggEl = document.getElementById("item-egg");
  if (eggEl) eggEl.textContent = meta.items.egg;

  const rcEl = document.getElementById("item-rare-candy");
  if (rcEl) rcEl.textContent = meta.items.rareCandy;

  const tokenEl = document.getElementById("item-trade-token");
  if (tokenEl) tokenEl.textContent = meta.items.tradeToken;

  const evoStoneEl = document.getElementById("item-evo-stone");
  if (evoStoneEl) evoStoneEl.textContent = meta.items.evoStone;

  const friendEl = document.getElementById("item-friendship");
  if (friendEl) friendEl.textContent = meta.items.friendship;

  const ballPokeEl = document.getElementById("ball-poke");
  if (ballPokeEl) ballPokeEl.textContent = meta.balls.poke;

  const ballSuperEl = document.getElementById("ball-super");
  if (ballSuperEl) ballSuperEl.textContent = meta.balls.super;

  const ballUltraEl = document.getElementById("ball-ultra");
  if (ballUltraEl) ballUltraEl.textContent = meta.balls.ultra;

  const lastUpdEl = document.getElementById("last-updated");
  if (lastUpdEl) lastUpdEl.textContent = formatDate(meta.lastUpdated);
}

// ========================
// Modal de edición
// ========================
function openModal() {
  const meta = loadMeta();
  const trainerName = window.currentTrainerName || "";

  const inputTrainerName = document.getElementById("input-trainer-name");
  const inputMoney = document.getElementById("input-money");
  const inputXp = document.getElementById("input-xp");
  const inputAchievements = document.getElementById("input-achievements");
  const inputPokedex = document.getElementById("input-pokedex");

  if (inputTrainerName) inputTrainerName.value = trainerName;
  if (inputMoney) inputMoney.value = meta.money;
  if (inputXp) inputXp.value = meta.xp;
  if (inputAchievements) inputAchievements.value = meta.achievements || "";
  if (inputPokedex) inputPokedex.value = meta.pokedex || "";

  const inputEgg = document.getElementById("input-egg");
  const inputRareCandy = document.getElementById("input-rare-candy");
  const inputTradeToken = document.getElementById("input-trade-token");
  const inputEvoStone = document.getElementById("input-evo-stone");
  const inputFriendship = document.getElementById("input-friendship");

  if (inputEgg) inputEgg.value = meta.items.egg;
  if (inputRareCandy) inputRareCandy.value = meta.items.rareCandy;
  if (inputTradeToken) inputTradeToken.value = meta.items.tradeToken;
  if (inputEvoStone) inputEvoStone.value = meta.items.evoStone;
  if (inputFriendship) inputFriendship.value = meta.items.friendship;

  const inputBallPoke = document.getElementById("input-ball-poke");
  const inputBallSuper = document.getElementById("input-ball-super");
  const inputBallUltra = document.getElementById("input-ball-ultra");

  if (inputBallPoke) inputBallPoke.value = meta.balls.poke;
  if (inputBallSuper) inputBallSuper.value = meta.balls.super;
  if (inputBallUltra) inputBallUltra.value = meta.balls.ultra;

  document.getElementById("modal-edit").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-edit").classList.add("hidden");
}

function parseNonNegativeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

async function handleSave() {
  const meta = loadMeta();

  const trainerInput = document.getElementById("input-trainer-name");
  const newTrainerName = trainerInput ? trainerInput.value.trim() : "";
  const userId = window.currentUserId;

  // Guardar nombre de entrenador en Supabase (user_game_data.trainer_name)
  if (newTrainerName && userId) {
    try {
      const { error } = await supabase.from(GAME_TABLE).upsert(
        {
          id: userId,
          trainer_name: newTrainerName,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error("Error guardando trainer_name en user_game_data:", error);
      } else {
        console.log("trainer_name actualizado en Supabase:", newTrainerName);
        window.currentTrainerName = newTrainerName; // actualizar cache global
      }
    } catch (e) {
      console.error("Error inesperado guardando trainer_name:", e);
    }
  }

  const moneyInput = document.getElementById("input-money");
  const xpInput = document.getElementById("input-xp");
  const achievementsInput = document.getElementById("input-achievements");
  const pokedexInput = document.getElementById("input-pokedex");

  if (moneyInput) {
    meta.money = parseNonNegativeInt(moneyInput.value, meta.money);
  }
  if (xpInput) {
    meta.xp = parseNonNegativeInt(xpInput.value, meta.xp);
  }

  meta.achievements = achievementsInput
    ? achievementsInput.value.trim()
    : meta.achievements;
  meta.pokedex = pokedexInput ? pokedexInput.value.trim() : meta.pokedex;

  const eggInput = document.getElementById("input-egg");
  const rareCandyInput = document.getElementById("input-rare-candy");
  const tradeTokenInput = document.getElementById("input-trade-token");
  const evoStoneInput = document.getElementById("input-evo-stone");
  const friendshipInput = document.getElementById("input-friendship");

  if (eggInput) {
    meta.items.egg = parseNonNegativeInt(eggInput.value, meta.items.egg);
  }
  if (rareCandyInput) {
    meta.items.rareCandy = parseNonNegativeInt(
      rareCandyInput.value,
      meta.items.rareCandy
    );
  }
  if (tradeTokenInput) {
    meta.items.tradeToken = parseNonNegativeInt(
      tradeTokenInput.value,
      meta.items.tradeToken
    );
  }
  if (evoStoneInput) {
    meta.items.evoStone = parseNonNegativeInt(
      evoStoneInput.value,
      meta.items.evoStone
    );
  }
  if (friendshipInput) {
    meta.items.friendship = parseNonNegativeInt(
      friendshipInput.value,
      meta.items.friendship
    );
  }

  const ballPokeInput = document.getElementById("input-ball-poke");
  const ballSuperInput = document.getElementById("input-ball-super");
  const ballUltraInput = document.getElementById("input-ball-ultra");

  if (ballPokeInput) {
    meta.balls.poke = parseNonNegativeInt(ballPokeInput.value, meta.balls.poke);
  }
  if (ballSuperInput) {
    meta.balls.super = parseNonNegativeInt(
      ballSuperInput.value,
      meta.balls.super
    );
  }
  if (ballUltraInput) {
    meta.balls.ultra = parseNonNegativeInt(
      ballUltraInput.value,
      meta.balls.ultra
    );
  }

  meta.lastUpdated = new Date().toISOString();

  await saveMeta(meta);
  renderView();
  closeModal();
}

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
  const list = document.getElementById("inventory-list");
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

// ========================
// Inicio página (con core.js)
// ========================
document.addEventListener("DOMContentLoaded", async () => {
  // Construimos la lista visual del inventario
  buildInventoryList();

  // 1) Proteger la página y obtener el usuario
  const user = await initProtectedPage(); // viene de core.js
  if (!user) return; // si no hay user, ya te redirigió al login

  // 2) Configurar botón de logout (helper de core.js)
  setupLogoutButton();

  // 3) Leer el trainer_name desde user_game_data y
  //    guardar en window.currentTrainerName + pintar en header
  await renderTrainerLabelFromGame();

  // 4) Cargar inventario de Supabase y pintar todo
  await initTrainerMeta();
  renderView();

  // 5) Traer contador de pokémon desde la caja en Supabase
  await updateCapturedCountFromSupabase();

  // 6) Listeners del modal
  const btnEdit = document.getElementById("btn-edit-profile");
  if (btnEdit) {
    btnEdit.addEventListener("click", openModal);
  }

  const btnCancel = document.getElementById("btn-cancel-edit");
  if (btnCancel) {
    btnCancel.addEventListener("click", closeModal);
  }

  const btnSave = document.getElementById("btn-save-edit");
  if (btnSave) {
    btnSave.addEventListener("click", handleSave);
  }
});
