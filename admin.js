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
let globalPokemonList = []; // Lista completa de nombres para autocomplete

// ==========================================
// Inicialización
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const user = await initProtectedPage(); 
    if (!user) return;
    document.getElementById("admin-label").textContent = "ADMIN CONECTADO";

    await fetchPlayerList();
    
    // CARGAR LISTA NOMBRES POKEMON
    loadAllPokemonNames();

    // Listeners Generales
    document.getElementById("admin-search").addEventListener("input", handleSearch);
    if(window.setupLogoutButton) setupLogoutButton("btn-logout");

    // Listeners Editar Jugador
    document.getElementById("btn-admin-edit").addEventListener("click", openAdminEditModal);
    document.getElementById("btn-adm-cancel").addEventListener("click", () => closeModal("modal-admin-edit"));
    document.getElementById("btn-adm-save").addEventListener("click", saveTargetData);

    // Listeners Nueva Pokédex
    document.getElementById("btn-new-pokedex").addEventListener("click", openPokeModal);
    document.getElementById("btn-poke-cancel").addEventListener("click", () => closeModal("modal-new-poke"));
    document.getElementById("btn-poke-save").addEventListener("click", saveNewDiscovery);
    
    // Listeners API Search
    document.getElementById("btn-api-search").addEventListener("click", handleApiSearch);
    
    // LÓGICA AUTOCOMPLETE
    const apiInput = document.getElementById("api-search-input");
    
    apiInput.addEventListener("input", function() {
        const val = this.value.toLowerCase();
        closeSuggestions();
        if (!val) return;

        // Filtramos: empieza con... (limitamos a 8 resultados)
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
                    handleApiSearch(); // Buscar automáticamente al seleccionar
                };
                list.appendChild(li);
            });
        }
    });

    // Cerrar sugerencias al hacer clic fuera
    document.addEventListener("click", function (e) {
        if (e.target !== apiInput) closeSuggestions();
    });
});

// --- FUNCIONES AUTOCOMPLETE ---
async function loadAllPokemonNames() {
    try {
        const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1500'); // Traer todos
        const data = await res.json();
        globalPokemonList = data.results;
    } catch (e) { console.error("Error cargando lista Pokemon", e); }
}

function closeSuggestions() {
    const list = document.getElementById("api-suggestions");
    list.innerHTML = "";
    list.classList.remove("active");
}

