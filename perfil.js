// perfil.js - Tarjeta de Identidad, Buzón Multijugador y Consumo de Tickets Reguladores
// ========================================================================================

const GAME_TABLE = "user_game_data";
const TRAINER_TABLE = "trainer_inventory";
const LOG_TABLE = "trainer_log";
const TRADE_TABLE = "trainer_trades";
const DISCOVERY_TABLE = "sorelle_discoveries";
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

let profileUserId = null; 
let isOwnProfile = true;  
let currentMeta = null;
let ownedPokemonPool = [];
let visitorOwnTradePool = []; // Pool de intercambio exclusivo del Usuario A (visitante)

// Variables de control del sistema de comercio y alertas
let selectedReceiverPkm = null;
let selectedSenderPkm = null;
let tradeProposalStep = 1;

function $(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  const user = await initProtectedPage();
  if (!user) return;

  if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();
  initHamburgerMenu();

  const urlParams = new URLSearchParams(window.location.search);
  const urlId = urlParams.get("id");
  
  profileUserId = urlId || window.currentUserId;
  isOwnProfile = (profileUserId === window.currentUserId);

  setupProfileButtonsRole();
  await loadProfileData();
  setupModalAutocomplete();

  // Listeners de la tarjeta propia
  $("btn-open-edit").onclick = openEditModal;
  $("btn-close-edit-modal").onclick = () => $("modal-edit-profile").classList.add("hidden");
  $("btn-save-edit-modal").onclick = saveAllModalChanges;
  $("modal-input-avatar").onchange = handleAvatarUpload;

  // Listeners del Asistente de Intercambios
  $("btn-trade-cancel").onclick = closeTradeProposalModal;
  $("btn-trade-next").onclick = handleTradeModalNextStep;

  // =========================================================================
  // ENFUERZA RETRO: Romper bloqueos de caché forzando la fuente pixelada
  // =========================================================================
  document.querySelectorAll('.row-card-title').forEach(titulo => {
    titulo.style.setProperty('font-family', "'Press Start 2P', monospace", 'important');
    titulo.style.setProperty('font-size', '0.7rem', 'important');
    titulo.style.setProperty('font-weight', 'normal', 'important');
    titulo.style.setProperty('letter-spacing', '-0.5px', 'important');
  });
});

// ==========================================
// GESTIÓN DE ROL Y PROPUESTAS DE INTERCAMBIO
// ==========================================
function setupProfileButtonsRole() {
  if (isOwnProfile) {
    $("btn-open-edit")?.classList.remove("hidden");
    $("btn-view-box")?.classList.add("hidden");
    $("btn-propose-trade")?.classList.add("hidden");
  } else {
    $("btn-open-edit")?.classList.add("hidden");
    $("btn-view-box")?.classList.remove("hidden");
    $("btn-propose-trade")?.classList.remove("hidden");

    $("btn-propose-trade").onclick = openTradeProposalModal;
    $("btn-view-box").onclick = () => {
      window.location.href = `cajapkm.html?id=${profileUserId}`; 
    };
  }
}

