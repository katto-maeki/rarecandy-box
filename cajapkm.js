// cajapkm.js - Versión Definitiva con Bypass de CDN e Imágenes Fluidas
// ===================================================================
const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const TRAINER_META_KEY = "pokeTrainerMeta_v1";
const BOX_SIZE = 32;
const DEFAULT_MAX_BOXES = 8;

// Variables globales dinámicas calculadas en el momento correcto
let boxUserId = null;
let isOwnProfile = true;
let boxTrainerName = "Entrenador";

let state = {
  // "party" ya no tiene UI propia (columna "Equipo actual" eliminada). Se
  // conserva vacío solo porque otras páginas (admin, perfil, intercambios)
  // todavía leen/guardan el campo "party_data" en Supabase.
  party: new Array(6).fill(null),
  boxes: [new Array(BOX_SIZE).fill(null)],
  boxNames: [null],
  currentBoxIndex: 0,
  selectedBoxSlotIndex: null,
  detailSource: null,
};

function getBoxName(index) {
  const name = Array.isArray(state.boxNames) ? state.boxNames[index] : null;
  return name || `Caja ${index + 1}`;
}

let allPokemonList = null; 
let dragSourceIndex = null; 

let currentTrainingPoke = null;
let currentInventory = null;

// Diccionarios globales para el formato estético en la vista de detalles
const ACTIVITY_LABELS = {
  encounter: "Encounter 💥",
  coloreo: "Coloreo 🎨",
  obsequio: "Obsequio 🎁",
  intercambio: "Intercambio 🔄",
  huevo: "Huevo 🥚",
  evento: "Evento 🎉"
};

const POKEBALL_LABELS = { 
  pokeball: "Pokéball 🔴", 
  superball: "Superball 🔵", 
  ultraball: "Ultraball 🟡", 
  masterball: "Masterball 🟣" 
};

// =============================
// LÓGICA DE XP Y NIVELES
// =============================
function getLevelFromTotalXP(totalXP) {
    if (totalXP < 50) return Math.min(5, Math.floor(totalXP / 10) + 1);
    if (totalXP < 125) return 5 + Math.floor((totalXP - 50) / 15) + 1;
    if (totalXP < 225) return 10 + Math.floor((totalXP - 125) / 20) + 1;
    if (totalXP < 350) return 15 + Math.floor((totalXP - 225) / 25) + 1;
    if (totalXP < 700) return 20 + Math.floor((totalXP - 350) / 35) + 1;
    if (totalXP < 1150) return 30 + Math.floor((totalXP - 700) / 45) + 1;
    if (totalXP < 1700) return 40 + Math.floor((totalXP - 1150) / 55) + 1;
    return 50 + Math.floor((totalXP - 1700) / 100) + 1;
}

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

function getTargetLevelByClass(clase, stage) {
  const c = (clase || "Común").toLowerCase();
  if (c.includes("baby")) return 12;
  if (c.includes("raro")) return stage === 1 ? 19 : 38;
  if (c.includes("especial")) return stage === 1 ? 21 : 42;
  return stage === 1 ? 16 : 32;
}

// ==========================================
// PERSISTENCIA CONTROLADA AISLADA POR USUARIO
// ==========================================
async function saveState() {
  if (!isOwnProfile || !boxUserId) return; 

  try {
    localStorage.setItem(`pokeBoxState_${boxUserId}_v1`, JSON.stringify(state));
  } catch (e) { console.error(e); }

  const supabase = window.supabaseClient;
  if (supabase && boxUserId) {
      const payload = {
        id: boxUserId,
        box_data: { boxes: state.boxes, boxNames: state.boxNames, currentBoxIndex: state.currentBoxIndex },
        party_data: state.party,
      };
      return supabase.from("user_game_data").upsert(payload, { onConflict: "id" });
  }
}

async function saveGameData() {
    if (!isOwnProfile) return; 

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
  const userId = boxUserId; 
  let loadedFromSupabase = false;

  if (supabase && userId) {
    try {
      const { data, error } = await supabase.from("user_game_data").select("box_data, party_data, trainer_name").eq("id", userId);
      if (error) console.error(error);
      else if (data && data.length > 0) {
        const row = data[0];
        if (row.trainer_name) boxTrainerName = row.trainer_name; 
        if (Array.isArray(row.party_data)) state.party = row.party_data;
        if (row.box_data && Array.isArray(row.box_data.boxes)) {
          state.boxes = row.box_data.boxes;
          state.boxNames = Array.isArray(row.box_data.boxNames) ? row.box_data.boxNames : [];
          if (typeof row.box_data.currentBoxIndex === "number") state.currentBoxIndex = row.box_data.currentBoxIndex;
        }
        loadedFromSupabase = true;
      } else {
        state.party = new Array(6).fill(null);
        state.boxes = [new Array(BOX_SIZE).fill(null)];
        state.boxNames = [null];
        state.currentBoxIndex = 0;

        if (isOwnProfile) {
          const initialRow = { id: userId, box_data: { boxes: state.boxes, boxNames: state.boxNames, currentBoxIndex: 0 }, party_data: state.party };
          await supabase.from("user_game_data").insert(initialRow);
        }
        loadedFromSupabase = true;
      }
    } catch (e) { console.error(e); }
  }

  if (!loadedFromSupabase && userId) {
    try {
      const raw = localStorage.getItem(`pokeBoxState_${userId}_v1`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.party) && Array.isArray(parsed.boxes)) state = parsed;
      }
    } catch (e) { console.error(e); }
  }

  if (!Array.isArray(state.party) || state.party.length !== 6) state.party = new Array(6).fill(null);
  if (!Array.isArray(state.boxes) || state.boxes.length === 0) state.boxes = [new Array(BOX_SIZE).fill(null)];
  else {
    state.boxes = state.boxes.map((box) => {
      const arr = Array.isArray(box) ? box.slice(0, BOX_SIZE) : [];
      while (arr.length < BOX_SIZE) arr.push(null);
      return arr;
    });
  }

  if (!Array.isArray(state.boxNames)) state.boxNames = [];
  state.boxNames = state.boxNames.slice(0, state.boxes.length);
  while (state.boxNames.length < state.boxes.length) state.boxNames.push(null);
}

