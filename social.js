// social.js - Lógica del Hub Social y Bitácora Global con Tags (Fase 2 Final)
// =========================================================================

const GAME_TABLE = "user_game_data";
const TRAINER_TABLE = "trainer_inventory";
const LOG_TABLE = "trainer_log";

const HIDDEN_USERS = [
  "966a8f84-2440-4a40-a334-75d35764743e" // Ejemplo: "d3b07384-d113-4ec6..."
];

let userMap = {}; // Diccionario maestro: userId -> { nombre, avatar, tag, tags }

function $(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  const user = await initProtectedPage();
  if (!user) return;

  if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();
  initHamburgerMenu();

  await loadSocialHubData();
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
    encounter: "Encounter", quest: "Quest", pokedex_comu: "Pokédex Comu.",
    pokedex_legen: "Pokédex Leg.", pokewords: "Pokéwords", freemode: "Freemode",
    passport: "Passport", checkpoint: "Checkpoint", trade: "Intercambio", consume: "Consumo", otros: "Otros"
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

      case "purchase":
        logContent = `🛒 ${authorPrefix} realizó una compra: "${log.activity_name}"`;
        break;
      case "incubation":
        logContent = `🥚 ${authorPrefix} activó su incubator con un <strong>${log.activity_name}</strong>`;
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
// COMPONENTE 3: MENÚ LATERAL
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