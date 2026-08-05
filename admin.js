// admin.js - Gestión de Admin con PokeAPI Autocomplete y Menú Lateral

const GAME_TABLE = "user_game_data";
const TRAINER_TABLE = "trainer_inventory";
const POKE_TABLE = "sorelle_pokedex";
const DISC_TABLE = "sorelle_discoveries";

// LABELS ACTUALIZADO: Sincronizado con Master Ball y Panquecito
const LABELS = {
    egg: "Huevo", tradeToken: "Ticket Intercambio", evoStone: "Piedra Evo",
    friendship: "Pulsera Amistad", passport: "Pasaporte Regional", panquecito: "Panquecito",
    poke: "Poké Ball", super: "Super Ball", ultra: "Ultra Ball", master: "Master Ball"
};

const REGION_MAP = {
    "generation-i": "Kanto", "generation-ii": "Johto", "generation-iii": "Hoenn",
    "generation-iv": "Sinnoh", "generation-v": "Unova", "generation-vi": "Kalos",
    "generation-vii": "Alola", "generation-viii": "Galar", "generation-ix": "Paldea"
};

// Catálogo de todos los tipos de actividad que puede generar el sistema (manuales y automáticos),
// usado para etiquetar y colorear el Diario de Actividades del admin.
const ACTIVITY_TYPE_INFO = {
    encounter:            { label: "Encounter",              color: "#7a47ff", icon: "🐾" },
    exploration:          { label: "Exploración",            color: "#7a47ff", icon: "🧭" },
    quest:                { label: "Quest",                  color: "#7a47ff", icon: "🎯" },
    egg_challenge:        { label: "Reto Huevo",             color: "#d97706", icon: "🥚" },
    pokedex_comu:         { label: "Pokédex Comunitaria",    color: "#7a47ff", icon: "📘" },
    pokedex_legen:        { label: "Pokédex Legendaria",     color: "#7a47ff", icon: "📕" },
    coloring:             { label: "Coloreo",                color: "#7a47ff", icon: "🎨" },
    pokewords:            { label: "Pokéwords",              color: "#7a47ff", icon: "🔤" },
    freemode:             { label: "Freemode",                color: "#7a47ff", icon: "🕹️" },
    passport:             { label: "Passport",                color: "#7a47ff", icon: "🛂" },
    evolution_narrative:  { label: "Evolución (Narrativa)",  color: "#d97706", icon: "✨" },
    trade_narrative:      { label: "Intercambio (Narrativa)",color: "#2563eb", icon: "🔄" },
    checkpoint:           { label: "Checkpoint",             color: "#059669", icon: "📌" },
    logros:               { label: "Logros",                 color: "#7a47ff", icon: "🏆" },
    otros_manual:         { label: "Otros (Manual)",         color: "#4b5563", icon: "📝" },
    otros:                { label: "Otros (Sistema)",        color: "#4b5563", icon: "📝" },
    incubation:           { label: "Incubación",             color: "#d97706", icon: "🥚" },
    box_add:              { label: "Ingreso a Caja",         color: "#0369a1", icon: "📥" },
    purchase:             { label: "Compra",                  color: "#e53e3e", icon: "🛍️" },
    consume:              { label: "Consumo de Ítem",        color: "#4b5563", icon: "🎒" },
    bimonthly_close:      { label: "Cierre Bimestral",       color: "#059669", icon: "🏁" },
    exp_assign:           { label: "Asignación EXP",         color: "#7a47ff", icon: "💪" },
    evolution:            { label: "Evolución (Sistema)",    color: "#d97706", icon: "💥" },
    trade:                { label: "Intercambio (Sistema)",  color: "#2563eb", icon: "🤝" },
    gacha_close:          { label: "Cierre de Evento",       color: "#059669", icon: "🎟️" },
    gacha_roll:           { label: "Gachapón",                color: "#c957b0", icon: "🎰" },
    gacha_reward:         { label: "Recompensa de Álbum",    color: "#c957b0", icon: "⭐" }
};

