// cajapkm.js - Versión Completa Corregida
// =============================
// Configuración y estado
// =============================
const STORAGE_KEY = "pokeBoxState_v1";
const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const TRAINER_META_KEY = "pokeTrainerMeta_v1";

let state = {
  party: new Array(6).fill(null),
  boxes: [new Array(30).fill(null)],
  currentBoxIndex: 0,
  selectedBoxSlotIndex: null,
  selectedPartyIndex: null,
  detailSource: null, 
};

let allPokemonList = null; 
let dragSourceIndex = null; 

// Variables para el entrenamiento
let currentTrainingPoke = null;
let currentInventory = null;

// =============================
// LÓGICA DE XP Y NIVELES
// =============================

// Calcula el nivel actual basándose en la XP TOTAL acumulada
function getLevelFromTotalXP(totalXP) {
    if (totalXP < 50) return Math.min(5, Math.floor(totalXP / 10) + 1);
    if (totalXP < 125) return 5 + Math.floor((totalXP - 50) / 15) + 1;
    if (totalXP < 225) return 10 + Math.floor((totalXP - 125) / 20) + 1;
    if (totalXP < 350) return 15 + Math.floor((totalXP - 225) / 25) + 1;
    if (totalXP < 700) return 20 + Math.floor((totalXP - 350) / 35) + 1;
    if (totalXP < 1150) return 30 + Math.floor((totalXP - 700) / 45) + 1;
    if (totalXP < 1700) return 40 + Math.floor((totalXP - 1150) / 55) + 1;
    // Nivel 51+ (Estimado a 100xp por nivel)
    return 50 + Math.floor((totalXP - 1700) / 100) + 1;
}

// Calcula cuánta XP total se necesita para alcanzar el INICIO de un nivel
function getTotalXpForLevel(level) {
    if (level <= 1) return 0;
    if (level <= 5) return (level - 1) * 10;
    if (level <= 10) return 50 + (level - 6) * 15;
    if (level <= 15) return 125 + (level - 11) * 20;
    if (level <= 20) return 225 + (level - 16) * 25;
    if (level <= 30) return 350 + (level - 21) * 35;
    if (level <= 40) return 700 + (level - 31) * 45;
    if (level <= 50) return 1150 + (level - 41) * 55;
    return 1700 + (level - 51) * 100;
}

// Nivel objetivo para evolucionar
function getTargetLevelByClass(clase, stage) {
  const c = (clase || "Común").toLowerCase();
  if (c.includes("baby")) return 12;
  if (c.includes("raro")) return stage === 1 ? 19 : 38;
  if (c.includes("especial")) return stage === 1 ? 21 : 42;
  return stage === 1 ? 16 : 32; // Común
}

// =============================
// Persistencia
// =============================
async function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.error(e); }

  const supabase = window.supabaseClient;
  const userId = window.currentUserId;

  if (supabase && userId) {
      const payload = {
        id: userId,
        box_data: { boxes: state.boxes, currentBoxIndex: state.currentBoxIndex },
        party_data: state.party,
      };
      return supabase.from("user_game_data").upsert(payload, { onConflict: "id" });
  }
}

async function saveGameData() {
    const p1 = saveState(); 
    const supabase = window.supabaseClient;
    const userId = window.currentUserId;
    let p2 = Promise.resolve();
    
    if (supabase && userId && currentInventory) {
        p2 = supabase.from("trainer_inventory").update({ inventory: currentInventory }).eq("user_id", userId);
    }
    await Promise.all([p1, p2]);
}

async function loadState() {
  const supabase = window.supabaseClient;
  const userId = window.currentUserId;
  let loadedFromSupabase = false;

  if (supabase && userId) {
    try {
      const { data, error } = await supabase.from("user_game_data").select("box_data, party_data").eq("id", userId);
      if (error) console.error(error);
      else if (data && data.length > 0) {
        const row = data[0];
        if (Array.isArray(row.party_data)) state.party = row.party_data;
        if (row.box_data && Array.isArray(row.box_data.boxes)) {
          state.boxes = row.box_data.boxes;
          if (typeof row.box_data.currentBoxIndex === "number") state.currentBoxIndex = row.box_data.currentBoxIndex;
        }
        loadedFromSupabase = true;
      } else {
        // Crear fila inicial
        const initialRow = { id: userId, box_data: { boxes: state.boxes, currentBoxIndex: 0 }, party_data: state.party };
        await supabase.from("user_game_data").insert(initialRow);
        loadedFromSupabase = true;
      }
    } catch (e) { console.error(e); }
  }

  if (!loadedFromSupabase) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.party) && Array.isArray(parsed.boxes)) state = parsed;
      }
    } catch (e) { console.error(e); }
  }

  // Estructura mínima garantizada
  if (!Array.isArray(state.party) || state.party.length !== 6) state.party = new Array(6).fill(null);
  if (!Array.isArray(state.boxes) || state.boxes.length === 0) state.boxes = [new Array(30).fill(null)];
  else {
    state.boxes = state.boxes.map((box) => {
      const arr = Array.isArray(box) ? box.slice(0, 30) : [];
      while (arr.length < 30) arr.push(null);
      return arr;
    });
  }
}

