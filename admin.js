// admin.js
// =======================================
// Tablas en Supabase (ajusta si cambia)
// =======================================
const PLAYERS_TABLE = "user_game_data";
const INVENTORY_TABLE = "trainer_inventory";

// 👇 Cliente Supabase (creado en core.js)
const supabase = window.supabaseClient;
if (!supabase) {
  console.error(
    "supabaseClient no está inicializado. Asegúrate de cargar primero el CDN de Supabase y luego core.js antes de admin.js."
  );
}

// Campos esperados en user_game_data:
// id (uuid PK), trainer_name, email, status, created_at, last_login,
// box_data (json), party_data (json)

// Campos esperados en trainer_inventory:
// user_id (uuid), inventory (json con mismo esquema que TRAINER_META)

// Meta por defecto (por si no hay inventario)
const defaultInventory = {
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
};

let playersCache = [];
let selectedPlayerId = null;

// =====================
// Utils
// =====================
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function countCapturedFromState(boxState) {
  if (!boxState) return 0;

  let total = 0;

  if (Array.isArray(boxState.party)) {
    total += boxState.party.filter((p) => p != null).length;
  }

  if (Array.isArray(boxState.boxes)) {
    boxState.boxes.forEach((box) => {
      if (Array.isArray(box)) {
        total += box.filter((p) => p != null).length;
      }
    });
  }

  return total;
}

function getPartyFromPlayer(player) {
  // party_data directo o dentro de box_data.party
  if (Array.isArray(player.party_data)) return player.party_data;
  if (player.box_data && Array.isArray(player.box_data.party)) {
    return player.box_data.party;
  }
  return [];
}

function getBoxStateFromPlayer(player) {
  // si box_data ya es el objeto con { boxes, party, currentBoxIndex }
  if (player.box_data && Array.isArray(player.box_data.boxes)) {
    return player.box_data;
  }
  return null;
}

// =====================
// Render: Lista de jugadores
// =====================
function renderPlayerList(filterText = "") {
  const list = document.getElementById("player-list");
  if (!list) return;

  list.innerHTML = "";

  const term = filterText.trim().toLowerCase();

  const filtered = playersCache.filter((p) => {
    if (!term) return true;
    const name = (p.trainer_name || "(sin nombre)").toLowerCase();
    const email = (p.email || "").toLowerCase();
    return name.includes(term) || email.includes(term);
  });

  if (filtered.length === 0) {
    const emptyRow = document.createElement("div");
    emptyRow.className = "admin-player-row";
    emptyRow.textContent = term
      ? "No se encontraron jugadores con ese filtro."
      : "No hay jugadores registrados todavía.";
    list.appendChild(emptyRow);
    return;
  }

  filtered.forEach((player) => {
    const row = document.createElement("div");
    row.className = "admin-player-row";
    row.dataset.playerId = player.id;

    if (player.id === selectedPlayerId) {
      row.classList.add("is-selected");
    }

    const main = document.createElement("div");
    main.className = "admin-player-main";

    const nameEl = document.createElement("span");
    nameEl.className = "admin-player-name";
    nameEl.textContent = player.trainer_name || "(sin nombre)";

    const emailEl = document.createElement("span");
    emailEl.className = "admin-player-email";
    emailEl.textContent = player.email || "—";

    main.appendChild(nameEl);
    main.appendChild(emailEl);

    const statusEl = document.createElement("span");
    statusEl.className = "admin-player-status";
    const status = (player.status || "active").toLowerCase();

    if (status === "blocked" || status === "banned") {
      statusEl.classList.add("admin-status-blocked");
      statusEl.textContent = "Bloqueado";
    } else {
      statusEl.classList.add("admin-status-active");
      statusEl.textContent = "Activo";
    }

    row.appendChild(main);
    row.appendChild(statusEl);

    row.addEventListener("click", () => {
      selectedPlayerId = player.id;
      // resaltar selección
      document
        .querySelectorAll(".admin-player-row")
        .forEach((r) => r.classList.remove("is-selected"));
      row.classList.add("is-selected");

      loadPlayerDetail(player);
    });

    list.appendChild(row);
  });
}

