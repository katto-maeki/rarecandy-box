// admin.js - Gestión de Admin con PokeAPI Autocomplete

const GAME_TABLE = "user_game_data";
const TRAINER_TABLE = "trainer_inventory";
const POKE_TABLE = "sorelle_pokedex";
const DISC_TABLE = "sorelle_discoveries";

const LABELS = {
    egg: "Huevo", rareCandy: "Rare Candy", tradeToken: "Token", evoStone: "Piedra Evo",
    friendship: "Pulsera", poke: "Poké Ball", super: "Super Ball", ultra: "Ultra Ball"
};

const REGION_MAP = {
    "generation-i": "Kanto", "generation-ii": "Johto", "generation-iii": "Hoenn",
    "generation-iv": "Sinnoh", "generation-v": "Unova", "generation-vi": "Kalos",
    "generation-vii": "Alola", "generation-viii": "Galar", "generation-ix": "Paldea"
};

let allPlayers = []; 
let selectedPlayerFullData = null;
let globalPokemonList = []; 

// ==========================================
// Inicialización
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const user = await initProtectedPage(); 
    if (!user) return;
    document.getElementById("admin-label").textContent = "ADMIN CONECTADO";

    await fetchPlayerList();
    loadAllPokemonNames();

    document.getElementById("admin-search").addEventListener("input", handleSearch);
    if(window.setupLogoutButton) setupLogoutButton("btn-logout");

    document.getElementById("btn-admin-edit").addEventListener("click", openAdminEditModal);
    document.getElementById("btn-adm-cancel").addEventListener("click", () => closeModal("modal-admin-edit"));
    document.getElementById("btn-adm-save").addEventListener("click", saveTargetData);

    document.getElementById("btn-new-pokedex").addEventListener("click", openPokeModal);
    document.getElementById("btn-poke-cancel").addEventListener("click", () => closeModal("modal-new-poke"));
    document.getElementById("btn-poke-save").addEventListener("click", saveNewDiscovery);
    document.getElementById("btn-api-search").addEventListener("click", handleApiSearch);
    
    const apiInput = document.getElementById("api-search-input");
    apiInput.addEventListener("input", function() {
        const val = this.value.toLowerCase();
        closeSuggestions();
        if (!val) return;
        const matches = globalPokemonList.filter(p => p.name.startsWith(val)).slice(0, 8);
        if (matches.length > 0) {
            const list = document.getElementById("api-suggestions");
            list.classList.add("active");
            matches.forEach(match => {
                const li = document.createElement("li");
                li.className = "suggestion-item";
                li.textContent = match.name;
                li.onclick = () => {
                    apiInput.value = match.name;
                    closeSuggestions();
                    handleApiSearch();
                };
                list.appendChild(li);
            });
        }
    });

    document.addEventListener("click", function (e) {
        if (e.target !== apiInput) closeSuggestions();
    });
});

// --- FUNCIONES SOPORTE ---
async function loadAllPokemonNames() {
    try {
        const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1500');
        const data = await res.json();
        globalPokemonList = data.results;
    } catch (e) { console.error(e); }
}