// =============================
// API & Helpers
// =============================
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const TYPE_MAP_ES = {
  normal: "normal", fire: "fuego", water: "agua", grass: "planta",
  electric: "eléctrico", ice: "hielo", fighting: "lucha", poison: "veneno",
  ground: "tierra", flying: "volador", psychic: "psíquico", bug: "bicho",
  rock: "roca", ghost: "fantasma", dragon: "dragón", dark: "siniestro",
  steel: "acero", fairy: "hada",
};

function translateType(typeName) { return TYPE_MAP_ES[typeName] || typeName; }

async function fetchPokemonList() {
  if (allPokemonList) return allPokemonList;
  const res = await fetch(`${POKEAPI_BASE}/pokemon?limit=100000&offset=0`);
  const data = await res.json();
  allPokemonList = data.results;
  return allPokemonList;
}

async function fetchPokemonByNameOrId(value) {
  const v = value.toString().trim().toLowerCase();
  if (!v) throw new Error("Nombre vacío");
  
  const res = await fetch(`${POKEAPI_BASE}/pokemon/${v}`);
  if (!res.ok) throw new Error("Pokémon no encontrado");
  
  const data = await res.json();
  return {
    id: data.id,
    numero: "#" + String(data.id).padStart(3, "0"),
    nombre: capitalize(data.name),
    tipos: data.types.map((t) => translateType(t.type.name)),
    spriteNormal: data.sprites?.other?.home?.front_default || data.sprites?.front_default || "",
    spriteShiny: data.sprites?.other?.home?.front_shiny || data.sprites?.front_shiny || ""
  };
}

// =============================
// Evoluciones (Lógica Regional)
// =============================
function parseSpeciesIdFromUrl(url) {
  const parts = url.split("/").filter(Boolean);
  return parseInt(parts[parts.length - 1], 10);
}

function getRegionSuffix(name) {
  const m = String(name).toLowerCase().match(/-(alola|galar|hisui|paldea)/);
  return m ? m[0] : null; 
}

function findEvolutionNode(chainNode, targetName) {
  if (!chainNode) return null;
  if (chainNode.species?.name === targetName) return chainNode;
  if (Array.isArray(chainNode.evolves_to)) {
    for (const next of chainNode.evolves_to) {
      const found = findEvolutionNode(next, targetName);
      if (found) return found;
    }
  }
  return null;
}

async function getEvolutionOptions(pokemonId, pokemonName) {
  try {
    const resPokemon = await fetch(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
    if (!resPokemon.ok) return [];
    const pokemonData = await resPokemon.json();
    
    const currentRegionSuffix = getRegionSuffix(pokemonData.name); 

    const speciesUrl = pokemonData.species.url;
    const resSpecies = await fetch(speciesUrl);
    if (!resSpecies.ok) return [];
    const speciesData = await resSpecies.json();

    const evoUrl = speciesData.evolution_chain?.url;
    if (!evoUrl) return [];
    const resChain = await fetch(evoUrl);
    if (!resChain.ok) return [];
    const chainData = await resChain.json();

    const root = chainData.chain;
    const node = findEvolutionNode(root, speciesData.name);
    
    if (!node || !Array.isArray(node.evolves_to) || node.evolves_to.length === 0) return [];

    const options = [];
    for (const evNode of node.evolves_to) {
      const evoSpeciesName = evNode.species.name;
      const resEvoSpecies = await fetch(`${POKEAPI_BASE}/pokemon-species/${evoSpeciesName}`);
      if (!resEvoSpecies.ok) continue;
      const evoSpeciesData = await resEvoSpecies.json();

      // Buscamos todas las variedades (Normal y Regionales)
      for (const varEntry of evoSpeciesData.varieties) {
        const vName = varEntry.pokemon.name;
        const regionSuffix = getRegionSuffix(vName);
        
        // LÓGICA DE FILTRADO:
        // 1. Si el actual es regional, solo mostramos su línea regional.
        // 2. Si el actual es normal, mostramos la normal Y las regionales disponibles.
        if (currentRegionSuffix && !vName.includes(currentRegionSuffix)) continue;
        if (!currentRegionSuffix && !varEntry.is_default && !regionSuffix) continue;

        const evoPokemonId = parseSpeciesIdFromUrl(varEntry.pokemon.url);
        const evoPokemonName = capitalize(vName);

        let requiresStone = false;
        let requiresFriendship = false;
        // Si tiene sufijo de región y el Pokémon base NO lo tenía, requiere Pasaporte
        let requiresPassport = (regionSuffix && !currentRegionSuffix);

        if (Array.isArray(evNode.evolution_details)) {
          for (const detail of evNode.evolution_details) {
            if (detail.trigger?.name === "use-item" && detail.item?.name?.endsWith("stone")) requiresStone = true;
            if (detail.min_happiness > 0 || detail.min_affection > 0) requiresFriendship = true;
          }
        }

        options.push({
          id: evoPokemonId,
          name: evoPokemonName,
          requiresStone,
          requiresFriendship,
          requiresPassport // Nueva propiedad
        });
      }
    }
    return options;
  } catch (err) {
    console.error("Error evoluciones:", err);
    return [];
  }
}
function filterSuggestions(list, query, max = 7) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const isNum = /^\d+$/.test(q);
  return list.filter((p) => !isNum && p.name.startsWith(q)).slice(0, max);
}

// =============================
// Render de UI
// =============================
function renderTrainerName() {
  const trainer = window.currentTrainerName || "Entrenador";
  const el = document.getElementById("trainer-label");
  if (el) el.textContent = `Entrenador: ${trainer}`;
}

