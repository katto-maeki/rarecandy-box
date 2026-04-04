// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================

const bd = window.supabaseClient;

let user = null;
let selectedPokemon = [];
let selectedType = "comun";
let activeIncubations = [];

const EGG_DATA = {
  comun: { label: "Huevo Común", pool: ["Poochyena","Zigzagoon","Wurmple","Lotad","Seedot","Taillow","Wingull","Surskit","Shroomish","Nincada","Whismur","Makuhita","Nosepass","Skitty","Aron","Meditite","Electrike","Gulpin","Carvanha","Wailmer","Numel","Spoink","Cacnea","Barboach","Corphish","Baltoy","Shuppet","Duskull","Snorunt","Spheal","Luvdisc","Sentret","Hoothoot","Ledyba","Spinarak","Chinchou","Natu","Mareep","Marill","Hoppip","Sunkern","Wooper","Pineco","Snubbull","Teddiursa","Slugma","Swinub","Remoraid","Phanpy"] },
  raro: { label: "Huevo Raro", pool: ["Treecko","Torchic","Mudkip","Ralts","Slakoth","Sableye","Mawile","Plusle","Minun","Volbeat","Illumise","Roselia","Torkoal","Spinda","Trapinch","Swablu","Zangoose","Seviper","Lunatone","Solrock","Lileep","Anorith","Feebas","Castform","Kecleon","Tropius","Chimecho","Absol","Clamperl","Relicanth","Bagon","Beldum","Chikorita","Cyndaquil","Totodile","Sudowoodo","Aipom","Yanma","Murkrow","Misdreavus","Unown","Girafarig","Dunsparce","Gligar","Qwilfish","Shuckle","Heracross","Sneasel","Corsola","Delibird","Skarmory","Houndour","Stantler","Smeargle","Miltank","Larvitar"] },
  baby: { label: "Huevo Baby", pool: ["Azurill","Wynaut","Pichu","Cleffa","Igglybuff","Togepi","Tyrogue","Smoochum","Elekid","Magby"] }
};

/* ================================
   MAPA DE REGIONES
   ================================ */

const REGION_MAP = {

  /* ===== HOENN ===== */

  // Raros
  Treecko: "hoenn",
  Torchic: "hoenn",
  Mudkip: "hoenn",
  Ralts: "hoenn",
  Slakoth: "hoenn",
  Sableye: "hoenn",
  Mawile: "hoenn",
  Plusle: "hoenn",
  Minun: "hoenn",
  Volbeat: "hoenn",
  Illumise: "hoenn",
  Roselia: "hoenn",
  Torkoal: "hoenn",
  Spinda: "hoenn",
  Trapinch: "hoenn",
  Swablu: "hoenn",
  Zangoose: "hoenn",
  Seviper: "hoenn",
  Lunatone: "hoenn",
  Solrock: "hoenn",
  Lileep: "hoenn",
  Anorith: "hoenn",
  Feebas: "hoenn",
  Castform: "hoenn",
  Kecleon: "hoenn",
  Tropius: "hoenn",
  Chimecho: "hoenn",
  Absol: "hoenn",
  Clamperl: "hoenn",
  Relicanth: "hoenn",
  Bagon: "hoenn",
  Beldum: "hoenn",

  // Comunes
  Poochyena: "hoenn",
  Zigzagoon: "hoenn",
  Wurmple: "hoenn",
  Lotad: "hoenn",
  Seedot: "hoenn",
  Taillow: "hoenn",
  Wingull: "hoenn",
  Surskit: "hoenn",
  Shroomish: "hoenn",
  Nincada: "hoenn",
  Whismur: "hoenn",
  Makuhita: "hoenn",
  Nosepass: "hoenn",
  Skitty: "hoenn",
  Aron: "hoenn",
  Meditite: "hoenn",
  Electrike: "hoenn",
  Gulpin: "hoenn",
  Carvanha: "hoenn",
  Wailmer: "hoenn",
  Numel: "hoenn",
  Spoink: "hoenn",
  Cacnea: "hoenn",
  Barboach: "hoenn",
  Corphish: "hoenn",
  Baltoy: "hoenn",
  Shuppet: "hoenn",
  Duskull: "hoenn",
  Snorunt: "hoenn",
  Spheal: "hoenn",
  Luvdisc: "hoenn",

  // Baby
  Azurill: "hoenn",
  Wynaut: "hoenn",

  /* ===== JOHTO ===== */

  // Raros
  Chikorita: "johto",
  Cyndaquil: "johto",
  Totodile: "johto",
  Sudowoodo: "johto",
  Aipom: "johto",
  Yanma: "johto",
  Murkrow: "johto",
  Misdreavus: "johto",
  Unown: "johto",
  Girafarig: "johto",
  Dunsparce: "johto",
  Gligar: "johto",
  Qwilfish: "johto",
  Shuckle: "johto",
  Heracross: "johto",
  Sneasel: "johto",
  Corsola: "johto",
  Delibird: "johto",
  Skarmory: "johto",
  Houndour: "johto",
  Stantler: "johto",
  Smeargle: "johto",
  Miltank: "johto",
  Larvitar: "johto",

  // Comunes
  Sentret: "johto",
  Hoothoot: "johto",
  Ledyba: "johto",
  Spinarak: "johto",
  Chinchou: "johto",
  Natu: "johto",
  Mareep: "johto",
  Marill: "johto",
  Hoppip: "johto",
  Sunkern: "johto",
  Wooper: "johto",
  Pineco: "johto",
  Snubbull: "johto",
  Teddiursa: "johto",
  Slugma: "johto",
  Swinub: "johto",
  Remoraid: "johto",
  Phanpy: "johto",

  // Baby
  Smoochum: "johto",
  Elekid: "johto",
  Magby: "johto",
  Tyrogue: "johto",
  Pichu: "johto",
  Cleffa: "johto",
  Igglybuff: "johto",
  Togepi: "johto"
};

