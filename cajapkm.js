// cajapkm.js
// =============================
// Configuración y estado
// =============================
const STORAGE_KEY = "pokeBoxState_v1";
const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const TRAINER_META_KEY = "pokeTrainerMeta_v1";

let state = {
  party: new Array(6).fill(null), // 6 slots
  boxes: [new Array(30).fill(null)], // al menos 1 caja con 30 slots
  currentBoxIndex: 0,
  selectedBoxSlotIndex: null, // índice 0-29 dentro de la caja actual
  selectedPartyIndex: null, // índice 0-5 dentro de la party
  detailSource: null, // "box" | "party" | null
};

let allPokemonList = null; // para autocompletado
let dragSourceIndex = null; // índice del slot que se está arrastrando

// =============================
// Utilidades
// =============================
// AHORA async: primero intenta Supabase, luego fallback localStorage
async function loadState() {
  const supabase = window.supabase;
  const userId = window.currentUserId;

  let loadedFromSupabase = false;

  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("user_game_data")
        .select("box_data, party_data")
        .eq("id", userId);

      if (error) {
        console.error("Error leyendo estado desde base de datos", error);
      } else if (data && data.length > 0) {
        const row = data[0];

        // party_data: array de 6 slots
        if (Array.isArray(row.party_data)) {
          state.party = row.party_data;
        }

        // box_data: { boxes: [...], currentBoxIndex: n }
        if (row.box_data && Array.isArray(row.box_data.boxes)) {
          state.boxes = row.box_data.boxes;
          if (
            typeof row.box_data.currentBoxIndex === "number" &&
            row.box_data.currentBoxIndex >= 0
          ) {
            state.currentBoxIndex = row.box_data.currentBoxIndex;
          }
        }

        loadedFromSupabase = true;
      } else {
        // No hay fila: crear una nueva con estado inicial
        const initialRow = {
          id: userId,
          box_data: {
            boxes: state.boxes,
            currentBoxIndex: state.currentBoxIndex,
          },
          party_data: state.party,
        };
        const { error: insertError } = await supabase
          .from("user_game_data")
          .insert(initialRow);

        if (insertError) {
          console.error(
            "Error creando fila inicial en base de datos",
            insertError
          );
        } else {
          loadedFromSupabase = true;
        }
      }
    } catch (e) {
      console.error("Error loadState BD", e);
    }
  }

  // Si NO se cargó desde Supabase, usamos el comportamiento anterior (localStorage)
  if (!loadedFromSupabase) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Validación simple
        if (Array.isArray(parsed.party) && Array.isArray(parsed.boxes)) {
          state = parsed;
        }
      }
    } catch (e) {
      console.error("Error cargando estado desde guardado local", e);
    }
  }

  // Aseguramos estructura mínima
  if (!Array.isArray(state.party) || state.party.length !== 6) {
    state.party = new Array(6).fill(null);
  }
  if (!Array.isArray(state.boxes) || state.boxes.length === 0) {
    state.boxes = [new Array(30).fill(null)];
  } else {
    // Asegurar que cada caja tenga 30 slots
    state.boxes = state.boxes.map((box) => {
      const arr = Array.isArray(box) ? box.slice(0, 30) : [];
      while (arr.length < 30) arr.push(null);
      return arr;
    });
  }
}

