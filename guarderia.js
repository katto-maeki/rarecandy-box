// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================

const bd = window.supabaseClient;

let user = null;
let selectedPokemon = []; 
let selectedType = "comun";
let activeIncubations = [];

const EGG_DATA = {
  comun: {
    label: "Huevo Común",
    pool: ["Caterpie","Weedle","Pidgey","Rattata","Spearow","Ekans","Sandshrew","Nidoran♀","Nidoran♂","Vulpix","Jigglypuff","Zubat","Oddish","Paras","Venonat","Diglett","Meowth","Psyduck","Mankey","Poliwag","Machop","Bellsprout","Tentacool","Geodude","Ponyta","Slowpoke","Magnemite","Doduo","Seel","Grimer","Shellder","Drowzee","Krabby","Voltorb","Exeggcute","Cubone","Koffing","Rhyhorn","Horsea","Goldeen","Staryu","Magikarp","Sentret","Hoothoot","Ledyba","Spinarak","Chinchou","Natu","Mareep","Hoppip","Sunkern","Wooper","Pineco","Snubbull","Teddiursa","Slugma","Swinub","Remoraid","Phanpy"]
  },
  raro: {
    label: "Huevo Raro",
    pool: ["Bulbasaur","Charmander","Squirtle","Growlithe","Abra","Farfetch'd","Gastly","Tangela","Kangaskhan","Scyther","Pinsir","Tauros","Lapras","Eevee","Porygon","Dratini","Chikorita","Cyndaquil","Totodile","Aipom","Yanma","Murkrow","Misdreavus","Girafarig","Dunsparce","Gligar","Qwilfish","Shuckle","Heracross","Sneasel","Corsola","Delibird","Skarmory","Houndour","Stantler","Smeargle","Miltank","Larvitar"]
  },
  baby: {
    label: "Huevo Baby",
    pool: ["Azurill","Wynaut","Pichu","Cleffa","Igglybuff","Togepi","Tyrogue","Smoochum","Elekid","Magby","Budew","Chingling","Bonsly","Mime Jr.","Happiny","Munchlax", "Riolu", "Mantyke", "Toxel"]
  }
};

const REGION_MAP = {
  /* KANTO */
  Caterpie: "kanto", Weedle: "kanto", Pidgey: "kanto", Rattata: "kanto", Spearow: "kanto", Ekans: "kanto",
  Sandshrew: "kanto", "Nidoran♀": "kanto", "Nidoran♂": "kanto", Vulpix: "kanto", Jigglypuff: "kanto", Zubat: "kanto",
  Oddish: "kanto", Paras: "kanto", Venonat: "kanto", Diglett: "kanto", Meowth: "kanto", Psyduck: "kanto",
  Mankey: "kanto", Poliwag: "kanto", Machop: "kanto", Bellsprout: "kanto", Tentacool: "kanto", Geodude: "kanto",
  Ponyta: "kanto", Slowpoke: "kanto", Magnemite: "kanto", Doduo: "kanto", Seel: "kanto", Grimer: "kanto",
  Shellder: "kanto", Drowzee: "kanto", Krabby: "kanto", Voltorb: "kanto", Exeggcute: "kanto", Cubone: "kanto",
  Koffing: "kanto", Rhyhorn: "kanto", Horsea: "kanto", Goldeen: "kanto", Staryu: "kanto", Magikarp: "kanto",
  Bulbasaur: "kanto", Charmander: "kanto", Squirtle: "kanto", Growlithe: "kanto", Abra: "kanto", "Farfetch'd": "kanto",
  Gastly: "kanto", Tangela: "kanto", Kangaskhan: "kanto", Scyther: "kanto", Pinsir: "kanto", Tauros: "kanto",
  Lapras: "kanto", Eevee: "kanto", Porygon: "kanto", Dratini: "kanto",

  /* JOHTO */
  Sentret: "johto", Hoothoot: "johto", Ledyba: "johto", Spinarak: "johto", Chinchou: "johto", Natu: "johto",
  Mareep: "johto", Hoppip: "johto", Sunkern: "johto", Wooper: "johto", Pineco: "johto", Snubbull: "johto",
  Teddiursa: "johto", Slugma: "johto", Swinub: "johto", Remoraid: "johto", Phanpy: "johto",
  Chikorita: "johto", Cyndaquil: "johto", Totodile: "johto", Aipom: "johto", Yanma: "johto", Murkrow: "johto",
  Misdreavus: "johto", Girafarig: "johto", Dunsparce: "johto", Gligar: "johto", Qwilfish: "johto", Shuckle: "johto",
  Heracross: "johto", Sneasel: "johto", Corsola: "johto", Delibird: "johto", Skarmory: "johto", Houndour: "johto",
  Stantler: "johto", Smeargle: "johto", Miltank: "johto", Larvitar: "johto"
};