// ==========================================
// ASISTENTE DE PROPUESTA: ENFRENTAR VITRINAS Y TICKETS
// ==========================================
async function openTradeProposalModal() {
  const supabase = window.supabaseClient;
  const myId = window.currentUserId;

  try {
    const { data: myInvRow } = await supabase.from(TRAINER_TABLE).select("inventory").eq("user_id", myId).maybeSingle();
    const myMeta = myInvRow?.inventory || {};
    myMeta.items = myMeta.items || {};
    if ((myMeta.items.tradeToken || 0) <= 0) {
      alert("No cuentas con tickets de intercambio.");
      return;
    }

    currentMeta.items = currentMeta.items || {};
    if ((currentMeta.items.tradeToken || 0) <= 0) {
      alert("El otro isleño no cuenta con tickets de intercambio.");
      return;
    }

    selectedReceiverPkm = null;
    selectedSenderPkm = null;
    tradeProposalStep = 1;

    $("stats-receiver-preview").textContent = "Selecciona un pokémon...";
    $("stats-sender-preview").textContent = "Selecciona tu oferta...";
    $("btn-trade-next").disabled = true;
    $("btn-trade-next").textContent = "Siguiente";
    $("trade-step-select").classList.remove("hidden");
    $("trade-step-confirm").classList.add("hidden");

    const receiverContainer = $("proposal-receiver-pool");
    receiverContainer.innerHTML = "";
    const receiverTrades = ownedPokemonPool.filter(p => p.forTrade === true);

    if (receiverTrades.length === 0) {
      receiverContainer.innerHTML = `<p style="font-size:0.65rem; color:#e53e3e; grid-column:1/-1;">Este isleño no tiene pokémon para intercambiar.</p>`;
    } else {
      receiverTrades.forEach((poke) => {
        const box = document.createElement("div");
        box.className = "pkm-profile-box";
        box.style.cssText = "cursor:pointer; flex:unset; padding:2px;";
        
        const shortName = poke.apodo ? `"${poke.apodo}"` : poke.nombre;
        box.innerHTML = `<img src="${poke.sprite}" style="height:35px;"/><div style="font-size:0.55rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${poke.nombre}">${shortName}</div>`;
        
        box.onclick = () => {
          document.querySelectorAll("#proposal-receiver-pool .pkm-profile-box").forEach(b => b.style.borderColor = "#dac6f0");
          box.style.borderColor = "#2b6cb0";
          selectedReceiverPkm = poke;
          
          const fullDisplayName = poke.apodo ? `"${poke.apodo}" (${poke.nombre})` : poke.nombre;
          $("stats-receiver-preview").innerHTML = `<strong>${fullDisplayName}</strong><br>Lvl: ${poke.nivel} | Personalidad: ${poke.personalidad}<br>${poke.isShiny ? '✨ SHINY' : 'Normal'}`;
          validateTradeProposalButtons();
        };
        receiverContainer.appendChild(box);
      });
    }

    const { data: myGameData } = await supabase.from(GAME_TABLE).select("*").eq("id", myId).maybeSingle();
    visitorOwnTradePool = [];
    if (myGameData) {
      if (Array.isArray(myGameData.party_data)) visitorOwnTradePool.push(...myGameData.party_data.filter(p => p));
      if (myGameData.box_data?.boxes) {
        myGameData.box_data.boxes.forEach(box => {
          if (Array.isArray(box)) visitorOwnTradePool.push(...box.filter(p => p));
        });
      }
    }

    const senderContainer = $("proposal-sender-pool");
    senderContainer.innerHTML = "";
    const myTrades = visitorOwnTradePool.filter(p => p.forTrade === true);

    if (myTrades.length === 0) {
      senderContainer.innerHTML = `<p style="font-size:0.65rem; color:#e53e3e; grid-column:1/-1;">No tienes pokémon de intercambio en tu perfil.</p>`;
    } else {
      myTrades.forEach((poke) => {
        const box = document.createElement("div");
        box.className = "pkm-profile-box";
        box.style.cssText = "cursor:pointer; flex:unset; padding:2px;";
        
        const shortName = poke.apodo ? `"${poke.apodo}"` : poke.nombre;
        box.innerHTML = `<img src="${poke.sprite}" style="height:35px;"/><div style="font-size:0.55rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${poke.nombre}">${shortName}</div>`;
        
            box.onclick = () => {
          document.querySelectorAll("#proposal-sender-pool .pkm-profile-box").forEach(b => b.style.borderColor = "#3182ce");
          box.style.borderColor = "#38a169";
          selectedSenderPkm = poke;
          
          const fullDisplayName = poke.apodo ? `"${poke.apodo}" (${poke.nombre})` : poke.nombre;
          $("stats-sender-preview").innerHTML = `<strong>${fullDisplayName}</strong><br>Lvl: ${poke.nivel} | Personalidad: ${poke.personalidad}<br>${poke.isShiny ? '✨ SHINY' : 'Normal'}`;
          validateTradeProposalButtons();
        };
        senderContainer.appendChild(box);
      });
    }

    $("modal-trade-proposal").classList.remove("hidden");
  } catch (err) { console.error(err); }
}