function renderParty() {
  const container = document.getElementById("party-list");
  container.innerHTML = "";

  state.party.forEach((poke, index) => {
    const slot = document.createElement("div");
    slot.className = "party-slot";

    if (!poke) {
      slot.classList.add("empty");
      slot.textContent = `Slot ${index + 1} vacío`;
    } else {
      const img = document.createElement("img");
      img.className = "party-sprite";
      img.src = poke.sprite || "";
      img.alt = poke.apodo || poke.nombre;

      const main = document.createElement("div");
      main.className = "party-main";

      const nameEl = document.createElement("span");
      nameEl.className = "party-name";
      nameEl.textContent = poke.apodo || poke.nombre;
      if (poke.isShiny) nameEl.textContent += " ✨";

      const lvlEl = document.createElement("span");
      lvlEl.className = "party-level";
      lvlEl.textContent = `Lv. ${poke.nivel || 1}`;

      main.appendChild(nameEl);
      main.appendChild(lvlEl);

      const tag = document.createElement("span");
      tag.className = "party-level";
      tag.textContent = poke.numero;

      slot.appendChild(img);
      slot.appendChild(main);
      slot.appendChild(tag);
    }

    if (state.selectedPartyIndex === index) {
      slot.classList.add("selected");
    }

    slot.addEventListener("click", () => {
      if (!state.party[index]) {
        state.selectedPartyIndex = null;
        state.detailSource = null;
      } else {
        state.selectedPartyIndex = index;
        state.selectedBoxSlotIndex = null;
        state.detailSource = "party";
      }
      renderParty();
      renderDetail();
      saveState();
    });

    container.appendChild(slot);
  });
}

function renderBox() {
  const title = document.getElementById("box-title");
  title.textContent = `Caja ${state.currentBoxIndex + 1}`;

  const grid = document.getElementById("box-grid");
  grid.innerHTML = "";

  const box = state.boxes[state.currentBoxIndex];

  box.forEach((poke, index) => {
    const slot = document.createElement("div");
    slot.className = "box-slot";
    slot.dataset.index = index;
    slot.draggable = true;

    if (!poke) {
      slot.classList.add("empty");
    } else {
      const img = document.createElement("img");
      img.className = "box-slot-sprite";
      img.src = poke.sprite || "";
      img.alt = poke.apodo || poke.nombre;

      const label = document.createElement("div");
      label.className = "box-slot-label";
      let nombreBox = poke.apodo || poke.nombre;
      if (poke.isShiny) nombreBox = "✨ " + nombreBox;
      label.textContent = nombreBox;
      
      if (poke.isShiny) label.style.color = "#a18617"; 

      slot.appendChild(img);
      slot.appendChild(label);
    }

    if (state.selectedBoxSlotIndex === index) {
      slot.classList.add("selected");
    }

    slot.addEventListener("click", () => {
      state.selectedBoxSlotIndex = index;
      state.selectedPartyIndex = null;
      state.detailSource = "box";
      renderBox();
      renderParty();
      renderDetail();
      saveState();
    });

    slot.addEventListener("dragstart", (e) => {
      dragSourceIndex = index;
      slot.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });

    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragSourceIndex === null || dragSourceIndex === index) return;
      slot.classList.add("drag-over");
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    });

    slot.addEventListener("dragleave", () => {
      slot.classList.remove("drag-over");
    });

    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("drag-over");
      if (dragSourceIndex === null || dragSourceIndex === index) return;

      const boxRef = state.boxes[state.currentBoxIndex];
      const from = dragSourceIndex;
      const to = index;
      const temp = boxRef[from];
      boxRef[from] = boxRef[to];
      boxRef[to] = temp;

      state.selectedBoxSlotIndex = to;
      state.detailSource = "box";

      dragSourceIndex = null;
      saveState();
      renderBox();
      renderParty();
      renderDetail();
    });

    slot.addEventListener("dragend", () => {
      dragSourceIndex = null;
      slot.classList.remove("dragging");
      slot.classList.remove("drag-over");
    });

    grid.appendChild(slot);
  });
}

