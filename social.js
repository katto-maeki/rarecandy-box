// social.js - Lógica del Hub Social y Bitácora Global con Tags (Fase 2 Final)
// =========================================================================

const GAME_TABLE = "user_game_data";
const TRAINER_TABLE = "trainer_inventory";
const LOG_TABLE = "trainer_log";
const ANNOUNCEMENT_TABLE = "announcements";

// Debe coincidir con la función is_admin() de Supabase (la seguridad real está allí;
// esta lista solo decide si se muestra el botón de borrar en avisos ajenos)
const ADMIN_EMAILS = [
  "umbreon@rarecandy.rp",
  "sylveon@rarecandy.rp",
  "test@rarecandy.rp",
  "test2@rarecandy.rp"
];

const HIDDEN_USERS = [
  "966a8f84-2440-4a40-a334-75d35764743e" // Ejemplo: "d3b07384-d113-4ec6..."
];

let userMap = {}; // Diccionario maestro: userId -> { nombre, avatar, tag, tags }
let isCurrentUserAdmin = false;

function $(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  const user = await initProtectedPage();
  if (!user) return;
  isCurrentUserAdmin = ADMIN_EMAILS.includes((user.email || "").toLowerCase());

  if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();
  initHamburgerMenu();

  const hubReady = loadSocialHubData();
  initFeedTabs(hubReady);
  await hubReady;
});

// ==========================================
// CORE: CARGA Y CRUCE DE DATOS MULTIJUGADOR
// ==========================================
async function loadSocialHubData() {
  const supabase = window.supabaseClient;

  try {
    // 1. Descargar entrenadores registrados y 2. sus inventarios (fotos de
    // perfil y etiquetas), en paralelo: son consultas independientes.
    const [{ data: allGames }, { data: allInventories }] = await Promise.all([
      supabase.from(GAME_TABLE).select("id, trainer_name, user_tag"),
      supabase.from(TRAINER_TABLE).select("user_id, inventory"),
    ]);

    // Crear un mapa de metadatos rápido
    let metaMap = {};
    if (allInventories) {
      allInventories.forEach(row => {
        metaMap[row.user_id] = {
          avatar: window.toCdnSpriteUrl(row.inventory?.avatarUrl, window.MYSTERY_EGG_SPRITE),
          tags: row.inventory?.tags || []
        };
      });
    }

    // 3. Compilar el diccionario maestro de usuarios (Aplicando el filtro de ocultado)
    userMap = {};
    if (allGames) {
      allGames.forEach(trainer => {
        // CORREGIDO: Si el entrenador está en la lista negra, no lo agregamos al mapa ni al directorio
        if (HIDDEN_USERS.includes(trainer.id)) return;

        const meta = metaMap[trainer.id] || { avatar: window.MYSTERY_EGG_SPRITE, tags: [] };
        userMap[trainer.id] = {
          name: trainer.name || trainer.trainer_name || "Entrenador",
          tag: trainer.user_tag || "0000",
          avatar: meta.avatar,
          tags: meta.tags 
        };
      });
    }

    renderTrainersDirectory();
    await loadAndRenderGlobalFeed();

  } catch (err) {
    console.error("Error crítico al cargar el Hub Social:", err);
  }
}

// ==========================================
// COMPONENTE 1: DIRECTORIO DE USUARIOS
// ==========================================
function renderTrainersDirectory() {
  const container = $("directory-container");
  container.innerHTML = "";

  const userIds = Object.keys(userMap);

  if (userIds.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem; color:#718096; padding:10px;">No hay otros entrenadores registrados.</p>`;
    return;
  }

  userIds.forEach(id => {
    const trainer = userMap[id];
    
    const card = document.createElement("div");
    card.className = "trainer-social-card";
    
    card.innerHTML = `
      <img src="${trainer.avatar}" class="avatar-social-mini" alt="Avatar" />
      <div style="flex: 1; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
        <div style="display: flex; align-items: baseline; gap: 6px;">
          <span style="font-weight: 700; color: #232542; font-size: 0.9rem; white-space: nowrap;">${trainer.name.toUpperCase()}</span>
          <span style="font-size: 0.72rem; color: #c957b0; font-family: 'Press Start 2P', sans-serif; font-weight: normal; white-space: nowrap;">#${trainer.tag}</span>
        </div>
        
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          ${trainer.tags.map(t => `<span class="profile-tag-pill" style="font-size: 0.62rem; padding: 2px 8px; font-weight: 700;">${t}</span>`).join("")}
        </div>
      </div>
      <i class="fa fa-chevron-right" style="color: #cbd5e0; font-size: 0.8rem; margin-left: auto;"></i>
    `;

    card.onclick = () => {
      window.location.href = `perfil.html?id=${id}`;
    };

    container.appendChild(card);
  });
}