function validateTradeProposalButtons() {
  $("btn-trade-next").disabled = !(selectedReceiverPkm && selectedSenderPkm);
}

function closeTradeProposalModal() {
  $("modal-trade-proposal").classList.add("hidden");
}

async function handleTradeModalNextStep() {
  if (tradeProposalStep === 1) {
    tradeProposalStep = 2;
    $("trade-step-select").classList.add("hidden");
    $("trade-step-confirm").classList.remove("hidden");
    
    const senderLabel = selectedSenderPkm.apodo ? `"${selectedSenderPkm.apodo}" (${selectedSenderPkm.nombre})` : selectedSenderPkm.nombre;
    const receiverLabel = selectedReceiverPkm.apodo ? `"${selectedReceiverPkm.apodo}" (${selectedReceiverPkm.nombre})` : selectedReceiverPkm.nombre;

    $("confirm-txt-sender").textContent = `${senderLabel} (Lv.${selectedSenderPkm.nivel})${selectedSenderPkm.isShiny ? ' ✨':''}`;
    $("confirm-txt-receiver").textContent = `${receiverLabel} (Lv.${selectedReceiverPkm.nivel})${selectedReceiverPkm.isShiny ? ' ✨':''}`;
    
    $("btn-trade-next").textContent = "Sí, proponer";
    $("btn-trade-cancel").textContent = "No, volver";
    
    $("btn-trade-cancel").onclick = () => {
      tradeProposalStep = 1;
      $("trade-step-select").classList.remove("hidden");
      $("trade-step-confirm").classList.add("hidden");
      $("btn-trade-next").textContent = "Siguiente";
      $("btn-trade-cancel").textContent = "Cancelar";
      $("btn-trade-cancel").onclick = closeTradeProposalModal;
    };
  } else {
    await submitTradeProposalToDatabase();
  }
}

async function submitTradeProposalToDatabase() {
  const supabase = window.supabaseClient;
  try {
    const { error } = await supabase.from(TRADE_TABLE).insert({
      sender_id: window.currentUserId,
      receiver_id: profileUserId,
      sender_pokemon: selectedSenderPkm,
      receiver_pokemon: selectedReceiverPkm,
      status: 'pending'
    });

    if (error) throw error;

    closeTradeProposalModal();
    alert("¡Propuesta hecha exitosamente! Espera a que el isleño acepte o rechace.");
    location.reload();
  } catch (err) { alert("Fallo al procesar oferta: " + err.message); }
}