// Guardamos en localStorage + Supabase (si existe sesión)
function saveState() {
  // Comportamiento original: guardar todo el objeto state en localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Error guardando en local", e);
  }

  const supabase = window.supabase;
  const userId = window.currentUserId;

  if (supabase && userId) {
    (async () => {
      try {
        const payload = {
          id: userId,
          box_data: {
            boxes: state.boxes,
            currentBoxIndex: state.currentBoxIndex,
          },
          party_data: state.party,
        };

        const { error } = await supabase
          .from("user_game_data")
          .upsert(payload, { onConflict: "id" });

        if (error) {
          console.error("Error guardando estado en base de datos", error);
        }
      } catch (e) {
        console.error("Error saveState en base de datos", e);
      }
    })();
  }
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Mapeo simple de tipos EN -> ES
const TYPE_MAP_ES = {
  normal: "normal",
  fire: "fuego",
  water: "agua",
  grass: "planta",
  electric: "eléctrico",
  ice: "hielo",
  fighting: "lucha",
  poison: "veneno",
  ground: "tierra",
  flying: "volador",
  psychic: "psíquico",
  bug: "bicho",
  rock: "roca",
  ghost: "fantasma",
  dragon: "dragón",
  dark: "siniestro",
  steel: "acero",
  fairy: "hada",
};

function translateType(typeName) {
  return TYPE_MAP_ES[typeName] || typeName;
}

// =============================
// PokeAPI helpers
// =============================
async function fetchPokemonList() {
  if (allPokemonList) return allPokemonList;
  const res = await fetch(`${POKEAPI_BASE}/pokemon?limit=100000&offset=0`);
  const data = await res.json();
  allPokemonList = data.results; // [{name, url}, ...]
  return allPokemonList;
}

// =============================
// Evoluciones con PokeAPI
// =============================
function parseSpeciesIdFromUrl(url) {
  const parts = url.split("/").filter(Boolean);
  const idStr = parts[parts.length - 1];
  return parseInt(idStr, 10);
}