function formatEggType(type) {
  const map = {
    comun: "Común",
    raro: "Raro",
    baby: "Baby"
  };
  return map[type] || type;
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
        btnLogoutSide.onclick = (e) => {
            e.preventDefault();
            window.supabaseClient.auth.signOut().then(() => {
                window.location.href = "index.html";
            });
        };
    }
}

/* ================================
   PROBABILIDAD REGIONAL 70/30
   ================================ */

function getWeightedWinner(selectedPokemon) {

  const hoenn = selectedPokemon.filter(p => REGION_MAP[p] === "hoenn");
  const johto = selectedPokemon.filter(p => REGION_MAP[p] === "johto");

  // 70% Hoenn / 30% Johto
  const regionRoll = Math.random();
  const chosenRegion = regionRoll < 0.8 ? "hoenn" : "johto";

  // Fallback automático
  if (chosenRegion === "hoenn" && hoenn.length === 0) {
    return randomFromArray(johto);
  }

  if (chosenRegion === "johto" && johto.length === 0) {
    return randomFromArray(hoenn);
  }

  return chosenRegion === "hoenn"
    ? randomFromArray(hoenn)
    : randomFromArray(johto);
}

/* ================================
   PROBABILIDAD SHINY 10%
   ================================ */

function isShiny() {
  return Math.random() < 0.10; // 10%
}

/* ================================
   OBTENER SPRITE DESDE POKEAPI
   ================================ */