function renderDetail() {
  const empty = document.getElementById("detail-empty");
  const content = document.getElementById("detail-content");
  const box = state.boxes[state.currentBoxIndex];

  let source = null;
  let poke = null;

  // 1. Determinamos el origen y el Pokémon seleccionado
  if (state.selectedPartyIndex != null && state.party[state.selectedPartyIndex]) {
    source = "party";
    poke = state.party[state.selectedPartyIndex];
  } else if (state.selectedBoxSlotIndex != null && box[state.selectedBoxSlotIndex]) {
    source = "box";
    poke = box[state.selectedBoxSlotIndex];
  }

  const btnUpdate = document.getElementById("btn-update-pokemon");
  const btnMove = document.getElementById("btn-move-to-party");
  const btnRelease = document.getElementById("btn-release-pokemon");
  const btnTrain = document.getElementById("btn-train-pokemon");

  // 2. Si no hay ningún Pokémon seleccionado, limpiamos la vista
  if (!poke) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    if (btnUpdate) btnUpdate.disabled = true;
    if (btnMove) btnMove.disabled = true;
    if (btnRelease) btnRelease.disabled = true;
    if (btnTrain) btnTrain.classList.add("hidden");
    state.detailSource = null;
    return;
  }

  // 3. Mostramos el contenido del detalle
  state.detailSource = source;
  empty.classList.add("hidden");
  content.classList.remove("hidden");

  // Botón Actualizar
  if (btnUpdate) btnUpdate.disabled = false;

  // Botón Mover (Cambia texto según el origen)
  if (btnMove) {
    btnMove.disabled = false;
    btnMove.textContent = source === "party" ? "Retirar de equipo actual" : "Mover a equipo actual";
  }

  // Botón Liberar
  if (btnRelease) {
    btnRelease.disabled = false;
}

  // Botón Entrenar (Solo visible si el Pokémon está en la Party)
  if (btnTrain) {
    if (source === "party") {
      btnTrain.classList.remove("hidden");
      // Asignamos el evento de click de forma limpia
      btnTrain.onclick = () => openTrainingModal(state.selectedPartyIndex);
    } else {
      btnTrain.classList.add("hidden");
    }
  }

  // --- RENDERIZADO DE DATOS DEL POKÉMON ---

  // Sprite
  document.getElementById("detail-sprite").src = poke.sprite || "";
  document.getElementById("detail-sprite").alt = poke.apodo || poke.nombre;

  // Título (Número + Nombre + Género + Shiny)
  const nn = document.getElementById("detail-number-name");
  let htmlTitulo = `${poke.numero} ${poke.nombre}`;

  if (poke.gender === "Macho") {
    htmlTitulo += ` <span style="color: #3b82f6; font-size: 1.1em; vertical-align: middle;">♂</span>`;
  } else if (poke.gender === "Hembra") {
    htmlTitulo += ` <span style="color: #ec4899; font-size: 1.1em; vertical-align: middle;">♀</span>`;
  }
  
  if (poke.isShiny) {
    htmlTitulo += " ✨";
    nn.style.color = "#D4AF37"; 
    nn.style.textShadow = "0px 0px 5px rgba(255, 215, 0, 0.5)"; 
    nn.style.fontWeight = "800"; 
  } else {
    nn.style.color = ""; 
    nn.style.textShadow = "";
    nn.style.fontWeight = "";
  }
  nn.innerHTML = htmlTitulo;

  // Tipos
  const typesContainer = document.getElementById("detail-types");
  typesContainer.innerHTML = "";

  (poke.tipos || []).forEach((t) => {
    const pill = document.createElement("span");
    pill.className = "type-pill";
    const key = normalizeTypeKey(t);
    const meta = TYPE_META[key] || {};
    pill.textContent = (meta.label || t).toUpperCase();
    if (meta.color) {
      pill.style.backgroundColor = meta.color;
      pill.style.color = "#ffffff";
    }
    typesContainer.appendChild(pill);
  });

  // Campos de texto básicos
  document.getElementById("detail-apodo").textContent = poke.apodo || "(Sin apodo)";
  document.getElementById("detail-nivel").textContent = poke.nivel || 1;
  document.getElementById("detail-personalidad").textContent = poke.personalidad || "(Sin definir)";
  
  // Clase y Origen
  const claseMostrar = poke.clase || (typeof getPokemonClass === 'function' ? getPokemonClass(poke.nombre) : "Común");
  document.getElementById("detail-clase").textContent = claseMostrar;
  document.getElementById("detail-capturado-como").textContent = poke.capturadoComo || poke.nombre;

const detailNotas = document.getElementById("detail-notas");
  if (detailNotas) {
    detailNotas.textContent = poke.notes || "(Sin notas)";
  }

  // Género detallado
  const generoEl = document.getElementById("detail-genero");
  if (generoEl) {
    generoEl.textContent = poke.gender || "-";
    if (poke.gender === "Macho") generoEl.style.color = "#3b82f6";
    else if (poke.gender === "Hembra") generoEl.style.color = "#ec4899";
    else generoEl.style.color = "";
  }
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// =============================
// LÓGICA MODAL ENTRENAMIENTO
// =============================
async function openTrainingModal(pokeIndex) {
    currentTrainingPoke = state.party[pokeIndex];
    if (!currentTrainingPoke) return;

    if (typeof currentTrainingPoke.storedXP !== 'number') {
        currentTrainingPoke.storedXP = getTotalXpForLevel(currentTrainingPoke.nivel || 1);
    }

    const supabase = window.supabaseClient;
    const userId = window.currentUserId;
    currentInventory = { xp: 0, items: {} };

    if (supabase && userId) {
        const { data } = await supabase.from("trainer_inventory").select("inventory").eq("user_id", userId).single();
        if (data && data.inventory) currentInventory = data.inventory;
    }
    if (typeof currentInventory.xp !== 'number') currentInventory.xp = 0;
    if (!currentInventory.items) currentInventory.items = {};

    document.getElementById("train-sprite").src = currentTrainingPoke.sprite;
    document.getElementById("train-name").textContent = currentTrainingPoke.apodo || currentTrainingPoke.nombre;
    document.getElementById("train-level-info").textContent = `Nivel: ${currentTrainingPoke.nivel} | Clase: ${currentTrainingPoke.clase}`;
    document.getElementById("global-xp-display").textContent = `${currentInventory.xp} XP`;
    document.getElementById("train-xp-input").value = "";
    
    const select = document.getElementById("train-evolution-select");
    select.innerHTML = '<option value="">Cargando...</option>';
    
    const evolutions = await getEvolutionOptions(currentTrainingPoke.id, currentTrainingPoke.nombre);
    select.innerHTML = '';

    if (evolutions.length === 0) {
        select.innerHTML = '<option value="">No puede evolucionar más</option>';
        updateTrainingUI(); 
        openModal("modal-train");
        return;
    }

evolutions.forEach(evo => {
    const option = document.createElement("option");
    option.value = evo.id; 
    option.textContent = evo.name;
    option.dataset.requiresStone = evo.requiresStone;
    option.dataset.requiresFriendship = evo.requiresFriendship;
    option.dataset.requiresPassport = evo.requiresPassport;
    
    const clase = currentTrainingPoke.clase;
    
    // DETERMINACIÓN DE NIVEL FIJA
    // Siempre pedimos el nivel de la 1ra evolución (lvl1) para el Pokémon actual.
    // Esto evita que Pikachu pida nivel 38 (lvl2) solo por haber llegado al 19.
    const targetLvl = getTargetLevelByClass(clase, 1);
    
    option.dataset.targetLevel = targetLvl;
    option.textContent += ` (Requiere Nivel ${targetLvl})`;
    select.appendChild(option);
});

    openModal("modal-train");
    updateTrainingUI();
}