// ==========================================
// CARGA DINÁMICA DE DATOS DESDE SUPABASE
// ==========================================
async function loadProfileData() {
  const supabase = window.supabaseClient;

  try {
    const [{ data: gameData }, { data: invRow }, { data: logs }] = await Promise.all([
      supabase.from(GAME_TABLE).select("*").eq("id", profileUserId).maybeSingle(),
      supabase.from(TRAINER_TABLE).select("inventory").eq("user_id", profileUserId).maybeSingle(),
      supabase.from(LOG_TABLE).select("*").eq("user_id", profileUserId).order("created_at", { ascending: false }),
    ]);

    const trainerName = gameData?.trainer_name || (isOwnProfile ? window.currentTrainerName : "Entrenador");
    $("trainer-name-display").textContent = trainerName.toUpperCase();
    $("trainer-label").textContent = `Entrenador: ${window.currentTrainerName || "Invitado"}`;

    let trainerTag = gameData?.user_tag;
    if (!trainerTag && gameData) {
      if (isOwnProfile) {
        trainerTag = String(Math.floor(1000 + Math.random() * 9000));
        await supabase.from(GAME_TABLE).update({ user_tag: trainerTag }).eq("id", profileUserId);
      } else {
        trainerTag = profileUserId.slice(0, 4).toUpperCase();
      }
    } else if (!trainerTag) {
      trainerTag = profileUserId.slice(0, 4).toUpperCase();
    }

    $("user-tag-display").textContent = `#${trainerTag}`;

    ownedPokemonPool = [];
    if (gameData) {
      if (Array.isArray(gameData.party_data)) ownedPokemonPool.push(...gameData.party_data.filter(p => p));
      if (gameData.box_data?.boxes) {
        gameData.box_data.boxes.forEach(box => {
          if (Array.isArray(box)) ownedPokemonPool.push(...box.filter(p => p));
        });
      }
    }
    renderMainPageTrades();
    renderMainPageTeam();

    currentMeta = invRow?.inventory || {};
    if (!currentMeta.wishlist) currentMeta.wishlist = [];
    if (!currentMeta.tags) currentMeta.tags = []; 
    
    $("profile-phrase-display").textContent = currentMeta.bio ? `"${currentMeta.bio}"` : '"¡Sin frase de perfil aún! (˶ᵔ ᵕ ᵔ˶)"';
    
    if (currentMeta.bannerColor) $("profile-banner").style.backgroundColor = currentMeta.bannerColor;
    if (currentMeta.avatarUrl) $("profile-avatar").src = currentMeta.avatarUrl;

    renderMainPageWishlist();
    renderMainPageTags();
    await renderCommunityStats(trainerName);

    renderHistoryPanels(logs);

  } catch (err) { console.error("Fallo al procesar perfil:", err); }
}

function renderMainPageWishlist() {
  const container = $("wishlist-container");
  container.innerHTML = "";
  if (currentMeta.wishlist.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem; color:#718096; padding:10px;">La Wishlist está vacía.</p>`;
    return;
  }
  currentMeta.wishlist.forEach(pkm => {
    const box = document.createElement("div");
    box.className = "pkm-profile-box";
    box.innerHTML = `
      <img src="https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/images/pokemon/versions/generation-v/black-white/animated/${pkm.id}.gif" onerror="this.src='https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${pkm.id}.png'"/>
      <div style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${pkm.name}</div>
    `;
    container.appendChild(box);
  });
}

function renderMainPageTrades() {
  const container = $("trade-pool-container");
  container.innerHTML = "";
  const activeTrades = ownedPokemonPool.filter(p => p.forTrade === true);
  if (activeTrades.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem; color:#718096; padding:10px;">No hay Pokémon para intercambio en exhibición.</p>`;
    return;
  }
  activeTrades.forEach(poke => {
    const card = document.createElement("div");
    card.className = "pkm-profile-box on-trade";
    card.innerHTML = `
      <img src="${window.toCdnSpriteUrl(poke.sprite, window.MYSTERY_EGG_SPRITE)}" title="${poke.nombre}"/>
      <div style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${poke.apodo || poke.nombre}</div>
    `;
    container.appendChild(card);
  });
}

function renderMainPageTeam() {
  const container = $("team-container");
  container.innerHTML = "";
  const teamPokemon = ownedPokemonPool.filter(p => p.enEquipo === true);
  if (teamPokemon.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem; color:#718096; padding:10px;">Aún no se ha definido un equipo actual.</p>`;
    return;
  }
  teamPokemon.forEach(poke => {
    const card = document.createElement("div");
    card.className = "pkm-profile-box";
    card.innerHTML = `
      <img src="${window.toCdnSpriteUrl(poke.sprite, window.MYSTERY_EGG_SPRITE)}" title="${poke.nombre}"/>
      <div style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${poke.apodo || poke.nombre}</div>
    `;
    container.appendChild(card);
  });
}

