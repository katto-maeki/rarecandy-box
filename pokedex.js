// pokedex.js - Con traducción de tipos, colores oficiales y Menú Hamburguesa

const POKE_TABLE = "sorelle_pokedex";
const DISCOVERY_TABLE = "sorelle_discoveries";

// Variables globales para el filtro
let allSpecies = [];
let allDiscoveries = [];

// Configuración de Tipos (Español + Colores)
const TYPE_META = {
    normal: { color: "#A8A77A", label: "Normal" },
    fuego: { color: "#EE8130", label: "Fuego" }, fire: { color: "#EE8130", label: "Fuego" },
    agua: { color: "#6390F0", label: "Agua" }, water: { color: "#6390F0", label: "Agua" },
    electrico: { color: "#F7D02C", label: "Eléctrico" }, electric: { color: "#F7D02C", label: "Eléctrico" },
    planta: { color: "#7AC74C", label: "Planta" }, grass: { color: "#7AC74C", label: "Planta" },
    hielo: { color: "#96D9D6", label: "Hielo" }, ice: { color: "#96D9D6", label: "Hielo" },
    lucha: { color: "#C22E28", label: "Lucha" }, fighting: { color: "#C22E28", label: "Lucha" },
    veneno: { color: "#A33EA1", label: "Veneno" }, poison: { color: "#A33EA1", label: "Veneno" },
    tierra: { color: "#E2BF65", label: "Tierra" }, ground: { color: "#E2BF65", label: "Tierra" },
    volador: { color: "#A98FF3", label: "Volador" }, flying: { color: "#A98FF3", label: "Volador" },
    psiquico: { color: "#F95587", label: "Psíquico" }, psychic: { color: "#F95587", label: "Psíquico" },
    bicho: { color: "#A6B91A", label: "Bicho" }, bug: { color: "#A6B91A", label: "Bicho" },
    roca: { color: "#B6A136", label: "Roca" }, rock: { color: "#B6A136", label: "Roca" },
    fantasma: { color: "#735797", label: "Fantasma" }, ghost: { color: "#735797", label: "Fantasma" },
    dragon: { color: "#6F35FC", label: "Dragón" }, dragon_en: { color: "#6F35FC", label: "Dragón" },
    siniestro: { color: "#705746", label: "Siniestro" }, dark: { color: "#705746", label: "Siniestro" },
    acero: { color: "#B7B7CE", label: "Acero" }, steel: { color: "#B7B7CE", label: "Acero" },
    hada: { color: "#D685AD", label: "Hada" }, fairy: { color: "#D685AD", label: "Hada" },
};

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");
    const btnLogoutSide = document.getElementById("btn-logout-side");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => {
            sideMenu.classList.remove("hidden");
        };

        if (btnClose) {
            btnClose.onclick = () => sideMenu.classList.add("hidden");
        }

        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) sideMenu.classList.add("hidden");
        };
    }

    if (btnLogoutSide) {
        btnLogoutSide.onclick = (e) => {
            e.preventDefault();
            // Si existe la función de logout en core.js o el botón original
            const originalLogout = document.getElementById("btn-logout");
            if (originalLogout) originalLogout.click();
            else {
                window.supabaseClient.auth.signOut().then(() => {
                    window.location.href = "index.html";
                });
            }
        };
    }
}

// ==========================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Protección y Datos de Sesión
    try {
        const user = await initProtectedPage(); 
        if (!user) return;
    } catch (e) { return; }

    try {
        if(typeof renderTrainerLabelFromGame === 'function') await renderTrainerLabelFromGame();
        if(typeof setupLogoutButton === 'function') setupLogoutButton();
    } catch (e) {}

    // 2. Inicializar Menú Hamburguesa
    initHamburgerMenu();

    // 3. Filtros y Carga
    const filterSelect = document.getElementById("region-filter");
    if(filterSelect) {
        filterSelect.addEventListener("change", applyFilter);
    }

    loadPokedex();
});

// --- Resto de funciones (loadPokedex, renderGrid, etc.) se mantienen igual ---