function updateTrainingUI() {
    if (!currentTrainingPoke) return;

    const select = document.getElementById("train-evolution-select");
    const selectedOption = select.options[select.selectedIndex];
    const xpInput = document.getElementById("train-xp-input");
    const inputVal = parseInt(xpInput.value) || 0;
    
    const btnSave = document.getElementById("btn-save-xp");
    const btnEvolve = document.getElementById("btn-do-evolve");
    const xpProgressText = document.getElementById("xp-progress-text");
    const xpBarFill = document.getElementById("xp-bar-fill");
    const xpPercentage = document.getElementById("xp-percentage");
    const helpText = document.getElementById("train-evo-help");

    // Validar si el input de XP supera lo que tiene el entrenador
    xpInput.style.borderColor = inputVal > currentInventory.xp ? "#e53e3e" : "";

    // Caso: No hay evolución seleccionada (Solo entrenamiento de nivel)
    if (!selectedOption || !selectedOption.value) {
        btnSave.disabled = inputVal <= 0 || inputVal > currentInventory.xp;
        btnEvolve.disabled = true;
        btnEvolve.style.backgroundColor = "#a0aec0";
        
        const currentXP = currentTrainingPoke.storedXP || 0;
        const nextLevelXP = getTotalXpForLevel(currentTrainingPoke.nivel + 1);
        xpProgressText.textContent = `Nivel ${currentTrainingPoke.nivel} (XP: ${currentXP + inputVal} / ${nextLevelXP})`;
        
        const prevLevelXP = getTotalXpForLevel(currentTrainingPoke.nivel);
        const diff = nextLevelXP - prevLevelXP;
        const p = diff > 0 ? Math.min(100, Math.max(0, (((currentXP + inputVal) - prevLevelXP) / diff) * 100)) : 100;
        xpBarFill.style.width = `${p}%`;
        xpPercentage.textContent = `${Math.round(p)}%`;
        helpText.style.display = "none";
        return;
    }

    // Caso: Evolución seleccionada
    const targetLvlRequired = parseInt(selectedOption.dataset.targetLevel);
    const requiresStone = selectedOption.dataset.requiresStone === "true";
    const requiresFriendship = selectedOption.dataset.requiresFriendship === "true";
    const requiresPassport = selectedOption.dataset.requiresPassport === "true";

    const totalNeededXP = getTotalXpForLevel(targetLvlRequired);
    const storedXP = currentTrainingPoke.storedXP || 0;
    const currentTotalXP = storedXP + inputVal;
    
    // Actualizar barra de progreso hacia la evolución
    let percentage = 0;
    if (totalNeededXP > 0) percentage = Math.min(100, Math.round((currentTotalXP / totalNeededXP) * 100));
    else percentage = 100;
    
    xpProgressText.textContent = `${currentTotalXP} / ${totalNeededXP} XP`;
    xpBarFill.style.width = `${percentage}%`;
    xpPercentage.textContent = `${percentage}%`;

    // --- LÓGICA DE HABILITACIÓN DE BOTONES (CORREGIDA) ---
    if (currentTrainingPoke.nivel >= targetLvlRequired) {
        btnSave.disabled = true; 
        btnSave.style.opacity = "0.5";
        btnSave.style.cursor = "not-allowed";
    } else {
        btnSave.disabled = !(inputVal > 0 && inputVal <= currentInventory.xp);
        btnSave.style.opacity = "1";
        btnSave.style.cursor = "pointer";
    }

    let canEvolve = true;
    let errors = [];

    if (currentTotalXP < totalNeededXP) {
        canEvolve = false;
    }
    if (inputVal > currentInventory.xp) {
        canEvolve = false;
    }
    
    // Validar Items
    if (requiresStone && (currentInventory.items.evoStone || 0) < 1) { 
        canEvolve = false; 
        errors.push("Piedra Evolutiva"); 
    }
    if (requiresFriendship && (currentInventory.items.friendship || 0) < 1) { 
        canEvolve = false; 
        errors.push("Pulsera Amistad"); 
    }
    if (requiresPassport && (currentInventory.items.passport || 0) < 1) { 
        canEvolve = false; 
        errors.push("Pasaporte Regional"); 
    }

    // --- MOSTRAR MENSAJES DE ERROR O ESTADO ---
    if (errors.length > 0) {
        helpText.textContent = "Falta: " + errors.join(", ");
        helpText.style.display = "block";
        helpText.style.color = "#e53e3e";
    } else if (currentTrainingPoke.nivel >= targetLvlRequired) {
        helpText.textContent = "¡Nivel máximo! Usa los ítems necesarios para evolucionar.";
        helpText.style.display = "block";
        helpText.style.color = "#2b6cb0";
    } else if (currentTotalXP < totalNeededXP) {
        helpText.textContent = `Nivel insuficiente (Requiere Lv. ${targetLvlRequired})`;
        helpText.style.display = "block";
        helpText.style.color = "#e53e3e";
    } else {
        helpText.style.display = "none";
    }

    // Estado final del botón evolucionar
    btnEvolve.disabled = !canEvolve;
    btnEvolve.style.backgroundColor = canEvolve ? "#48bb78" : "#a0aec0";
    btnEvolve.style.border = canEvolve ? "1px solid #38a169" : "1px solid #a0aec0";
    btnEvolve.style.cursor = canEvolve ? "pointer" : "not-allowed";
} // <--- ESTA LLAVE CIERRA updateTrainingUI Y ARREGLA EL ERROR