function closeSuggestions() {
    const list = document.getElementById("api-suggestions");
    list.innerHTML = "";
    list.classList.remove("active");
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// --- LÓGICA JUGADORES ---
async function fetchPlayerList() {
    const listContainer = document.getElementById("player-list");
    listContainer.innerHTML = '<div style="padding:10px;">Cargando...</div>';
    const { data, error } = await window.supabaseClient.from(GAME_TABLE).select("id, trainer_name, email");
    if (error) return console.error(error);
    allPlayers = data.sort((a, b) => (a.trainer_name || "Z").localeCompare(b.trainer_name || "Z"));
    renderPlayerList(allPlayers);
}

function renderPlayerList(players) {
    const listContainer = document.getElementById("player-list");
    listContainer.innerHTML = "";
    players.forEach(p => {
        const div = document.createElement("div");
        div.className = "player-row";
        div.innerHTML = `<div class="player-row-name">${p.trainer_name || "Sin Nombre"}</div>
                         <div class="player-row-id" style="text-transform: lowercase;">${p.email || "Sin correo"}</div>`;
        div.onclick = () => selectPlayer(p.id, div);
        listContainer.appendChild(div);
    });
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    renderPlayerList(allPlayers.filter(p => (p.trainer_name||"").toLowerCase().includes(term)));
}

async function selectPlayer(targetId, cardElement) {
    document.querySelectorAll(".player-row").forEach(c => c.classList.remove("active"));
    if(cardElement) cardElement.classList.add("active");
    
    document.getElementById("player-detail-empty").classList.add("hidden");
    document.getElementById("player-detail-content").classList.remove("hidden");

    const resGame = await window.supabaseClient.from(GAME_TABLE).select("*").eq("id", targetId).single();
    const resInv = await window.supabaseClient.from(TRAINER_TABLE).select("inventory").eq("user_id", targetId).maybeSingle();

    selectedPlayerFullData = { id: targetId, gameData: resGame.data || {}, inventoryData: resInv.data?.inventory || {} };
    renderDetailPanel(selectedPlayerFullData);
}

function renderDetailPanel(data) {
    const game = data.gameData;
    const inv = data.inventoryData;
    const eco = inv.economy || { biIncome:0, savings:0, spent:0 };
    
    document.getElementById("det-name").textContent = (game.trainer_name || "").toUpperCase();
    document.getElementById("det-id").textContent = `${game.email || 'Sin correo'}`;
    
    const available = (eco.savings + eco.biIncome) - eco.spent;
    document.getElementById("det-money").textContent = `₽${available.toLocaleString()}`;
    document.getElementById("det-savings").textContent = `₽${eco.savings||0}`;
    document.getElementById("det-income").textContent = `₽${eco.biIncome||0}`;
    document.getElementById("det-xp").textContent = `${inv.xp||0} XP`;
    document.getElementById("det-achievements").textContent = inv.achievements||"-";
    document.getElementById("det-pokedex").textContent = inv.pokedex||"0";

    const iList = document.getElementById("det-inventory-list"); iList.innerHTML = "";
    const items = inv.items||{}; const balls = inv.balls||{};
    Object.keys(LABELS).forEach(k => {
        let v = ["poke","super","ultra"].includes(k) ? (balls[k]||0) : (items[k]||0);
        if(v>0) iList.innerHTML += `<div style="display:flex; justify-content:space-between"><span>${LABELS[k]}</span><strong>${v}</strong></div>`;
    });

    // --- Pokémon: Equipo y Caja ---
const partyListEl = document.getElementById("det-party-list");
const boxListEl = document.getElementById("det-box-list");
const partyCountEl = document.getElementById("det-party-count");
const boxCountEl = document.getElementById("det-box-count");

if (partyListEl) partyListEl.innerHTML = "";
if (boxListEl) boxListEl.innerHTML = "";

const getPokeName = (p) => {
  if (!p) return null;
  if (typeof p === "string") return p;

  // Tu estructura real
  if (p.apodo) return p.apodo;

  // Fallbacks por si cambia el formato
  return (
    p.nickname ||
    p.name ||
    p.species ||
    p.pokemon?.name ||
    p.species?.name ||
    null
  );
};


// Equipo
const partyRaw = Array.isArray(game.party_data) ? game.party_data : [];
const party = partyRaw.filter(Boolean);
if (partyCountEl) partyCountEl.textContent = String(party.length);

if (partyListEl) {
  party.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = getPokeName(p) || "Pokémon";
    partyListEl.appendChild(li);
  });
}

// Caja
let boxAll = [];
if (game.box_data && Array.isArray(game.box_data.boxes)) {
  game.box_data.boxes.forEach((box) => {
    if (Array.isArray(box)) boxAll.push(...box.filter(Boolean));
  });
}
if (boxCountEl) boxCountEl.textContent = String(boxAll.length);

if (boxListEl) {
  boxAll.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = getPokeName(p) || "Pokémon";
    boxListEl.appendChild(li);
  });
}

}

// --- MODAL EDICIÓN ---
function openAdminEditModal() {
    if(!selectedPlayerFullData) return;
    const inv = selectedPlayerFullData.inventoryData;
    const eco = inv.economy || { biIncome:0, savings:0, spent:0 };

    document.getElementById("adm-input-name").value = selectedPlayerFullData.gameData.trainer_name || "";
    document.getElementById("adm-input-income").value = eco.biIncome;
    document.getElementById("adm-input-savings").value = eco.savings;
    document.getElementById("adm-input-spent").value = eco.spent;
    document.getElementById("adm-input-xp").value = inv.xp || 0;
    document.getElementById("adm-input-achievements").value = inv.achievements || "";
    
    // Actualizar visualización de Pokédex Real
    document.getElementById("adm-pokedex-display").textContent = `${inv.pokedex || 0} registrados`;

    const container = document.getElementById("adm-item-manager-container");
    container.innerHTML = "";
    Object.keys(LABELS).forEach(k => {
        let v = ["poke","super","ultra"].includes(k) ? (inv.balls?.[k]||0) : (inv.items?.[k]||0);
        container.innerHTML += `<div class="item-manager-row"><span>${LABELS[k]}</span><input type="number" class="input" style="width:70px" value="${v}" id="adm-qty-${k}"></div>`;
    });
    openModal("modal-admin-edit");
}