let allPlayers = [];
let selectedPlayerFullData = null;
let globalPokemonList = [];
let currentPlayerLogs = [];
const closureSummaryLookup = {};

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

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => sideMenu.classList.remove("hidden");
        if (btnClose) btnClose.onclick = () => sideMenu.classList.add("hidden");
        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) sideMenu.classList.add("hidden");
        };
    }

    if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

// ==========================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Iniciando Panel de Admin...");

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

    initHamburgerMenu();

    if (window.supabaseClient) {
        await fetchPlayerList();
        loadAllPokemonNames();
    }

    document.getElementById("admin-search")?.addEventListener("input", handleSearch);
    document.getElementById("btn-admin-edit")?.addEventListener("click", openAdminEditModal);
    document.getElementById("btn-adm-cancel")?.addEventListener("click", () => closeModal("modal-admin-edit"));
    document.getElementById("btn-adm-save")?.addEventListener("click", saveTargetData);

    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.add("hidden"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab)?.classList.remove("hidden");
        });
    });

    document.getElementById("btn-new-pokedex")?.addEventListener("click", openPokeModal);
    document.getElementById("btn-poke-cancel")?.addEventListener("click", () => closeModal("modal-new-poke"));
    document.getElementById("btn-poke-save")?.addEventListener("click", saveNewDiscovery);
    document.getElementById("btn-api-search")?.addEventListener("click", handleApiSearch);
    
    const apiInput = document.getElementById("api-search-input");
    if (apiInput) {
        apiInput.addEventListener("input", function() {
            const val = this.value.toLowerCase().trim();
            closeSuggestions();
            if (val.length < 2) return;

            const matches = globalPokemonList
                .filter(p => p.name.includes(val)) 
                .slice(0, 10);

            if (matches.length > 0) {
                const list = document.getElementById("api-suggestions");
                list.classList.add("active");
                matches.forEach(match => {
                    const li = document.createElement("li");
                    li.className = "suggestion-item";
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

    // Al cambiar de jugador, volvemos siempre a la pestaña "Resumen"
    document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.admin-tab-btn[data-tab="tab-resumen"]')?.classList.add("active");
    document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-resumen")?.classList.remove("hidden");

    // Cargar el Diario de Actividades completo del jugador (filtrable por tipo)
    await fetchAndRenderAdminLogs(targetId);
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
        let v = ["poke","super","ultra","master"].includes(k) ? (balls[k]||0) : (items[k]||0);
        if(v > 0) iList.innerHTML += `<div style="display:flex; justify-content:space-between"><span>${LABELS[k]}</span><strong>${v}</strong></div>`;
    });

    // --- Pokémon: Equipo y Caja CORREGIDO (Muestra la especie con prioridad) ---
    const partyListEl = document.getElementById("det-party-list");
    const boxListEl = document.getElementById("det-box-list");
    const partyCountEl = document.getElementById("det-party-count");
    const boxCountEl = document.getElementById("det-box-count");

    if (partyListEl) partyListEl.innerHTML = "";
    if (boxListEl) boxListEl.innerHTML = "";

    const getPokeName = (p) => {
        if (!p) return null;
        if (typeof p === "string") return p;
        
        // Prioriza el nombre de la especie sobre la palabra genérica "Pokémon"
        const speciesName = p.nombre || p.species || p.name || "Pokémon";
        if (p.apodo && p.apodo.trim() !== "" && p.apodo !== speciesName) {
            return `${p.apodo} (${speciesName})`;
        }
        return speciesName;
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

// --- DIARIO DE ACTIVIDADES: historial completo del jugador, filtrable por tipo ---
async function fetchAndRenderAdminLogs(targetId) {
    const diarioList = document.getElementById("det-diario-list");
    const filterSelect = document.getElementById("diario-filter-type");

    if (diarioList) diarioList.innerHTML = "Cargando diario de actividades...";

    const { data: logs, error } = await window.supabaseClient
        .from("trainer_log")
        .select("*")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        currentPlayerLogs = [];
        if (diarioList) diarioList.innerHTML = "Error al cargar el diario de actividades.";
        return;
    }

    currentPlayerLogs = logs || [];

    if (filterSelect) {
        const presentTypes = [...new Set(currentPlayerLogs.map(l => l.activity_type))].sort((a, b) => {
            const la = ACTIVITY_TYPE_INFO[a]?.label || a || "";
            const lb = ACTIVITY_TYPE_INFO[b]?.label || b || "";
            return la.localeCompare(lb);
        });
        filterSelect.innerHTML = `<option value="all">Todos los tipos</option>` +
            presentTypes.map(t => `<option value="${t}">${ACTIVITY_TYPE_INFO[t]?.label || t}</option>`).join("");
        filterSelect.value = "all";
        filterSelect.onchange = () => renderDiarioList(filterSelect.value);
    }

    renderDiarioList("all");
}

function renderDiarioList(typeFilter) {
    const diarioList = document.getElementById("det-diario-list");
    if (!diarioList) return;

    const rows = (typeFilter === "all")
        ? currentPlayerLogs
        : currentPlayerLogs.filter(l => l.activity_type === typeFilter);

    if (rows.length === 0) {
        diarioList.innerHTML = `<div style="color:#94a3b8; font-style:italic; padding:10px;">Sin registros para este filtro.</div>`;
        return;
    }

    Object.keys(closureSummaryLookup).forEach(key => delete closureSummaryLookup[key]);

    diarioList.innerHTML = rows.map(log => {
        const dateStr = new Date(log.created_at).toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const info = ACTIVITY_TYPE_INFO[log.activity_type] || { label: log.activity_type || "Otros", color: "#4b5563", icon: "📝" };

        let displayTitle = log.activity_name || "Sin descripción";
        let clickable = false;

        if (log.activity_type === "bimonthly_close") {
            try {
                const summary = JSON.parse(log.activity_name);
                displayTitle = summary.displayTitle;
                closureSummaryLookup[log.id] = { summary, dateStr };
                clickable = true;
            } catch (e) { /* registro plano antiguo sin JSON, se muestra tal cual */ }
        }

        const rewardBits = [];
        if (log.money_reward) rewardBits.push(`<span style="color:${log.money_reward > 0 ? '#0fb86b' : '#e53e3e'};">${log.money_reward > 0 ? '+' : ''}${log.money_reward}₽</span>`);
        if (log.xp_reward) rewardBits.push(`<span style="color:#7a47ff;">+${log.xp_reward} XP</span>`);

        return `<div class="diario-row"${clickable ? ` data-log-id="${log.id}" title="Haz clic para auditar estadísticas completas de este cierre"` : ""}>
            <div class="diario-row-top">
                <span class="badge-diario" style="background:${info.color}1a; color:${info.color};">${info.icon} ${info.label}</span>
                <span class="diario-row-date">${dateStr}</span>
            </div>
            <div class="diario-row-name">${displayTitle}</div>
            ${rewardBits.length ? `<div class="diario-row-rewards">${rewardBits.join(" ")}</div>` : ""}
        </div>`;
    }).join("");

    diarioList.querySelectorAll(".diario-row[data-log-id]").forEach(row => {
        row.addEventListener("click", () => {
            const entry = closureSummaryLookup[row.dataset.logId];
            if (entry) window.showClosureSummaryModal(entry.summary, entry.dateStr);
        });
    });
}

// Modal de auditoría de cierre bimestral (mismo comportamiento que en perfil.js, autocontenido aquí
// porque admin.html no carga perfil.js).
window.showClosureSummaryModal = function(summary, dateStr) {
    const existing = document.getElementById("dynamic-closure-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "dynamic-closure-modal";
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; font-family:'Nunito', sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background:white; width:480px; max-width:100%; border-radius:16px; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.15); position:relative; color:#2d3748; text-align:left;";

    box.innerHTML = `
        <button style="position:absolute; top:12px; right:15px; background:none; border:none; font-size:1.4rem; cursor:pointer; color:#718096;" onclick="document.getElementById('dynamic-closure-modal').remove()">&times;</button>
        <h3 style="margin:0 0 4px 0; color:#312e81; font-family:'Press Start 2P', monospace; font-size:0.7rem; letter-spacing:-0.5px;">Resumen Histórico</h3>
        <p style="margin:0 0 15px 0; color:#94a3b8; font-size:0.8rem;">Corte oficial guardado el ${dateStr}</p>

        <div style="background:#e6fffa; border:1px solid #b2f5ea; padding:12px; border-radius:12px; margin-bottom:15px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#234e52; font-weight:700;">
                <span>INGRESO TOTAL EN CICLO:</span>
                <span style="font-family:'Press Start 2P', monospace; font-size:0.7rem;">₽${summary.income.toLocaleString()}</span>
            </div>
            <div style="border-top:1px dashed #b2f5ea; margin:2px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#234e52; font-weight:700;">
                <span>AHORROS TRASLADADOS:</span>
                <span style="color:#0fb86b; font-family:'Press Start 2P', monospace; font-size:0.7rem;">₽${summary.savings.toLocaleString()}</span>
            </div>
        </div>

        <div style="max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; font-size:0.85rem; padding-right:4px;">
            <div>
                <strong style="color:#373b5c; display:block; border-bottom:1px solid #edf2f7; padding-bottom:2px; margin-bottom:4px;">📦 Pokémon por tipo principal</strong>
                <span style="color:#4a5568; line-height:1.4;">${summary.types}</span>
            </div>
            <div>
                <strong style="color:#373b5c; display:block; border-bottom:1px solid #edf2f7; padding-bottom:2px; margin-bottom:4px;">📝 Actividades registradas</strong>
                <span style="color:#4a5568; line-height:1.4;">${summary.activities}</span>
            </div>
            <div>
                <strong style="color:#373b5c; display:block; border-bottom:1px solid #edf2f7; padding-bottom:2px; margin-bottom:4px;">🎒 Ítems en mochila</strong>
                <span style="color:#4a5568; line-height:1.4;">${summary.items}</span>
            </div>
            <div>
                <strong style="color:#373b5c; display:block; border-bottom:1px solid #edf2f7; padding-bottom:2px; margin-bottom:4px;">🥚 Incubación</strong>
                <span style="color:#4a5568;">Huevos eclosionados en el ciclo: <strong>${summary.hatched}</strong></span>
            </div>
        </div>

        <button style="margin-top:15px; width:100%; background:#312e81; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;" onclick="document.getElementById('dynamic-closure-modal').remove()">Entendido</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
};

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
        let v = ["poke","super","ultra","master"].includes(k) ? (inv.balls?.[k]||0) : (inv.items?.[k]||0);
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
        if (["poke", "super", "ultra", "master"].includes(k)) inv.balls[k] = val;
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

        // Cuenta por user_id (vínculo estable, sobrevive a cambios de username).
        const { count: byId } = await window.supabaseClient.from(DISC_TABLE)
            .select("*", { count: "exact", head: true })
            .eq("user_id", targetId);

        // Respaldo para registros muy antiguos sin user_id, vinculados solo por nombre.
        const { count: legacyByName } = await window.supabaseClient.from(DISC_TABLE)
            .select("*", { count: "exact", head: true })
            .is("user_id", null)
            .eq("trainer_name", user.trainer_name);

        return (byId || 0) + (legacyByName || 0);
    } catch (e) { return 0; }
}

// --- LÓGICA POKÉDEX ---
async function handleApiSearch() {
    const query = document.getElementById("api-search-input").value.trim().toLowerCase().replace(/\s+/g, "-");
    if(!query) return;
    
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${query}`);
        const data = await res.json();
        
        const cleanName = data.name.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
        document.getElementById("poke-input-name").value = cleanName;

        const img = data.sprites.other["official-artwork"].front_default || data.sprites.front_default;
        document.getElementById("poke-input-img").value = img;
        document.getElementById("api-preview-img").src = img;
        document.getElementById("api-preview-img").classList.add("visible");
        document.getElementById("poke-input-type").value = data.types.map(t => t.type.name).join(" / ");

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