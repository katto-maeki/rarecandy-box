// pokedex.js - Con traducción de tipos y colores oficiales

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

document.addEventListener("DOMContentLoaded", async () => {
  try {
      const user = await initProtectedPage(); 
      if (!user) return;
  } catch (e) { return; }

  try {
      if(typeof renderTrainerLabelFromGame === 'function') await renderTrainerLabelFromGame();
      if(typeof setupLogoutButton === 'function') setupLogoutButton();
  } catch (e) {}

  const filterSelect = document.getElementById("region-filter");
  if(filterSelect) {
      filterSelect.addEventListener("change", applyFilter);
  }

  loadPokedex();
});

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
    container.innerHTML = `<div class="loading-msg" style="color:red">Error de conexión.</div>`;
  }
}

function populateRegionFilter() {
    const select = document.getElementById("region-filter");
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
    document.getElementById("detail-empty").classList.add("hidden");
    document.getElementById("detail-content").classList.remove("hidden");

    document.getElementById("detail-img").src = poke.image_url || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
    document.getElementById("detail-name").textContent = poke.name;
    document.getElementById("detail-region").textContent = poke.season || "SORELLE";
    
    // --- LÓGICA DE TIPOS (ACTUALIZADA) ---
    const typesContainer = document.getElementById("detail-types-container");
    typesContainer.innerHTML = "";
    
    const typesString = poke.type || "Normal";
    // Separamos por /, + o , para soportar varios formatos
    const typesArray = typesString.split(/[\/\,\+]/).map(t => t.trim());

    typesArray.forEach(rawType => {
        // Normalizar clave (quitar espacios, minúsculas)
        const key = rawType.toLowerCase();
        // Buscar en META o usar default
        const meta = TYPE_META[key] || { color: "#A8A77A", label: rawType };

        const span = document.createElement("span");
        span.className = "type-pill";
        // Aplicamos color directo desde JS
        span.style.backgroundColor = meta.color;
        span.textContent = meta.label;
        
        typesContainer.appendChild(span);
    });

    document.getElementById("detail-desc").textContent = poke.description || "Sin información disponible.";

    const usersContainer = document.getElementById("detail-users");
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