const INCUBATION_TIME = { comun: 7, raro: 21, baby: 28 };

// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  const loggedUser = await initProtectedPage();
  if (!loggedUser) return;
  user = loggedUser;

  await renderTrainerLabelFromGame();
  initHamburgerMenu();

  await loadIncubations();
  setupEggTabs();
  setupViewTabs();

  const specialCheckbox = document.getElementById("special-incubator");
  if (specialCheckbox) {
    specialCheckbox.addEventListener("change", function() {
      const iconContainer = document.getElementById("special-icon-summary");
      const dateDisplay = document.getElementById("summary-date");

      if (this.checked) {
        if (iconContainer) iconContainer.innerHTML = " ⚡";
        const newDate = calculateHatchDate(selectedType, true);
        if (dateDisplay) dateDisplay.textContent = `${newDate.toLocaleDateString("es-ES")} a las ${newDate.toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}`;
      } else {
        if (iconContainer) iconContainer.innerHTML = "";
        const originalDate = calculateHatchDate(selectedType, false);
        if (dateDisplay) dateDisplay.textContent = `${originalDate.toLocaleDateString("es-ES")} a las ${originalDate.toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}`;
      }
    });
  }

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
    : pool.filter(p => REGION_MAP[p] === "kanto");

  container.innerHTML = poolToShow.map(p => {
    const isBaby = (type === "baby");
    const isSelected = selectedPokemon.includes(p);
    
    // Si es tipo baby, removemos el evento click y forzamos estilos de bloqueo visual
    const clickHandler = isBaby ? "" : `onclick="toggleSelection('${p}')"`;
    const disableStyles = isBaby ? 'style="pointer-events: none; cursor: not-allowed; opacity: 0.9;"' : '';

    return `
      <div class="pool-item ${isSelected ? "selected" : ""}" ${clickHandler} ${disableStyles}>
        ${p}
      </div>
    `;
  }).join("");
}

function toggleSelection(name) {
  // Cláusula de seguridad: Si es tipo baby, no permitimos ninguna mutación manual
  if (selectedType === "baby") return;

  if (selectedPokemon.includes(name)) {
    selectedPokemon = selectedPokemon.filter(p => p !== name);
  } else if (selectedPokemon.length < 4) {
    selectedPokemon.push(name);
  }
  
  renderPool(selectedType);
  updateCounter();
  updateIncubateButton();
}

function updateCounter() {
  const isBaby = (selectedType === "baby");
  const countEl = document.getElementById("selection-count");
  
  if (countEl) {
    countEl.textContent = isBaby ? "Todos" : `${selectedPokemon.length} / 4`;
  }
  
  const title = document.querySelector(".pool-info-section .column-title");
  if (title) {
    title.textContent = isBaby
      ? "Pokémon Baby (Todos incluidos)"
      : "Selecciona 4 Pokémon de Kanto";
  }

  const notice = document.getElementById("johto-notice");
  if (notice) {
    notice.style.display = isBaby ? "none" : "block";
  }
}

function updateIncubateButton() {
  const isBaby = (selectedType === "baby");
  const canIncubate = isBaby 
    ? selectedPokemon.length === EGG_DATA.baby.pool.length 
    : selectedPokemon.length === 4;

  const btn = document.getElementById("btn-incubar");
  if (btn) btn.disabled = !canIncubate;
}

// ===============================
// MODAL Y LÓGICA DE JUEGO
// ===============================

document.getElementById("btn-incubar").onclick = openSummaryModal;