async function loadPokedex() {
    const container = document.getElementById("pokedex-grid");
    const supabase = window.supabaseClient;

    try {
        const { data: species, error: err1 } = await supabase.from(POKE_TABLE).select("*").order("created_at", { ascending: false });
        const { data: discoveries, error: err2 } = await supabase.from(DISCOVERY_TABLE).select("pokedex_id, trainer_name");

        if (err1 || err2) throw err1 || err2;

        allSpecies = species || [];
        allDiscoveries = discoveries || [];

        populateRegionFilter();
        renderGrid(allSpecies);

    } catch (error) {
        console.error("Error:", error);
        if(container) container.innerHTML = `<div class="loading-msg" style="color:red">Error de conexión.</div>`;
    }
}

function populateRegionFilter() {
    const select = document.getElementById("region-filter");
    if (!select) return;
    const regions = [...new Set(allSpecies.map(p => p.season || "Desconocida"))].sort();
    select.innerHTML = '<option value="all">Todas las regiones</option>';
    regions.forEach(region => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        select.appendChild(option);
    });
}

function applyFilter() {
    const selectedRegion = document.getElementById("region-filter").value;
    if (selectedRegion === "all") {
        renderGrid(allSpecies);
    } else {
        const filtered = allSpecies.filter(p => (p.season || "Desconocida") === selectedRegion);
        renderGrid(filtered);
    }
}

function renderGrid(speciesList) {
    const container = document.getElementById("pokedex-grid");
    if (!container) return;
    container.innerHTML = "";

    if (speciesList.length === 0) {
      container.innerHTML = `<div class="loading-msg">No hay Pokémon en esta categoría.</div>`;
      return;
    }

    speciesList.forEach((poke) => {
      const finders = allDiscoveries
        .filter((d) => d.pokedex_id === poke.id)
        .map((d) => d.trainer_name || "Anónimo");
      
      const uniqueFinders = [...new Set(finders)];

      const slot = document.createElement("div");
      slot.className = "poke-slot";
      
      const imgUrl = poke.image_url || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
      slot.innerHTML = `<img src="${imgUrl}" alt="${poke.name}" class="slot-img">`;

      slot.addEventListener("click", () => {
          document.querySelectorAll(".poke-slot").forEach(s => s.classList.remove("active"));
          slot.classList.add("active");
          renderDetail(poke, uniqueFinders);
      });

      container.appendChild(slot);
    });
}

function renderDetail(poke, finders) {
    document.getElementById("detail-empty")?.classList.add("hidden");
    document.getElementById("detail-content")?.classList.remove("hidden");

    const imgEl = document.getElementById("detail-img");
    if(imgEl) imgEl.src = poke.image_url || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
    
    setTextById("detail-name", poke.name);
    setTextById("detail-region", poke.season || "SORELLE");
    
    const typesContainer = document.getElementById("detail-types-container");
    if (typesContainer) {
        typesContainer.innerHTML = "";
        const typesString = poke.type || "Normal";
        const typesArray = typesString.split(/[\/\,\+]/).map(t => t.trim());

        typesArray.forEach(rawType => {
            const key = rawType.toLowerCase();
            const meta = TYPE_META[key] || { color: "#A8A77A", label: rawType };
            const span = document.createElement("span");
            span.className = "type-pill";
            span.style.backgroundColor = meta.color;
            span.textContent = meta.label;
            typesContainer.appendChild(span);
        });
    }

    setTextById("detail-desc", poke.description || "Sin información disponible.");

    const usersContainer = document.getElementById("detail-users");
    if (usersContainer) {
        usersContainer.innerHTML = "";
        if (finders.length === 0) {
            usersContainer.innerHTML = "<span style='color:#999; font-size:0.8rem;'>Nadie todavía.</span>";
        } else {
            finders.forEach(finder => {
                const chip = document.createElement("span");
                chip.className = "user-chip";
                chip.textContent = finder;
                usersContainer.appendChild(chip);
            });
        }
    }
}

// Helper rápido para evitar errores si no existe el ID
function setTextById(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}