// =====================
// Render: Detalle del jugador
// =====================
async function loadPlayerDetail(player) {
  const emptyEl = document.getElementById("player-detail-empty");
  const detailEl = document.getElementById("player-detail");
  if (!emptyEl || !detailEl) return;

  emptyEl.classList.add("hidden");
  detailEl.classList.remove("hidden");

  // ===== Datos básicos SOLO con lo que quieres mostrar =====
  const nameEl = document.getElementById("detail-name");
  if (nameEl) {
    nameEl.textContent = player.trainer_name || "(sin nombre)";
  }

  const createdEl = document.getElementById("detail-created");
  if (createdEl) {
    createdEl.textContent = fmtDate(player.created_at);
  }

  const lastLoginEl = document.getElementById("detail-last-login");
  if (lastLoginEl) {
    lastLoginEl.textContent = fmtDate(player.last_login);
  }

  // ===== Trainer card (equipo actual) =====
  const partyList = document.getElementById("detail-party");
  if (partyList) {
    partyList.innerHTML = "";

    const party = getPartyFromPlayer(player);
    if (!party || party.length === 0 || party.every((p) => !p)) {
      const li = document.createElement("li");
      li.textContent = "Sin equipo registrado.";
      partyList.appendChild(li);
    } else {
      party.forEach((poke, idx) => {
        if (!poke) return;
        const li = document.createElement("li");
        const name = poke.apodo || poke.nombre || "Pokémon sin nombre";
        const lvl = poke.nivel || 1;
        li.textContent = `${idx + 1}. ${name} (Lv. ${lvl})`;
        partyList.appendChild(li);
      });
    }
  }

  // ===== Caja Pokémon =====
  const boxStateRaw = getBoxStateFromPlayer(player);
  const party = getPartyFromPlayer(player);

  const combinedState = {
    party: Array.isArray(party) ? party : [],
    boxes:
      boxStateRaw && Array.isArray(boxStateRaw.boxes) ? boxStateRaw.boxes : [],
  };

  const totalCaptured = countCapturedFromState(combinedState);
  const countEl = document.getElementById("detail-box-count");
  if (countEl) countEl.textContent = totalCaptured;

  const previewEl = document.getElementById("detail-box-preview");

  if (previewEl) {
    if (totalCaptured === 0) {
      previewEl.textContent = "No hay pokémon registrados en la caja.";
    } else {
      const names = [];

      combinedState.party.forEach((p) => {
        if (p && names.length < 10) {
          names.push(p.apodo || p.nombre);
        }
      });

      combinedState.boxes.forEach((box) => {
        if (!Array.isArray(box)) return;
        box.forEach((p) => {
          if (p && names.length < 10) {
            names.push(p.apodo || p.nombre);
          }
        });
      });

      if (names.length === 0) {
        previewEl.textContent = "No hay nombres disponibles para mostrar.";
      } else {
        const uniqueNames = [...new Set(names)];
        const list = uniqueNames.join(", ");
        previewEl.textContent =
          uniqueNames.length >= totalCaptured
            ? list
            : `${list} y ${totalCaptured - uniqueNames.length} más…`;
      }
    }
  }

  // ===== Inventario (trainer_inventory) =====
  const inventoryList = document.getElementById("detail-inventory");
  if (!inventoryList) return;

  inventoryList.innerHTML = "";

  let inv = {
    ...defaultInventory,
    items: { ...defaultInventory.items },
    balls: { ...defaultInventory.balls },
  };

  try {
    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select("inventory")
      .eq("user_id", player.id)
      .maybeSingle();

    if (!error && data && data.inventory) {
      const raw = data.inventory;
      inv = {
        ...inv,
        ...raw,
        items: { ...inv.items, ...(raw.items || {}) },
        balls: { ...inv.balls, ...(raw.balls || {}) },
      };
    }
  } catch (e) {
    console.error("Error leyendo inventario del jugador:", e);
  }

  const fields = [
    { label: "Dinero", value: `₽${inv.money || 0}` },
    { label: "Experiencia", value: `${inv.xp || 0} XP` },
    { label: "Logros", value: inv.achievements || "—" },
    { label: "Pokédex comunitaria", value: inv.pokedex || "—" },
    { label: "Huevos", value: inv.items.egg || 0 },
    { label: "Rare Candy", value: inv.items.rareCandy || 0 },
    { label: "Tokens intercambio", value: inv.items.tradeToken || 0 },
    { label: "Piedras evolutivas", value: inv.items.evoStone || 0 },
    { label: "Pulseras amistad", value: inv.items.friendship || 0 },
    { label: "Poké Ball", value: inv.balls.poke || 0 },
    { label: "Super Ball", value: inv.balls.super || 0 },
    { label: "Ultra Ball", value: inv.balls.ultra || 0 },
  ];

  fields.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = `${f.label}: ${f.value}`;
    inventoryList.appendChild(li);
  });
}

// =====================
// Carga inicial de jugadores
// =====================
async function loadPlayers() {
  const listEl = document.getElementById("player-list");
  if (listEl) {
    listEl.innerHTML =
      '<div class="admin-player-row">Cargando jugadores…</div>';
  }

  try {
    const { data, error } = await supabase
      .from(PLAYERS_TABLE)
      .select(
        `
        id,
        trainer_name,
        created_at,
        last_login,
        box_data,
        party_data
      `
      )
      .order("trainer_name", { ascending: true });

    if (error) {
      console.error("Error cargando jugadores:", error);
      if (listEl) {
        listEl.innerHTML =
          '<div class="admin-player-row">Error al cargar jugadores.</div>';
      }
      return;
    }

    playersCache = data || [];
    renderPlayerList();
  } catch (e) {
    console.error("Error inesperado cargando jugadores:", e);
    if (listEl) {
      listEl.innerHTML =
        '<div class="admin-player-row">Error al cargar jugadores.</div>';
    }
  }
}

// =====================
// Inicialización
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  // Proteger página y obtener admin actual
  const user = await initProtectedPage({ redirectToLogin: "index.html" });
  if (!user) return;

  // Email en el header
  const adminEmailEl = document.getElementById("admin-email");
  if (adminEmailEl) {
    adminEmailEl.textContent = `Admin: ${user.email || "—"}`;
  }

  // Botón logout
  setupLogoutButton("btn-logout");

  // Buscar jugadores
  const searchInput = document.getElementById("player-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderPlayerList(searchInput.value);
    });
  }

  // Cargar lista
  await loadPlayers();
});