function openSummaryModal() {
  // Nota: los 2 Pokémon de Johto se sortean recién al confirmar (no aquí), para que
  // no se puedan "rerolear" abriendo y cerrando este modal hasta ver un resultado deseado.
  const fullPreview = [...selectedPokemon];

  const specialContainer = document.getElementById("container-special-incubator");
  const specialCheckbox = document.getElementById("special-incubator");
  const specialIconContainer = document.getElementById("special-icon-summary");

  if (specialCheckbox) specialCheckbox.checked = false;
  if (specialIconContainer) specialIconContainer.innerHTML = "";

  if (selectedType === "comun") {
    if (specialContainer) specialContainer.style.display = "none";
  } else {
    if (specialContainer) specialContainer.style.display = "block";
  }

  document.getElementById("summary-type").textContent = EGG_DATA[selectedType].label;
  document.getElementById("summary-time").textContent = `${INCUBATION_TIME[selectedType]} días`;
  
  const hatchDate = calculateHatchDate(selectedType, false);
  document.getElementById("summary-date").textContent = `${hatchDate.toLocaleDateString("es-ES")} a las ${hatchDate.toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}`;

  const list = document.getElementById("summary-pokemon");
  list.innerHTML = fullPreview.map(p => `<li>${p}</li>`).join("");
  if (selectedType !== "baby") {
    list.innerHTML += `<li><small style="color: #6366f1;">+2 Pokémon al azar de Johto</small></li>`;
  }

  document.getElementById("modal-summary").classList.remove("hidden");
}

function getRandomJohto(type, count = 2) {
  const pool = EGG_DATA[type].pool;
  const johtoPool = pool.filter(p => REGION_MAP[p] === "johto");
  return [...johtoPool].sort(() => 0.5 - Math.random()).slice(0, count);
}

