// admin.js - Gestión de Admin con PokeAPI Autocomplete y Menú Lateral

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
// UTILIDADES DE MODALES Y UI
// ==========================================
function openModal(id) {
    document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
}

function closeSuggestions() {
    const list = document.getElementById("api-suggestions");
    if (list) {
        list.innerHTML = "";
        list.classList.remove("active");
    }
}

// Carga inicial de nombres para el autocompletado (PokeAPI)
async function loadAllPokemonNames() {
    try {
        // Subimos a 2000 para capturar variantes y formas regionales
        const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
        const data = await res.json();
        globalPokemonList = data.results;
        console.log("PokeAPI lista cargada con variantes.");
    } catch (e) {
        console.error("Error cargando lista de nombres:", e);
    }
}

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");
    const btnLogoutSide = document.getElementById("btn-logout-side");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => sideMenu.classList.remove("hidden");
        if (btnClose) btnClose.onclick = () => sideMenu.classList.add("hidden");
        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) sideMenu.classList.add("hidden");
        };
    }

    if (btnLogoutSide) {
        btnLogoutSide.onclick = async (e) => {
            e.preventDefault();
            if (window.supabaseClient) {
                await window.supabaseClient.auth.signOut();
                window.location.href = "index.html";
            }
        };
    }
}

// ==========================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Iniciando Panel de Admin...");

    // 1. Protección y Header
    let user = null;
    try {
        if (typeof initProtectedPage === "function") {
            user = await initProtectedPage(); 
        }
    } catch (e) {
        console.error("Error en la protección de página:", e);
    }

    const trainerLabel = document.getElementById("trainer-label");
    if (user && trainerLabel) {
        trainerLabel.textContent = "Admin Conectado";
    } else if (trainerLabel) {
        trainerLabel.textContent = "Sin Conexión";
    }

    // 2. Inicializar Menú
    initHamburgerMenu();

    // 3. Cargar datos base
    if (window.supabaseClient) {
        await fetchPlayerList();
        loadAllPokemonNames();
    }

    // 4. Listeners de Botones y Buscador
    document.getElementById("admin-search")?.addEventListener("input", handleSearch);
    document.getElementById("btn-admin-edit")?.addEventListener("click", openAdminEditModal);
    document.getElementById("btn-adm-cancel")?.addEventListener("click", () => closeModal("modal-admin-edit"));
    document.getElementById("btn-adm-save")?.addEventListener("click", saveTargetData);

    document.getElementById("btn-new-pokedex")?.addEventListener("click", openPokeModal);
    document.getElementById("btn-poke-cancel")?.addEventListener("click", () => closeModal("modal-new-poke"));
    document.getElementById("btn-poke-save")?.addEventListener("click", saveNewDiscovery);
    document.getElementById("btn-api-search")?.addEventListener("click", handleApiSearch);
    
    // Autocomplete Logic
    const apiInput = document.getElementById("api-search-input");
    if (apiInput) {
apiInput.addEventListener("input", function() {
    const val = this.value.toLowerCase().trim();
    closeSuggestions();
    if (val.length < 2) return; // Esperar a que escriba al menos 2 letras

    // CAMBIO CLAVE: usamos .includes en lugar de .startsWith
    const matches = globalPokemonList
        .filter(p => p.name.includes(val)) 
        .slice(0, 10); // Mostramos hasta 10 sugerencias

    if (matches.length > 0) {
        const list = document.getElementById("api-suggestions");
        list.classList.add("active");
        matches.forEach(match => {
            const li = document.createElement("li");
            li.className = "suggestion-item";
            // Reemplazamos guiones por espacios para que se vea más limpio
            li.textContent = match.name.replace(/-/g, " "); 
            li.onclick = () => {
                apiInput.value = match.name;
                closeSuggestions();
                handleApiSearch();
            };
            list.appendChild(li);
        });
    }
});
    }

    document.addEventListener("click", (e) => {
        if (e.target !== apiInput) closeSuggestions();
    });
});