// ==========================================
// COMPONENTE 2: BITÁCORA GLOBAL RECOPILADA
// ==========================================
async function loadAndRenderGlobalFeed() {
  const supabase = window.supabaseClient;
  const feedContainer = $("global-history-feed");
  feedContainer.innerHTML = "";

  const { data: logs, error } = await supabase
    .from(LOG_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    feedContainer.innerHTML = `<p style="font-size:0.75rem; color:#e53e3e; padding:10px;">Error al sintonizar la bitácora.</p>`;
    return;
  }

  if (!logs || logs.length === 0) {
    feedContainer.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border:none; padding:10px;">La bitácora global está despejada.</div>`;
    return;
  }

  const typeNames = {
    encounter: "Encounter", safari: "Safari", quest: "Quest", pokedex_comu: "Pokédex Comu.",
    pokedex_legen: "Pokédex Leg.", pokewords: "Pokéwords", freemode: "Freemode",
    passport: "Passport", checkpoint: "Checkpoint", trade: "Intercambio", consume: "Consumo", otros: "Otros", promptober: "Promptober"
  };

  logs.forEach(log => {
    if (HIDDEN_USERS.includes(log.user_id)) return;

    const date = new Date(log.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    
    const authorName = userMap[log.user_id]?.name || "Entrenador Desconocido";
    const authorPrefix = `<span style="color: #4a5568; font-weight: 800;">${authorName}</span>`;

let logContent = "";
    switch (log.activity_type) {
      // 🎲 NUEVO: Registro de tiradas en la máquina Gachapón
      case "gacha_roll":
        logContent = `🎰 ${authorPrefix} probó su suerte la máquina de sobres: ¡Abrió un paquete de <strong>${log.activity_name}</strong>!`;
        break;

      // 🎁 NUEVO: Registro de hitos reclamados de la barra de progreso
      case "gacha_reward":
        logContent = `⭐ ¡Recompensa de Progreso de Álbum! ${authorPrefix} reclamó el <strong>${log.activity_name}</strong>`;
        break;

      // 🎟️ NUEVO: Registro del cierre de evento (conversión de tickets a pokecoins)
      case "gacha_close":
        logContent = `🎟️ ¡Cierre de Evento! ${authorPrefix} transformó sus tickets del Gachapón en <strong style="color:#0fb86b;">₽${log.money_reward} pokecoins</strong>`;
        break;

      case "purchase": {
        let purchaseDesc = log.activity_name;
        try {
          const order = JSON.parse(log.activity_name);
          purchaseDesc = order.items.map(it => `${it.qty}x ${it.label}`).join(", ");
        } catch (e) { /* registro antiguo de un solo ítem en texto plano, se muestra tal cual */ }
        logContent = `🛒 ${authorPrefix} realizó una compra: "${purchaseDesc}"`;
        break;
      }
      case "gift": {
        let giftDesc = log.activity_name;
        try {
          const order = JSON.parse(log.activity_name);
          giftDesc = order.items.map(it => `${it.qty}x ${it.label}`).join(", ");
        } catch (e) { /* registro antiguo en texto plano, se muestra tal cual */ }
        logContent = `🎁 ${authorPrefix} recibió un regalo de la tienda: "${giftDesc}"`;
        break;
      }
      case "incubation":
        logContent = `🥚 ${authorPrefix} puso a incubar un <strong>${log.activity_name}</strong>`;
        break;
      case "hatch":
        logContent = `🐣 ¡El huevo de ${authorPrefix} eclosionó! Obtuvo a <strong>${log.activity_name}</strong>`;
        break;
      case "box_add":
        logContent = `📦 ${authorPrefix} guardó a <strong>${log.activity_name}</strong> en su caja`;
        break;
      case "box_release":
        logContent = `🕊️ ${authorPrefix} liberó a: <strong>${log.activity_name}</strong>`;
        break;
      case "evolution":
        logContent = `💥 ¡Gran noticia! El Pokémon de ${authorPrefix} evolucionó: <strong>${log.activity_name}</strong>`;
        break;
      case "exp_assign":
        logContent = `💪 ${authorPrefix} entrenó a <strong>${log.activity_name}</strong> con <span style="color:#7a47ff; font-weight:700;">+${log.xp_reward} XP</span>`;
        break;
      case "consume":
        logContent = `🎒 ${authorPrefix} usó descarte de mochila: <strong>${log.activity_name}</strong>`;
        break;
      case "checkpoint":
        logContent = `🏁 ${authorPrefix} timbró un hito oficial: <em>${log.activity_name}</em>`;
        break;
      case "trade":
        if (log.activity_name.includes("Rechazó") || log.activity_name.includes("rechazo")) {
          const cleanText = log.activity_name.charAt(0).toLowerCase() + log.activity_name.slice(1);
          logContent = `❌ ${authorPrefix} ${cleanText}`;
        } else {
          logContent = `🤝 ${authorPrefix}: ${log.activity_name}`;
        }
        break;
      case "bimonthly_close":
        try {
          const closeData = JSON.parse(log.activity_name);
          const titleText = closeData.displayTitle || "Cierre de Bimestre";
          
          let details = "";
          if (closeData.types) {
            details += `<br>★ <strong>Pokes atrapados:</strong> ${closeData.types}`;
          }
          if (closeData.activities) {
            details += `<br>★ <strong>Actividades:</strong> ${closeData.activities}`;
          }
          if (closeData.items) {
            details += `<br>★ <strong>Objetos en mochila:</strong> ${closeData.items}`;
          }
          if (closeData.hatched && parseInt(closeData.hatched) > 0) {
            details += `<br>★ <strong>Huevos eclosionados:</strong> ${closeData.hatched}`;
          }
          
          logContent = `📅 ¡${authorPrefix} completó su <strong>${titleText}</strong>!${details}`;
        } catch (e) {
          logContent = `📅 ¡${authorPrefix} completó su <strong>Cierre de Bimestre</strong>!`;
        }
        break;
      default:
        const label = typeNames[log.activity_type] || log.activity_type;
        logContent = `🎯 ${authorPrefix} completó [${label}]: "${log.activity_name}"`;
    }

    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `<strong>[${date}]</strong> ${logContent}`;
    feedContainer.appendChild(item);
  });
}

// ==========================================
// COMPONENTE 3: PESTAÑAS DEL PANEL DERECHO
// ==========================================
function initFeedTabs(hubReady) {
  // Pestañas que se descargan solo la primera vez que se abren
  // (las cajas de todos los usuarios pesan bastante)
  const lazyLoaders = {
    "trade-market-feed": loadAndRenderTradeMarket,
    "board-panel": loadAndRenderBoard,
  };
  const loaded = new Set();

  document.querySelectorAll(".social-tab").forEach(tab => {
    tab.onclick = async () => {
      document.querySelectorAll(".social-tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".social-tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== tab.dataset.tab));

      const loader = lazyLoaders[tab.dataset.tab];
      if (loader && !loaded.has(tab.dataset.tab)) {
        loaded.add(tab.dataset.tab);
        await hubReady; // Necesitamos userMap para nombres y avatares
        await loader();
      }
    };
  });

  // La pestaña activa al entrar (Anuncios) también se carga de forma
  // diferida: se dispara su carga como si se hubiera hecho clic.
  document.querySelector(".social-tab.active")?.onclick();

  initAnnouncementModal();
}