async function saveTargetData() {
  if (!selectedPlayerFullData) return;
  const targetId = selectedPlayerFullData.id;
  const inv = JSON.parse(JSON.stringify(selectedPlayerFullData.inventoryData));
  const newName = document.getElementById("adm-input-name").value.trim();

  // 1. Economía
  if (!inv.economy) inv.economy = { biIncome: 0, savings: 0, spent: 0 };
  inv.economy.biIncome = parseInt(document.getElementById("adm-input-income").value) || 0;
  inv.economy.savings = parseInt(document.getElementById("adm-input-savings").value) || 0;
  inv.economy.spent = parseInt(document.getElementById("adm-input-spent").value) || 0;

  // 2. Progreso
  inv.xp = parseInt(document.getElementById("adm-input-xp").value) || 0;
  inv.achievements = document.getElementById("adm-input-achievements").value.trim();

  // 3. Sincronizar Pokédex automáticamente al guardar
  const realCount = await syncPokedexCount(targetId);
  inv.pokedex = String(realCount || 0);

  // 4. Inventario
  if (!inv.items) inv.items = {};
  if (!inv.balls) inv.balls = {};
  Object.keys(LABELS).forEach(k => {
    const val = parseInt(document.getElementById(`adm-qty-${k}`).value) || 0;
    if (["poke", "super", "ultra"].includes(k)) inv.balls[k] = val;
    else inv.items[k] = val;
  });

  try {
    // Update nombre (y valida error real)
    const { error: nameErr } = await window.supabaseClient
      .from(GAME_TABLE)
      .update({ trainer_name: newName })
      .eq("id", targetId);

    if (nameErr) throw nameErr;

    // Upsert inventario con onConflict para evitar 409
    const { error: invErr } = await window.supabaseClient
      .from(TRAINER_TABLE)
      .upsert(
        { user_id: targetId, inventory: inv, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (invErr) throw invErr;

    alert("¡Guardado y Sincronizado!");
    closeModal("modal-admin-edit");
    await fetchPlayerList();
    await selectPlayer(targetId, document.querySelector(".player-row.active"));
  } catch (e) {
    console.error("Error al guardar:", e);
    alert(`Error al guardar: ${e?.message || e}`);
  }
}


async function syncPokedexCount(targetId) {
    try {
        const { data: user } = await window.supabaseClient.from(GAME_TABLE).select("trainer_name").eq("id", targetId).single();
        if (!user) return 0;
        const { count } = await window.supabaseClient.from(DISC_TABLE).select("*", { count: "exact", head: true }).eq("trainer_name", user.trainer_name);
        return count || 0;
    } catch (e) { return 0; }
}

// --- LÓGICA POKÉDEX ---
async function handleApiSearch() {
    const query = document.getElementById("api-search-input").value.trim().toLowerCase();
    if(!query) return;
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${query}`);
        const data = await res.json();
        const resSpec = await fetch(data.species.url);
        const dataSpec = await resSpec.json();

        document.getElementById("poke-input-name").value = data.name.charAt(0).toUpperCase() + data.name.slice(1);
        const img = data.sprites.other["official-artwork"].front_default || data.sprites.front_default;
        document.getElementById("poke-input-img").value = img;
        document.getElementById("api-preview-img").src = img;
        document.getElementById("api-preview-img").classList.add("visible");
        document.getElementById("poke-input-type").value = data.types.map(t => t.type.name).join(" / ");
        document.getElementById("poke-input-season").value = REGION_MAP[dataSpec.generation.name] || "Desconocida";
    } catch (e) { alert("No encontrado"); }
}

function openPokeModal() {
    // Limpiar modal y cargar lista de checkbox
    const listDiv = document.getElementById("poke-user-list");
    listDiv.innerHTML = "";
    allPlayers.forEach(p => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${p.id}" data-name="${p.trainer_name}" class="poke-user-check"> ${p.trainer_name}`;
        listDiv.appendChild(label);
    });
    openModal("modal-new-poke");
}

async function saveNewDiscovery() {
    const name = document.getElementById("poke-input-name").value.trim();
    if(!name) return;
    const checks = document.querySelectorAll(".poke-user-check:checked");
    const selectedUsers = Array.from(checks).map(c => ({ id: c.value, name: c.dataset.name }));

    try {
        const { data: pData } = await window.supabaseClient.from(POKE_TABLE).insert({ 
            name, 
            image_url: document.getElementById("poke-input-img").value,
            type: document.getElementById("poke-input-type").value,
            description: document.getElementById("poke-input-desc").value,
            season: document.getElementById("poke-input-season").value
        }).select();
        
        if (selectedUsers.length > 0) {
            const discRows = selectedUsers.map(u => ({ pokedex_id: pData[0].id, user_id: u.id, trainer_name: u.name }));
            await window.supabaseClient.from(DISC_TABLE).insert(discRows);
            // Sincronizar a los usuarios afectados
            for (const user of selectedUsers) { await syncPokedexCount(user.id); }
        }
        alert("¡Pokémon Registrado!");
        closeModal("modal-new-poke");
        fetchPlayerList();
    } catch (e) { console.error(e); }
}