async function handleSaveXPAction() {
    const xpInput = document.getElementById("train-xp-input");
    const amount = parseInt(xpInput.value) || 0;
    
    if (amount <= 0 || amount > currentInventory.xp) return;

    if (!currentTrainingPoke.storedXP) currentTrainingPoke.storedXP = 0;
    currentTrainingPoke.storedXP += amount;
    currentInventory.xp -= amount;

    const oldLevel = currentTrainingPoke.nivel;
    const newLevel = getLevelFromTotalXP(currentTrainingPoke.storedXP);
    
    let msg = `Se asignaron ${amount} XP.`;
    if (newLevel > oldLevel) {
        currentTrainingPoke.nivel = newLevel;
        msg += `\n¡${currentTrainingPoke.apodo || currentTrainingPoke.nombre} subió al Nivel ${newLevel}!`;
    }

    if (state.detailSource === 'party' && state.selectedPartyIndex !== null) {
        state.party[state.selectedPartyIndex] = currentTrainingPoke;
    }

    await saveGameData();
    alert(msg);
    closeModal("modal-train");
    renderParty(); 
    renderDetail();
}

async function handleEvolveAction() {
    const select = document.getElementById("train-evolution-select");
    const selectedOption = select.options[select.selectedIndex];
    const xpInput = document.getElementById("train-xp-input");
    const amount = parseInt(xpInput.value) || 0;

    const targetId = selectedOption.value;
    const targetLvl = parseInt(selectedOption.dataset.targetLevel);
    const requiresStone = selectedOption.dataset.requiresStone === "true";
    const requiresFriendship = selectedOption.dataset.requiresFriendship === "true";
    const requiresPassport = selectedOption.dataset.requiresPassport === "true";

    currentInventory.xp -= amount; 
    if (!currentTrainingPoke.storedXP) currentTrainingPoke.storedXP = 0;
    currentTrainingPoke.storedXP += amount;

    if (requiresStone) currentInventory.items.evoStone--;
    if (requiresFriendship) currentInventory.items.friendship--;
    if (requiresPassport) currentInventory.items.passport--;

    try {
        const basic = await fetchPokemonByNameOrId(targetId);
        currentTrainingPoke.id = basic.id;
        currentTrainingPoke.numero = basic.numero;
        currentTrainingPoke.nombre = basic.nombre;
        currentTrainingPoke.tipos = basic.tipos;
        currentTrainingPoke.sprite = currentTrainingPoke.isShiny ? basic.spriteShiny : basic.spriteNormal;
        currentTrainingPoke.nivel = Math.max(currentTrainingPoke.nivel, targetLvl);

        if (typeof getPokemonClass === 'function') {
             currentTrainingPoke.clase = getPokemonClass(basic.nombre);
        }

        if (state.detailSource === 'party' && state.selectedPartyIndex !== null) {
            state.party[state.selectedPartyIndex] = currentTrainingPoke;
        }

        await saveGameData();
        alert(`¡Evolución exitosa a ${basic.nombre}!`);
        closeModal("modal-train");
        renderParty();
        renderDetail();
    } catch (e) {
        console.error(e);
        alert("Error de conexión con PokeAPI.");
    }
}