async function confirmIncubationFromModal() {
  if (activeIncubations.length >= 2) return alert("Solo puedes tener 2 incubadoras activas.");
  
  let special = document.getElementById("special-incubator").checked;
  if (selectedType === "comun") {
    special = false; 
  }

  const { data } = await bd.from("trainer_inventory").select("inventory").eq("user_id", user.id).single();
  const inventory = data.inventory;

  if (inventory.items.egg <= 0) return alert("No tienes huevos disponibles.");
  
  const disponible = (inventory.economy.savings + inventory.economy.biIncome) - inventory.economy.spent;

  if (special) {
    if (disponible < 100) return alert("No tienes suficientes Pokecoins.");
    inventory.economy.spent += 100; 
  }

  inventory.items.egg--;
  await bd.from("trainer_inventory").update({ inventory }).eq("user_id", user.id);

  const hatchDate = calculateHatchDate(selectedType, special);
  const johtoPicks = (selectedType === "baby") ? [] : getRandomJohto(selectedType, 2);
  const finalPool = [...selectedPokemon, ...johtoPicks];

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

  const eggLabel = selectedType === "comun" ? "Huevo Común" : selectedType === "raro" ? "Huevo Raro" : "Huevo Baby";
  
  await bd.from("trainer_log").insert({
    user_id: user.id,
    activity_type: "incubation",
    activity_name: eggLabel,
    money_reward: special ? -100 : 0,
    xp_reward: 0
  });

  activeIncubations.push(newInc);
  renderIncubations();
  
  selectedPokemon = [];
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
    const now = new Date();
    const hatchTime = new Date(inc.hatch_date);
    const isReady = hatchTime <= now;

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

    const displayDate = hatchTime.toLocaleDateString("es-ES");
    const displayTime = hatchTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    return `
      <div class="incubator-card-advanced ${isReady ? "ready" : ""}" ${isReady ? `onclick="hatchIncubation('${inc.id}')"` : ""}>
        <div class="inc-card-header">
          <div class="meta-info">
            <span class="inc-type">${formatEggType(inc.egg_type)}</span>
            <span class="inc-date">${displayDate} a las ${displayTime}</span>
          </div>
          <span class="inc-status-icon">
            ${isReady ? "✅" : "⏳"}
            ${inc.special_incubator ? '<span class="special-icon" style="color: #facc15; font-weight: bold; margin-left: 2px;">⚡</span>' : ''}
          </span>
        </div>
        <div class="inc-card-content">
          <div class="inc-card-left">
            <div class="egg-visual-container">
              <img src="${window.MYSTERY_EGG_SPRITE}" class="mystery-egg" />
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

const HATCH_BOX_SIZE = 32;

const HATCH_NATURES = [
  "Fuerte", "Huraño", "Valiente", "Firme", "Travieso", "Osado", "Dócil",
  "Relajado", "Agitado", "Flojo", "Miedoso", "Serio", "Alegre", "Ingenuo",
  "Modesto", "Afable", "Manso", "Alocado", "Excéntrico", "Sereno", "Amable",
  "Descarado", "Cauto", "Tímido", "Impaciente"
];

const HATCH_TYPE_MAP_ES = {
  normal: "normal", fire: "fuego", water: "agua", grass: "planta",
  electric: "eléctrico", ice: "hielo", fighting: "lucha", poison: "veneno",
  ground: "tierra", flying: "volador", psychic: "psíquico", bug: "bicho",
  rock: "roca", ghost: "fantasma", dragon: "dragón", dark: "siniestro",
  steel: "acero", fairy: "hada",
};

async function fetchHatchedPokemonBasic(name) {
  const slug = name.toLowerCase().replace(" ", "-").replace(".", "");
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
  if (!res.ok) throw new Error("No se encontró en PokeAPI: " + name);
  const data = await res.json();
  return {
    id: data.id,
    numero: "#" + String(data.id).padStart(3, "0"),
    tipos: data.types.map((t) => HATCH_TYPE_MAP_ES[t.type.name] || t.type.name),
    spriteNormal: data.sprites?.other?.home?.front_default || data.sprites?.front_default || "",
    spriteShiny: data.sprites?.other?.home?.front_shiny || data.sprites?.front_shiny || "",
  };
}

// Añade el pokémon eclosionado directamente a la caja del entrenador (nv.1,
// género y personalidad al azar, como en los juegos). El usuario puede
// ajustar la personalidad y el género después desde "Editar" en su caja.
async function addHatchedPokemonToBox(speciesName, isShiny) {
  const basic = await fetchHatchedPokemonBasic(speciesName);
  const clase = typeof getPokemonClass === "function" ? getPokemonClass(speciesName) : "Común";
  const personalidad = HATCH_NATURES[Math.floor(Math.random() * HATCH_NATURES.length)];
  const gender = Math.random() < 0.5 ? "Macho" : "Hembra";

  const newPoke = {
    id: basic.id,
    numero: basic.numero,
    nombre: speciesName,
    tipos: basic.tipos,
    sprite: isShiny ? basic.spriteShiny : basic.spriteNormal,
    apodo: "",
    nivel: 1,
    personalidad,
    clase,
    capturadoComo: speciesName,
    isShiny: !!isShiny,
    gender,
    storedXP: 0,
    notes: "",
    activity: "huevo",
    pokeball: null,
    registrationDate: new Date().toISOString(),
  };

  const { data, error } = await bd.from("user_game_data").select("box_data, party_data").eq("id", user.id).maybeSingle();
  if (error) throw error;

  const boxData = data?.box_data;
  const boxes = Array.isArray(boxData?.boxes)
    ? boxData.boxes.map((b) => (Array.isArray(b) ? b.slice() : new Array(HATCH_BOX_SIZE).fill(null)))
    : [new Array(HATCH_BOX_SIZE).fill(null)];
  const boxNames = Array.isArray(boxData?.boxNames) ? boxData.boxNames.slice() : [];
  while (boxNames.length < boxes.length) boxNames.push(null);
  const currentBoxIndex = typeof boxData?.currentBoxIndex === "number" ? boxData.currentBoxIndex : 0;
  const partyData = Array.isArray(data?.party_data) ? data.party_data : new Array(6).fill(null);

  let placed = false;
  for (const box of boxes) {
    const idx = box.findIndex((slot) => slot === null);
    if (idx !== -1) {
      box[idx] = newPoke;
      placed = true;
      break;
    }
  }
  if (!placed) {
    const newBox = new Array(HATCH_BOX_SIZE).fill(null);
    newBox[0] = newPoke;
    boxes.push(newBox);
    boxNames.push(null);
  }

  const { error: upsertError } = await bd.from("user_game_data").upsert(
    { id: user.id, box_data: { boxes, boxNames, currentBoxIndex }, party_data: partyData },
    { onConflict: "id" }
  );
  if (upsertError) throw upsertError;

  await bd.from("trainer_log").insert({
    user_id: user.id,
    activity_type: "box_add",
    activity_name: `${newPoke.nombre} (Eclosión)`,
    money_reward: 0,
    xp_reward: 0,
  });

  return newPoke;
}

async function hatchIncubation(id) {
  const inc = activeIncubations.find(i => i.id === id);
  let winner;

  if (inc.egg_type === "baby") {
    winner = inc.selected_pokemon[Math.floor(Math.random() * inc.selected_pokemon.length)];
  } else {
    const kanto = inc.selected_pokemon.filter(p => REGION_MAP[p] === "kanto");
    const johto = inc.selected_pokemon.filter(p => REGION_MAP[p] === "johto");
    winner = (Math.random() < 0.8 && kanto.length > 0) ? kanto[Math.floor(Math.random() * kanto.length)] : johto[Math.floor(Math.random() * johto.length)];
  }

  const shiny = Math.random() < 0.10;
  await bd.from("trainer_incubations").update({ hatched: true, shiny, result_pokemon: winner }).eq("id", id);
  await loadIncubations();

  let addedPoke = null;
  try {
    addedPoke = await addHatchedPokemonToBox(winner, shiny);
  } catch (e) {
    console.error("Error al añadir automáticamente el Pokémon eclosionado a la caja:", e);
  }

  startHatchAnimation(winner, shiny, addedPoke);
}

// Cache en memoria por especie: evita volver a golpear PokeAPI para el mismo
// pokémon cada vez que se re-renderizan las incubadoras (tabs, refrescos, etc).
const speciesSpriteCache = new Map();

async function getPokemonSprite(name, shiny = false) {
  const key = name.toLowerCase();
  try {
    let sprites = speciesSpriteCache.get(key);
    if (!sprites) {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${key.replace(" ", "-").replace(".", "")}`);
      const data = await res.json();
      sprites = { front_default: data.sprites.front_default, front_shiny: data.sprites.front_shiny };
      speciesSpriteCache.set(key, sprites);
    }
    const raw = shiny ? sprites.front_shiny : sprites.front_default;
    return window.toCdnSpriteUrl(raw, window.MYSTERY_EGG_SPRITE);
  } catch { return window.MYSTERY_EGG_SPRITE; }
}