function renderMainPageTags() {
  const container = $("profile-tags-display");
  if (!container) return;
  container.innerHTML = "";
  if (currentMeta && Array.isArray(currentMeta.tags)) {
    currentMeta.tags.forEach(tag => {
      const pill = document.createElement("span");
      pill.className = "profile-tag-pill";
      pill.textContent = tag;
      container.appendChild(pill);
    });
  }
}

async function renderCommunityStats(trainerName) {
  const achEl = $("profile-achievements-value");
  if (achEl) {
    achEl.textContent = (currentMeta.achievements !== undefined && currentMeta.achievements !== "") ? currentMeta.achievements : "—";
  }

  const pokedexEl = $("profile-pokedex-value");
  if (!pokedexEl) return;

  try {
    const supabase = window.supabaseClient;

    // Cuenta por user_id (vínculo estable, sobrevive a cambios de username) y,
    // en paralelo, el respaldo por nombre para registros antiguos sin user_id.
    const [{ count: byId, error: errId }, { count: legacyCount, error: errName }] = await Promise.all([
      supabase.from(DISCOVERY_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("user_id", profileUserId),
      trainerName
        ? supabase.from(DISCOVERY_TABLE)
            .select("*", { count: "exact", head: true })
            .is("user_id", null)
            .eq("trainer_name", trainerName)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (errId) throw errId;
    if (errName) throw errName;

    pokedexEl.textContent = (byId || 0) + (legacyCount || 0);
  } catch (err) {
    console.error("Error al calcular la Pokédex comunitaria:", err);
    pokedexEl.textContent = currentMeta.pokedex || "0";
  }
}

function openEditModal() {
  if ($("modal-trainer-name")) $("modal-trainer-name").value = window.currentTrainerName || "";
  $("modal-bio").value = currentMeta.bio || "";
  $("modal-banner-color").value = currentMeta.bannerColor || "#c957b0";
  $("modal-tags").value = (currentMeta.tags && Array.isArray(currentMeta.tags)) ? currentMeta.tags.join(", ") : "";
  renderModalTeamPool();
  renderModalTradePool();
  renderModalWishlist();
  $("modal-edit-profile").classList.remove("hidden");
}

function renderModalWishlist() {
  const container = $("modal-wishlist-container");
  container.innerHTML = "";
  currentMeta.wishlist.forEach((pkm, index) => {
    const box = document.createElement("div");
    box.className = "pkm-profile-box";
    box.innerHTML = `
      <button class="btn-del-wish" onclick="removeModalWishItem(${index})">&times;</button>
      <img src="https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${pkm.id}.png" style="height:40px;"/>
      <div style="font-size:0.65rem; text-overflow:ellipsis; overflow:hidden;">${pkm.name}</div>
    `;
    container.appendChild(box);
  });
}

window.removeModalWishItem = function(index) {
  currentMeta.wishlist.splice(index, 1);
  renderModalWishlist();
};

function renderModalTradePool() {
  const container = $("modal-trade-pool-container");
  container.innerHTML = "";
  if (ownedPokemonPool.length === 0) {
    container.innerHTML = `<p style="font-size:0.7rem; color:#718096; text-align:center; grid-column:1/-1;">No tienes Pokémon registrados.</p>`;
    return;
  }
  ownedPokemonPool.forEach(poke => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative; border:1px solid #cbd5e0; padding:4px; text-align:center; background:white; border-radius:6px;";
    wrapper.innerHTML = `
      <input type="checkbox" style="position:absolute; top:2px; left:2px; scale:0.9;" class="modal-trade-check" data-id="${poke.id}" data-name="${poke.nombre}" ${poke.forTrade ? 'checked' : ''} />
      <img src="${poke.sprite}" style="height:35px; object-fit:contain; margin-top:8px;" />
      <div style="font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${poke.nombre}</div>
    `;
    container.appendChild(wrapper);
  });
}

function renderModalTeamPool() {
  const container = $("modal-team-pool-container");
  container.innerHTML = "";
  if (ownedPokemonPool.length === 0) {
    container.innerHTML = `<p style="font-size:0.7rem; color:#718096; text-align:center; grid-column:1/-1;">No tienes Pokémon registrados.</p>`;
    return;
  }
  ownedPokemonPool.forEach(poke => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative; border:1px solid #cbd5e0; padding:4px; text-align:center; background:white; border-radius:6px;";
    wrapper.innerHTML = `
      <input type="checkbox" style="position:absolute; top:2px; left:2px; scale:0.9;" class="modal-team-check" data-id="${poke.id}" data-name="${poke.nombre}" ${poke.enEquipo ? 'checked' : ''} />
      <img src="${poke.sprite}" style="height:35px; object-fit:contain; margin-top:8px;" />
      <div style="font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${poke.nombre}</div>
    `;
    container.appendChild(wrapper);
  });

  container.querySelectorAll(".modal-team-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const checkedCount = container.querySelectorAll(".modal-team-check:checked").length;
      if (checkedCount > 6) {
        chk.checked = false;
        alert("Tu Equipo Actual ya está lleno (Máx. 6 Pokémon).");
      }
    });
  });
}