// =============================
// AÑADIR / EDITAR / MOVER
// =============================
async function handleAddPokemon() {
  const speciesInput = document.getElementById("add-species-input");
  const nicknameInput = document.getElementById("add-nickname-input");
  const personalityField = document.getElementById("add-personality-select");
  const levelInput = document.getElementById("add-level-input");
  const shinyInput = document.getElementById("add-shiny-input");
  const genderInput = document.querySelector('input[name="add-gender"]:checked');

  if (!speciesInput || !personalityField || !levelInput) {
    console.error("Faltan elementos del formulario.");
    return;
  }

  const rawSpecies = speciesInput.value.trim();
  if (!rawSpecies) { alert("Escribe un nombre de Pokémon."); return; }

  const personalidad = personalityField.value.trim();
  if (!personalidad) { alert("Selecciona una personalidad."); return; }

  let level = parseInt(levelInput.value, 10);
  if (Number.isNaN(level) || level < 1 || level > 100) level = 1;

  const isShiny = shinyInput ? shinyInput.checked : false;
  const gender = genderInput ? genderInput.value : "Sin género";

  let basic;
  try {
    basic = await fetchPokemonByNameOrId(rawSpecies);
  } catch (e) {
    console.error(e);
    alert("No encontré ese Pokémon. Revisa el nombre.");
    return;
  }

  const box = state.boxes[state.currentBoxIndex];
  const emptyIndex = box.findIndex((slot) => slot === null);
  if (emptyIndex === -1) {
    alert("Caja llena. Cambia de caja o libera espacio.");
    return;
  }

  const claseAuto = typeof getPokemonClass === 'function' ? getPokemonClass(basic.nombre) : "Común";
  const imagenFinal = isShiny ? basic.spriteShiny : basic.spriteNormal;
  const initialXP = getTotalXpForLevel(level);

  const newPoke = {
    id: basic.id,
    numero: basic.numero,
    nombre: basic.nombre,
    tipos: basic.tipos,
    sprite: imagenFinal,
    apodo: nicknameInput.value.trim() || "",
    nivel: level,
    personalidad,
    clase: claseAuto,
    capturadoComo: basic.nombre,
    isShiny: isShiny,
    gender: gender,
    storedXP: initialXP,
    notes: ""
  };

  box[emptyIndex] = newPoke;
  state.selectedBoxSlotIndex = emptyIndex;

  saveState();
  renderParty();
  renderBox();
  renderDetail();

  speciesInput.value = "";
  nicknameInput.value = "";
  personalityField.value = "";
  if(shinyInput) shinyInput.checked = false; 
  const radioMacho = document.querySelector('input[name="add-gender"][value="Macho"]');
  if(radioMacho) radioMacho.checked = true;
  const suggest = document.getElementById("add-suggest-list");
  if (suggest) suggest.innerHTML = "";

  closeModal("modal-add");
}

async function handleUpdatePokemon() {
  const box = state.boxes[state.currentBoxIndex];
  let container = null;
  let index = null;

  // 1. Identificar el origen del Pokémon (Equipo o Caja)
  if (state.detailSource === "party" && state.selectedPartyIndex != null && state.party[state.selectedPartyIndex]) {
    container = state.party;
    index = state.selectedPartyIndex;
  } else if (state.selectedBoxSlotIndex != null && box[state.selectedBoxSlotIndex]) {
    container = box;
    index = state.selectedBoxSlotIndex;
  } else { 
    return; 
  }

  const poke = container[index];
  if (!poke) return;

  // 2. Referencias a los inputs del modal
  const nicknameInput = document.getElementById("edit-nickname-input");
  const levelInput = document.getElementById("edit-level-input");
  const personalitySelect = document.getElementById("edit-personality-select");
  const notesInput = document.getElementById("edit-notes-input");

  // 3. Validación de límite de palabras (Máx 60)
  if (notesInput) {
    const text = notesInput.value.trim();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length > 60) {
      alert(`Has superado el límite de palabras (${words.length}/60). Por favor, resume tus notas.`);
      return;
    }
    // Guardar la nota en el objeto
    poke.notes = text;
  }

  // 4. Actualizar datos básicos (Apodo, Nivel, Personalidad)
  if (nicknameInput) {
    poke.apodo = nicknameInput.value.trim();
  }

  if (levelInput) {
    let newNivel = parseInt(levelInput.value, 10);
    if (!Number.isNaN(newNivel) && newNivel >= 1 && newNivel <= 100) {
      if (newNivel !== poke.nivel) {
        poke.nivel = newNivel;
        // Recalcular XP base si el nivel cambió manualmente
        if (typeof getTotalXpForLevel === 'function') {
          poke.storedXP = getTotalXpForLevel(newNivel);
        }
      }
    }
  }

  if (personalitySelect) {
    poke.personalidad = personalitySelect.value; 
  }

  // 5. Persistencia y actualización de la interfaz
  container[index] = poke;

  try {
    await saveState(); // Guarda en Supabase y LocalStorage
    renderParty();
    renderBox();
    renderDetail();
    closeModal("modal-edit");
  } catch (error) {
    console.error("Error al guardar los cambios:", error);
    alert("Hubo un error al conectar con la base de datos.");
  }
}

function handleReleasePokemon() {
  const box = state.boxes[state.currentBoxIndex];
  let poke = null;
  let releasingFrom = null;

  if (state.detailSource === "party" && state.selectedPartyIndex != null && state.party[state.selectedPartyIndex]) {
    releasingFrom = "party";
    poke = state.party[state.selectedPartyIndex];
  } else if (state.selectedBoxSlotIndex != null && box[state.selectedBoxSlotIndex]) {
    releasingFrom = "box";
    poke = box[state.selectedBoxSlotIndex];
  }

  if (!poke) return;
  const nombreMostrar = poke.apodo || poke.nombre;
  const ok = confirm(`¿Seguro que quieres liberar a ${nombreMostrar}?`);
  if (!ok) return;

  if (releasingFrom === "party") {
    state.party[state.selectedPartyIndex] = null;
    state.selectedPartyIndex = null;
  } else if (releasingFrom === "box") {
    box[state.selectedBoxSlotIndex] = null;
    state.selectedBoxSlotIndex = null;
  }

  state.detailSource = null;
  saveState();
  renderParty();
  renderBox();
  renderDetail();
}