// ==========================================
// COMPONENTE 4: POKÉMON DISPONIBLES PARA INTERCAMBIO
// ==========================================
async function loadAndRenderTradeMarket() {
  const supabase = window.supabaseClient;
  const container = $("trade-market-feed");

  const { data: games, error } = await supabase
    .from(GAME_TABLE)
    .select("id, party_data, box_data");

  if (error) {
    container.innerHTML = `<p style="font-size:0.75rem; color:#e53e3e; padding:10px;">Error al buscar pokémon de intercambio.</p>`;
    return;
  }

  container.innerHTML = "";

  (games || []).forEach(game => {
    // Se omiten usuarios ocultos y el propio usuario
    if (!userMap[game.id] || game.id === window.currentUserId) return;

    const pool = [];
    if (Array.isArray(game.party_data)) pool.push(...game.party_data.filter(p => p));
    if (game.box_data?.boxes) {
      game.box_data.boxes.forEach(box => {
        if (Array.isArray(box)) pool.push(...box.filter(p => p));
      });
    }
    const trades = pool.filter(p => p.forTrade === true);
    if (trades.length === 0) return;

    const trainer = userMap[game.id];
    const goToProfile = () => { window.location.href = `perfil.html?id=${game.id}`; };

    const row = document.createElement("div");
    row.className = "trade-market-row";
    row.innerHTML = `
      <div class="trade-market-owner">
        <img src="${trainer.avatar}" class="avatar-social-mini" alt="Avatar" />
        <span style="font-weight: 700; color: #232542; font-size: 0.85rem;">${trainer.name.toUpperCase()}</span>
        <span style="font-size: 0.65rem; color: #c957b0; font-family: 'Press Start 2P', sans-serif;">#${trainer.tag}</span>
        <span style="margin-left: auto; font-size: 0.72rem; color: #718096; font-weight: 700;">${trades.length} disponible(s) <i class="fa fa-chevron-right" style="color: #cbd5e0;"></i></span>
      </div>
      <div class="trade-market-pokes"></div>
    `;
    row.querySelector(".trade-market-owner").onclick = goToProfile;

    const pokesBox = row.querySelector(".trade-market-pokes");
    trades.forEach(poke => {
      const card = document.createElement("div");
      card.className = "pkm-profile-box on-trade";
      card.title = `${poke.apodo ? `"${poke.apodo}" (${poke.nombre})` : poke.nombre}${poke.nivel ? ` · Lvl ${poke.nivel}` : ""}${poke.isShiny ? " · ✨ Shiny" : ""}`;
      card.innerHTML = `
        <img src="${window.toCdnSpriteUrl(poke.sprite, window.MYSTERY_EGG_SPRITE)}" alt="${poke.nombre}"/>
        <div style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${poke.isShiny ? "✨" : ""}${poke.apodo || poke.nombre}</div>
      `;
      card.onclick = goToProfile;
      pokesBox.appendChild(card);
    });

    container.appendChild(row);
  });

  if (!container.children.length) {
    container.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border:none; padding:10px;">Ningún isleño tiene pokémon disponibles para intercambio por ahora.</div>`;
  }
}

// ==========================================
// COMPONENTE 5: TABLÓN DE ANUNCIOS
// Todo el texto de los usuarios se inserta con textContent (nunca innerHTML)
// para que nadie pueda inyectar HTML o scripts en el navegador de los demás.
// ==========================================
async function loadAndRenderBoard() {
  const supabase = window.supabaseClient;
  const feed = $("board-feed");

  // RLS ya oculta los vencidos a los usuarios; el admin sí los recibe, así que se filtran aquí también
  const { data: announcements, error } = await supabase
    .from(ANNOUNCEMENT_TABLE)
    .select("id, user_id, title, activity_type, content, link, created_at, expires_at")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    feed.innerHTML = `<p style="font-size:0.75rem; color:#e53e3e; padding:10px;">Error al cargar el tablón.</p>`;
    return;
  }

  feed.innerHTML = "";

  if (!announcements || announcements.length === 0) {
    feed.innerHTML = `<div class="log-item" style="font-style:italic; color:#718096; border:none; padding:10px;">El tablón está vacío. ¡Sé el primero en publicar un aviso!</div>`;
    return;
  }

  announcements.forEach(a => feed.appendChild(buildAnnouncementCard(a)));
}

function buildAnnouncementCard(a) {
  const author = userMap[a.user_id];
  const date = new Date(a.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const card = document.createElement("article");
  card.className = "announcement-card";
  card.innerHTML = `
    <div class="announcement-head">
      <div class="announcement-title"></div>
    </div>
    <div class="announcement-meta">
      <img class="avatar-social-mini" alt="Avatar" />
      <span class="announcement-author"></span>
      <span>·</span>
      <span class="announcement-date"></span>
    </div>
    <p class="announcement-content"></p>
  `;

  card.querySelector(".announcement-title").textContent = a.title;

  if (a.activity_type) {
    const pill = document.createElement("span");
    pill.className = "profile-tag-pill announcement-activity";
    pill.textContent = a.activity_type;
    pill.title = a.activity_type;
    card.querySelector(".announcement-head").appendChild(pill);
  }
  card.querySelector(".announcement-content").textContent = a.content;
  card.querySelector(".announcement-date").textContent = date;
  card.querySelector(".avatar-social-mini").src = author?.avatar || window.MYSTERY_EGG_SPRITE;

  const authorEl = card.querySelector(".announcement-author");
  authorEl.textContent = author ? `${author.name.toUpperCase()} #${author.tag}` : "Entrenador";
  if (author) authorEl.onclick = () => { window.location.href = `perfil.html?id=${a.user_id}`; };

  // Solo enlaces http(s); la base de datos también lo exige
  if (a.link && /^https?:\/\//i.test(a.link)) {
    const link = document.createElement("a");
    link.className = "announcement-link";
    link.href = a.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `<i class="fa fa-external-link"></i> `;
    link.append(a.link);
    card.appendChild(link);
  }

  if (a.user_id === window.currentUserId || isCurrentUserAdmin) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "announcement-delete";
    del.title = "Borrar aviso";
    del.innerHTML = `<i class="fa fa-trash"></i>`;
    del.onclick = () => deleteAnnouncement(a.id, card, del);
    card.querySelector(".announcement-head").appendChild(del);
  }

  return card;
}

async function deleteAnnouncement(id, card, btn) {
  btn.disabled = true;
  const { data, error } = await window.supabaseClient
    .from(ANNOUNCEMENT_TABLE)
    .delete()
    .eq("id", id)
    .select("id");

  // Si RLS no lo permite, Supabase no da error: simplemente no borra ninguna fila
  if (error || !data || data.length === 0) {
    console.error("No se pudo borrar el aviso:", error);
    btn.disabled = false;
    btn.style.color = "#e53e3e";
    btn.title = "No se pudo borrar el aviso";
    return;
  }

  card.remove();
  if (!$("board-feed").children.length) await loadAndRenderBoard();
}

function initAnnouncementModal() {
  const modal = $("modal-new-announcement");
  const titleInput = $("announcement-title");
  const activityInput = $("announcement-activity");
  const contentInput = $("announcement-content");
  const linkInput = $("announcement-link");
  const errorEl = $("announcement-error");
  const submitBtn = $("btn-announcement-submit");

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  };

  contentInput.oninput = () => {
    $("announcement-count").textContent = `${contentInput.value.length}/280`;
  };

  $("btn-new-announcement").onclick = () => {
    titleInput.value = "";
    activityInput.value = "";
    contentInput.value = "";
    linkInput.value = "";
    contentInput.oninput();
    errorEl.classList.add("hidden");
    modal.classList.remove("hidden");
    titleInput.focus();
  };

  const close = () => modal.classList.add("hidden");
  $("btn-announcement-cancel").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  submitBtn.onclick = async () => {
    const title = titleInput.value.trim();
    const activityType = activityInput.value.trim();
    const content = contentInput.value.trim();
    const link = linkInput.value.trim();

    if (!title) return showError("Escribe un título.");
    if (!content) return showError("Escribe el contenido del aviso.");
    if (link && !/^https?:\/\/\S+$/i.test(link)) return showError("El enlace debe empezar con http:// o https://");

    submitBtn.disabled = true;
    const { error } = await window.supabaseClient
      .from(ANNOUNCEMENT_TABLE)
      .insert({ title, activity_type: activityType || null, content, link: link || null });
    submitBtn.disabled = false;

    if (error) {
      console.error("Error al publicar aviso:", error);
      return showError("No se pudo publicar el aviso. Inténtalo de nuevo.");
    }

    close();
    await loadAndRenderBoard();
  };
}

// ==========================================
// COMPONENTE 6: MENÚ LATERAL
// ==========================================
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