async function setupModalAutocomplete() {
  const searchInput = $("modal-wishlist-search");
  const suggestUl = $("modal-wishlist-suggest");
  if (!searchInput || !suggestUl) return;

  const res = await fetch(`${POKEAPI_BASE}/pokemon?limit=1200`);
  const data = await res.json();
  allPokemonList = data.results;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();
    suggestUl.innerHTML = "";
    if (!query) { suggestUl.classList.add("hidden"); return; }

    const filtered = allPokemonList.filter(p => p.name.startsWith(query)).slice(0, 5);
    if (filtered.length === 0) { suggestUl.classList.add("hidden"); return; }

    suggestUl.classList.remove("hidden");
    filtered.forEach(p => {
      const li = document.createElement("li"); li.className = "suggest-li";
      li.textContent = p.name.charAt(0).toUpperCase() + p.name.slice(1);
      li.onclick = () => addPokemonToModalWishlist(p.name);
      suggestUl.appendChild(li);
    });
  });
}

async function addPokemonToModalWishlist(name) {
  $("modal-wishlist-search").value = ""; $("modal-wishlist-suggest").classList.add("hidden");
  if (currentMeta.wishlist.length >= 6) return alert("Tu Wishlist ya está llena (Máx. 6 Pokémon).");
  try {
    const res = await fetch(`${POKEAPI_BASE}/pokemon/${name}`);
    const data = await res.json();
    currentMeta.wishlist.push({ id: data.id, name: data.name.charAt(0).toUpperCase() + data.name.slice(1) });
    renderModalWishlist();
  } catch (e) { console.error(e); }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return alert("La imagen supera los 2MB.");
  const supabase = window.supabaseClient;
  const userId = window.currentUserId;
  const fileExt = file.name.split('.').pop();
  const filePath = `profile_pics/${userId}_${Date.now()}.${fileExt}`;
  try {
    const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { cacheControl: "3600", upsert: true });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    currentMeta.avatarUrl = urlData.publicUrl;
    alert("Foto de perfil lista. Recuerda guardar los cambios globales.");
  } catch (err) { alert("Error al subir archivo: " + err.message); }
}

