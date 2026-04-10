// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================

const bd = window.supabaseClient;

let user = null;
let selectedPokemon = []; 
let tempJohtoSelection = []; 
let selectedType = "comun";
let activeIncubations = [];

const EGG_DATA = {
  comun: { label: "Huevo Común", pool: ["Poochyena","Zigzagoon","Wurmple","Lotad","Seedot","Taillow","Wingull","Surskit","Shroomish","Nincada","Whismur","Makuhita","Nosepass","Skitty","Aron","Meditite","Electrike","Gulpin","Carvanha","Wailmer","Numel","Spoink","Cacnea","Barboach","Corphish","Baltoy","Shuppet","Duskull","Snorunt","Spheal","Luvdisc","Sentret","Hoothoot","Ledyba","Spinarak","Chinchou","Natu","Mareep","Marill","Hoppip","Sunkern","Wooper","Pineco","Snubbull","Teddiursa","Slugma","Swinub","Remoraid","Phanpy"] },
  raro: { label: "Huevo Raro", pool: ["Treecko","Torchic","Mudkip","Ralts","Slakoth","Sableye","Mawile","Plusle","Minun","Volbeat","Illumise","Roselia","Torkoal","Spinda","Trapinch","Swablu","Zangoose","Seviper","Lunatone","Solrock","Feebas","Castform","Kecleon","Tropius","Chimecho","Absol","Clamperl","Relicanth","Bagon","Beldum","Chikorita","Cyndaquil","Totodile","Sudowoodo","Aipom","Yanma","Murkrow","Misdreavus","Unown","Girafarig","Dunsparce","Gligar","Qwilfish","Shuckle","Heracross","Sneasel","Corsola","Delibird","Skarmory","Houndour","Stantler","Smeargle","Miltank","Larvitar"] },
  baby: { label: "Huevo Baby", pool: ["Azurill","Wynaut","Pichu","Cleffa","Igglybuff","Togepi","Tyrogue","Smoochum","Elekid","Magby","Budew","Chingling","Bonsly","Mime Jr.","Happiny","Munchlax", "Riolu", "Mantyke", "Toxel",] }
};

const REGION_MAP = {
  /* HOENN */
  Treecko: "hoenn", Torchic: "hoenn", Mudkip: "hoenn", Ralts: "hoenn", Slakoth: "hoenn", Sableye: "hoenn", Mawile: "hoenn", Plusle: "hoenn", Minun: "hoenn", Volbeat: "hoenn", Illumise: "hoenn", Roselia: "hoenn", Torkoal: "hoenn", Spinda: "hoenn", Trapinch: "hoenn", Swablu: "hoenn", Zangoose: "hoenn", Seviper: "hoenn", Lunatone: "hoenn", Solrock: "hoenn", Feebas: "hoenn", Castform: "hoenn", Kecleon: "hoenn", Tropius: "hoenn", Chimecho: "hoenn", Absol: "hoenn", Clamperl: "hoenn", Relicanth: "hoenn", Bagon: "hoenn", Beldum: "hoenn", Poochyena: "hoenn", Zigzagoon: "hoenn", Wurmple: "hoenn", Lotad: "hoenn", Seedot: "hoenn", Taillow: "hoenn", Wingull: "hoenn", Surskit: "hoenn", Shroomish: "hoenn", Nincada: "hoenn", Whismur: "hoenn", Makuhita: "hoenn", Nosepass: "hoenn", Skitty: "hoenn", Aron: "hoenn", Meditite: "hoenn", Electrike: "hoenn", Gulpin: "hoenn", Carvanha: "hoenn", Wailmer: "hoenn", Numel: "hoenn", Spoink: "hoenn", Cacnea: "hoenn", Barboach: "hoenn", Corphish: "hoenn", Baltoy: "hoenn", Shuppet: "hoenn", Duskull: "hoenn", Snorunt: "hoenn", Spheal: "hoenn", Luvdisc: "hoenn", Azurill: "hoenn", Wynaut: "hoenn",
  /* JOHTO */
  Chikorita: "johto", Cyndaquil: "johto", Totodile: "johto", Sudowoodo: "johto", Aipom: "johto", Yanma: "johto", Murkrow: "johto", Misdreavus: "johto", Unown: "johto", Girafarig: "johto", Dunsparce: "johto", Gligar: "johto", Qwilfish: "johto", Shuckle: "johto", Heracross: "johto", Sneasel: "johto", Corsola: "johto", Delibird: "johto", Skarmory: "johto", Houndour: "johto", Stantler: "johto", Smeargle: "johto", Miltank: "johto", Larvitar: "johto", Sentret: "johto", Hoothoot: "johto", Ledyba: "johto", Spinarak: "johto", Chinchou: "johto", Natu: "johto", Mareep: "johto", Marill: "johto", Hoppip: "johto", Sunkern: "johto", Wooper: "johto", Pineco: "johto", Snubbull: "johto", Teddiursa: "johto", Slugma: "johto", Swinub: "johto", Remoraid: "johto", Phanpy: "johto", Smoochum: "johto", Elekid: "johto", Magby: "johto", Tyrogue: "johto", Pichu: "johto", Cleffa: "johto", Igglybuff: "johto", Togepi: "johto"
};