// Detecta si un nombre de PokeAPI tiene sufijo regional: -alola, -galar, etc.
function getRegionSuffixFromApiName(name) {
  const m = String(name)
    .toLowerCase()
    .match(/-(alola|galar|hisui|paldea|sinnoh|unova|kanto|johto)/);
  return m ? m[0] : null; // ej. "-alola"
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

/**
 * Obtiene las posibles evoluciones inmediatas de un Pokémon
 * usando su id actual (PokeAPI /pokemon/{id}) y nombre actual.
 * Funciona también para formas regionales (alola, galar, etc.).
 * Devuelve array de { id, name, requiresStone, requiresFriendship } o [].
 */
async function getEvolutionOptions(pokemonId, pokemonName) {
  try {
    // 0. Datos del pokémon actual, para obtener species + nombre real de PokeAPI
    const resPokemon = await fetch(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
    if (!resPokemon.ok) return [];
    const pokemonData = await resPokemon.json();

    // Sufijo regional, ej. "-alola", "-galar", etc. (si aplica)
    const regionSuffix = getRegionSuffixFromApiName(pokemonData.name);

    // 1. Species REAL del pokémon (vulpix, meowth, etc.)
    const speciesUrl = pokemonData.species.url;
    const resSpecies = await fetch(speciesUrl);
    if (!resSpecies.ok) return [];
    const speciesData = await resSpecies.json(); // speciesData.name = "vulpix"

    // 2. Cadena de evolución
    const evoUrl = speciesData.evolution_chain?.url;
    if (!evoUrl) return [];
    const resChain = await fetch(evoUrl);
    if (!resChain.ok) return [];
    const chainData = await resChain.json();

    const root = chainData.chain;

    // MUY IMPORTANTE:
    // Buscamos el nodo por speciesData.name (ej. "vulpix"), NO por el nombre mostrado.
    const node = findEvolutionNode(root, speciesData.name);
    if (
      !node ||
      !Array.isArray(node.evolves_to) ||
      node.evolves_to.length === 0
    ) {
      return [];
    }

    const options = [];

    // 3. Para cada evolución inmediata
    for (const evNode of node.evolves_to) {
      const evoSpeciesName = evNode.species.name; // ej. "ninetales"

      // 3.1 Species de la evolución (aquí se ven las variedades: normal, alola, galar...)
      const resEvoSpecies = await fetch(
        `${POKEAPI_BASE}/pokemon-species/${evoSpeciesName}`
      );
      if (!resEvoSpecies.ok) continue;
      const evoSpeciesData = await resEvoSpecies.json();

      // 3.2 Elegir qué "variety" usar para esta evolución:
      //     - si el pokémon actual es regional, buscamos misma región (ninetales-alola)
      //     - si no, usamos la forma default (ninetales)
      let targetVar = null;

      if (regionSuffix) {
        targetVar = evoSpeciesData.varieties.find((v) =>
          v.pokemon.name.toLowerCase().endsWith(regionSuffix)
        );
      }

      if (!targetVar) {
        targetVar =
          evoSpeciesData.varieties.find((v) => v.is_default) ||
          evoSpeciesData.varieties[0];
      }

      if (!targetVar) continue;

      // targetVar.pokemon.url es algo como ".../pokemon/10167/"
      const evoPokemonId = parseSpeciesIdFromUrl(targetVar.pokemon.url);
      const evoPokemonName = capitalize(targetVar.pokemon.name);

      let requiresStone = false;
      let requiresFriendship = false;

      // 3.3 Revisar detalles de evolución (piedra / amistad) igual que antes
      if (Array.isArray(evNode.evolution_details)) {
        for (const detail of evNode.evolution_details) {
          // Evolución por piedra
          if (
            detail.trigger?.name === "use-item" &&
            detail.item?.name &&
            detail.item.name.endsWith("stone")
          ) {
            requiresStone = true;
          }

          // Evolución por amistad/afecto
          if (
            (typeof detail.min_happiness === "number" &&
              detail.min_happiness > 0) ||
            (typeof detail.min_affection === "number" &&
              detail.min_affection > 0)
          ) {
            requiresFriendship = true;
          }
        }
      }

      options.push({
        id: evoPokemonId, // <- ID del /pokemon correcto (forma normal o regional)
        name: evoPokemonName,
        requiresStone,
        requiresFriendship,
      });
    }

    return options;
  } catch (err) {
    console.error("Error obteniendo evoluciones:", err);
    return [];
  }
}

function filterSuggestions(list, query, max = 7) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  // Permitimos buscar por número también
  // Si es número exacto, lo emparejamos con el id equivalente
  const isNum = /^\d+$/.test(q);

  return list
    .filter((p) => {
      if (isNum) return false; // por simplicidad, manejamos num directo en fetch
      return p.name.startsWith(q);
    })
    .slice(0, max);
}

async function fetchPokemonByNameOrId(value) {
  const v = value.toString().trim().toLowerCase();
  if (!v) throw new Error("Nombre vacío");
  const res = await fetch(`${POKEAPI_BASE}/pokemon/${v}`);
  if (!res.ok) {
    throw new Error("Pokémon no encontrado");
  }
  const data = await res.json();
  const id = data.id;
  const numero = "#" + String(id).padStart(3, "0");
  const nombre = capitalize(data.name);
  const tipos = data.types.map((t) => translateType(t.type.name));
  const sprite =
    data.sprites?.other?.home?.front_default ||
    data.sprites?.front_default ||
    "";

  return {
    id,
    numero,
    nombre,
    tipos,
    sprite,
  };
}

// =============================
// Render de UI
// =============================
function renderTrainerName() {
  // Tomamos el nombre que nos puso core.js
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

    // Resaltar si está seleccionado
    if (state.selectedPartyIndex === index) {
      slot.classList.add("selected");
    }

    // Click en slot de party
    slot.addEventListener("click", () => {
      if (!state.party[index]) {
        // si está vacío, quitamos selección
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

    // ✅ Hacer todos los slots "arrastrables"
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
      label.textContent = poke.apodo || poke.nombre;

      slot.appendChild(img);
      slot.appendChild(label);
    }

    if (state.selectedBoxSlotIndex === index) {
      slot.classList.add("selected");
    }

    // 👆 Click para seleccionar y mostrar detalles
    slot.addEventListener("click", () => {
      state.selectedBoxSlotIndex = index;
      state.selectedPartyIndex = null;
      state.detailSource = "box";
      renderBox();
      renderParty();
      renderDetail();
      saveState();
    });

    // ================================
    //    EVENTOS DE DRAG & DROP
    // ================================
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

  // Preferimos party si hay algo seleccionado ahí
  if (
    state.selectedPartyIndex != null &&
    state.party[state.selectedPartyIndex]
  ) {
    source = "party";
    poke = state.party[state.selectedPartyIndex];
  } else if (
    state.selectedBoxSlotIndex != null &&
    box[state.selectedBoxSlotIndex]
  ) {
    source = "box";
    poke = box[state.selectedBoxSlotIndex];
  } else {
    state.detailSource = null;
  }

  const btnUpdate = document.getElementById("btn-update-pokemon");
  const btnMove = document.getElementById("btn-move-to-party");
  const btnRelease = document.getElementById("btn-release-pokemon");

  if (!poke) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    if (btnUpdate) btnUpdate.disabled = true;
    if (btnMove) btnMove.disabled = true;
    if (btnRelease) btnRelease.disabled = true;
    return;
  }

  state.detailSource = source;

  empty.classList.add("hidden");
  content.classList.remove("hidden");
  if (btnUpdate) btnUpdate.disabled = false;
  if (btnMove) {
    btnMove.disabled = false;
    btnMove.textContent =
      source === "party" ? "Retirar de equipo actual" : "Mover a equipo actual";
  }
  if (btnRelease) btnRelease.disabled = false;

  document.getElementById("detail-sprite").src = poke.sprite || "";
  document.getElementById("detail-sprite").alt = poke.apodo || poke.nombre;

  const nn = document.getElementById("detail-number-name");
  nn.textContent = `${poke.numero} ${poke.nombre}`;

  const typesContainer = document.getElementById("detail-types");
  typesContainer.innerHTML = "";

  (poke.tipos || []).forEach((t) => {
    const pill = document.createElement("span");
    pill.className = "type-pill";

    const key = normalizeTypeKey(t); // <-- aquí usamos la función
    const meta = TYPE_META[key] || {};

    // Texto: etiqueta en español si existe, o el texto original
    pill.textContent = (meta.label || t).toUpperCase();

    // Color de fondo si lo tenemos definido
    if (meta.color) {
      pill.style.backgroundColor = meta.color;
      pill.style.color = "#ffffff";
    }

    typesContainer.appendChild(pill);
  });

  document.getElementById("detail-apodo").textContent =
    poke.apodo || "(Sin apodo)";
  document.getElementById("detail-nivel").textContent = poke.nivel || 1;
  document.getElementById("detail-personalidad").textContent =
    poke.personalidad || "(Sin definir)";
  document.getElementById("detail-clase").textContent =
    poke.clase || "(Sin definir)";
  document.getElementById("detail-capturado-como").textContent =
    poke.capturadoComo || poke.nombre;
}

// =============================
// Modales
// =============================
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

// =============================
// Lógica: añadir, actualizar, mover, liberar
// =============================

// Añadir Pokémon a la caja
async function handleAddPokemon() {
  const speciesInput = document.getElementById("add-species-input");
  const nicknameInput = document.getElementById("add-nickname-input");
  const personalityField = document.getElementById("add-personality-select");
  const classField = document.getElementById("add-class-select");
  const levelInput = document.getElementById("add-level-input");

  if (!speciesInput || !personalityField || !classField || !levelInput) {
    console.error("Faltan elementos del formulario de 'Añadir Pokémon'.");
    return;
  }

  const rawSpecies = speciesInput.value.trim();
  if (!rawSpecies) {
    alert("Escribe un nombre de Pokémon.");
    return;
  }

  // Validar personalidad
  const personalidad = personalityField.value.trim();
  if (!personalidad) {
    alert("Selecciona una personalidad para el Pokémon.");
    return;
  }

  // Validar clase
  const clase = classField.value.trim();
  if (!clase) {
    alert("Selecciona una clase de Pokémon.");
    return;
  }

  // Validar nivel
  let level = parseInt(levelInput.value, 10);
  if (Number.isNaN(level) || level < 1 || level > 100) {
    level = 1; // valor por defecto si está vacío o fuera de rango
  }

  let basic;
  try {
    basic = await fetchPokemonByNameOrId(rawSpecies);
  } catch (e) {
    console.error(e);
    alert("No encontré ese Pokémon en la base de datos. Revisa el nombre.");
    return;
  }

  const box = state.boxes[state.currentBoxIndex];
  const emptyIndex = box.findIndex((slot) => slot === null);
  if (emptyIndex === -1) {
    alert("Esta caja está llena. Cambia de caja o libera un espacio.");
    return;
  }

  const newPoke = {
    id: basic.id,
    numero: basic.numero,
    nombre: basic.nombre,
    tipos: basic.tipos,
    sprite: basic.sprite,
    apodo: nicknameInput.value.trim() || "",
    nivel: level,
    personalidad,
    clase: clase,
    capturadoComo: basic.nombre,
  };

  box[emptyIndex] = newPoke;
  state.selectedBoxSlotIndex = emptyIndex;

  saveState();
  renderParty();
  renderBox();
  renderDetail();

  // limpiar campos del modal
  speciesInput.value = "";
  nicknameInput.value = "";
  personalityField.value = "";
  classField.value = "";
  const suggest = document.getElementById("add-suggest-list");
  if (suggest) suggest.innerHTML = "";

  closeModal("modal-add");
}

// Actualizar (nivel, apodo, evolución) para BOX o PARTY
async function handleUpdatePokemon() {
  const box = state.boxes[state.currentBoxIndex];

  // Determinar de dónde viene el Pokémon mostrado en el panel derecho
  let container = null; // puede ser state.party o box
  let index = null;

  if (
    state.detailSource === "party" &&
    state.selectedPartyIndex != null &&
    state.party[state.selectedPartyIndex]
  ) {
    container = state.party;
    index = state.selectedPartyIndex;
  } else if (
    state.selectedBoxSlotIndex != null &&
    box[state.selectedBoxSlotIndex]
  ) {
    container = box;
    index = state.selectedBoxSlotIndex;
  } else {
    // No hay Pokémon seleccionado
    return;
  }

  const poke = container[index];
  if (!poke) return;

  const nicknameInput = document.getElementById("edit-nickname-input");
  const levelInput = document.getElementById("edit-level-input");
  const evolutionSelect = document.getElementById("edit-evolution-select");

  if (!nicknameInput || !levelInput) {
    console.error("Faltan campos de edición.");
    return;
  }

  const newApodo = nicknameInput.value.trim();

  let newNivel = parseInt(levelInput.value, 10);
  if (Number.isNaN(newNivel)) {
    newNivel = poke.nivel || 1;
  }

  if (newNivel < 1 || newNivel > 100) {
    alert("El nivel debe estar entre 1 y 100");
    return;
  }

  // Evolución (si se seleccionó alguna opción distinta a "No evolucionar")
  const evolutionId = evolutionSelect ? evolutionSelect.value.trim() : "";
  if (evolutionId && evolutionSelect) {
    const selectedOption =
      evolutionSelect.options[evolutionSelect.selectedIndex];

    const needsStone =
      selectedOption && selectedOption.dataset.requiresStone === "true";
    const needsFriendship =
      selectedOption && selectedOption.dataset.requiresFriendship === "true";

    // Si requiere piedra o amistad, necesitamos leer el meta del entrenador
    let meta = null;
    if (needsStone || needsFriendship) {
      try {
        const rawMeta = localStorage.getItem(TRAINER_META_KEY);
        meta = rawMeta ? JSON.parse(rawMeta) : null;
      } catch (e) {
        console.error("Error leyendo datos del entrenador:", e);
      }

      if (!meta || !meta.items) {
        alert(
          "No se pudo validar el inventario del entrenador. Intenta de nuevo."
        );
        return;
      }

      // Validar piedra de evolución (si la requiere)
      if (needsStone) {
        if (!meta.items.evoStone || meta.items.evoStone <= 0) {
          alert(
            "No puedes evolucionar este Pokémon: necesitas al menos 1 Piedra Evolución en tu inventario."
          );
          return;
        }
      }

      // Validar brazalete de amistad (si lo requiere)
      if (needsFriendship) {
        if (!meta.items.friendship || meta.items.friendship <= 0) {
          alert(
            "No puedes evolucionar este Pokémon: necesitas al menos 1 Pulsera Amistad en tu inventario."
          );
          return;
        }
      }

      // Consumir objetos requeridos
      if (needsStone) {
        meta.items.evoStone = Math.max(0, (meta.items.evoStone || 0) - 1);
      }
      if (needsFriendship) {
        meta.items.friendship = Math.max(0, (meta.items.friendship || 0) - 1);
      }

      localStorage.setItem(TRAINER_META_KEY, JSON.stringify(meta));
    }

    // Aplicar la evolución normalmente
    try {
      const basic = await fetchPokemonByNameOrId(evolutionId);
      poke.id = basic.id;
      poke.numero = basic.numero;
      poke.nombre = basic.nombre;
      poke.tipos = basic.tipos;
      poke.sprite = basic.sprite;
      // OJO: mantenemos apodo, nivel, personalidad, clase, capturadoComo
    } catch (e) {
      console.error(e);
      alert(
        "No se pudo aplicar la evolución seleccionada. Se guardarán los demás cambios."
      );
    }
  }

  // Actualizar datos comunes
  poke.apodo = newApodo;
  poke.nivel = Math.max(1, Math.min(100, newNivel));
  // Ya NO tocamos la personalidad (se queda fija)

  // (poke ya es referencia dentro de container[index], pero por claridad:)
  container[index] = poke;

  saveState();
  renderParty();
  renderBox();
  renderDetail();

  closeModal("modal-edit");
}

function handleReleasePokemon() {
  const box = state.boxes[state.currentBoxIndex];

  let poke = null;
  let nombreMostrar = "";
  let releasingFrom = null;

  if (
    state.detailSource === "party" &&
    state.selectedPartyIndex != null &&
    state.party[state.selectedPartyIndex]
  ) {
    releasingFrom = "party";
    poke = state.party[state.selectedPartyIndex];
  } else if (
    state.selectedBoxSlotIndex != null &&
    box[state.selectedBoxSlotIndex]
  ) {
    releasingFrom = "box";
    poke = box[state.selectedBoxSlotIndex];
  }

  if (!poke) return;

  nombreMostrar = poke.apodo || poke.nombre;

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
    // Retirar de equipo actual → mandar a la caja
    const pIdx = state.selectedPartyIndex;
    if (pIdx == null || !state.party[pIdx]) return;

    const poke = state.party[pIdx];

    const emptyBoxIndex = box.findIndex((x) => x === null);
    if (emptyBoxIndex === -1) {
      alert(
        "La caja actual está llena. Libera un espacio antes de retirar un Pokémon del equipo."
      );
      return;
    }

    box[emptyBoxIndex] = poke;
    state.party[pIdx] = null;
    state.selectedPartyIndex = null;
    state.detailSource = null;
  } else {
    // Comportamiento original: mover de caja → equipo
    const idx = state.selectedBoxSlotIndex;
    if (idx == null || !box[idx]) return;

    const poke = box[idx];

    const emptyIndex = state.party.findIndex((x) => x === null);
    if (emptyIndex === -1) {
      alert(
        "Tu equipo actual está lleno. Libera un espacio antes de mover otro Pokémon."
      );
      return;
    }

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

// =============================
// Autocompletado
// =============================
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

// =============================
// Navegación entre cajas
// =============================
function goToPrevBox() {
  if (state.currentBoxIndex > 0) {
    state.currentBoxIndex--;
  } else {
    state.currentBoxIndex = state.boxes.length - 1;
  }
  state.selectedBoxSlotIndex = null;
  saveState();
  renderBox();
  renderDetail();
}

function goToNextBox() {
  if (state.currentBoxIndex < state.boxes.length - 1) {
    state.currentBoxIndex++;
  } else {
    state.boxes.push(new Array(30).fill(null));
    state.currentBoxIndex = state.boxes.length - 1;
  }
  state.selectedBoxSlotIndex = null;
  saveState();
  renderBox();
  renderDetail();
}

// =============================
// Inicialización (con core.js)
// =============================
document.addEventListener("DOMContentLoaded", () => {
  (async () => {
    // 1) Proteger la página (core.js)
    const user = await initProtectedPage({
      redirectToLogin: "index.html",
    });
    if (!user) return; // ya redirigió al login

    // 2) Configurar botón de cerrar sesión (core.js)
    if (typeof setupLogoutButton === "function") {
      setupLogoutButton();
    }

    // 3) Leer trainer_name desde Supabase y guardarlo en window.currentTrainerName
    //    (esta función viene de core.js, igual que en trainer.js)
    if (typeof renderTrainerLabelFromGame === "function") {
      await renderTrainerLabelFromGame();
    }

    // 4) Pintar el nombre en la barra de la Caja con el valor actualizado
    renderTrainerName();

    // 5) Cargar estado (Supabase o local) y dibujar caja + party
    await loadState();
    renderParty();
    renderBox();
    renderDetail();

    // 6) Listeners (todo lo que ya tenías)
    const prevBtn = document.getElementById("btn-prev-box");
    const nextBtn = document.getElementById("btn-next-box");
    if (prevBtn) prevBtn.addEventListener("click", goToPrevBox);
    if (nextBtn) nextBtn.addEventListener("click", goToNextBox);

    // --- MODAL AÑADIR ---
    const btnAdd = document.getElementById("btn-add-pokemon");
    const btnAddCancel = document.getElementById("btn-add-cancel");
    const btnAddConfirm = document.getElementById("btn-add-confirm");

    if (btnAdd) btnAdd.addEventListener("click", () => openModal("modal-add"));
    if (btnAddCancel)
      btnAddCancel.addEventListener("click", () => closeModal("modal-add"));
    if (btnAddConfirm)
      btnAddConfirm.addEventListener("click", handleAddPokemon);

    // --- MODAL ACTUALIZAR ---
    const btnUpdate = document.getElementById("btn-update-pokemon");
    const btnEditCancel = document.getElementById("btn-edit-cancel");
    const btnEditConfirm = document.getElementById("btn-edit-confirm");

    if (btnUpdate) {
      btnUpdate.addEventListener("click", async () => {
        const box = state.boxes[state.currentBoxIndex];

        let poke = null;

        if (
          state.detailSource === "party" &&
          state.selectedPartyIndex != null &&
          state.party[state.selectedPartyIndex]
        ) {
          poke = state.party[state.selectedPartyIndex];
        } else if (
          state.selectedBoxSlotIndex != null &&
          box[state.selectedBoxSlotIndex]
        ) {
          poke = box[state.selectedBoxSlotIndex];
        }

        if (!poke) return;

        document.getElementById("edit-nickname-input").value = poke.apodo || "";
        document.getElementById("edit-level-input").value = poke.nivel || 1;

        const personalitySelect = document.getElementById(
          "edit-personality-select"
        );
        if (personalitySelect) {
          personalitySelect.value = poke.personalidad || "";
        }

        const evolutionGroup = document.querySelector(".evolution-group");
        const evolutionSelect = document.getElementById(
          "edit-evolution-select"
        );
        if (evolutionGroup && evolutionSelect) {
          evolutionGroup.style.display = "none";
          evolutionSelect.innerHTML =
            '<option value="">No evolucionar</option>';

          const evolutions = await getEvolutionOptions(poke.id, poke.nombre);
          if (evolutions.length > 0) {
            evolutions.forEach((ev) => {
              const option = document.createElement("option");
              option.value = String(ev.id);
              option.textContent = `Evolucionar a #${String(ev.id).padStart(
                3,
                "0"
              )} ${ev.name}`;
              if (ev.requiresStone) {
                option.dataset.requiresStone = "true";
              }
              if (ev.requiresFriendship) {
                option.dataset.requiresFriendship = "true";
              }
              evolutionSelect.appendChild(option);
            });
            evolutionGroup.style.display = "block";
          }
        }

        openModal("modal-edit");
      });
    }

    if (btnEditCancel)
      btnEditCancel.addEventListener("click", () => closeModal("modal-edit"));
    if (btnEditConfirm)
      btnEditConfirm.addEventListener("click", handleUpdatePokemon);

    const btnRelease = document.getElementById("btn-release-pokemon");
    const btnMove = document.getElementById("btn-move-to-party");

    if (btnRelease) btnRelease.addEventListener("click", handleReleasePokemon);
    if (btnMove) btnMove.addEventListener("click", handleMoveToParty);

    const addSpeciesInput = document.getElementById("add-species-input");
    const addSuggestList = document.getElementById("add-suggest-list");
    if (addSpeciesInput && addSuggestList) {
      setupSuggest(addSpeciesInput, addSuggestList);
    }
  })();
});

// Normaliza el texto de tipo: minúsculas y sin acentos
function normalizeTypeKey(t) {
  return String(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .trim();
}
const TYPE_META = {
  normal: { color: "#A8A77A", label: "Normal" },

  fuego: { color: "#EE8130", label: "Fuego" },
  fire: { color: "#EE8130", label: "Fuego" },

  agua: { color: "#6390F0", label: "Agua" },
  water: { color: "#6390F0", label: "Agua" },

  electrico: { color: "#F7D02C", label: "Eléctrico" },
  electric: { color: "#F7D02C", label: "Eléctrico" },

  planta: { color: "#7AC74C", label: "Planta" },
  grass: { color: "#7AC74C", label: "Planta" },

  hielo: { color: "#96D9D6", label: "Hielo" },
  ice: { color: "#96D9D6", label: "Hielo" },

  lucha: { color: "#C22E28", label: "Lucha" },
  fighting: { color: "#C22E28", label: "Lucha" },

  veneno: { color: "#A33EA1", label: "Veneno" },
  poison: { color: "#A33EA1", label: "Veneno" },

  tierra: { color: "#E2BF65", label: "Tierra" },
  ground: { color: "#E2BF65", label: "Tierra" },

  volador: { color: "#A98FF3", label: "Volador" },
  flying: { color: "#A98FF3", label: "Volador" },

  psiquico: { color: "#F95587", label: "Psíquico" },
  psychic: { color: "#F95587", label: "Psíquico" },

  bicho: { color: "#A6B91A", label: "Bicho" },
  bug: { color: "#A6B91A", label: "Bicho" },

  roca: { color: "#B6A136", label: "Roca" },
  rock: { color: "#B6A136", label: "Roca" },

  fantasma: { color: "#735797", label: "Fantasma" },
  ghost: { color: "#735797", label: "Fantasma" },

  dragon: { color: "#6F35FC", label: "Dragón" },
  dragon_en: { color: "#6F35FC", label: "Dragón" },

  siniestro: { color: "#705746", label: "Siniestro" },
  dark: { color: "#705746", label: "Siniestro" },

  acero: { color: "#B7B7CE", label: "Acero" },
  steel: { color: "#B7B7CE", label: "Acero" },

  hada: { color: "#D685AD", label: "Hada" },
  fairy: { color: "#D685AD", label: "Hada" },
};