async function saveAllModalChanges() {
  const supabase = window.supabaseClient;
  const userId = window.currentUserId;
  try {
    const newName = ($("modal-trainer-name")?.value || "").trim();

    currentMeta.bio = $("modal-bio").value.trim();
    currentMeta.bannerColor = $("modal-banner-color").value;
    const tagsInput = $("modal-tags").value;
    currentMeta.tags = tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0);

    const checkboxes = document.querySelectorAll(".modal-trade-check");
    const teamCheckboxes = document.querySelectorAll(".modal-team-check");
    const checkedTeamCount = document.querySelectorAll(".modal-team-check:checked").length;
    if (checkedTeamCount > 6) {
      alert("Tu Equipo Actual no puede tener más de 6 Pokémon. Desmarca alguno antes de guardar.");
      return;
    }

    const { data: gameData } = await supabase.from(GAME_TABLE).select("*").eq("id", userId).maybeSingle();
    if (gameData) {
      if (newName) {
        gameData.trainer_name = newName;
        window.currentTrainerName = newName;
      }

      checkboxes.forEach(chk => {
        const pId = parseInt(chk.dataset.id);
        const pName = chk.dataset.name;
        const isChecked = chk.checked;
        if (Array.isArray(gameData.party_data)) {
          gameData.party_data.forEach(p => { if (p && p.id === pId && p.nombre === pName) p.forTrade = isChecked; });
        }
        if (gameData.box_data?.boxes) {
          gameData.box_data.boxes.forEach(box => {
            if (Array.isArray(box)) {
              box.forEach(p => { if (p && p.id === pId && p.nombre === pName) p.forTrade = isChecked; });
            }
          });
        }
      });

      teamCheckboxes.forEach(chk => {
        const pId = parseInt(chk.dataset.id);
        const pName = chk.dataset.name;
        const isChecked = chk.checked;
        if (Array.isArray(gameData.party_data)) {
          gameData.party_data.forEach(p => { if (p && p.id === pId && p.nombre === pName) p.enEquipo = isChecked; });
        }
        if (gameData.box_data?.boxes) {
          gameData.box_data.boxes.forEach(box => {
            if (Array.isArray(box)) {
              box.forEach(p => { if (p && p.id === pId && p.nombre === pName) p.enEquipo = isChecked; });
            }
          });
        }
      });

      await supabase.from(GAME_TABLE).upsert({
        id: userId, 
        box_data: gameData.box_data, 
        party_data: gameData.party_data,
        trainer_name: gameData.trainer_name 
      }, { onConflict: "id" });
    }
    const { error: invError } = await supabase.from(TRAINER_TABLE).upsert({ user_id: userId, inventory: currentMeta, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (invError) throw invError;
    $("modal-edit-profile").classList.add("hidden");
    alert("¡Tu Tarjeta de Entrenador ha sido actualizada!");
    await loadProfileData(); 
  } catch (err) { alert("Hubo un fallo al sincronizar con Supabase: " + err.message); }
}

// ===================================================================================
// RENDER HISTORIAL: ACTUALIZADO PARA EXTRAER LOS CIERRES DESDE LA BASE DE LOGS (REAL)
// ===================================================================================
function renderHistoryPanels(logs) {
  const historyFeed = $("action-history-feed");
  const closuresFeed = $("closures-history-feed");
  if (!historyFeed || !closuresFeed) return;
  historyFeed.innerHTML = "";
  closuresFeed.innerHTML = "";

  const typeNames = {
    encounter: "Encounter", quest: "Quest", pokedex_comu: "Pokédex Comu.",
    pokedex_legen: "Pokédex Leg.", pokewords: "Pokéwords", freemode: "Freemode",
    passport: "Passport", checkpoint: "Checkpoint Mensual", trade: "Intercambio",
    consume: "Consumo", bimonthly_close: "Cierre Bimestral", gacha_close: "Cierre de Evento", otros: "Otros"
  };

  if (!logs || logs.length === 0) {
    historyFeed.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border:none;">Sin interacciones registradas.</div>`;
    closuresFeed.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border:none;">No hay reportes de cierre previos.</div>`;
    return;
  }

  let hasCloses = false;

  logs.forEach(log => {
    const date = new Date(log.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    let logContent = "";

    // GESTIÓN DEL ENTRANTE DE CORTE OFICIAL (Caja Derecha)
    if (log.activity_type === "bimonthly_close") {
      hasCloses = true;
      const closureItem = document.createElement("div");
      closureItem.className = "log-item";
      closureItem.style.cssText = "border-left: 3px solid #0fb86b; background: #f0fff4; padding: 10px; margin-bottom: 8px;";
      
      let displayTitle = log.activity_name;
      
      // Intentamos desempaquetar el JSON de estadísticas si está disponible
      try {
        const summaryData = JSON.parse(log.activity_name);
        displayTitle = summaryData.displayTitle;
        closureItem.style.cursor = "pointer";
        closureItem.title = "Haz clic para ver el desglose de estadísticas de este ciclo";
        closureItem.onclick = () => window.showClosureSummaryModal(summaryData, date);
      } catch (e) {
        // Retrocompatibilidad: Si es un registro plano viejo, se despliega normalmente como texto fijo
      }

      closureItem.innerHTML = `<i class="fa fa-calendar-check-o" style="color:#0fb86b;"></i> <strong>Cierre Bimestral Oficial [${date}]:</strong><br>${displayTitle}`;
      closuresFeed.appendChild(closureItem);
      return; 
    }

    switch (log.activity_type) {
      case "checkpoint":
        logContent = `📌 <strong>Checkpoint Mensual:</strong> "${log.activity_name}"`;
        break;
      case "purchase":
        logContent = `🛒 <strong>Compra:</strong> "${log.activity_name}" gastando <span style="color:#e53e3e; font-weight:700;">-₽${Math.abs(log.money_reward)}</span>`;
        break;
      case "incubation":
        logContent = `🥚 <strong>Incubadora:</strong> Puso a incubar un ${log.activity_name}`;
        break;
      case "box_add":
        logContent = `📦 <strong>Caja Pokémon:</strong> Añadió a ${log.activity_name} a su colección`;
        break;
      case "evolution":
        logContent = `💥 <strong>Evolución:</strong> ¡Felicidades! Su ${log.activity_name}`;
        break;
      case "exp_assign":
        logContent = `💪 <strong>Entrenamiento:</strong> Otorgó <span style="color:#7a47ff; font-weight:700;">+${log.xp_reward} XP</span> a ${log.activity_name}`;
        break;
      case "consume":
        logContent = `🎒 <strong>Mochila:</strong> Consumió/Usó <strong>${log.activity_name}</strong> en su aventura`;
        break;
      case "trade":
        logContent = `🤝 <strong>Intercambio:</strong> ${log.activity_name}`;
        break;
      default:
        const label = typeNames[log.activity_type] || log.activity_type;
        logContent = `🎯 <strong>${label}:</strong> "${log.activity_name}" <span style="color:#0fb86b; font-weight:700;">+₽${log.money_reward}</span> | <span style="color:#7a47ff; font-weight:700;">+${log.xp_reward} XP</span>`;
    }
    
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `<strong>[${date}]</strong> ${logContent}`;
    historyFeed.appendChild(item);
  });

  if (!hasCloses) {
    closuresFeed.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border-bottom:none;">No hay reportes de cierre previos.</div>`;
  }
}

// INYECTOR DINÁMICO DE CORTE VISUAL (MODAL EN TIEMPO REAL)
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

function initHamburgerMenu() {
  const btnMenu = $("btn-menu");
  const sideMenu = $("side-menu");
  const btnClose = $("btn-close-menu");
  if (btnMenu && sideMenu) {
    btnMenu.onclick = () => { sideMenu.classList.remove("hidden"); };
    if (btnClose) { btnClose.onclick = () => sideMenu.classList.add("hidden"); }
    sideMenu.onclick = (e) => { if (e.target === sideMenu) sideMenu.classList.add("hidden"); };
  }
  if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}