const INCUBATION_TIME = { comun: 7, raro: 21, baby: 28 };

// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Validación de sesión y usuario
  const loggedUser = await initProtectedPage();
  if (!loggedUser) return;
  user = loggedUser;

  // 2. Setup visual y menús
  await renderTrainerLabelFromGame();
  initHamburgerMenu();

  // 3. Carga de datos y configuración de pestañas
  await loadIncubations();
  setupEggTabs();
  setupViewTabs();

  // 4. Lógica del Rayo y Fecha Dinámica en el Modal ---
  const specialCheckbox = document.getElementById("special-incubator");
  if (specialCheckbox) {
    specialCheckbox.addEventListener("change", function() {
      const iconContainer = document.getElementById("special-icon-summary");
      const dateDisplay = document.getElementById("summary-date");

      if (this.checked) {
        // Mostramos el rayo
        if (iconContainer) iconContainer.innerHTML = " ⚡";
        
        // OPCIONAL: Actualizar la fecha en el modal restando los 7 días al instante
        const newDate = calculateHatchDate(selectedType, true);
        if (dateDisplay) dateDisplay.textContent = newDate.toLocaleDateString("es-ES");
      } else {
        // Quitamos el rayo
        if (iconContainer) iconContainer.innerHTML = "";
        
        // Volvemos a la fecha original
        const originalDate = calculateHatchDate(selectedType, false);
        if (dateDisplay) dateDisplay.textContent = originalDate.toLocaleDateString("es-ES");
      }
    });
  }
  // -----------------------------------------------------------

  // 5. Renderizado inicial de la pool de Pokémon
  renderPool(selectedType);
  updateCounter();
  updateIncubateButton();
});

function setupViewTabs() {
  const tabInc = document.getElementById("tab-incubadora");
  const tabHist = document.getElementById("tab-historial");
  const viewInc = document.getElementById("incubadora-view");
  const viewHist = document.getElementById("historial-view");

  if (tabInc && tabHist) {
    tabInc.onclick = () => {
      tabInc.classList.add("active");
      tabHist.classList.remove("active");
      viewInc.classList.remove("hidden");
      viewHist.classList.add("hidden");
      loadIncubations();
    };

    tabHist.onclick = () => {
      tabHist.classList.add("active");
      tabInc.classList.remove("active");
      viewHist.classList.remove("hidden");
      viewInc.classList.add("hidden");
      loadHistory();
    };
  }
}

function setupEggTabs() {
  document.querySelectorAll(".info-tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".info-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;

      if (selectedType === "baby") {
        selectedPokemon = [...EGG_DATA.baby.pool];
      } else {
        selectedPokemon = [];
      }

      renderPool(selectedType);
      updateCounter();
      updateIncubateButton();
    };
  });
}

function renderPool(type) {
  const container = document.getElementById("pool-display");
  const pool = EGG_DATA[type].pool;

  const poolToShow = (type === "baby") 
    ? pool 
    : pool.filter(p => REGION_MAP[p] === "hoenn");

  container.innerHTML = poolToShow.map(p => `
    <div class="pool-item ${selectedPokemon.includes(p) ? "selected" : ""}" onclick="toggleSelection('${p}')">
      ${p}
    </div>
  `).join("");
}

function toggleSelection(name) {
  const max = (selectedType === "baby") ? EGG_DATA.baby.pool.length : 4;

  if (selectedPokemon.includes(name)) {
    selectedPokemon = selectedPokemon.filter(p => p !== name);
  } else if (selectedPokemon.length < max) {
    selectedPokemon.push(name);
  }
  
  renderPool(selectedType);
  updateCounter();
  updateIncubateButton();
}

function updateCounter() {
  const isBaby = (selectedType === "baby");
  const max = isBaby ? EGG_DATA.baby.pool.length : 4;
  
  const countEl = document.getElementById("selection-count");
  if (countEl) countEl.textContent = `${selectedPokemon.length} / ${max}`;
  
  const title = document.querySelector(".pool-info-section .column-title");
  if (title) {
    title.textContent = isBaby 
      ? "Pokémon Baby (Todos en consideración)" 
      : "Selecciona 4 Pokémon de Hoenn";
  }

  const notice = document.getElementById("johto-notice");
  if (notice) {
    notice.style.display = isBaby ? "none" : "block";
  }
}

function updateIncubateButton() {
  const isBaby = (selectedType === "baby");
  const canIncubate = isBaby 
    ? selectedPokemon.length > 0 
    : selectedPokemon.length === 4;

  const btn = document.getElementById("btn-incubar");
  if (btn) btn.disabled = !canIncubate;
}

// ===============================
// MODAL Y LÓGICA DE JUEGO
// ===============================

document.getElementById("btn-incubar").onclick = openSummaryModal;

function openSummaryModal() {
  tempJohtoSelection = [];
  let fullPreview = [];

  // 1. Preparar la previsualización de Pokémon
  if (selectedType === "baby") {
    fullPreview = [...selectedPokemon];
  } else {
    tempJohtoSelection = getRandomJohto(selectedType, 2);
    fullPreview = [...selectedPokemon, ...tempJohtoSelection];
  }

  // 2. Lógica de Restricción e Iconos
  const specialContainer = document.getElementById("container-special-incubator");
  const specialCheckbox = document.getElementById("special-incubator");
  const specialIconContainer = document.getElementById("special-icon-summary");

  // RESET: Siempre empezamos con el checkbox desmarcado y sin rayo al abrir el modal
  if (specialCheckbox) specialCheckbox.checked = false;
  if (specialIconContainer) specialIconContainer.innerHTML = "";

  if (selectedType === "comun") {
    // Si el huevo es común, escondemos la opción
    if (specialContainer) specialContainer.style.display = "none";
  } else {
    // Si es Raro o Baby, mostramos la opción
    if (specialContainer) specialContainer.style.display = "block";
  }

  // 3. Rellenar datos de texto en el modal
  document.getElementById("summary-type").textContent = EGG_DATA[selectedType].label;
  document.getElementById("summary-time").textContent = `${INCUBATION_TIME[selectedType]} días`;
  
  // Siempre mostramos la fecha base inicialmente
  const hatchDate = calculateHatchDate(selectedType, false);
  document.getElementById("summary-date").textContent = hatchDate.toLocaleDateString("es-ES");

  // 4. Renderizar la lista de Pokémon que podrían salir
  const list = document.getElementById("summary-pokemon");
  list.innerHTML = fullPreview.map(p => {
    const isAutoJohto = tempJohtoSelection.includes(p);
    return `<li>${p} ${isAutoJohto ? '<small style="color: #6366f1;">(Johto)</small>' : ''}</li>`;
  }).join("");

  // 5. Mostrar el modal
  document.getElementById("modal-summary").classList.remove("hidden");
}

function getRandomJohto(type, count = 2) {
  const pool = EGG_DATA[type].pool;
  const johtoPool = pool.filter(p => REGION_MAP[p] === "johto");
  return [...johtoPool].sort(() => 0.5 - Math.random()).slice(0, count);
}

async function confirmIncubationFromModal() {
  if (activeIncubations.length >= 2) return alert("Solo puedes tener 2 incubadoras activas.");
  
  // 1. Forzar special a false si el huevo es común
  let special = document.getElementById("special-incubator").checked;
  if (selectedType === "comun") {
    special = false; 
  }

  // 2. Obtener inventario actual de la base de datos
  const { data } = await bd.from("trainer_inventory").select("inventory").eq("user_id", user.id).single();
  const inventory = data.inventory;

  if (inventory.items.egg <= 0) return alert("No tienes huevos disponibles.");
  
  // 3. Calcular saldo disponible (usando la misma fórmula de tu inventario)
  const disponible = (inventory.economy.savings + inventory.economy.biIncome) - inventory.economy.spent;

  // 4. Validar cobro si es incubadora especial (100 Pokecoins)
  if (special) {
    if (disponible < 100) return alert("No tienes suficientes Pokecoins.");
    
    // RESTAR del ahorro visual (opcional según tu lógica) y SUMAR al gasto del mes
    inventory.economy.spent += 100; 
  }

  // 5. Descontar el huevo e introducir cambios en la BD
  inventory.items.egg--;
  
  await bd.from("trainer_inventory").update({ inventory }).eq("user_id", user.id);

  // 6. Resto de la lógica de creación de la incubación
  const hatchDate = calculateHatchDate(selectedType, special);
  const finalPool = (selectedType === "baby") ? [...selectedPokemon] : [...selectedPokemon, ...tempJohtoSelection];

  const { data: newInc, error } = await bd.from("trainer_incubations").insert({
    user_id: user.id,
    egg_type: selectedType,
    selected_pokemon: finalPool,
    start_date: new Date(),
    hatch_date: hatchDate,
    special_incubator: special,
    hatched: false
  }).select().single();

  if (error) return console.error("Error al incubar:", error);

  activeIncubations.push(newInc);
  renderIncubations();
  
  // Resetear interfaz
  selectedPokemon = [];
  tempJohtoSelection = [];
  updateCounter();
  updateIncubateButton();
  document.getElementById("modal-summary").classList.add("hidden");
}

// ===============================
// RENDERIZADO INCUBADORAS
// ===============================

async function loadIncubations() {
  const { data } = await bd.from("trainer_incubations").select("*").eq("user_id", user.id).eq("hatched", false);
  activeIncubations = data || [];
  renderIncubations();
}

async function renderIncubations() {
  const container = document.getElementById("incubator-container");
  if (activeIncubations.length === 0) {
    container.innerHTML = `<div class="detail-empty"><p>No hay huevos incubándose...</p></div>`;
    return;
  }

  const cardsHtml = await Promise.all(activeIncubations.map(async inc => {
    const isReady = new Date(inc.hatch_date) <= new Date();
    const MAX_VISIBLES = 6;
    const totalPkm = inc.selected_pokemon.length;
    
    const pkmParaMostrar = totalPkm > MAX_VISIBLES 
        ? inc.selected_pokemon.slice(0, MAX_VISIBLES - 1) 
        : inc.selected_pokemon;

    const pokemonSprites = await Promise.all(
      pkmParaMostrar.map(async p => {
        const url = await getPokemonSprite(p);
        return `<div class="mini-sprite-box"><img src="${url}" class="mini-sprite" title="${p}"></div>`;
      })
    );

    if (totalPkm > MAX_VISIBLES) {
        const resto = totalPkm - (MAX_VISIBLES - 1);
        pokemonSprites.push(`
            <div class="mini-sprite-box extra-count-box" title="Y otros ${resto} más...">
                <span>+${resto}</span>
            </div>
        `);
    }

    return `
      <div class="incubator-card-advanced ${isReady ? "ready" : ""}" ${isReady ? `onclick="hatchIncubation('${inc.id}')"` : ""}>
        <div class="inc-card-header">
          <div class="meta-info">
            <span class="inc-type">${formatEggType(inc.egg_type)}</span>
            <span class="inc-date">${new Date(inc.hatch_date).toLocaleDateString("es-ES")}</span>
          </div>
          <span class="inc-status-icon">
            ${isReady ? "✅" : "⏳"}
            ${inc.special_incubator ? '<span class="special-icon" style="color: #facc15; font-weight: bold; margin-left: 2px;">⚡</span>' : ''}
          </span>
        </div>
        <div class="inc-card-content">
          <div class="inc-card-left">
            <div class="egg-visual-container">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mystery-egg.png" class="mystery-egg" />
            </div>
          </div>
          <div class="inc-card-right">${pokemonSprites.join("")}</div>
        </div>
      </div>`;
  }));

  container.innerHTML = cardsHtml.join("");
}