// --- LÓGICA API ---
async function handleApiSearch() {
    const query = document.getElementById("api-search-input").value.trim().toLowerCase();
    const btn = document.getElementById("btn-api-search");
    
    if(!query) return;
    
    btn.textContent = "⌛";
    btn.disabled = true;
    
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${query}`);
        if(!res.ok) throw new Error("No encontrado");
        const data = await res.json();

        const resSpec = await fetch(data.species.url);
        const dataSpec = await resSpec.json();

        const name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
        document.getElementById("poke-input-name").value = name;

        const img = data.sprites.other["official-artwork"].front_default || data.sprites.front_default;
        document.getElementById("poke-input-img").value = img;
        
        const preview = document.getElementById("api-preview-img");
        preview.src = img;
        preview.classList.add("visible");

        const types = data.types.map(t => t.type.name).join(" / ");
        document.getElementById("poke-input-type").value = types;

        const genName = dataSpec.generation.name;
        const region = REGION_MAP[genName] || "Desconocida";
        document.getElementById("poke-input-season").value = region;

    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.textContent = "Buscar";
        btn.disabled = false;
    }
}

// --- LÓGICA JUGADORES (Existente) ---
async function fetchPlayerList() {
    const listContainer = document.getElementById("player-list");
    listContainer.innerHTML = '<div style="padding:10px;">Cargando...</div>';
    const { data, error } = await window.supabaseClient.from(GAME_TABLE).select("id, trainer_name");
    if (error) return console.error(error);
    allPlayers = data.sort((a, b) => (a.trainer_name || "Z").localeCompare(b.trainer_name || "Z"));
    renderPlayerList(allPlayers);
}

function renderPlayerList(players) {
    const listContainer = document.getElementById("player-list");
    listContainer.innerHTML = "";
    if (players.length === 0) return listContainer.innerHTML = "Sin resultados";
    players.forEach(p => {
        const div = document.createElement("div");
        div.className = "player-row";
        div.innerHTML = `<div class="player-row-name">${p.trainer_name || "Sin Nombre"}</div><div class="player-row-id">${p.id.substring(0, 8)}...</div>`;
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
    document.getElementById("det-id").textContent = `ID: ${data.id}`;
    
    const available = (eco.savings + eco.biIncome) - eco.spent;
    const moneyDisplay = (typeof inv.money === 'number' && !inv.economy) ? inv.money : available;

    document.getElementById("det-money").textContent = `₽${moneyDisplay}`;
    document.getElementById("det-savings").textContent = `₽${eco.savings||0}`;
    document.getElementById("det-income").textContent = `₽${eco.biIncome||0}`;
    
    document.getElementById("det-xp").textContent = `${inv.xp||0} XP`;
    document.getElementById("det-achievements").textContent = inv.achievements||"-";
    document.getElementById("det-pokedex").textContent = inv.pokedex||"-";

    let partyC = Array.isArray(game.party_data) ? game.party_data.filter(p=>p).length : 0;
    let boxC = 0;
    if(game.box_data?.boxes) game.box_data.boxes.forEach(b=>{if(Array.isArray(b)) boxC+=b.filter(p=>p).length});
    
    document.getElementById("det-party-count").textContent = partyC;
    document.getElementById("det-box-count").textContent = boxC;

    const pList = document.getElementById("det-party-list"); pList.innerHTML="";
    if(game.party_data) game.party_data.forEach(p=>{if(p) pList.innerHTML+=`<li>${p.nombre}</li>`});
    
    const bList = document.getElementById("det-box-list"); bList.innerHTML="";
    if(game.box_data?.boxes) game.box_data.boxes.flat().forEach(p=>{if(p) bList.innerHTML+=`<li>${p.nombre}</li>`});

    const iList = document.getElementById("det-inventory-list"); iList.innerHTML = "";
    const items = inv.items||{}; const balls = inv.balls||{};
    Object.keys(LABELS).forEach(k => {
        let v = ["poke","super","ultra"].includes(k) ? (balls[k]||0) : (items[k]||0);
        if(v>0) iList.innerHTML += `<div style="display:flex; justify-content:space-between"><span>${LABELS[k]}</span><strong>${v}</strong></div>`;
    });
}

function openAdminEditModal() {
    if(!selectedPlayerFullData) return;
    const d = selectedPlayerFullData;
    const inv = d.inventoryData;
    const eco = inv.economy || { biIncome:0, savings:0, spent:0 };

    document.getElementById("adm-input-name").value = d.gameData.trainer_name||"";
    document.getElementById("adm-input-income").value = eco.biIncome;
    document.getElementById("adm-input-savings").value = eco.savings;
    document.getElementById("adm-input-spent").value = eco.spent;
    document.getElementById("adm-input-xp").value = inv.xp||0;
    document.getElementById("adm-input-achievements").value = inv.achievements||"";
    document.getElementById("adm-input-pokedex").value = inv.pokedex||"";

    const container = document.getElementById("adm-item-manager-container");
    container.innerHTML = "";
    Object.keys(LABELS).forEach(k => {
        let v = ["poke","super","ultra"].includes(k) ? (inv.balls?.[k]||0) : (inv.items?.[k]||0);
        container.innerHTML += `<div class="item-manager-row"><span>${LABELS[k]}</span><input type="number" class="input" style="width:60px" value="${v}" id="adm-qty-${k}"></div>`;
    });

    openModal("modal-admin-edit");
}

async function saveTargetData() {
    if(!selectedPlayerFullData) return;
    const targetId = selectedPlayerFullData.id;
    const inv = JSON.parse(JSON.stringify(selectedPlayerFullData.inventoryData));
    
    const newName = document.getElementById("adm-input-name").value;
    if(!inv.economy) inv.economy={};
    inv.economy.biIncome = parseInt(document.getElementById("adm-input-income").value)||0;
    inv.economy.savings = parseInt(document.getElementById("adm-input-savings").value)||0;
    inv.economy.spent = parseInt(document.getElementById("adm-input-spent").value)||0;
    inv.xp = parseInt(document.getElementById("adm-input-xp").value)||0;
    inv.achievements = document.getElementById("adm-input-achievements").value;
    inv.pokedex = document.getElementById("adm-input-pokedex").value;

    if(!inv.items) inv.items={}; if(!inv.balls) inv.balls={};
    Object.keys(LABELS).forEach(k => {
        let v = parseInt(document.getElementById(`adm-qty-${k}`).value)||0;
        if(["poke","super","ultra"].includes(k)) inv.balls[k]=v; else inv.items[k]=v;
    });

    await window.supabaseClient.from(GAME_TABLE).update({trainer_name:newName}).eq("id",targetId);
    await window.supabaseClient.from(TRAINER_TABLE).upsert({user_id:targetId, inventory:inv});
    
    alert("Guardado");
    closeModal("modal-admin-edit");
    fetchPlayerList();
    if(document.querySelector(".player-row.active")) selectPlayer(targetId, document.querySelector(".player-row.active"));
}

function openPokeModal() {
    document.getElementById("api-search-input").value = "";
    document.getElementById("api-preview-img").classList.remove("visible");
    document.getElementById("poke-input-name").value = "";
    document.getElementById("poke-input-img").value = "";
    document.getElementById("poke-input-type").value = "";
    document.getElementById("poke-input-desc").value = "";
    document.getElementById("poke-input-season").value = "";

    const listDiv = document.getElementById("poke-user-list");
    listDiv.innerHTML = "";
    allPlayers.forEach(p => {
        const label = document.createElement("label");
        label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "5px"; label.style.fontSize = "0.85rem"; label.style.cursor = "pointer";
        label.innerHTML = `<input type="checkbox" value="${p.id}" data-name="${p.trainer_name}" class="poke-user-check"> ${p.trainer_name || "Sin nombre"}`;
        listDiv.appendChild(label);
    });
    openModal("modal-new-poke");
}

async function saveNewDiscovery() {
    const sb = window.supabaseClient;
    const name = document.getElementById("poke-input-name").value.trim();
    if(!name) return alert("Nombre obligatorio");

    const img = document.getElementById("poke-input-img").value.trim();
    const type = document.getElementById("poke-input-type").value.trim();
    const desc = document.getElementById("poke-input-desc").value.trim();
    const season = document.getElementById("poke-input-season").value.trim();

    const checks = document.querySelectorAll(".poke-user-check:checked");
    const selectedUsers = Array.from(checks).map(c => ({ id: c.value, name: c.dataset.name }));

    try {
        const { data: pokeData, error: pokeErr } = await sb.from(POKE_TABLE).insert({ name, image_url: img, type, description: desc, season }).select();
        if(pokeErr) throw pokeErr;
        const pokeId = pokeData[0].id;

        if (selectedUsers.length > 0) {
            const discoveryRows = selectedUsers.map(u => ({ pokedex_id: pokeId, user_id: u.id, trainer_name: u.name }));
            const { error: discErr } = await sb.from(DISC_TABLE).insert(discoveryRows);
            if(discErr) throw discErr;

            for (const user of selectedUsers) {
                const { data: invRow } = await sb.from(TRAINER_TABLE).select("inventory").eq("user_id", user.id).maybeSingle();
                let currentInv = invRow?.inventory || {};
                let currentCount = parseInt(currentInv.pokedex) || 0;
                currentInv.pokedex = currentCount + 1;
                await sb.from(TRAINER_TABLE).upsert({ user_id: user.id, inventory: currentInv });
            }
        }
        alert("¡Registrado!");
        closeModal("modal-new-poke");
    } catch (e) { console.error(e); alert("Error: " + e.message); }
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }