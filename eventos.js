// ==========================================
// 🕹️ LÓGICA DE CONTROL DEL EVENTO GACHAPÓN (SISTEMA COMPLETO CON UX MEJORADA)
// ==========================================

// 🛑 REEMPLAZA ESTOS DATOS CON LOS DE TU PROYECTO EN SUPABASE
const SUPABASE_URL = "https://gsxfoebmxxgxyghltyra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzeGZvZWJteHhneHlnaGx0eXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjEwNzcsImV4cCI6MjA3OTgzNzA3N30.Xc0KHEWVNNrE9SKCQhCaLxmD162oYv17ApisorEPCAs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  
  let currentUserId = null;

  // Estado local sincronizado con Supabase
  const state = {
    totalCards: 20,
    ownedCards: new Set(), 
    pokecoins: 0,      
    fichas: 0,          
    rewardsClaimed: [],
    pityCountX3: 0, 
    spentThisRoll: 0
  };

  let activeFossilMilestone = null;

  const cardDatabase = {
    1: { id: 1, name: "Tu Pokémon 1", img: "./img/BASIC01.png" },
    2: { id: 2, name: "Tu Pokémon 2", img: "./img/BASIC02.png" },
    3: { id: 3, name: "Tu Pokémon 3", img: "./img/BASIC03.png" },
    4: { id: 4, name: "Tu Pokémon 4", img: "./img/BASIC04.png" },
    5: { id: 5, name: "Tu Pokémon 5", img: "./img/BASIC05.png" },
    6: { id: 6, name: "Tu Pokémon 6", img: "./img/BASIC06.png" },
    7: { id: 7, name: "Tu Pokémon 7", img: "./img/BASIC07.png" },
    8: { id: 8, name: "Tu Pokémon 8", img: "./img/BASIC08.png" },
    9: { id: 9, name: "Tu Pokémon 9", img: "./img/BASIC09.png" },
    10: { id: 10, name: "Tu Pokémon 10", img: "./img/BASIC10.png" },
    11: { id: 11, name: "Tu Pokémon 11", img: "./img/RARE01.png" },
    12: { id: 12, name: "Tu Pokémon 12", img: "./img/RARE02.png" },
    13: { id: 13, name: "Tu Pokémon 13", img: "./img/RARE03.png" },
    14: { id: 14, name: "Tu Pokémon 14", img: "./img/RARE04.png" },
    15: { id: 15, name: "Tu Pokémon 15", img: "./img/RARE05.png" },
    16: { id: 16, name: "Tu Pokémon 16", img: "./img/RARE06.png" },
    17: { id: 17, name: "Tu Pokémon 17", img: "./img/RARE07.png" },
    18: { id: 18, name: "Tu Pokémon 18", img: "./img/RAINBOW01.png" },
    19: { id: 19, name: "Tu Pokémon 19", img: "./img/RAINBOW02.png" },
    20: { id: 20, name: "Tu Pokémon 20", img: "./img/RAINBOW03.png" }
  };

  // Variables de control de flujo para aperturas múltiples (x3)
  let packsRemaining = 0;
  let totalPacksInRoll = 0;
  let newCardsInThisRoll = [];
  
  // 🌟 SISTEMA DE PITY: Variables de control de sesión de tiro
  let rainbowDroppedInCurrentRoll = false;
  let isPityActiveForThisPack = false;

  // Elementos del DOM (Principales y Modales)
  const albumGrid = document.getElementById("album-grid");
  const pokecoinsDisplay = document.getElementById("pokecoins-count");
  const fichasDisplay = document.getElementById("fichas-count");
  const modalReveal = document.getElementById("modal-gacha-reveal");
  const revealCardsRow = document.getElementById("reveal-cards-row");
  const btnCloseReveal = document.getElementById("btn-close-reveal");
  const progressFill = document.getElementById("progress-fill");
  const gachaCrank = document.getElementById("gacha-crank");

  // Elementos del DOM (Promo Codes)
  const btnPromoCode = document.getElementById("btn-promo-code");
  const modalPromo = document.getElementById("modal-promo-code");
  const inputPromo = document.getElementById("input-promo-code");
  const btnSubmitCode = document.getElementById("btn-submit-code");
  const btnCancelCode = document.getElementById("btn-cancel-code");

  // Elementos del DOM (Tienda de Fichas)
  const btnFichasShop = document.getElementById("btn-fichas-shop");
  const modalFichasShop = document.getElementById("modal-fichas-shop-container");
  const btnCloseFichasShop = document.getElementById("btn-close-fichas-shop");
  const btnBuyPackFichas = document.getElementById("btn-buy-pack-fichas");
  const fichasShopGrid = document.getElementById("fichas-shop-cards-grid");

  // Elementos del DOM (Modales de Recompensa Específica)
  const modalFossil = document.getElementById("modal-fossil-choice");
  const selectFossil = document.getElementById("select-fossil-type");
  const btnConfirmFossil = document.getElementById("btn-confirm-fossil");
  const btnLaterFossil = document.getElementById("btn-later-fossil"); 

  // Control del Menú Lateral
  const btnMenu = document.getElementById("btn-menu");
  const sideMenu = document.getElementById("side-menu");
  const btnCloseMenu = document.getElementById("btn-close-menu");

  btnMenu?.addEventListener("click", () => sideMenu.classList.remove("hidden"));
  btnCloseMenu?.addEventListener("click", () => sideMenu.classList.add("hidden"));

  // --- 🔄 CONEXIÓN CON SUPABASE ---

async function checkUserAndLoadData() {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.warn("❌ Usuario no autenticado:", authError);
      document.getElementById("trainer-label").textContent = "Entrenador: Invitado (Inicia sesión)";
      return;
    }

    currentUserId = user.id;
    document.getElementById("trainer-label").textContent = `Entrenador: ${user.email.split('@')[0]}`;

    // 1. Cargar e igualar la economía matemática exacta de trainer.js
    const { data: invRow } = await supabaseClient
      .from('trainer_inventory') // ⚠️ Corregido a minúsculas
      .select('inventory')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (invRow?.inventory?.economy) {
      const eco = invRow.inventory.economy;
      const savings = Number(eco.savings) || 0;
      const biIncome = Number(eco.biIncome) || 0;
      const spent = Number(eco.spent) || 0;
      
      // 📊 Operación matemática idéntica a tu trainer.js
      state.pokecoins = (savings + biIncome) - spent;
    } else {
      state.pokecoins = 0; 
    }

    // 2. Cargar Fichas e hitos cobrados temporales
    let { data: profile } = await supabaseClient
      .from('gacha_event_progress')
      .select('fichas, rewards_claimed, pity_count_x3')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (!profile) {
      const { data: newProfile } = await supabaseClient
        .from('gacha_event_progress')
        .insert([{ user_id: currentUserId, fichas: 0, rewards_claimed: [], pity_count_x3: 0 }])
        .select()
        .maybeSingle();
      profile = newProfile;
    }
    state.fichas = profile ? profile.fichas : 0;
    state.rewardsClaimed = profile?.rewards_claimed || [];
    state.pityCountX3 = profile?.pity_count_x3 || 0;

    // 3. Cargar inventario de cartas obtenidas
    const { data: savedCards } = await supabaseClient
      .from('gacha_event_inventory')
      .select('card_id')
      .eq('user_id', currentUserId);

    if (savedCards) {
      state.ownedCards.clear();
      savedCards.forEach(row => state.ownedCards.add(row.card_id));
    }

    renderAlbum();
    updateUI();
  }

async function syncProgressToSupabase(newCardsArray) {
    if (!currentUserId) return;

    // 💰 NUEVO: Capturamos el costo de esta tirada ANTES de que el código lo limpie
    const totalGachaSpent = Number(state.spentThisRoll) || 0;

    // 1. Sincronizar billetera agregando el costo al acumulador 'spent'
    const { data: invRow } = await supabaseClient
      .from('trainer_inventory') // ⚠️ Corregido a minúsculas
      .select('inventory')
      .eq('user_id', currentUserId)
      .maybeSingle();

    let currentInventory = invRow?.inventory || {};
    if (!currentInventory.economy) {
      currentInventory.economy = { savings: 0, biIncome: 0, spent: 0 };
    }

    // Sumamos lo gastado en el gachapón al histórico de gastos de la mochila
    currentInventory.economy.spent = (Number(currentInventory.economy.spent) || 0) + totalGachaSpent;
    currentInventory.lastUpdated = new Date().toISOString();

    // Guardamos usando el formato de guardado seguro de tu trainer.js
    await supabaseClient
      .from('trainer_inventory')
      .upsert(
        { user_id: currentUserId, inventory: currentInventory, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    // Reiniciamos el rastreador de gasto una vez subido con éxito
    state.spentThisRoll = 0;

    // 2. Sincronizar Fichas, Hitos Reclamados y Contador Pity
    await supabaseClient
      .from('gacha_event_progress')
      .update({ 
        fichas: state.fichas,
        rewards_claimed: state.rewardsClaimed,
        pity_count_x3: state.pityCountX3
      })
      .eq('user_id', currentUserId);

    // 3. Guardar cartas obtenidas
    if (newCardsArray.length > 0) {
      const inserts = newCardsArray.map(cardId => ({
        user_id: currentUserId,
        card_id: cardId
      }));
      await supabaseClient.from('gacha_event_inventory').upsert(inserts);
    }

    // ===================================================================
    // 📊 4. NUEVO: ENVIAR EL LOG DE LA TIRADA A PLAZA SORELLE (trainer_log)
    // ===================================================================
    // Solo se dispara si la función fue llamada tras abrir sobres (totalPacksInRoll > 0)
    if (typeof totalPacksInRoll !== 'undefined' && totalPacksInRoll > 0) {
      const packLabel = totalPacksInRoll === 1 ? "1 Sobre" : `${totalPacksInRoll} Sobres (Bundle)`;

      await supabaseClient.from("trainer_log").insert({
        user_id: currentUserId,
        activity_type: "gacha_roll",
        activity_name: packLabel,
        money_reward: -totalGachaSpent, // Guardamos el dinero restado en negativo para el contador global
        xp_reward: 0
      });

      // Reseteamos el control de paquetes para evitar duplicados en futuras sincronizaciones de hitos
      totalPacksInRoll = 0;
    }
  }

  // --- 🎁 LÓGICA DE VALIDACIÓN DE CÓDIGOS ---

  async function redeemCode() {
    const codeEntered = inputPromo.value.trim().toUpperCase();
    if (!codeEntered) return alert("Por favor, escribe un código.");
    if (!currentUserId) return alert("Debes iniciar sesión para canjear códigos.");

    const { data: promo, error } = await supabaseClient
      .from('gacha_promo_codes')
      .select('*')
      .eq('code', codeEntered)
      .single();

    if (error || !promo || !promo.is_active) {
      return alert("El código no existe o ya caducó.");
    }

    if (promo.type === 'single_use') {
      const { data: globalRedeemed } = await supabaseClient
        .from('gacha_code_redemptions')
        .select('id')
        .eq('code', codeEntered);
        
      if (globalRedeemed && globalRedeemed.length > 0) {
        return alert("Este código ya fue utilizado por otro entrenador.");
      }
    }

    const { data: userRedeemed } = await supabaseClient
      .from('gacha_code_redemptions')
      .select('id')
      .eq('code', codeEntered)
      .eq('user_id', currentUserId)
      .single();

    if (userRedeemed) {
      return alert("Ya has reclamado este código anteriormente.");
    }

    const { error: insertError } = await supabaseClient
      .from('gacha_code_redemptions')
      .insert([{ user_id: currentUserId, code: codeEntered }]);

    if (insertError) {
      return alert("Hubo un error procesando tu solicitud.");
    }

    modalPromo.classList.add("hidden");
    inputPromo.value = "";
    triggerGachaRoll(promo.reward_packs, true); 
  }

  // --- 🛠️ LÓGICA DEL GACHAPÓN ---

  function triggerGachaRoll(packSize, isFree = false) {
    if (!currentUserId) return alert("Debes iniciar sesión para poder jugar.");

    if (!isFree) {
      const cost = packSize === 1 ? 75 : 210;
      if (state.pokecoins < cost) return alert("Pokécoins insuficientes"); 
      state.pokecoins -= cost;
      state.spentThisRoll += cost;
      updateUI();
    }

    packsRemaining = packSize;
    totalPacksInRoll = packSize;
    newCardsInThisRoll = []; 

    // 🌟 SISTEMA DE PITY: Evaluamos si corresponde activar la piedad en este tiro de 3 sobres
    if (packSize === 3) {
      rainbowDroppedInCurrentRoll = false; // Reset de control de sesión
      isPityActiveForThisPack = (state.pityCountX3 >= 2); // Si ya falló 2 veces anteriores, el 3er pack activa Pity
    } else {
      isPityActiveForThisPack = false;
    }

    gachaCrank.classList.add("crank-spinning");

    setTimeout(() => {
      gachaCrank.classList.remove("crank-spinning");
      generateBoosterPack(); 
    }, 600);
  }

  function generateBoosterPack() {
    revealCardsRow.innerHTML = "";
    btnCloseReveal.style.display = "none";
    
    packsRemaining--;
    const currentPackNumber = totalPacksInRoll - packsRemaining;

    const revealTitle = document.querySelector(".reveal-title");
    if (revealTitle) {
      revealTitle.textContent = totalPacksInRoll > 1 
        ? `¡SOBRE ABIERTO (${currentPackNumber}/${totalPacksInRoll})! 🌟` 
        : "¡SOBRE ABIERTO! 🌟";
    }

    btnCloseReveal.textContent = packsRemaining > 0 ? "Siguiente Sobre 📦" : "Confirmar e Integrar 🌟";
    
    const packCards = [];

    // 🌟 SISTEMA DE PITY: Si el Pity está activo, alteramos obligatoriamente el PRIMER sobre de este paquete x3
    if (totalPacksInRoll === 3 && isPityActiveForThisPack && currentPackNumber === 1) {
      console.log("⚡ [SISTEMA PITY]: Generando sobre garantizado (1 Básica, 1 Especial, 1 Arcoíris)");

      // Generamos IDs fijos basados en tus rangos reales de base de datos
      const pityIds = [
        Math.floor(Math.random() * 10) + 1,  // Básica (1 al 10)
        Math.floor(Math.random() * 7) + 11,  // Especial (11 al 17)
        Math.floor(Math.random() * 3) + 18   // Arcoíris (18 al 20)
      ];

      // Barajamos el array para que la carta arcoíris no salga siempre en la misma posición visual
      pityIds.sort(() => Math.random() - 0.5);

      pityIds.forEach(randomId => {
        if (randomId >= 18) rainbowDroppedInCurrentRoll = true; // Validamos obtención exitosa

        const isDuplicate = state.ownedCards.has(randomId);
        packCards.push({ id: randomId, duplicate: isDuplicate });
        
        if(!isDuplicate) {
          state.ownedCards.add(randomId);
          newCardsInThisRoll.push(randomId); 
        } else {
          state.fichas += 2; 
        }
      });

      // Desactivamos para que los otros 2 sobres del paquete x3 corran con suerte normal
      isPityActiveForThisPack = false;

    } else {
      // GENERACIÓN NORMAL DE SOBRES (Tu algoritmo original)
      for(let i = 0; i < 3; i++) {
        const rand = Math.random() * 100;
        let randomId;

        if (rand < 75) {
          randomId = Math.floor(Math.random() * 10) + 1; 
        } else if (rand < 97) {
          randomId = Math.floor(Math.random() * 7) + 11; 
        } else {
          randomId = Math.floor(Math.random() * 3) + 18; 
        }

        // 🌟 SISTEMA DE PITY: Si sale una arcoíris de forma natural, lo registramos para la sesión
        if (randomId >= 18) {
          rainbowDroppedInCurrentRoll = true;
        }

        const isDuplicate = state.ownedCards.has(randomId);
        packCards.push({ id: randomId, duplicate: isDuplicate });
        
        if(!isDuplicate) {
          state.ownedCards.add(randomId);
          newCardsInThisRoll.push(randomId); 
        } else {
          state.fichas += 2; 
        }
      }
    }

    packCards.forEach(item => {
      const cardData = cardDatabase[item.id];
      const flipCard = document.createElement("div");
      flipCard.className = "flip-card";
      
      let rarityClass = "rarity-basic";
      if (item.id >= 11 && item.id <= 17) rarityClass = "rarity-special";
      if (item.id >= 18) rarityClass = "rarity-rainbow";
      flipCard.classList.add(rarityClass);
      
      const cardBack = document.createElement("div");
      cardBack.className = "card-back";
      cardBack.innerHTML = "<i class='fa fa-question-circle'></i>";
      
      const cardFront = document.createElement("div");
      cardFront.className = "card-front";
      
      const img = document.createElement("img");
      img.src = cardData?.img || "";
      
      const badge = document.createElement("span");
      badge.className = `status-badge ${item.duplicate ? 'repeat' : 'new'}`;
      badge.textContent = item.duplicate ? "Repetida (+2 Tickets)" : "¡Nueva!";
      
      cardFront.appendChild(img);
      cardFront.appendChild(badge);
      flipCard.appendChild(cardBack);
      flipCard.appendChild(cardFront);
      
      flipCard.addEventListener("click", () => {
        flipCard.classList.add("flipped");
        checkAllCardsFlipped();
      });
      
      revealCardsRow.appendChild(flipCard);
    });

    modalReveal.classList.remove("hidden");
  }

  function checkAllCardsFlipped() {
    const totalFlipped = document.querySelectorAll(".flip-card.flipped").length;
    if(totalFlipped === 3) {
      btnCloseReveal.style.display = "inline-block";
    }
  }

  // --- 🎫 LÓGICA DE LA TIENDA DE FICHAS ---

  function getCardCost(cardId) {
    if (cardId <= 10) return 15;
    if (cardId <= 17) return 33;
    return 55;
  }

  function openFichasShop() {
    if (!currentUserId) return alert("Inicia sesión para entrar al Mercado.");
    fichasShopGrid.innerHTML = "";

    if (state.fichas < 20) {
      btnBuyPackFichas.disabled = true;
      btnBuyPackFichas.style.background = "#bdc3c7";
      btnBuyPackFichas.style.cursor = "not-allowed";
    } else {
      btnBuyPackFichas.disabled = false;
      btnBuyPackFichas.style.background = "#6c5ce7";
      btnBuyPackFichas.style.cursor = "pointer";
    }

    for (let i = 1; i <= state.totalCards; i++) {
      const card = cardDatabase[i];
      const cost = getCardCost(i);
      const isOwned = state.ownedCards.has(i);

      const cardBox = document.createElement("div");
      cardBox.style.cssText = "background: white; border: 2px solid #edf2f7; padding: 8px; border-radius: 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);";

      let rName = "Básica"; let rColor = "#718096";
      if (i >= 11 && i <= 17) { rName = "Especial"; rColor = "#3182ce"; }
      if (i >= 18) { rName = "Arcoíris"; rColor = "#eb4d4b"; }

      cardBox.innerHTML = `
        <span style="font-size: 0.7rem; font-weight: bold; color: ${rColor}; text-transform: uppercase;">${rName}</span>
        <img src="${card.img}" style="width: 70px; height: 70px; object-fit: contain; margin: 4px 0; ${!isOwned ? 'filter: grayscale(100%); opacity: 0.6;' : ''}">
        <span style="font-size: 0.75rem; font-weight: bold; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">Nº ${String(i).padStart(3, '0')}</span>
        <span style="font-size: 0.8rem; font-weight: 800; color: #6c5ce7; margin-bottom: 6px;">🎫 ${cost}</span>
      `;

      const buyBtn = document.createElement("button");
      buyBtn.style.cssText = "width: 100%; padding: 5px; font-size: 0.75rem; border-radius: 6px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s;";

      if (isOwned) {
        buyBtn.textContent = "Obtenida";
        buyBtn.disabled = true;
        buyBtn.style.background = "#e2e8f0";
        buyBtn.style.color = "#a0aec0";
        buyBtn.style.cursor = "not-allowed";
      } else if (state.fichas < cost) {
        buyBtn.textContent = "Canjear";
        buyBtn.disabled = true;
        buyBtn.style.background = "#edf2f7";
        buyBtn.style.color = "#cbd5e0";
        buyBtn.style.cursor = "not-allowed";
      } else {
        buyBtn.textContent = "Canjear";
        buyBtn.style.background = "#2ecc71";
        buyBtn.style.color = "white";
        buyBtn.onclick = () => buyCardDirect(i, cost);
      }

      cardBox.appendChild(buyBtn);
      fichasShopGrid.appendChild(cardBox);
    }

    modalFichasShop.classList.remove("hidden");
  }

  async function buyCardDirect(cardId, cost) {
    if (state.fichas < cost) return alert("No tienes tickets suficientes.");
    if (confirm(`¿Quieres canjear ${cost} tickets por la Carta Nº ${String(cardId).padStart(3, '0')}?`)) {
      state.fichas -= cost;
      state.ownedCards.add(cardId);
      updateUI();
      openFichasShop();
      await syncProgressToSupabase([cardId]);
    }
  }

  btnBuyPackFichas.addEventListener("click", () => {
    if (state.fichas < 20) return alert("No tienes tickets suficientes.");
    state.fichas -= 20;
    modalFichasShop.classList.add("hidden");
    updateUI();
    triggerGachaRoll(1, true);
  });

  // --- 🏆 LÓGICA DE RECOMPENSAS POR HITOS DE PROGRESO ---

async function claimMilestoneReward(milestone) {
    if (state.rewardsClaimed.includes(milestone)) return; 

    let rewardLabel = "";

    if (milestone === 2) {
      rewardLabel = "Premio Hito 2: 2x Poké Balls";
      alert("¡Felicidades, has obtenido 2 Poké Balls!");
    } 
    else if (milestone === 4) {
      rewardLabel = "Premio Hito 4: 1x Super Ball";
      alert("¡Felicidades, has obtenido 1 Super Ball!");
    } 
    else if (milestone === 8 || milestone === 16) {
      activeFossilMilestone = milestone;
      modalFossil.classList.remove("hidden");
      return; // Se procesa por separado en el botón de confirmación
    } 
    else if (milestone === 12) {
      rewardLabel = "Premio Hito 12: Ticket Shiny";
      alert("¡Felicidades, has obtenido un ticket shiny!");
    } 
    else if (milestone === 20) {
      rewardLabel = "Premio Final Hito 20: Scorbunny + Eevee Nv. 5";
      alert("¡Felicidades! Has obtenido un Scorbunny y Eevee nv.5");
    }

    state.rewardsClaimed.push(milestone);
    updateUI();
    
    // 📊 Insertar Log en la base de datos para Plaza Sorelle
    if (rewardLabel) {
      await supabaseClient.from("trainer_log").insert({
        user_id: currentUserId,
        activity_type: "gacha_reward",
        activity_name: rewardLabel,
        money_reward: 0,
        xp_reward: 0
      });
    }

    await syncProgressToSupabase([]);
  }

btnConfirmFossil.addEventListener("click", async () => {
    const selectedFossilValue = selectFossil.value; 
    alert(`Has obtenido un ${selectedFossilValue}, puedes añadirlo a tus notas de inventario`);
    
    modalFossil.classList.add("hidden");
    
    if (activeFossilMilestone) {
      state.rewardsClaimed.push(activeFossilMilestone);
      
      await supabaseClient.from("trainer_log").insert({
        user_id: currentUserId,
        activity_type: "gacha_reward",
        activity_name: `Premio Hito ${activeFossilMilestone}: ${selectedFossilValue}`,
        money_reward: 0,
        xp_reward: 0
      });

      activeFossilMilestone = null;
      updateUI();
      await syncProgressToSupabase([]);
    }
  });

  btnLaterFossil?.addEventListener("click", () => {
    modalFossil.classList.add("hidden");
    activeFossilMilestone = null; 
  });

  // --- 📐 INTERFAZ GRÁFICA DEL ÁLBUM ---

  function renderAlbum() {
    albumGrid.innerHTML = "";
    for (let i = 1; i <= state.totalCards; i++) {
      const slot = document.createElement("div");
      slot.className = `card-slot slot-${i}`;
      slot.id = `album-slot-${i}`;

      const img = document.createElement("img");
      img.src = cardDatabase[i]?.img || "";
      img.className = "card-img";
      img.alt = cardDatabase[i]?.name || "Slot vacío";

      const idTag = document.createElement("span");
      idTag.className = "card-id";
      idTag.textContent = String(i).padStart(3, '0');

      slot.appendChild(img);
      slot.appendChild(idTag);
      albumGrid.appendChild(slot);
    }
  }

  function updateUI() {
    if (pokecoinsDisplay) pokecoinsDisplay.textContent = state.pokecoins.toLocaleString();
    if (fichasDisplay) fichasDisplay.textContent = state.fichas.toLocaleString();
    
    state.ownedCards.forEach(id => {
      const slot = document.getElementById(`album-slot-${id}`);
      if (slot) slot.classList.add("unlocked");
    });

    const titleElement = document.querySelector(".row-card-title");
    if(titleElement) {
      titleElement.innerHTML = `<i class="fa fa-book text-gold"></i> Álbum de Cartas Evento (${state.ownedCards.size}/${state.totalCards})`;
    }

    const progressPercent = (state.ownedCards.size / state.totalCards) * 100;
    progressFill.style.width = `${progressPercent}%`;

    document.querySelectorAll(".milestone-item").forEach(item => {
      const milestone = parseInt(item.getAttribute("data-milestone"));
      const rewardBox = item.querySelector(".reward-box");
      
      const newRewardBox = rewardBox.cloneNode(true);
      rewardBox.parentNode.replaceChild(newRewardBox, rewardBox);

      if (state.ownedCards.size >= milestone) {
        item.classList.add("reached");
        
        if (state.rewardsClaimed.includes(milestone)) {
          item.classList.add("claimed");
          newRewardBox.style.cursor = "default";
          newRewardBox.style.opacity = "0.5";
          newRewardBox.title = "Recompensa ya reclamada";
        } else {
          item.classList.remove("claimed");
          newRewardBox.style.cursor = "pointer";
          newRewardBox.style.animation = "pulse 1.5s infinite"; 
          newRewardBox.title = "¡Haz clic para reclamar premio!";
          newRewardBox.addEventListener("click", () => claimMilestoneReward(milestone));
        }
      } else {
        item.classList.remove("reached");
        item.classList.remove("claimed");
        newRewardBox.style.cursor = "not-allowed";
        newRewardBox.style.opacity = "0.3";
        newRewardBox.title = `Bloqueado. Junta ${milestone} cartas para desbloquear.`;
      }
    });
  }

  // --- 📅 ASIGNACIÓN DE EVENTOS ESCUCHADORES ---

  document.getElementById("btn-x1").addEventListener("click", () => triggerGachaRoll(1));
  document.getElementById("btn-x3").addEventListener("click", () => triggerGachaRoll(3));

  btnFichasShop?.addEventListener("click", openFichasShop);
  btnCloseFichasShop?.addEventListener("click", () => modalFichasShop.classList.add("hidden"));

  btnPromoCode?.addEventListener("click", () => {
    if(!currentUserId) return alert("Inicia sesión para reclamar códigos.");
    modalPromo.classList.remove("hidden");
    inputPromo.focus();
  });
  
  btnCancelCode?.addEventListener("click", () => {
    modalPromo.classList.add("hidden");
    inputPromo.value = "";
  });

  btnSubmitCode?.addEventListener("click", redeemCode);
  inputPromo?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") redeemCode();
  });

  btnCloseReveal.addEventListener("click", async () => {
    if (packsRemaining > 0) {
      generateBoosterPack();
    } else {
      btnCloseReveal.style.pointerEvents = "none";
      btnCloseReveal.textContent = "Guardando en la nube...";
      
      // 🌟 SISTEMA DE PITY: Al terminar de abrir el paquete completo evaluamos la racha del usuario
      if (totalPacksInRoll === 3) {
        if (rainbowDroppedInCurrentRoll) {
          console.log("🌈 [SISTEMA PITY]: ¡Salió una carta arcoíris! Contador reiniciado a 0.");
          state.pityCountX3 = 0;
        } else {
          state.pityCountX3 += 1;
          console.log(`❌ [SISTEMA PITY]: Sin arcoíris en este paquete x3. Racha de mala suerte: ${state.pityCountX3}/2`);
        }
      }

      await syncProgressToSupabase(newCardsInThisRoll);
      
      modalReveal.classList.add("hidden");
      btnCloseReveal.style.pointerEvents = "auto";
      
      updateUI();
    }
  });

  // --- 🚀 ARRANQUE INICIAL ---
  renderAlbum();
  await checkUserAndLoadData();
});