async function getPokemonSprite(pokemonName, shiny = false) {
  try {
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`
    );

    if (!response.ok) {
      throw new Error("No se pudo obtener el Pokémon");
    }

    const data = await response.json();

    return shiny
      ? data.sprites.front_shiny
      : data.sprites.front_default;

  } catch (error) {
    console.error("Error cargando sprite:", error);
    return null;
  }
}

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const INCUBATION_TIME = {
  comun: 7,
  raro: 14,
  baby: 28
};

// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", async () => {

  // 🔐 Usar helper global correcto
  const loggedUser = await initProtectedPage();
  if (!loggedUser) return;

  user = loggedUser;

  // 👤 Renderizar nombre del entrenador
  await renderTrainerLabelFromGame();
   initHamburgerMenu();

  // 🔄 Inicializar vista
  await loadIncubations();
  setupTabs();
  renderPool(selectedType);
  updateCounter();
  updateIncubateButton();

  // ===============================
  // TABS INCUBADORA / HISTORIAL
  // ===============================

  const tabInc = document.getElementById("tab-incubadora");
  const tabHist = document.getElementById("tab-historial");

  if (tabInc && tabHist) {

    tabInc.addEventListener("click", () => {
      tabInc.classList.add("active");
      tabHist.classList.remove("active");

      document.getElementById("incubadora-view").classList.remove("hidden");
      document.getElementById("historial-view").classList.add("hidden");
    });

    tabHist.addEventListener("click", () => {
      tabHist.classList.add("active");
      tabInc.classList.remove("active");

      document.getElementById("historial-view").classList.remove("hidden");
      document.getElementById("incubadora-view").classList.add("hidden");

      loadHistory(); // 🔥 aquí se carga el historial
    });

  }

});

// ===============================
// TABS Y SELECCIÓN
// ===============================

function setupTabs() {
  document.querySelectorAll(".info-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".info-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedType = btn.dataset.type;
      selectedPokemon = [];
      renderPool(selectedType);
      updateCounter();
      updateIncubateButton();
    });
  });
}

function renderPool(type) {
  const container = document.getElementById("pool-display");
  const pool = EGG_DATA[type].pool;

  container.innerHTML = pool.map(p => `
    <div class="pool-item ${selectedPokemon.includes(p) ? "selected" : ""}" onclick="toggleSelection('${p}')">
      ${p}
    </div>
  `).join("");
}

function toggleSelection(name) {
  if (selectedPokemon.includes(name)) {
    selectedPokemon = selectedPokemon.filter(p => p !== name);
  } else {
    if (selectedPokemon.length < 6) {
      selectedPokemon.push(name);
    }
  }
  renderPool(selectedType);
  updateCounter();
  updateIncubateButton();
}

function updateCounter() {
  document.getElementById("selection-count").textContent = `${selectedPokemon.length} / 6`;
}

function updateIncubateButton() {
  document.getElementById("btn-incubar").disabled = selectedPokemon.length !== 6;
}

// ===============================
// MODAL DE RESUMEN
// ===============================

document.getElementById("btn-incubar").addEventListener("click", openSummaryModal);

function openSummaryModal() {
  document.getElementById("summary-type").textContent = EGG_DATA[selectedType].label;
  document.getElementById("summary-time").textContent = `${INCUBATION_TIME[selectedType]} días`;

  const hatchDate = calculateHatchDate(selectedType, false);
  document.getElementById("summary-date").textContent = hatchDate.toLocaleDateString("es-ES");

  const list = document.getElementById("summary-pokemon");
  list.innerHTML = selectedPokemon.map(p => `<li>${p}</li>`).join("");

  document.getElementById("modal-summary").classList.remove("hidden");
}

function closeSummaryModal() {
  document.getElementById("modal-summary").classList.add("hidden");
}

function calculateHatchDate(type, special) {
  let days = INCUBATION_TIME[type];
  if (special) days -= 7;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

// ===============================
// CONFIRMAR INCUBACIÓN
// ===============================

async function confirmIncubationFromModal() {
  if (activeIncubations.length >= 2) {
  alert("Solo puedes tener 2 incubadoras activas.");
  return;
}
  const special = document.getElementById("special-incubator").checked;

  const { data } = await bd
    .from("trainer_inventory")
    .select("inventory")
    .eq("user_id", user.id)
    .single();

  const inventory = data.inventory;

  if (inventory.items.egg <= 0) {
    alert("No tienes huevos disponibles.");
    return;
  }

  if (special && inventory.economy.savings < 100) {
    alert("No tienes suficientes Pokecoins.");
    return;
  }

  inventory.items.egg -= 1;
  if (special) inventory.economy.savings -= 100;

  await bd
    .from("trainer_inventory")
    .update({ inventory })
    .eq("user_id", user.id);

  const hatchDate = calculateHatchDate(selectedType, special);

  const { data: newInc } = await bd
    .from("trainer_incubations")
    .insert({
      user_id: user.id,
      egg_type: selectedType,
      selected_pokemon: selectedPokemon,
      start_date: new Date(),
      hatch_date: hatchDate,
      special_incubator: special,
      hatched: false
    })
    .select()
    .single();

  activeIncubations.push(newInc);
  renderIncubations();

  selectedPokemon = [];
  updateCounter();
  updateIncubateButton();
  closeSummaryModal();
}

// ===============================
// RENDER INCUBACIONES ACTIVAS
// ===============================

async function loadIncubations() {
  const { data } = await bd
    .from("trainer_incubations")
    .select("*")
    .eq("user_id", user.id)
    .eq("hatched", false);

  activeIncubations = data || [];
  renderIncubations();
}

// ===============================
// HISTORIAL
// ===============================

async function loadHistory() {
  const { data } = await bd
    .from("trainer_incubations")
    .select("*")
    .eq("user_id", user.id)
    .eq("hatched", true)
    .order("hatch_date", { ascending: false });

  const body = document.getElementById("history-body");

  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="4">No hay eclosiones aún.</td></tr>`;
    return;
  }

  body.innerHTML = data.map(row => `
    <tr>
      <td>${new Date(row.hatch_date).toLocaleDateString("es-ES")}</td>
      <td>${row.egg_type}</td>
      <td>${row.result_pokemon || "-"}</td>
      <td>${row.shiny ? "✨ Sí" : "No"}</td>
    </tr>
  `).join("");
}

async function renderIncubations() {
  const container = document.getElementById("incubator-container");

  if (activeIncubations.length === 0) {
    container.innerHTML = `
      <div class="detail-empty">
        <p>No hay huevos incubándose...</p>
      </div>`;
    return;
  }

  container.innerHTML = await Promise.all(
    activeIncubations.map(async inc => {

      const isReady = new Date(inc.hatch_date) <= new Date();

      const pokemonSprites = await Promise.all(
        inc.selected_pokemon.map(p =>
          getPokemonSprite(p).then(url =>
            `<img src="${url}" class="mini-sprite">`
          )
        )
      );

return `
  <div class="incubator-card-advanced ${isReady ? "ready" : ""}"
       ${isReady ? `onclick="hatchIncubation('${inc.id}')"` : ""}>

    <div class="inc-card-header">
      <div class="meta-info">
        <span class="inc-type">
          ${formatEggType(inc.egg_type)}
        </span>
        <span class="inc-date">
          ${new Date(inc.hatch_date).toLocaleDateString("es-ES")}
        </span>
      </div>

      <span class="inc-status-icon">
        ${isReady ? "✅" : "⏳"}
      </span>
    </div>

    <div class="inc-card-content">

      <div class="inc-card-left">
        <div class="egg-visual-container">
          <img 
  src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mystery-egg.png"
  class="mystery-egg"
/>
        </div>
      </div>

      <div class="inc-card-right">
      ${pokemonSprites.map(sprite => `
  <div class="mini-sprite-box">
    ${sprite}
  </div>
`).join("")}
      </div>

    </div>

  </div>
`;
    })
  ).then(cards => cards.join(""));
}

// ===============================
// ECLOSIÓN
// ===============================

async function hatchIncubation(id) {
  const incubation = activeIncubations.find(i => i.id === id);

  const winner = getWeightedWinner(incubation.selected_pokemon);
  const shiny = isShiny();

const { error } = await bd
  .from("trainer_incubations")
  .update({
    hatched: true,
    shiny: shiny,
    result_pokemon: winner
  })
  .eq("id", id);

if (error) {
  console.error("Error actualizando incubación:", error);
  alert("Error al guardar la eclosión.");
  return;
}

await loadIncubations();

  startHatchAnimation(winner, shiny);
}

// ===============================
// ANIMACIÓN DE ECLOSIÓN
// ===============================

async function startHatchAnimation(pokemon, shiny = false) {
  const modal = document.getElementById("modal-hatch");
  const display = document.getElementById("hatch-animation-area");
  const status = document.getElementById("hatch-status");
  const footer = document.getElementById("modal-hatch-footer");

  modal.classList.remove("hidden");
  footer.style.display = "none";

  display.innerHTML = `
  <img 
    src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mystery-egg.png"
    class="mystery-egg egg-shaking"
  />
`;
status.textContent = "¡El huevo se está moviendo!";

  setTimeout(async () => {

    status.textContent = "Descubriendo Pokémon...";

    const spriteUrl = await getPokemonSprite(pokemon, shiny);

    if (!spriteUrl) {
      status.textContent = "Error al cargar el Pokémon 😢";
      footer.style.display = "flex";
      return;
    }

    display.innerHTML = `
      <img src="${spriteUrl}"
           class="pokeapi-sprite hatch-flash ${shiny ? "shiny-glow" : ""}"
           alt="${pokemon}">
    `;

    status.textContent = shiny
      ? `✨ ¡INCREÍBLE! Ha nacido un ${pokemon} SHINY ✨. Puedes añadirlo a tu caja pokémon con género y personalidad a elegir, nivel 1.`
      : `¡Felicidades! Ha nacido un ${pokemon}. Puedes añadirlo a tu caja pokémon con género y personalidad a elegir, nivel 1.`;

    footer.style.display = "flex";

  }, 2000);
}

function closeHatchModal() {
  document.getElementById("modal-hatch").classList.add("hidden");
}
// Hacer funciones accesibles globalmente
window.toggleSelection = toggleSelection;
window.closeSummaryModal = closeSummaryModal;
window.confirmIncubationFromModal = confirmIncubationFromModal;
window.hatchIncubation = hatchIncubation;
window.closeHatchModal = closeHatchModal;