// Mueve cualquier Pokémon que haya quedado en "party" (equipo actual, ya sin
// UI propia) al primer espacio libre de la caja, creando cajas nuevas si
// hace falta. Devuelve true si migró algo (para saber si hay que guardar).
function migratePartyIntoBox() {
  if (!Array.isArray(state.party)) return false;

  let migrated = false;

  for (let i = 0; i < state.party.length; i++) {
    const poke = state.party[i];
    if (!poke) continue;

    let box = state.boxes[state.boxes.length - 1];
    let emptyIndex = box.findIndex((slot) => slot === null);

    if (emptyIndex === -1) {
      box = new Array(BOX_SIZE).fill(null);
      state.boxes.push(box);
      state.boxNames.push(null);
      emptyIndex = 0;
    }

    box[emptyIndex] = poke;
    state.party[i] = null;
    migrated = true;
  }

  return migrated;
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

// FUNCIÓN BYPASS MEJORADA: Repara datos corruptos antiguos y aplica el CDN
function getSafeSpriteUrl(poke) {
  if (!poke) return "";
  
  let url = poke.sprite;
  
  // AUTO-CURACIÓN: Si por errores antiguos el sprite quedó vacío o corrupto,
  // lo reconstruimos de forma idéntica usando el ID del Pokémon
  if (!url || url === "undefined" || url === "[object Object]") {
    if (!poke.id) return "";
    if (poke.isShiny) {
      return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/home/shiny/${poke.id}.png`;
    } else {
      return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/home/${poke.id}.png`;
    }
  }
  
  // Si tiene URL de GitHub, la redirigimos al CDN espejo
  return window.toCdnSpriteUrl ? window.toCdnSpriteUrl(url) : url;
}
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

function filterSuggestions(list, query, max = 7) {
  if (!query || !list) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const isNum = /^\d+$/.test(q);
  return list.filter((p) => !isNum && p.name.startsWith(q)).slice(0, max);
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

// Formas de "vitrina" (Totem, etc.) que no son evoluciones elegibles por el
// entrenador: aparecen como variedad de la especie en PokeAPI pero no deben
// ofrecerse como destino de evolución.
function isShowcaseVariety(vName) {
  return vName.includes("totem");
}

// Mega Evolución / Gigamax NO están disponibles como evolución en la caja
// (son formas de batalla temporales, no evoluciones permanentes). Sin este
// filtro, PokeAPI las lista como "variedad" de la especie evolucionada y se
// colaban como si fueran el destino normal de la evolución (p. ej. Kirlia
// terminaba pudiendo "evolucionar" directo a Mega Gallade).
function isMegaOrGmaxVariety(vName) {
  return /-(mega(-x|-y)?|gmax)$/.test(vName);
}

// Casos donde la cadena de evolución de PokeAPI tiene más de una rama (p.
// ej. Meowth evoluciona en Persian o, si es Galar, en Perrserker) y NINGUNA
// de esas ramas tiene una forma con sufijo de región propia. En ese caso no
// hay forma de distinguir "cuál rama es la regional" solo con los nombres,
// así que se resuelve a mano para las formas regionales disponibles en
// Sorelle.
const REGION_EXCLUSIVE_BRANCH = {
  "meowth-galar": ["perrserker"],
  "yamask-galar": ["runerigus"],
  "corsola-galar": ["cursola"],
  "farfetchd-galar": ["sirfetchd"],
  "zigzagoon-galar": ["linoone-galar"],
  "linoone-galar": ["obstagoon"],
};

async function getEvolutionOptions(pokemonId, pokemonName) {
  try {
    const resPokemon = await fetch(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
    if (!resPokemon.ok) return [];
    const pokemonData = await resPokemon.json();

    const currentRegionSuffix = getRegionSuffix(pokemonData.name);
    const resSpecies = await fetch(pokemonData.species.url);
    if (!resSpecies.ok) return [];
    const speciesData = await resSpecies.json();

    const evoUrl = speciesData.evolution_chain?.url;
    if (!evoUrl) return [];
    const resChain = await fetch(evoUrl);
    const chainData = await resChain.json();

    const isBaseForm = (chainData.chain.species.name === speciesData.name);
    const evolutionStage = isBaseForm ? 1 : 2;

    const root = chainData.chain;
    const node = findEvolutionNode(root, speciesData.name);
    if (!node) return [];

    const options = [];

    for (const evNode of (node.evolves_to || [])) {
      const evoSpeciesName = evNode.species.name;
      const resEvoSpecies = await fetch(`${POKEAPI_BASE}/pokemon-species/${evoSpeciesName}`);
      const evoSpeciesData = await resEvoSpecies.json();

      let requiresStone = false;
      let requiresFriendship = false;
      let timeCondition = "";
      if (Array.isArray(evNode.evolution_details)) {
        for (const detail of evNode.evolution_details) {
          if (detail.trigger?.name === "use-item" && detail.item?.name?.endsWith("stone")) requiresStone = true;
          if (detail.min_happiness > 0 || detail.min_affection > 0) requiresFriendship = true;
          if (detail.time_of_day) timeCondition = detail.time_of_day;
        }
      }

      // ¿Esta línea evolutiva tiene una forma específica para la región
      // actual? (p. ej. Darumaka-Galar -> Darmanitan-Galar). Si no la
      // tiene (p. ej. Meowth-Galar -> Perrserker, que no tiene forma
      // "normal"), no exigimos el sufijo de región: se ofrece la única
      // forma disponible tal cual.
      const hasMatchingRegionVariant = !!currentRegionSuffix && evoSpeciesData.varieties.some(
        (v) => v.pokemon.name.includes(currentRegionSuffix)
      );

      // Lista curada de "a quién le corresponde" cuando el pokémon actual
      // (o el destino) es una de las evoluciones exclusivas de región de
      // arriba, para casos con más de una rama posible.
      const currentExclusiveList = REGION_EXCLUSIVE_BRANCH[pokemonData.name];

      for (const varEntry of evoSpeciesData.varieties) {
        const vName = varEntry.pokemon.name;
        if (isShowcaseVariety(vName)) continue;
        // Mega Evolución / Gigamax no están disponibles como evolución.
        if (isMegaOrGmaxVariety(vName)) continue;

        if (currentExclusiveList) {
          // El pokémon actual tiene su propia rama exclusiva (p. ej.
          // Meowth-Galar -> Perrserker): solo esa, ninguna otra rama.
          if (!currentExclusiveList.includes(vName)) continue;
        } else {
          // Esta forma es la evolución exclusiva de OTRA variedad regional
          // (p. ej. Perrserker es solo de Meowth-Galar): un Meowth normal
          // no debe poder llegar a ella.
          const belongsToOtherVariety = Object.keys(REGION_EXCLUSIVE_BRANCH).some(
            (key) => key !== pokemonData.name && REGION_EXCLUSIVE_BRANCH[key].includes(vName)
          );
          if (belongsToOtherVariety) continue;
        }

        const regionSuffix = getRegionSuffix(vName);

        if (currentRegionSuffix) {
          if (hasMatchingRegionVariant) {
            // Existe una forma propia de esta región: solo mostramos esa.
            if (!vName.includes(currentRegionSuffix)) continue;
          } else if (regionSuffix) {
            // Tiene sufijo de OTRA región distinta a la actual: no aplica.
            continue;
          }
          // Si no aplica ninguno de los dos casos anteriores, es una forma
          // sin sufijo de región (evolución exclusiva ya validada arriba,
          // o la rama común): se acepta.
        }

        // Si el pokémon actual es la forma base, mostramos tanto la
        // evolución normal como la variante regional (esta última exige
        // Pasaporte Regional; antes se ocultaba directamente y por eso
        // nunca se podía elegir aunque se tuviera el ítem).
        const requiresPassport = !!(regionSuffix && !currentRegionSuffix);

        const evoPokemonId = parseSpeciesIdFromUrl(varEntry.pokemon.url);
        const displayName = capitalize(vName.replace(/-/g, " "));

        options.push({
          id: evoPokemonId,
          name: displayName,
          requiresStone,
          requiresFriendship,
          requiresPassport,
          timeCondition: timeCondition,
          evolutionStage: evolutionStage
        });
      }
    }

    return options;
  } catch (err) {
    console.error("Error evoluciones:", err);
    return [];
  }
}

function handleMaxXP() {
    if (!currentTrainingPoke || !currentInventory || !isOwnProfile) return;

    const select = document.getElementById("train-evolution-select");
    const selectedOption = select.options[select.selectedIndex];
    const xpInput = document.getElementById("train-xp-input");
    
    let amountToFill = 0;

    if (selectedOption && selectedOption.value) {
        const targetLvlRequired = parseInt(selectedOption.dataset.targetLevel);
        const totalNeededXP = getTotalXpForLevel(targetLvlRequired);
        const storedXP = currentTrainingPoke.storedXP || 0;
        
        const needed = Math.max(0, totalNeededXP - storedXP);
        amountToFill = Math.min(needed, currentInventory.xp);
    } else {
        const nextLevelXP = getTotalXpForLevel(currentTrainingPoke.nivel + 1);
        const currentXP = currentTrainingPoke.storedXP || 0;
        
        const needed = Math.max(0, nextLevelXP - currentXP);
        amountToFill = Math.min(needed, currentInventory.xp);
    }

    xpInput.value = amountToFill > 0 ? amountToFill : 0;
    updateTrainingUI(); 
}

// =============================
// Render de UI Controlado
// =============================
function renderTrainerName() {
  const trainer = isOwnProfile ? (window.currentTrainerName || "Entrenador") : boxTrainerName;
  const el = document.getElementById("trainer-label");
  if (el) {
    el.textContent = isOwnProfile ? `Entrenador: ${trainer}` : `Viendo la caja de: ${trainer}`;
  }
}

function renderBox() {
  const select = document.getElementById("box-select");
  if (select) {
    select.innerHTML = "";
    state.boxes.forEach((_, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = getBoxName(i);
      select.appendChild(opt);
    });
    select.value = state.currentBoxIndex;
  }

  const grid = document.getElementById("box-grid");
  grid.innerHTML = "";

  const box = state.boxes[state.currentBoxIndex];

  box.forEach((poke, index) => {
    const slot = document.createElement("div");
    slot.className = "box-slot";
    slot.dataset.index = index;
    slot.draggable = isOwnProfile; 

    if (!poke) {
      slot.classList.add("empty");
    } else {
      const img = document.createElement("img");
      img.className = "box-slot-sprite";
      img.alt = poke.apodo || poke.nombre;
      img.loading = "lazy";
      img.src = getSafeSpriteUrl(poke); // <-- Corregido con CDN Bypass

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
      state.detailSource = "box";
      renderBox();
      renderDetail();
      saveState();
    });

    slot.addEventListener("dragstart", (e) => {
      if (!isOwnProfile) return;
      dragSourceIndex = index;
      slot.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });

    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!isOwnProfile || dragSourceIndex === null || dragSourceIndex === index) return;
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
      if (!isOwnProfile || dragSourceIndex === null || dragSourceIndex === index) return;

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

  const poke = state.selectedBoxSlotIndex != null ? box[state.selectedBoxSlotIndex] : null;

  const btnUpdate = document.getElementById("btn-update-pokemon");
  const btnTrain = document.getElementById("btn-train-pokemon");
  const kebabBtn = document.getElementById("btn-detail-kebab");
  const btnMove = document.getElementById("btn-move-pokemon");

  if (!poke) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    if (btnUpdate) btnUpdate.disabled = true;
    if (btnTrain) btnTrain.classList.add("hidden");
    if (kebabBtn) kebabBtn.classList.add("hidden");
    closeDetailKebabMenu();
    state.detailSource = null;
    return;
  }

  state.detailSource = "box";
  empty.classList.add("hidden");
  content.classList.remove("hidden");

  if (!isOwnProfile) {
    if (btnUpdate) btnUpdate.classList.add("hidden");
    if (btnTrain) btnTrain.classList.add("hidden");
    if (kebabBtn) kebabBtn.classList.add("hidden");
    closeDetailKebabMenu();
  } else {
    if (btnUpdate) { btnUpdate.disabled = false; btnUpdate.classList.remove("hidden"); }

    if (btnTrain) {
      btnTrain.classList.remove("hidden");
      btnTrain.onclick = () => openTrainingModal();
    }

    if (kebabBtn) kebabBtn.classList.remove("hidden");
    if (btnMove) btnMove.disabled = state.boxes.length <= 1;
  }

  document.getElementById("detail-sprite").src = getSafeSpriteUrl(poke); // <-- Corregido con CDN Bypass
  document.getElementById("detail-sprite").alt = poke.apodo || poke.nombre;

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

  document.getElementById("detail-apodo").textContent = poke.apodo || "(Sin apodo)";
  document.getElementById("detail-nivel").textContent = poke.nivel || 1;
  document.getElementById("detail-personalidad").textContent = poke.personalidad || "(Sin definir)";
  
  const claseMostrar = poke.clase || (typeof getPokemonClass === 'function' ? getPokemonClass(poke.nombre) : "Común");
  document.getElementById("detail-clase").textContent = claseMostrar;
  document.getElementById("detail-capturado-como").textContent = poke.capturadoComo || poke.nombre;

  // RENDERIZADO DE LOS CAMPOS ADICIONALES
  const actividadEl = document.getElementById("detail-actividad");
  if (actividadEl) {
    actividadEl.textContent = ACTIVITY_LABELS[poke.activity] || poke.activity || "(No especificado)";
  }

  const pokeballEl = document.getElementById("detail-pokeball");
  if (pokeballEl) {
    pokeballEl.textContent = POKEBALL_LABELS[poke.pokeball] || poke.pokeball || "(No especificado)";
  }

  const fechaEl = document.getElementById("detail-fecha-registro");
  if (fechaEl) {
    if (poke.registrationDate) {
      const d = new Date(poke.registrationDate);
      fechaEl.textContent = d.toLocaleDateString("es-ES");
    } else {
      fechaEl.textContent = "(Antes del registro)";
    }
  }

  const detailNotas = document.getElementById("detail-notas");
  if (detailNotas) {
    detailNotas.textContent = poke.notes || "(Sin notas)";
  }

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
async function openTrainingModal() {
    if (!isOwnProfile) return;
    const box = state.boxes[state.currentBoxIndex];
    if (state.selectedBoxSlotIndex == null || !box[state.selectedBoxSlotIndex]) return;

    currentTrainingPoke = box[state.selectedBoxSlotIndex];

    if (typeof currentTrainingPoke.storedXP !== 'number') {
        currentTrainingPoke.storedXP = getTotalXpForLevel(currentTrainingPoke.nivel || 1);
    }

    const supabase = window.supabaseClient;
    const userId = window.currentUserId;
    currentInventory = { xp: 0, items: {} };

    if (supabase && userId) {
        const { data } = await supabase.from("trainer_inventory").select("inventory").eq("user_id", userId).maybeSingle();
        if (data && data.inventory) currentInventory = data.inventory;
    }
    if (typeof currentInventory.xp !== 'number') currentInventory.xp = 0;
    if (!currentInventory.items) currentInventory.items = {};

    document.getElementById("train-sprite").src = getSafeSpriteUrl(currentTrainingPoke.sprite);
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
        const targetLvl = getTargetLevelByClass(clase, evo.evolutionStage);
        
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

    xpInput.style.borderColor = inputVal > currentInventory.xp ? "#e53e3e" : "";

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

    const targetLvlRequired = parseInt(selectedOption.dataset.targetLevel);
    const requiresStone = selectedOption.dataset.requiresStone === "true";
    const requiresFriendship = selectedOption.dataset.requiresFriendship === "true";
    const requiresPassport = selectedOption.dataset.requiresPassport === "true";

    const totalNeededXP = getTotalXpForLevel(targetLvlRequired);
    const storedXP = currentTrainingPoke.storedXP || 0;
    const currentTotalXP = storedXP + inputVal;
    
    let percentage = 0;
    if (totalNeededXP > 0) percentage = Math.min(100, Math.round((currentTotalXP / totalNeededXP) * 100));
    else percentage = 100;
    
    xpProgressText.textContent = `${currentTotalXP} / ${totalNeededXP} XP`;
    xpBarFill.style.width = `${percentage}%`;
    xpPercentage.textContent = `${percentage}%`;

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

    if (currentTotalXP < totalNeededXP) canEvolve = false;
    if (inputVal > currentInventory.xp) canEvolve = false;
    
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

    btnEvolve.disabled = !canEvolve;
    btnEvolve.style.backgroundColor = canEvolve ? "#48bb78" : "#a0aec0";
    btnEvolve.style.border = canEvolve ? "1px solid #38a169" : "1px solid #a0aec0";
    btnEvolve.style.cursor = canEvolve ? "pointer" : "not-allowed";
} 

async function handleSaveXPAction() {
    if (!isOwnProfile) return;
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

    if (state.selectedBoxSlotIndex !== null) {
        state.boxes[state.currentBoxIndex][state.selectedBoxSlotIndex] = currentTrainingPoke;
    }

    await saveGameData();

    await window.supabaseClient.from("trainer_log").insert({
      user_id: window.currentUserId,
      activity_type: "exp_assign",
      activity_name: currentTrainingPoke.apodo || currentTrainingPoke.nombre,
      money_reward: 0,
      xp_reward: amount
    });

    alert(msg);
    closeModal("modal-train");
    renderBox();
    renderDetail();
}

async function handleEvolveAction() {
    if (!isOwnProfile) return;
    const select = document.getElementById("train-evolution-select");
    const selectedOption = select.options[select.selectedIndex];
    
    if (!selectedOption || !selectedOption.value) return;

    const xpInput = document.getElementById("train-xp-input");
    const amount = parseInt(xpInput.value) || 0;

    const targetId = selectedOption.value; 
    const targetLvl = parseInt(selectedOption.dataset.targetLevel);
    const requiresStone = selectedOption.dataset.requiresStone === "true";
    const requiresFriendship = selectedOption.dataset.requiresFriendship === "true";
    const requiresPassport = selectedOption.dataset.requiresPassport === "true";

    const nameBeforeEvo = currentTrainingPoke.apodo || currentTrainingPoke.nombre;

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

        if (currentTrainingPoke.nivel < targetLvl) {
            currentTrainingPoke.nivel = targetLvl;
            const minXPForTarget = getTotalXpForLevel(targetLvl);
            if (currentTrainingPoke.storedXP < minXPForTarget) {
                currentTrainingPoke.storedXP = minXPForTarget;
            }
        }

        if (typeof getPokemonClass === 'function') {
             currentTrainingPoke.clase = getPokemonClass(basic.nombre);
        }

        if (state.selectedBoxSlotIndex !== null) {
            state.boxes[state.currentBoxIndex][state.selectedBoxSlotIndex] = currentTrainingPoke;
        }

        await saveGameData();

        await window.supabaseClient.from("trainer_log").insert({
          user_id: window.currentUserId,
          activity_type: "evolution",
          activity_name: `${nameBeforeEvo} a ${basic.nombre}`,
          money_reward: 0,
          xp_reward: 0
        });

        alert(`¡Evolución exitosa a ${basic.nombre}!`);

        closeModal("modal-train");
        renderBox();
        renderDetail();
    } catch (e) {
        console.error("Error en el proceso de evolución:", e);
        alert("Hubo un problema al conectar con PokeAPI. Los cambios no se guardaron.");
    }
}

// =============================
// AÑADIR / EDITAR / MOVER
// =============================
async function handleAddPokemon() {
  if (!isOwnProfile) return;
  const speciesInput = document.getElementById("add-species-input");
  const nicknameInput = document.getElementById("add-nickname-input");
  const personalityField = document.getElementById("add-personality-select");
  const levelInput = document.getElementById("add-level-input");
  const shinyInput = document.getElementById("add-shiny-input");
  const genderInput = document.querySelector('input[name="add-gender"]:checked');
  
  const activityField = document.getElementById("add-activity-select");
  const pokeballField = document.getElementById("add-pokeball-select");

  if (!speciesInput || !personalityField || !levelInput) return;

  const rawSpecies = speciesInput.value.trim();
  if (!rawSpecies) { alert("Escribe un nombre de Pokémon."); return; }

  const personalidad = personalityField.value.trim();
  if (!personalidad) { alert("Selecciona una personalidad."); return; }

  let level = parseInt(levelInput.value, 10);
  if (Number.isNaN(level) || level < 1 || level > 100) level = 1;

  const isShiny = shinyInput ? shinyInput.checked : false;
  const gender = genderInput ? genderInput.value : "Sin género";
  
  const activity = activityField ? activityField.value : "";
  const pokeball = pokeballField ? pokeballField.value : "";
  const registrationDate = new Date().toISOString(); 

  let basic;
  try {
    basic = await fetchPokemonByNameOrId(rawSpecies);
  } catch (e) {
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
    notes: "",
    activity: activity || null,
    pokeball: pokeball || null,
    registrationDate: registrationDate
  };

  box[emptyIndex] = newPoke;
  state.selectedBoxSlotIndex = emptyIndex;

  await saveState();

  await window.supabaseClient.from("trainer_log").insert({
    user_id: window.currentUserId,
    activity_type: "box_add",
    activity_name: newPoke.apodo ? `${newPoke.apodo} (${newPoke.nombre})` : newPoke.nombre,
    money_reward: 0,
    xp_reward: 0
  });

  renderBox();
  renderDetail();

  speciesInput.value = "";
  nicknameInput.value = "";
  personalityField.value = "";
  if(shinyInput) shinyInput.checked = false; 
  if(activityField) activityField.value = "";
  if(pokeballField) pokeballField.value = "";
  
  const radioMacho = document.querySelector('input[name="add-gender"][value="Macho"]');
  if(radioMacho) radioMacho.checked = true;
  const suggest = document.getElementById("add-suggest-list");
  if (suggest) suggest.innerHTML = "";

  closeModal("modal-add");
}

async function handleUpdatePokemon() {
  if (!isOwnProfile) return;
  const box = state.boxes[state.currentBoxIndex];

  if (state.selectedBoxSlotIndex == null || !box[state.selectedBoxSlotIndex]) return;
  const index = state.selectedBoxSlotIndex;

  const poke = box[index];
  if (!poke) return;

  const nicknameInput = document.getElementById("edit-nickname-input");
  const personalitySelect = document.getElementById("edit-personality-select");
  const notesInput = document.getElementById("edit-notes-input");
  
  const activitySelect = document.getElementById("edit-activity-select");
  const pokeballSelect = document.getElementById("edit-pokeball-select");

  if (notesInput) {
    const text = notesInput.value.trim();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length > 60) {
      alert(`Has superado el límite de palabras (${words.length}/60). Por favor, resume tus notas.`);
      return;
    }
    poke.notes = text;
  }

  if (nicknameInput) poke.apodo = nicknameInput.value.trim();
  if (personalitySelect) poke.personalidad = personalitySelect.value; 
  
  if (activitySelect) poke.activity = activitySelect.value || null;
  if (pokeballSelect) poke.pokeball = pokeballSelect.value || null;

  box[index] = poke;

  try {
    await saveState();
    renderBox();
    renderDetail();
    closeModal("modal-edit");
  } catch (error) {
    console.error("Error al guardar los cambios:", error);
  }
}

function handleReleasePokemon() {
  if (!isOwnProfile) return;
  const box = state.boxes[state.currentBoxIndex];

  if (state.selectedBoxSlotIndex == null || !box[state.selectedBoxSlotIndex]) return;
  const poke = box[state.selectedBoxSlotIndex];

  const nombreMostrar = poke.apodo || poke.nombre;
  const ok = confirm(`¿Seguro que quieres liberar a ${nombreMostrar}?`);
  if (!ok) return;

  box[state.selectedBoxSlotIndex] = null;
  state.selectedBoxSlotIndex = null;
  state.detailSource = null;
  saveState();
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

function goToBox(index) {
    if (Number.isNaN(index) || index < 0 || index >= state.boxes.length) return;
    if (index === state.currentBoxIndex) return;
    state.currentBoxIndex = index;
    state.selectedBoxSlotIndex = null;
    saveState();
    renderBox();
    renderDetail();
}

function addNewBox() {
    if (!isOwnProfile) return false;

    if (state.boxes.length >= DEFAULT_MAX_BOXES) {
        const ok = confirm(
            `Ya tienes ${state.boxes.length} cajas (el máximo recomendado es ${DEFAULT_MAX_BOXES}). ¿Quieres añadir una caja adicional de todas formas?`
        );
        if (!ok) return false;
    }

    state.boxes.push(new Array(BOX_SIZE).fill(null));
    state.boxNames.push(null);
    state.currentBoxIndex = state.boxes.length - 1;
    state.selectedBoxSlotIndex = null;
    saveState();
    renderBox();
    renderDetail();
    return true;
}

// =============================
// MENÚ KEBAB DEL PANEL DE DETALLE
// =============================
function openDetailKebabMenu() {
    document.getElementById("detail-kebab-menu")?.classList.remove("hidden");
}

function closeDetailKebabMenu() {
    document.getElementById("detail-kebab-menu")?.classList.add("hidden");
}

function toggleDetailKebabMenu() {
    const menu = document.getElementById("detail-kebab-menu");
    if (!menu) return;
    menu.classList.contains("hidden") ? openDetailKebabMenu() : closeDetailKebabMenu();
}

// =============================
// MOVER POKÉMON A OTRA CAJA (MODAL)
// =============================
function openMoveModal() {
    if (!isOwnProfile || state.boxes.length <= 1) return;
    const box = state.boxes[state.currentBoxIndex];
    if (state.selectedBoxSlotIndex == null || !box[state.selectedBoxSlotIndex]) return;

    closeDetailKebabMenu();

    const select = document.getElementById("move-box-select");
    if (select) {
        select.innerHTML = "";
        state.boxes.forEach((_, i) => {
            if (i === state.currentBoxIndex) return;
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = getBoxName(i);
            select.appendChild(opt);
        });
    }

    openModal("modal-move");
}

function handleConfirmMove() {
    if (!isOwnProfile) return;
    const box = state.boxes[state.currentBoxIndex];
    if (state.selectedBoxSlotIndex == null || !box[state.selectedBoxSlotIndex]) return;

    const select = document.getElementById("move-box-select");
    if (!select || select.value === "") return;
    const targetIndex = parseInt(select.value, 10);
    if (Number.isNaN(targetIndex) || targetIndex === state.currentBoxIndex) return;

    const targetBox = state.boxes[targetIndex];
    const emptyIndex = targetBox.findIndex((slot) => slot === null);
    if (emptyIndex === -1) {
        alert("La caja destino está llena.");
        return;
    }

    const poke = box[state.selectedBoxSlotIndex];
    targetBox[emptyIndex] = poke;
    box[state.selectedBoxSlotIndex] = null;
    state.selectedBoxSlotIndex = null;
    state.detailSource = null;

    saveState();
    closeModal("modal-move");
    renderBox();
    renderDetail();
}

// =============================
// GESTIÓN DE CAJAS (MODAL: RENOMBRAR / REORDENAR / AÑADIR)
// =============================
function renderBoxManagerList() {
    const list = document.getElementById("box-manager-list");
    if (!list) return;
    list.innerHTML = "";

    state.boxes.forEach((box, i) => {
        const li = document.createElement("li");
        li.className = "box-manager-row";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "input box-manager-name-input";
        input.value = state.boxNames[i] || "";
        input.placeholder = `Caja ${i + 1}`;
        input.maxLength = 24;
        input.addEventListener("change", () => handleRenameBox(i, input.value));

        const countLabel = document.createElement("span");
        countLabel.className = "box-manager-count";
        countLabel.textContent = `${box.filter(Boolean).length}/${BOX_SIZE}`;

        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.className = "box-manager-arrow";
        btnUp.textContent = "▲";
        btnUp.disabled = i === 0;
        btnUp.addEventListener("click", () => moveBoxOrder(i, -1));

        const btnDown = document.createElement("button");
        btnDown.type = "button";
        btnDown.className = "box-manager-arrow";
        btnDown.textContent = "▼";
        btnDown.disabled = i === state.boxes.length - 1;
        btnDown.addEventListener("click", () => moveBoxOrder(i, 1));

        li.appendChild(input);
        li.appendChild(countLabel);
        li.appendChild(btnUp);
        li.appendChild(btnDown);
        list.appendChild(li);
    });
}

function handleRenameBox(index, value) {
    if (!isOwnProfile) return;
    const trimmed = value.trim();
    state.boxNames[index] = trimmed || null;
    saveState();
    renderBox();
}

function moveBoxOrder(index, direction) {
    if (!isOwnProfile) return;
    const target = index + direction;
    if (target < 0 || target >= state.boxes.length) return;

    const boxesTemp = state.boxes[index];
    state.boxes[index] = state.boxes[target];
    state.boxes[target] = boxesTemp;

    const namesTemp = state.boxNames[index];
    state.boxNames[index] = state.boxNames[target];
    state.boxNames[target] = namesTemp;

    if (state.currentBoxIndex === index) state.currentBoxIndex = target;
    else if (state.currentBoxIndex === target) state.currentBoxIndex = index;

    saveState();
    renderBox();
    renderDetail();
    renderBoxManagerList();
}

function openBoxManagerModal() {
    if (!isOwnProfile) return;
    renderBoxManagerList();
    openModal("modal-box-manager");
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
    dragon: { color: "#6F35FC", label: "Dragón" },
    siniestro: { color: "#705746", label: "Siniestro" }, dark: { color: "#705746", label: "Siniestro" },
    acero: { color: "#B7B7CE", label: "Acero" }, steel: { color: "#B7B7CE", label: "Acero" },
    hada: { color: "#D685AD", label: "Hada" }, fairy: { color: "#D685AD", label: "Hada" },
};

// ==========================================
// INICIALIZACIÓN CONFIGURADA EN TIEMPO REAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const user = await initProtectedPage({ redirectToLogin: "index.html" });
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");
    boxUserId = urlId || window.currentUserId;
    isOwnProfile = (boxUserId === window.currentUserId);

    if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
    if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();

    await loadState();

    // Migración única: si el entrenador tenía Pokémon en el antiguo "equipo
    // actual", pasan a la caja (esa columna ya no existe en la UI).
    const migratedFromParty = migratePartyIntoBox();
    if (migratedFromParty) await saveState();

    renderTrainerName();
    renderBox();
    renderDetail();

    const boxSelect = document.getElementById("box-select");
    if (boxSelect) boxSelect.addEventListener("change", () => goToBox(parseInt(boxSelect.value, 10)));

    const btnBoxManager = document.getElementById("btn-box-manager");
    if (btnBoxManager) {
      if (!isOwnProfile) btnBoxManager.classList.add("hidden");
      else btnBoxManager.addEventListener("click", openBoxManagerModal);
    }
    document.getElementById("btn-box-manager-close")?.addEventListener("click", () => closeModal("modal-box-manager"));
    document.getElementById("btn-box-manager-add")?.addEventListener("click", addNewBox);

    const btnDetailKebab = document.getElementById("btn-detail-kebab");
    if (btnDetailKebab) {
      btnDetailKebab.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDetailKebabMenu();
      });
    }
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("detail-kebab-menu");
      const kebabBtn = document.getElementById("btn-detail-kebab");
      if (!menu || menu.classList.contains("hidden")) return;
      if (menu.contains(e.target) || kebabBtn?.contains(e.target)) return;
      closeDetailKebabMenu();
    });

    document.getElementById("btn-move-pokemon")?.addEventListener("click", openMoveModal);
    document.getElementById("btn-move-cancel")?.addEventListener("click", () => closeModal("modal-move"));
    document.getElementById("btn-move-confirm")?.addEventListener("click", handleConfirmMove);

    const btnAdd = document.getElementById("btn-add-pokemon");
    if (btnAdd) {
      if (!isOwnProfile) btnAdd.classList.add("hidden");
      else btnAdd.addEventListener("click", () => openModal("modal-add"));
    }
    
    document.getElementById("btn-add-cancel")?.addEventListener("click", () => closeModal("modal-add"));
    document.getElementById("btn-add-confirm")?.addEventListener("click", handleAddPokemon);
    document.getElementById("btn-max-xp")?.addEventListener("click", handleMaxXP);
    
    // PRECARGA AUTOMÁTICA DE DATOS ACTUALES AL ABRIR EL MODAL EDITAR
    document.getElementById("btn-update-pokemon")?.addEventListener("click", () => {
        const box = state.boxes[state.currentBoxIndex];
        const poke = state.selectedBoxSlotIndex != null ? box[state.selectedBoxSlotIndex] : null;

        if (poke) {
            document.getElementById("edit-nickname-input").value = poke.apodo || "";
            document.getElementById("edit-personality-select").value = poke.personalidad || "";
            document.getElementById("edit-activity-select").value = poke.activity || "";
            document.getElementById("edit-pokeball-select").value = poke.pokeball || "";
            
            const notesInput = document.getElementById("edit-notes-input");
            if (notesInput) {
                notesInput.value = poke.notes || "";
                const words = notesInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
                const wordCountDisplay = document.getElementById("word-count-display");
                if (wordCountDisplay) wordCountDisplay.textContent = `Palabras: ${words} / 60`;
            }
        }
        openModal("modal-edit");
    });

    document.getElementById("btn-release-pokemon")?.addEventListener("click", handleReleasePokemon);
    document.getElementById("btn-edit-cancel")?.addEventListener("click", () => closeModal("modal-edit"));
    document.getElementById("btn-edit-confirm")?.addEventListener("click", handleUpdatePokemon);

    document.getElementById("train-xp-input")?.addEventListener("input", updateTrainingUI);
    document.getElementById("train-evolution-select")?.addEventListener("change", updateTrainingUI);
    document.getElementById("btn-save-xp")?.addEventListener("click", handleSaveXPAction);
    document.getElementById("btn-do-evolve")?.addEventListener("click", handleEvolveAction);
    document.getElementById("btn-train-cancel")?.addEventListener("click", () => closeModal("modal-train"));

    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => { sideMenu.classList.remove("hidden"); };
        if (btnClose) { btnClose.onclick = () => sideMenu.classList.add("hidden"); }
        sideMenu.onclick = (e) => { if (e.target === sideMenu) sideMenu.classList.add("hidden"); };
    }

    const addSpeciesInput = document.getElementById("add-species-input");
    const addSuggestList = document.getElementById("add-suggest-list");
    if (addSpeciesInput && addSuggestList) {
        setupSuggest(addSpeciesInput, addSuggestList);
    }
});

// ==========================================
// CONEXIONES FINALES CON EL HTML (Limpio)
// ==========================================
window.closeSummaryModal = () => document.getElementById("modal-summary").classList.add("hidden");
window.closeHatchModal = () => document.getElementById("modal-hatch").classList.add("hidden");