async function startHatchAnimation(p, s, addedPoke) {
  const modal = document.getElementById("modal-hatch");
  modal.classList.remove("hidden");
  document.getElementById("modal-hatch-footer").style.display = "none";
  document.getElementById("hatch-status").textContent = "¡El huevo se está moviendo!";

  const sprite = await getPokemonSprite(p, s);
  setTimeout(() => {
    document.getElementById("hatch-animation-area").innerHTML = `<img src="${sprite}" class="pokeapi-sprite hatch-flash ${s ? 'shiny-glow' : ''}">`;

    const intro = s ? `✨ ¡INCREÍBLE! Ha nacido un ${p} SHINY ✨.` : `¡Felicidades! Ha nacido un ${p}.`;
    const outro = addedPoke
      ? ` Se añadió automáticamente a tu caja en nv.1, con género ${addedPoke.gender} y personalidad ${addedPoke.personalidad} al azar (puedes cambiarlos luego en "Editar").`
      : ` No se pudo añadir automáticamente a tu caja; añádelo manualmente en nv.1, con género y personalidad a elegir.`;

    document.getElementById("hatch-status").textContent = intro + outro;
    document.getElementById("modal-hatch-footer").style.display = "flex";
  }, 2000);
}

function formatEggType(t) { return { comun: "Común", raro: "Raro", baby: "Baby" }[t] || t; }

function calculateHatchDate(t, s) { 
  let d = INCUBATION_TIME[t]; 
  if (s) d -= 7; 
  const dt = new Date(); 
  dt.setDate(dt.getDate() + d); 
  return dt; 
}

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
  if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

// Globales para HTML
window.toggleSelection = toggleSelection;
window.closeSummaryModal = () => document.getElementById("modal-summary").classList.add("hidden");
window.confirmIncubationFromModal = confirmIncubationFromModal;
window.hatchIncubation = hatchIncubation;
window.closeHatchModal = () => document.getElementById("modal-hatch").classList.add("hidden");