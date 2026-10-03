// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================

const bd = window.supabaseClient;
const TRAINER_TABLE = "trainer_inventory";
const LOG_TABLE = "trainer_log";

let user = null;
let currentMeta = null;
let cart = {}; // { itemKey: cantidad }

// Límites de compra por mes calendario (los regalos no cuentan).
// singular/plural se usan en los mensajes de Jigglypuff ("Ya compraste tus 3 huevos...").
// legacyPattern cuenta los registros antiguos en texto plano (solo existían para huevos).
const MONTHLY_LIMITS = {
  egg: { limit: 3, singular: "huevo", plural: "huevos", legacyPattern: /(\d+)x Huevo/ },
  curry: { limit: 2, singular: "curry", plural: "currys" },
};
// { egg: n, curry: n } comprados este mes; null = aún no se sabe (cargando o error al consultar)
let boughtThisMonth = null;

let infoItemKey = null; // ítem cuya descripción está mostrando Jigglypuff

// Mismos ítems, etiquetas y precios que en trainer.html (Inventario)
const SHOP_ITEMS = [
  { key: "poke", label: "Poké Ball", price: 50, category: "balls", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/poke-ball.png" },
  { key: "super", label: "Super Ball", price: 100, category: "balls", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/great-ball.png" },
  { key: "ultra", label: "Ultra Ball", price: 150, category: "balls", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/ultra-ball.png" },
  { key: "master", label: "Master Ball", price: 300, category: "balls", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/master-ball.png" },
  { key: "egg", label: "Huevo Pokémon", price: 600, category: "items", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/mystery-egg.png" },
  { key: "tradeToken", label: "Ticket de Intercambio", price: 150, category: "items", icon: "https://i.ibb.co/0yTnfxPN/Iris-ticket.png" },
  { key: "evoStone", label: "Piedra Evolución", price: 300, category: "items", icon: "https://i.ibb.co/Lyh4XR3/shiny-stone.png" },
  { key: "friendship", label: "Pulsera Amistad", price: 300, category: "items", icon: "https://i.ibb.co/QF4xxhVY/Cascabel-alivio.png" },
  { key: "starCrystal", label: "Cristal Estelar", price: 350, category: "items", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/star-piece.png" },
  { key: "passport", label: "Pasaporte Regional", price: 150, category: "items", icon: "https://i.ibb.co/R4HdLphw/eon-ticket.png" },
  { key: "panquecito", label: "Panquecito", price: 100, category: "items", icon: "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/lumiose-galette.png" },
  { key: "curry", label: "Curry", price: 600, category: "items", icon: "img/curry.png" },
];

const SHOP_ITEMS_MAP = Object.fromEntries(SHOP_ITEMS.map(i => [i.key, i]));

const defaultMeta = {
  xp: 0, achievements: "", pokedex: "0", notes: "",
  economy: { biIncome: 0, savings: 0, spent: 0 },
  items: { egg: 0, tradeToken: 0, evoStone: 0, friendship: 0, starCrystal: 0, passport: 0, panquecito: 0, curry: 0 },
  balls: { poke: 0, super: 0, ultra: 0, master: 0 },
  lastUpdated: null,
};

// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  // El catálogo es estático: lo pintamos de inmediato para no mostrar la
  // cuadrícula vacía mientras se valida la sesión y se carga el inventario.
  // Los botones de pago quedan deshabilitados hasta que currentMeta exista.
  renderShopGrid();
  renderTicket();
  updateCashierBalance();

  const loggedUser = await initProtectedPage();
  if (!loggedUser) return;
  user = loggedUser;

  await renderTrainerLabelFromGame();
  initHamburgerMenu();

  await Promise.all([loadMeta(), loadMonthlyPurchases()]);
  updateCashierBalance();
  renderShopGrid();
  renderTicket();

  document.getElementById("btn-confirm-purchase").onclick = openPurchaseSummaryModal;
  document.getElementById("btn-gift-cart").onclick = openGiftSummaryModal;
  document.getElementById("btn-purchase-cancel").onclick = closePurchaseSummaryModal;
  document.getElementById("btn-purchase-confirm").onclick = confirmPurchase;
  document.getElementById("btn-gift-cancel").onclick = closeGiftSummaryModal;
  document.getElementById("btn-gift-confirm").onclick = grantAsGift;
});

function initHamburgerMenu() {
  const b = document.getElementById("btn-menu");
  const m = document.getElementById("side-menu");
  if (b) b.onclick = () => m.classList.remove("hidden");
  const cb = document.getElementById("btn-close-menu");
  if (cb) cb.onclick = () => m.classList.add("hidden");
  if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

// ===============================
// DATOS DEL ENTRENADOR
// ===============================

async function loadMeta() {
  const { data, error } = await bd.from(TRAINER_TABLE).select("inventory").eq("user_id", user.id).maybeSingle();

  // Si la lectura falla NO usamos defaultMeta: al comprar se sobrescribiría el
  // inventario real con ceros. Dejamos currentMeta en null y la tienda bloqueada.
  if (error) {
    console.error("Error al cargar el inventario:", error);
    currentMeta = null;
    return;
  }

  if (data?.inventory) {
    const parsed = data.inventory;
    currentMeta = {
      ...defaultMeta,
      ...parsed,
      economy: { ...defaultMeta.economy, ...(parsed.economy || {}) },
      items: { ...defaultMeta.items, ...(parsed.items || {}) },
      balls: { ...defaultMeta.balls, ...(parsed.balls || {}) },
    };
  } else {
    currentMeta = { ...defaultMeta, lastUpdated: new Date().toISOString() };
  }
}

// Cuenta los ítems con límite comprados desde el día 1 del mes actual (hora local)
// a partir de trainer_log. Soporta las órdenes nuevas en JSON y los registros antiguos
// en texto plano ("Mochila: Compró 2x Huevo", "Tienda: Compró 1x Huevo Pokémon").
async function loadMonthlyPurchases() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await bd.from(LOG_TABLE)
    .select("activity_name")
    .eq("user_id", user.id)
    .eq("activity_type", "purchase")
    .gte("created_at", monthStart.toISOString());

  if (error) {
    console.error("Error al consultar las compras del mes:", error);
    boughtThisMonth = null;
    return;
  }

  boughtThisMonth = {};
  for (const key of Object.keys(MONTHLY_LIMITS)) {
    boughtThisMonth[key] = (data || []).reduce((sum, log) => sum + countItemInLog(log.activity_name, key), 0);
  }
}

function countItemInLog(activityName, key) {
  try {
    const order = JSON.parse(activityName);
    if (Array.isArray(order?.items)) {
      return order.items.filter(it => it.key === key).reduce((sum, it) => sum + (it.qty || 0), 0);
    }
  } catch (e) { /* registro antiguo en texto plano */ }
  const pattern = MONTHLY_LIMITS[key].legacyPattern;
  const match = pattern ? pattern.exec(activityName || "") : null;
  return match ? parseInt(match[1], 10) : 0;
}

// Unidades del ítem que aún se pueden comprar este mes. Si no se pudo verificar, 0 (bloquea).
function getRemaining(key) {
  if (boughtThisMonth === null) return 0;
  return Math.max(0, MONTHLY_LIMITS[key].limit - (boughtThisMonth[key] || 0));
}

function isLimitExceeded(key) {
  return (cart[key] || 0) > getRemaining(key);
}

// Primer ítem del carrito que supera su límite mensual (o null si ninguno).
function getExceededLimitKey() {
  return Object.keys(MONTHLY_LIMITS).find(isLimitExceeded) || null;
}

function getAvailableMoney() {
  const eco = currentMeta.economy;
  return (eco.savings + eco.biIncome) - eco.spent;
}

function getItemCategory(key) {
  return SHOP_ITEMS_MAP[key]?.category === "balls" ? "balls" : "items";
}

// ===============================
// GRID DE ÍTEMS
// ===============================

function renderShopGrid() {
  const grid = document.getElementById("shop-grid");
  grid.innerHTML = SHOP_ITEMS.map(item => renderShopItemCard(item)).join("");

  grid.querySelectorAll(".qty-btn").forEach(btn => {
    btn.onclick = () => changeCartQty(btn.dataset.key, btn.dataset.action === "inc" ? 1 : -1);
  });

  grid.querySelectorAll(".shop-item-info, .shop-item-image").forEach(el => {
    el.onclick = () => showItemInfo(el.dataset.key);
  });
}

// Jigglypuff explica para qué sirve el ítem en su globo. La explicación se
// mantiene hasta que el carrito cambie (renderTicket vuelve al mensaje normal)
// o hasta que se vuelva a tocar el mismo ⓘ / imagen (alterna).
function showItemInfo(key) {
  const item = SHOP_ITEMS_MAP[key];
  const desc = ITEM_DESCRIPTIONS[key];
  if (!item || !desc) return;

  if (infoItemKey === key) {
    updateCashierMessage(); // vuelve al mensaje normal y apaga el ⓘ
    return;
  }

  updateCashierMessage(`${item.label}: ${desc}`);
  infoItemKey = key;
  document.querySelectorAll(".shop-item-info").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.key === key);
  });
}

function renderShopItemCard(item) {
  const qty = cart[item.key] || 0;
  return `
    <div class="shop-item-card ${qty > 0 ? "in-cart" : ""}" id="card-${item.key}">
      <button class="shop-item-info ${infoItemKey === item.key ? "active" : ""}" data-key="${item.key}" title="¿Para qué sirve?" aria-label="Ver para qué sirve ${item.label}">
        <i class="fa fa-info"></i>
      </button>
      <div class="shop-item-image" data-key="${item.key}" title="¿Para qué sirve?">
        <img src="${item.icon}" alt="${item.label}" />
      </div>
      <div class="shop-item-name">${item.label}</div>
      <div class="shop-item-price">₽${item.price.toLocaleString()}</div>
      ${MONTHLY_LIMITS[item.key] ? renderLimitNote(item.key) : ""}
      <div class="qty-stepper">
        <button class="qty-btn" data-action="dec" data-key="${item.key}" ${qty === 0 ? "disabled" : ""}>−</button>
        <span class="qty-value" id="qty-${item.key}">${qty}</span>
        <button class="qty-btn qty-btn-add" data-action="inc" data-key="${item.key}">+</button>
      </div>
    </div>
  `;
}

function renderLimitNote(key) {
  const { limit } = MONTHLY_LIMITS[key];
  let text;
  if (!user) {
    text = `Máx. ${limit} al mes`;
  } else if (boughtThisMonth === null) {
    text = "No se pudo verificar el límite";
  } else {
    const remaining = getRemaining(key);
    text = `Te ${remaining === 1 ? "queda" : "quedan"} ${remaining} de ${limit} este mes`;
  }
  const exhausted = user && getRemaining(key) === 0;
  return `<div class="shop-item-limit ${exhausted ? "limit-reached" : ""}">${text}</div>`;
}

// Cada click en +/- suma o resta directamente del carrito (sin paso de "Agregar"
// intermedio): menos clics y el ticket se actualiza al instante.
function changeCartQty(key, delta) {
  const next = Math.max(0, Math.min((cart[key] || 0) + delta, 99));
  if (next === 0) delete cart[key];
  else cart[key] = next;

  const card = document.getElementById(`card-${key}`);
  if (card) {
    card.classList.toggle("in-cart", next > 0);
    card.querySelector(".qty-value").textContent = next;
    card.querySelector('[data-action="dec"]').disabled = next === 0;
  }

  renderTicket();
}

// ===============================
// TICKET / RESUMEN DE COMPRA
// ===============================

function renderTicket() {
  const list = document.getElementById("ticket-list");
  const keys = Object.keys(cart).filter(k => cart[k] > 0);

  if (keys.length === 0) {
    list.innerHTML = `<p class="ticket-empty">Tu carrito está vacío.</p>`;
  } else {
    list.innerHTML = keys.map(key => {
      const item = SHOP_ITEMS_MAP[key];
      const qty = cart[key];
      const subtotal = qty * item.price;
      return `
        <div class="ticket-row">
          <span class="ticket-item-name">${item.label}</span>
          <span class="ticket-item-qty">x${qty}</span>
          <span class="ticket-item-price">₽${subtotal.toLocaleString()}</span>
          <button class="ticket-remove-btn" data-key="${key}" title="Quitar del carrito">&times;</button>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".ticket-remove-btn").forEach(btn => {
      btn.onclick = () => {
        delete cart[btn.dataset.key];
        renderShopGrid();
        renderTicket();
      };
    });
  }

  const total = getCartTotal();
  document.getElementById("ticket-total").textContent = total.toLocaleString();
  document.getElementById("btn-confirm-purchase").disabled = !currentMeta || total === 0 || getExceededLimitKey() !== null;
  document.getElementById("btn-gift-cart").disabled = !currentMeta || getCartItemCount() === 0;
  updateCashierMessage();
}

function getCartTotal() {
  return Object.keys(cart).reduce((sum, key) => sum + (cart[key] * SHOP_ITEMS_MAP[key].price), 0);
}

function getCartItemCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

// Línea fija de Jigglypuff: siempre visible, muestra el saldo disponible.
function updateCashierBalance() {
  const balanceLine = document.getElementById("cashier-balance");
  if (!balanceLine) return;
  if (!currentMeta) {
    balanceLine.textContent = user
      ? "No pude cargar tu saldo. Recarga la página."
      : "Cargando tu saldo...";
    return;
  }
  balanceLine.textContent = `¡Bienvenido! Tienes ₽${getAvailableMoney().toLocaleString()} disponible.`;
}

// Segunda línea de Jigglypuff: mensaje dinámico según el estado del carrito.
function updateCashierMessage(customText) {
  const bubble = document.getElementById("cashier-message");
  if (!bubble) return;

  // Cualquier mensaje nuevo reemplaza la explicación de ítem que hubiera.
  infoItemKey = null;
  document.querySelectorAll(".shop-item-info.active").forEach(btn => btn.classList.remove("active"));

  if (customText) {
    bubble.textContent = customText;
    return;
  }

  const count = getCartItemCount();
  const exceededKey = user ? getExceededLimitKey() : null;
  if (exceededKey) {
    const { limit, singular, plural } = MONTHLY_LIMITS[exceededKey];
    const remaining = getRemaining(exceededKey);
    bubble.textContent = boughtThisMonth === null
      ? "No pude verificar tu límite de compras del mes. Recarga la página."
      : remaining === 0
      ? `Ya compraste tus ${limit} ${plural} de este mes. ¡Vuelve el próximo mes!`
      : `Solo puedes comprar ${remaining} ${remaining > 1 ? plural : singular} más este mes.`;
  } else if (count === 0) {
    bubble.textContent = "Elige lo que necesites.";
  } else {
    const total = getCartTotal();
    bubble.textContent = `¡Buena elección! Llevas ${count} ítem${count > 1 ? "s" : ""} por ₽${total.toLocaleString()}.`;
  }
}

function clearCart() {
  cart = {};
  renderShopGrid();
  renderTicket();
}

// ===============================
// OBTENER COMO REGALO (SIN COSTO)
// ===============================

function openGiftSummaryModal() {
  const count = getCartItemCount();
  if (count === 0) return;

  const list = document.getElementById("gift-summary-list");
  list.innerHTML = Object.keys(cart).filter(k => cart[k] > 0).map(key => {
    const item = SHOP_ITEMS_MAP[key];
    const qty = cart[key];
    return `<li><span>${item.label} x${qty}</span><span>Gratis</span></li>`;
  }).join("");

  document.getElementById("modal-gift-summary").classList.remove("hidden");
}

function closeGiftSummaryModal() {
  document.getElementById("modal-gift-summary").classList.add("hidden");
}

async function grantAsGift() {
  const count = getCartItemCount();
  if (count === 0 || !currentMeta) return;

  const giftBtn = document.getElementById("btn-gift-confirm");
  giftBtn.disabled = true;

  try {
    const result = await saveOrder("gift", 0);
    closeGiftSummaryModal();
    clearCart();
    if (result.logSaved) {
      updateCashierMessage("¡Listo! Se agregó tu regalo al inventario.");
    } else {
      updateCashierMessage("Se agregó tu regalo, pero no quedó en el historial. Avisa a un admin.");
    }
  } catch (e) {
    console.error("Error al obtener el regalo:", e);
    alert("Ocurrió un error al procesar el regalo. No se agregó nada a tu inventario. Intenta nuevamente.");
  } finally {
    giftBtn.disabled = getCartItemCount() === 0;
  }
}

// ===============================
// GUARDAR ORDEN (COMPRA O REGALO)
// ===============================

// Supabase no lanza excepciones: devuelve { error }, así que hay que revisarlo
// en cada llamada. Orden de guardado:
//   1) inventario: si falla, se lanza el error y se recarga currentMeta desde la
//      BD para descartar los cambios locales (no se entregó nada).
//   2) log: si falla, los ítems YA se entregaron, así que no revertimos; solo
//      devolvemos logSaved=false para avisar que la orden no quedó registrada.
async function saveOrder(activityType, total) {
  const isGift = activityType === "gift";
  const orderItems = Object.keys(cart).filter(k => cart[k] > 0).map(key => {
    const item = SHOP_ITEMS_MAP[key];
    const qty = cart[key];
    return { key, label: item.label, qty, price: item.price, subtotal: isGift ? 0 : qty * item.price };
  });

  orderItems.forEach(({ key, qty }) => {
    const cat = getItemCategory(key);
    currentMeta[cat][key] = (currentMeta[cat][key] || 0) + qty;
  });
  if (!isGift) currentMeta.economy.spent += total;
  currentMeta.lastUpdated = new Date().toISOString();

  const { error: invError } = await bd.from(TRAINER_TABLE).upsert(
    { user_id: user.id, inventory: currentMeta, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (invError) {
    await loadMeta();
    updateCashierBalance();
    throw invError;
  }

  const { error: logError } = await bd.from(LOG_TABLE).insert({
    user_id: user.id,
    activity_type: activityType,
    activity_name: JSON.stringify({ items: orderItems, total }),
    money_reward: -total,
    xp_reward: 0,
  });
  if (logError) console.error(`Inventario guardado, pero falló el registro de la orden (${activityType}):`, logError);

  return { logSaved: !logError };
}

// ===============================
// MODAL DE RESUMEN DE COMPRA
// ===============================

function openPurchaseSummaryModal() {
  const total = getCartTotal();
  if (total === 0) return;

  const list = document.getElementById("purchase-summary-list");
  list.innerHTML = Object.keys(cart).filter(k => cart[k] > 0).map(key => {
    const item = SHOP_ITEMS_MAP[key];
    const qty = cart[key];
    return `<li><span>${item.label} x${qty}</span><span>₽${(qty * item.price).toLocaleString()}</span></li>`;
  }).join("");

  document.getElementById("purchase-summary-total").textContent = total.toLocaleString();
  document.getElementById("modal-purchase-summary").classList.remove("hidden");
}

function closePurchaseSummaryModal() {
  document.getElementById("modal-purchase-summary").classList.add("hidden");
}

// ===============================
// CONFIRMAR COMPRA
// ===============================

async function confirmPurchase() {
  const total = getCartTotal();
  if (total === 0 || !currentMeta) return;

  const available = getAvailableMoney();
  if (total > available) {
    alert(`Saldo insuficiente. Faltan ₽${(total - available).toLocaleString()}`);
    return;
  }

  const confirmBtn = document.getElementById("btn-purchase-confirm");
  confirmBtn.disabled = true;

  try {
    // Volvemos a consultar justo antes de cobrar: el conteo en memoria puede estar
    // desactualizado si el jugador compró en otra pestaña o dispositivo.
    if (Object.keys(MONTHLY_LIMITS).some(key => cart[key] > 0)) {
      await loadMonthlyPurchases();
      if (getExceededLimitKey()) {
        closePurchaseSummaryModal();
        renderShopGrid();
        renderTicket();
        return;
      }
    }

    const limitedInOrder = Object.keys(MONTHLY_LIMITS).map(key => [key, cart[key] || 0]);
    const result = await saveOrder("purchase", total);
    if (boughtThisMonth !== null) {
      limitedInOrder.forEach(([key, qty]) => { boughtThisMonth[key] = (boughtThisMonth[key] || 0) + qty; });
    }
    closePurchaseSummaryModal();
    clearCart();
    updateCashierBalance();
    if (result.logSaved) {
      updateCashierMessage("¡Gracias por tu compra!");
    } else {
      updateCashierMessage("Compra guardada, pero no quedó en el historial. Avisa a un admin.");
    }
  } catch (e) {
    console.error("Error al confirmar la compra:", e);
    alert("Ocurrió un error al procesar la compra. No se cobró nada. Intenta nuevamente.");
  } finally {
    confirmBtn.disabled = getCartTotal() === 0;
  }
}