// --- LÓGICA JUGADORES ---
async function fetchPlayerList() {
    const listContainer = document.getElementById("player-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div style="padding:10px;">Cargando...</div>';
    const { data, error } = await window.supabaseClient.from(GAME_TABLE).select("id, trainer_name, email");
    
    if (error) return console.error(error);
    allPlayers = data.sort((a, b) => (a.trainer_name || "Z").localeCompare(b.trainer_name || "Z"));
    renderPlayerList(allPlayers);
}

function renderPlayerList(players) {
    const listContainer = document.getElementById("player-list");
    if (!listContainer) return;
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

    const iList = document.getElementById("det-inventory-list"); 
    iList.innerHTML = "";
    const items = inv.items||{}; const balls = inv.balls||{};
    Object.keys(LABELS).forEach(k => {
        let v = ["poke","super","ultra"].includes(k) ? (balls[k]||0) : (items[k]||0);
        if(v > 0) iList.innerHTML += `<div style="display:flex; justify-content:space-between"><span>${LABELS[k]}</span><strong>${v}</strong></div>`;
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
        return (typeof p === "string") ? p : (p.apodo || p.nickname || p.name || p.species || "Pokémon");
    };

    const party = (Array.isArray(game.party_data) ? game.party_data : []).filter(Boolean);
    if (partyCountEl) partyCountEl.textContent = String(party.length);
    party.forEach(p => {
        const li = document.createElement("li");
        li.textContent = getPokeName(p);
        partyListEl?.appendChild(li);
    });

    let boxAll = [];
    if (game.box_data && Array.isArray(game.box_data.boxes)) {
        game.box_data.boxes.forEach(box => {
            if (Array.isArray(box)) boxAll.push(...box.filter(Boolean));
        });
    }
    if (boxCountEl) boxCountEl.textContent = String(boxAll.length);
    boxAll.forEach(p => {
        const li = document.createElement("li");
        li.textContent = getPokeName(p);
        boxListEl?.appendChild(li);
    });
}

// --- MODAL EDICIÓN ---
function openAdminEditModal() {
    if(!selectedPlayerFullData) {
        alert("Primero selecciona un jugador de la lista.");
        return;
    }
    const inv = selectedPlayerFullData.inventoryData;
    const eco = inv.economy || { biIncome:0, savings:0, spent:0 };

    document.getElementById("adm-input-name").value = selectedPlayerFullData.gameData.trainer_name || "";
    document.getElementById("adm-input-income").value = eco.biIncome;
    document.getElementById("adm-input-savings").value = eco.savings;
    document.getElementById("adm-input-spent").value = eco.spent;
    document.getElementById("adm-input-xp").value = inv.xp || 0;
    document.getElementById("adm-input-achievements").value = inv.achievements || "";
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

    if (!inv.economy) inv.economy = { biIncome: 0, savings: 0, spent: 0 };
    inv.economy.biIncome = parseInt(document.getElementById("adm-input-income").value) || 0;
    inv.economy.savings = parseInt(document.getElementById("adm-input-savings").value) || 0;
    inv.economy.spent = parseInt(document.getElementById("adm-input-spent").value) || 0;
    inv.xp = parseInt(document.getElementById("adm-input-xp").value) || 0;
    inv.achievements = document.getElementById("adm-input-achievements").value.trim();

    const realCount = await syncPokedexCount(targetId);
    inv.pokedex = String(realCount || 0);

    if (!inv.items) inv.items = {};
    if (!inv.balls) inv.balls = {};
    Object.keys(LABELS).forEach(k => {
        const val = parseInt(document.getElementById(`adm-qty-${k}`).value) || 0;
        if (["poke", "super", "ultra"].includes(k)) inv.balls[k] = val;
        else inv.items[k] = val;
    });

    try {
        await window.supabaseClient.from(GAME_TABLE).update({ trainer_name: newName }).eq("id", targetId);
        await window.supabaseClient.from(TRAINER_TABLE).upsert(
            { user_id: targetId, inventory: inv, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        );

        alert("¡Guardado y Sincronizado!");
        closeModal("modal-admin-edit");
        await fetchPlayerList();
        await selectPlayer(targetId, null);
    } catch (e) {
        console.error("Error al guardar:", e);
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
    const query = document.getElementById("api-search-input").value.trim().toLowerCase().replace(/\s+/g, "-");
    if(!query) return;
    
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${query}`);
        const data = await res.json();
        
        // El nombre lo formateamos para que se vea bien (Raichu-alola -> Raichu Alola)
        const cleanName = data.name.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
        document.getElementById("poke-input-name").value = cleanName;

        const img = data.sprites.other["official-artwork"].front_default || data.sprites.front_default;
        document.getElementById("poke-input-img").value = img;
        document.getElementById("api-preview-img").src = img;
        document.getElementById("api-preview-img").classList.add("visible");
        document.getElementById("poke-input-type").value = data.types.map(t => t.type.name).join(" / ");

        // Intentamos obtener la generación de la especie
        try {
            const resSpec = await fetch(data.species.url);
            const dataSpec = await resSpec.json();
            document.getElementById("poke-input-season").value = REGION_MAP[dataSpec.generation.name] || "Desconocida";
        } catch (e) {
            document.getElementById("poke-input-season").value = "Variante Especial";
        }

    } catch (e) { 
        alert("Pokémon o variante no encontrada"); 
    }
}

function openPokeModal() {
    const listDiv = document.getElementById("poke-user-list");
    listDiv.innerHTML = "";
    allPlayers.forEach(p => {
        const label = document.createElement("label");
        label.style.display = "block";
        label.innerHTML = `<input type="checkbox" value="${p.id}" data-name="${p.trainer_name}" class="poke-user-check"> ${p.trainer_name}`;
        listDiv.appendChild(label);
    });
    openModal("modal-new-poke");
}

async function saveNewDiscovery() {
    const name = document.getElementById("poke-input-name").value.trim();
    if(!name) return alert("El nombre es obligatorio");
    
    const checks = document.querySelectorAll(".poke-user-check:checked");
    const selectedUsers = Array.from(checks).map(c => ({ id: c.value, name: c.dataset.name }));

    try {
        const { data: pData, error: pErr } = await window.supabaseClient.from(POKE_TABLE).insert({ 
            name, 
            image_url: document.getElementById("poke-input-img").value,
            type: document.getElementById("poke-input-type").value,
            description: document.getElementById("poke-input-desc").value,
            season: document.getElementById("poke-input-season").value
        }).select();
        
        if (pErr) throw pErr;

        if (selectedUsers.length > 0) {
            const discRows = selectedUsers.map(u => ({ pokedex_id: pData[0].id, user_id: u.id, trainer_name: u.name }));
            await window.supabaseClient.from(DISC_TABLE).insert(discRows);
            for (const user of selectedUsers) { await syncPokedexCount(user.id); }
        }
        
        alert("¡Pokémon Registrado con éxito!");
        closeModal("modal-new-poke");
        fetchPlayerList();
    } catch (e) { 
        console.error(e); 
        alert("Error al registrar: " + e.message);
    }
}