function handleMoveToParty() {
  const box = state.boxes[state.currentBoxIndex];

  if (state.detailSource === "party") {
    const pIdx = state.selectedPartyIndex;
    if (pIdx == null || !state.party[pIdx]) return;
    const poke = state.party[pIdx];
    const emptyBoxIndex = box.findIndex((x) => x === null);
    if (emptyBoxIndex === -1) { alert("Caja llena."); return; }
    box[emptyBoxIndex] = poke;
    state.party[pIdx] = null;
    state.selectedPartyIndex = null;
    state.detailSource = null;
  } else {
    const idx = state.selectedBoxSlotIndex;
    if (idx == null || !box[idx]) return;
    const poke = box[idx];
    const emptyIndex = state.party.findIndex((x) => x === null);
    if (emptyIndex === -1) { alert("Equipo lleno."); return; }
    state.party[emptyIndex] = poke;
    box[idx] = null;
    state.selectedBoxSlotIndex = null;
    state.detailSource = null;
  }

  saveState();
  renderParty();
  renderBox();
  renderDetail();
}

async function setupSuggest(inputEl, listEl) {
  await fetchPokemonList();
  inputEl.addEventListener("input", () => {
    const query = inputEl.value;
    const suggestions = filterSuggestions(allPokemonList, query);
    listEl.innerHTML = "";
    suggestions.forEach((p) => {
      const li = document.createElement("li");
      li.className = "suggest-item";
      li.textContent = capitalize(p.name);
      li.addEventListener("click", () => {
        inputEl.value = p.name;
        listEl.innerHTML = "";
      });
      listEl.appendChild(li);
    });
  });
}

function goToPrevBox() {
    if (state.currentBoxIndex > 0) state.currentBoxIndex--;
    else state.currentBoxIndex = state.boxes.length - 1;
    state.selectedBoxSlotIndex = null;
    saveState();
    renderBox();
    renderDetail();
}

function goToNextBox() {
    if (state.currentBoxIndex < state.boxes.length - 1) state.currentBoxIndex++;
    else {
        state.boxes.push(new Array(30).fill(null));
        state.currentBoxIndex = state.boxes.length - 1;
    }
    state.selectedBoxSlotIndex = null;
    saveState();
    renderBox();
    renderDetail();
}

function normalizeTypeKey(t) {
    return String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

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
// INICIALIZACIÓN ÚNICA
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Lógica de protección y carga de datos
    const user = await initProtectedPage({ redirectToLogin: "index.html" });
    if (!user) return;

    if (typeof setupLogoutButton === "function") setupLogoutButton();
    if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();

    renderTrainerName();
    await loadState();
    renderParty();
    renderBox();
    renderDetail();

    // 2. Eventos de la Caja
    const prevBtn = document.getElementById("btn-prev-box");
    const nextBtn = document.getElementById("btn-next-box");
    if (prevBtn) prevBtn.addEventListener("click", goToPrevBox);
    if (nextBtn) nextBtn.addEventListener("click", goToNextBox);

    const btnAdd = document.getElementById("btn-add-pokemon");
    if (btnAdd) btnAdd.addEventListener("click", () => openModal("modal-add"));
    
    document.getElementById("btn-add-cancel")?.addEventListener("click", () => closeModal("modal-add"));
    document.getElementById("btn-add-confirm")?.addEventListener("click", handleAddPokemon);

    document.getElementById("btn-update-pokemon")?.addEventListener("click", () => {
        openModal("modal-edit");
    });

    document.getElementById("btn-move-to-party")?.addEventListener("click", handleMoveToParty);

// Evento para Liberar Pokémon
document.getElementById("btn-release-pokemon")?.addEventListener("click", handleReleasePokemon);   
    document.getElementById("btn-edit-cancel")?.addEventListener("click", () => closeModal("modal-edit"));
    document.getElementById("btn-edit-confirm")?.addEventListener("click", handleUpdatePokemon);

    // 3. Eventos de entrenamiento
    document.getElementById("train-xp-input")?.addEventListener("input", updateTrainingUI);
    document.getElementById("train-evolution-select")?.addEventListener("change", updateTrainingUI);
    document.getElementById("btn-save-xp")?.addEventListener("click", handleSaveXPAction);
    document.getElementById("btn-do-evolve")?.addEventListener("click", handleEvolveAction);
    document.getElementById("btn-train-cancel")?.addEventListener("click", () => closeModal("modal-train"));

    // 4. LÓGICA DEL MENÚ HAMBURGUESA (Corregida)
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => {
            console.log("Menú abierto");
            sideMenu.classList.remove("hidden");
        };
        if (btnClose) {
            btnClose.onclick = () => sideMenu.classList.add("hidden");
        }
        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) sideMenu.classList.add("hidden");
        };
    }

    // 5. Sugerencias PokeAPI
    const addSpeciesInput = document.getElementById("add-species-input");
    const addSuggestList = document.getElementById("add-suggest-list");
    if (addSpeciesInput && addSuggestList) {
        setupSuggest(addSpeciesInput, addSuggestList);
    }
});