// ===============================
// ECLOSIÓN Y HELPERS
// ===============================

async function hatchIncubation(id) {
  const inc = activeIncubations.find(i => i.id === id);
  let winner;

  if (inc.egg_type === "baby") {
    winner = inc.selected_pokemon[Math.floor(Math.random() * inc.selected_pokemon.length)];
  } else {
    const hoenn = inc.selected_pokemon.filter(p => REGION_MAP[p] === "hoenn");
    const johto = inc.selected_pokemon.filter(p => REGION_MAP[p] === "johto");
    winner = (Math.random() < 0.8 && hoenn.length > 0) ? hoenn[Math.floor(Math.random()*hoenn.length)] : johto[Math.floor(Math.random()*johto.length)];
  }

  const shiny = Math.random() < 0.10;
  await bd.from("trainer_incubations").update({ hatched: true, shiny, result_pokemon: winner }).eq("id", id);
  await loadIncubations();
  startHatchAnimation(winner, shiny);
}

async function getPokemonSprite(name, shiny = false) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name.toLowerCase().replace(" ", "-")}`);
    const data = await res.json();
    return shiny ? data.sprites.front_shiny : data.sprites.front_default;
  } catch { return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mystery-egg.png"; }
}

async function startHatchAnimation(p, s) {
  const modal = document.getElementById("modal-hatch");
  modal.classList.remove("hidden");
  document.getElementById("modal-hatch-footer").style.display = "none";
  document.getElementById("hatch-status").textContent = "¡El huevo se está moviendo!";
  
  const sprite = await getPokemonSprite(p, s);
  setTimeout(() => {
    document.getElementById("hatch-animation-area").innerHTML = `<img src="${sprite}" class="pokeapi-sprite hatch-flash ${s ? 'shiny-glow' : ''}">`;
    document.getElementById("hatch-status").textContent = s ? `✨ ¡INCREÍBLE! Ha nacido un ${p} SHINY ✨. Puedes añadirlo a tu caja en nv.1, con género y personalidad a elegir.` : `¡Felicidades! Ha nacido un ${p}. Puedes añadirlo a tu caja en nv.1, con género y personalidad a elegir.`;
    document.getElementById("modal-hatch-footer").style.display = "flex";
  }, 2000);
}

function formatEggType(t) { return { comun: "Común", raro: "Raro", baby: "Baby" }[t] || t; }
function calculateHatchDate(t, s) { let d = INCUBATION_TIME[t]; if (s) d -= 7; const dt = new Date(); dt.setDate(dt.getDate() + d); return dt; }

async function loadHistory() {
  const { data } = await bd.from("trainer_incubations").select("*").eq("user_id", user.id).eq("hatched", true).order("hatch_date", { ascending: false });
  const body = document.getElementById("history-body");
  body.innerHTML = (data || []).map(row => `<tr><td>${new Date(row.hatch_date).toLocaleDateString("es-ES")}</td><td>${formatEggType(row.egg_type)}</td><td>${row.result_pokemon}</td><td>${row.shiny ? "✨ Sí" : "No"}</td></tr>`).join("");
}

function initHamburgerMenu() {
  const b = document.getElementById("btn-menu");
  const m = document.getElementById("side-menu");
  if(b) b.onclick = () => m.classList.remove("hidden");
  const cb = document.getElementById("btn-close-menu");
  if(cb) cb.onclick = () => m.classList.add("hidden");
}

// Globales para HTML
window.toggleSelection = toggleSelection;
window.closeSummaryModal = () => document.getElementById("modal-summary").classList.add("hidden");
window.confirmIncubationFromModal = confirmIncubationFromModal;
window.hatchIncubation = hatchIncubation;
window.closeHatchModal = () => document.getElementById("modal-hatch").classList.add("hidden");