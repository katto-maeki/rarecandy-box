
/* Promptober: the server owns balances, random draws and all reward delivery. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const names = ["El farol", "La hiedra", "La luna", "La niebla", "El roble", "El eco"];
  // Cosmetic only: the server decides the candies, these just put a face on the result.
  const residents = [[607, "Litwick"], [708, "Phantump"], [200, "Misdreavus"], [355, "Duskull"], [710, "Pumpkaboo"], [425, "Drifloon"]];
  const tricksters = [[94, "Gengar"], [93, "Haunter"], [354, "Banette"], [302, "Sableye"], [442, "Spiritomb"], [778, "Mimikyu"]];
  const SPRITES = "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/";
  const pokemonSprite = id => SPRITES + "pokemon/" + id + ".png";
  const candySprite = SPRITES + "items/rare-candy.png";
  const capitalize = text => String(text).charAt(0).toUpperCase() + String(text).slice(1);
  const HIDDEN_FEED_USERS = ["966a8f84-2440-4a40-a334-75d35764743e"];
  // Descripciones de la Tienda misteriosa (botón ⓘ de cada tarjeta), por id del catálogo.
  const SHOP_INFO = {
    starter: "Puedes obtener un Pokémon inicial de cualquier región.",
    rainbowShard: "Objeto que puedes vender a un poke-guía a un alto precio (1000 pokecoins) si resulta ser real. La probabilidad de que sea real es media-baja.",
    shinyTicket: "Si capturas un Pokémon en encounter o safari, puedes usar tu Ticket Shiny para convertirlo en shiny.",
    master: "Te asegura el 100 % de atrapar un Pokémon en las actividades narrativas de captura.",
    pokedoll: "Duplica la recompensa de experiencia o dinero de una actividad (post) a elección del jugador.",
    refresco: "Repone estamina al jugador para hacer un tercer intento de captura de un mismo Pokémon en encounter o safari.",
    fossil: "Puedes obtener un fósil aleatorio de cualquier región.",
    daycarePass: "Te permite acceder a una parte secreta de la guardería, donde hay un Ditto especializado en crianza. Solo puedes obtener un huevo de un Pokémon que ya tengas en tu caja Pokémon.",
    doubleHatch: "Probabilidad de obtener un Pokémon extra al momento de la eclosión (respeta la rareza solicitada).",
    regionVote: "Votos adicionales para elegir región en las encuestas de nuevos bimestres.",
    business: "Cuando registres un lugar en Explora Sorelle y un isleño registre una narrativa en ese lugar, obtienes +50 pokecoins al final del mes por cada registro de isleño. El amuleto Negocio dura un bimestre activo.",
    ghost: "Elige un compañero fantasma de la lista. Llega a tu caja Pokémon en nivel 1, con género y personalidad al azar. Un canje por participante."
  };
  const labels = { pending: "En revisión", approved: "Aprobado", rejected: "Corregir" };
  let state = null, selectedHouse = 1, busy = false, pending = null, storageKey = "", confirmation = null;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeURL = value => {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
  };
  const date = value => new Date(value).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
  function message(text, kind = "") {
    $("event-status").className = "event-status " + kind;
    $("event-status").textContent = text;
    $("event-status").hidden = !text;
  }
  function noticeRetry() {
    message("Hay una operación sin confirmar. Recupera su resultado antes de continuar; no se volverá a cobrar.", "error");
    const button = document.createElement("button");
    button.className = "event-button secondary";
    button.textContent = "Recuperar resultado";
    button.onclick = () => mutate(pending.action, pending.payload, true);
    $("event-status").append(button);
  }
  function tabs(id) {
    document.querySelectorAll("[data-tab]").forEach(button => {
      const active = button.dataset.tab === id;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      $("panel-" + button.dataset.tab).hidden = !active;
    });
  }
  function openDialog(id) {
    if (id === "prompt-dialog" && (!state || busy || pending)) return;
    if ((id === "gift-dialog" || id === "ghost-dialog") && (!state || busy || pending)) return;
    if (id === "prompt-dialog") populatePrompt();
    // Clear errors from a previous attempt on open (more reliable than the async "close" event).
    $(id).querySelector(".dialog-error")?.remove();
    $(id).showModal();
  }
  function showSubmission(s) {
    const rejected = s.status === "rejected";
    $("submission-title").textContent = "Prompt " + s.prompt + " · " + s.format;
    $("submission-status").innerHTML = escape(labels[s.status]) + ' · <a href="' + escape(safeURL(s.url)) + '" target="_blank" rel="noopener noreferrer">Ver publicación ↗</a>';
    $("submission-note").hidden = !rejected || !s.note;
    $("submission-note-text").textContent = s.note || "";
    $("submission-help").hidden = !rejected;
    $("submission-resend").hidden = !rejected;
    $("submission-resend").dataset.prompt = s.prompt;
    openDialog("submission-dialog");
  }
  function populatePrompt(number) {
    const previous = number || Number($("prompt-number").value);
    const available = Array.from({ length: 31 }, (_, i) => i + 1).filter(n =>
      !state.submissions.some(s => s.prompt === n && s.status !== "rejected"));
    $("prompt-number").innerHTML = available.map(n => '<option value="' + n + '">Prompt ' + n + '</option>').join("");
    if (available.includes(previous)) $("prompt-number").value = previous;
    fillSubmission();
  }
  function fillSubmission() {
    const existing = state.submissions.find(s => s.prompt === Number($("prompt-number").value));
    $("prompt-url").value = existing?.url || "";
    $("prompt-format").value = existing?.format || "narrativa";
  }
  const soldOut = item => item.max_per_user != null && (state.player.purchases[item.id] || 0) >= item.max_per_user;
  function controls() {
    const locked = busy || !!pending || !state;
    $("promptober").setAttribute("aria-busy", String(busy));
    $("register-prompt").disabled = locked || state.submissions.filter(s => s.status !== "rejected").length >= 31;
    $("knock-door").disabled = locked || state.player.tokens < 1;
    $("knock-door").textContent = busy ? "Consultando…" : state && state.player.tokens < 1 ? "Necesitas fichas para visitar" : "Llamar a la puerta · 1 ficha";
    document.querySelectorAll('[data-dialog="gift-dialog"]').forEach(b => b.disabled = locked);
    document.querySelectorAll("#prompt-form button, #gift-form button, #code-create-form button, .review-actions button, [data-code-toggle]").forEach(b => b.disabled = locked);
    document.querySelectorAll("[data-buy]").forEach(b => {
      const item = state?.catalog.find(i => i.id === b.dataset.buy);
      b.disabled = locked || !item || state.player.approved < 15 || state.player.tickets < item.price || soldOut(item);
    });
    if ($("open-ghost")) $("open-ghost").disabled = locked || !!state?.player.ghost_id;
    $("claim-ghost").disabled =locked || !!state.player.ghost_id || state.player.candies < 200 || !state.ghosts.length;
    document.querySelectorAll('input[name="ghost"]').forEach(r => r.disabled = locked || !!state?.player.ghost_id);
    $("confirm-purchase").disabled = locked;
    $("refresh-admin").disabled = busy;
  }
  function renderHouses() {
    document.querySelectorAll(".house").forEach((button, i) => {
      button.setAttribute("aria-pressed", String(i + 1 === selectedHouse));
      const visited = state?.player.houses.includes(i + 1);
      button.setAttribute("aria-label", "Casa " + (i + 1) + " · " + names[i] + (visited ? ", ya visitada" : ""));
    });
  }
  function render() {
    const p = state.player;
    ["tokens", "tickets", "candies"].forEach(k => $("balance-" + k).textContent = p[k]);
    $("visit-count").textContent = p.visits;
    $("prompt-count").textContent = p.approved;
    renderHouses();
    const sprite = n => "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/" + n + ".png";
    // Una sola barra: las visitas llenan el 75 % y, al completar las 36, los prompts continúan hasta la tienda.
    const maxVisits = 36, maxPrompts = 15, visitSpan = 75, shopDone = p.approved >= maxPrompts;
    const fill = p.visits >= maxVisits ? visitSpan + Math.min(p.approved / maxPrompts, 1) * (100 - visitSpan) : p.visits / maxVisits * visitSpan;
    $("milestone-list").innerHTML = '<div class="milestone-track"><div class="milestone-bar" role="img" aria-label="' + p.visits + '/' + maxVisits +
      ' visitas, ' + p.approved + '/' + maxPrompts + ' prompts"><span style="width:' + fill + '%"></span>' +
      [[9, "Poké Balls", "poke-ball"], [21, "Super Balls", "great-ball"], [36, "Ultra Balls", "ultra-ball"]].map(([goal, title, img]) =>
        '<div class="milestone-mark ' + (p.visits >= goal ? "complete" : "") + '" style="left:' + goal / maxVisits * visitSpan + '%" title="2 ' + title + ' · ' + goal + ' visitas">' +
        '<img src="' + sprite(img) + '" alt="" width="30" height="30" loading="lazy"><small>2 ' + title + '<br>' + (p.visits >= goal ? "✓ Entregado" : goal + " visitas") + '</small></div>').join("") +
      '<div class="milestone-mark ticket ' + (shopDone ? "complete" : "") + '" style="left:100%" title="Tienda misteriosa · ' + maxPrompts + ' prompts">' +
      '<span aria-hidden="true">🎟️</span><small>Tienda misteriosa<br>' + (shopDone ? "✓ Desbloqueada" : p.approved + "/" + maxPrompts + " prompts") + '</small></div>' +
      '</div><p class="milestone-count">' + p.visits + '/' + maxVisits + ' visitas · ' + p.approved + '/' + maxPrompts + ' prompts</p></div>';
    $("prompt-grid").innerHTML = Array.from({ length: 31 }, (_, i) => {
      const s = state.submissions.find(s => s.prompt === i + 1);
      return '<button class="prompt-day ' + (s?.status || "") + '" data-prompt="' + (i + 1) + '" aria-label="Prompt ' + (i + 1) + ', ' +
        (labels[s?.status] || "Sin registrar") + '">' + (i + 1) + '<small>' + (labels[s?.status] || "Registrar") + '</small></button>';
    }).join("");
    // Cuentas de prueba que tampoco aparecen en la Bitácora de Plaza Sorelle (social.js).
    const feed = (state.feed || []).filter(f => !HIDDEN_FEED_USERS.includes(f.user_id));
    $("prompt-feed").innerHTML = feed.length ? feed.map(f => '<li><span aria-hidden="true">📝</span><div><strong>' + escape(f.trainer_name) +
      '</strong> completó el <strong>prompt ' + f.prompt + '</strong> · ' + escape(f.format) + ' · <a href="' + escape(safeURL(f.url)) +
      '" target="_blank" rel="noopener noreferrer">Ver ↗</a><small>' + escape(date(f.reviewed_at)) + '</small></div></li>').join("") :
      '<li class="prompt-feed-empty">Aún no hay prompts aprobados. ¡El primero puede ser el tuyo!</li>';
    $("shop-lock").textContent = p.approved >= 15 ? "Tienda desbloqueada · Tienes " + p.tickets + " tickets." :
      "Catálogo disponible · Faltan " + (15 - p.approved) + " prompts aprobados para comprar. Tienes " + p.tickets + " tickets.";
    $("shop-catalog").innerHTML = state.catalog.map(i => {
      const count = p.purchases[i.id] || 0;
      return '<article class="event-card shop-item">' + '<button type="button" class="shop-item-info" data-info="' + escape(i.id) + '" title="¿Para qué sirve?" aria-label="Ver para qué sirve ' + escape(i.name) + '"><i class="fa fa-info" aria-hidden="true"></i></button>' + '<img src="' + escape(safeURL(i.image)) + '" alt="" loading="lazy"><h3>' + escape(i.name) +
        '</h3><small>' + i.quantity + ' unidad(es) · ' + (i.max_per_user ? count + '/' + i.max_per_user + ' canjes' : 'Sin límite' + (count ? ' · ' + count + ' canjeados' : '')) + '</small><button class="event-button" data-buy="' + escape(i.id) + '">' +
        (soldOut(i) ? "Límite alcanzado" : i.price + " tickets") + '</button></article>';
    }).join("") + '<article class="event-card shop-item ghost-item">' + '<button type="button" class="shop-item-info" data-info="ghost" title="¿Para qué sirve?" aria-label="Ver para qué sirve ' + escape("Pokémon Fantasma") + '"><i class="fa fa-info" aria-hidden="true"></i></button>' + '<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield/8.png" alt="" loading="lazy">' +
      '<h3>Pokémon Fantasma</h3><small>Elige 1 compañero · ' + (p.ghost_id ? 1 : 0) + '/1 canjes</small><button class="event-button" id="open-ghost">' +
      (p.ghost_id ? "✓ En tu caja" : "200 dulces") + '</button></article>';
    const chosenGhost = p.ghost_id || document.querySelector('input[name="ghost"]:checked')?.value;
    $("ghost-choice").innerHTML = state.ghosts.map((g, i) => {
      const owned = p.ghost_id === g.id;
      return '<label class="ghost-option' + (owned ? " owned" : "") + '"><input type="radio" name="ghost" value="' + escape(g.id) + '"' +
        (g.id === chosenGhost ? " checked" : "") + (p.ghost_id ? " disabled" : "") + (i === 0 ? " required" : "") + '>' +
        '<img src="' + escape(safeURL(g.pokemon.sprite)) + '" alt="" loading="lazy"><strong>' + escape(g.name) + '</strong><small>' +
        escape(g.region) + '</small><span class="ghost-types">' + (g.pokemon.tipos || []).map(t => escape(capitalize(t))).join(" · ") +
        '</span><small>' + (g.pokemon.genderless ? "Sin género" : "♂ / ♀ al azar") + '</small></label>';
    }).join("");
    const owned = state.ghosts.find(g => g.id === p.ghost_id);
    $("ghost-status").textContent = p.ghost_id ? "✓ " + (owned ? owned.name : "Tu Pokémon") + " ya está en tu caja Pokémon." : "Dulces disponibles: " + p.candies + "/200.";
    $("event-history").innerHTML = state.history.length ? state.history.map(h => '<div class="history-row">' + escape(h.description) +
      '<small>' + escape(date(h.created_at)) + '</small></div>').join("") : '<p>Aún no hay movimientos.</p>';
    $("tab-admin").hidden = !state.admin;
    if (state.admin) renderAdmin();
    controls();
  }
  function renderAdmin() {
    $("review-list").innerHTML = state.pending.length ? state.pending.map(s => '<article class="submission-row"><div><strong>' + escape(s.trainer_name) +
      ' · Prompt ' + s.prompt + '</strong><p>' + escape(s.format) + ' · <a target="_blank" rel="noopener noreferrer" href="' + escape(safeURL(s.url)) +
      '">Revisar publicación ↗</a></p></div><div class="review-actions"><input aria-label="Observación para prompt ' + s.prompt +
      '" data-note="' + s.id + '" placeholder="Motivo si rechazas" maxlength="500"><button class="event-button" data-review="' + s.id +
      '" data-decision="approved">Aprobar</button><button class="event-button secondary" data-review="' + s.id +
      '" data-decision="rejected">Rechazar</button></div></article>').join("") : '<p class="event-hint">No hay participaciones pendientes.</p>';
    $("admin-code-list").innerHTML = state.codes.map(c => '<div class="submission-row"><div><strong>' + escape(c.code) + '</strong> <span class="code-type">' +
      (c.single_use ? "Único" : "Público") + '</span><p>Vence: ' + escape(date(c.expires_at)) + ' · ' + (c.enabled ? "Activo" : "Desactivado") + ' · ' +
      (c.single_use ? (c.uses ? "Canjeado por " + escape(c.redeemed_by) : "Sin canjear") : c.uses + (c.uses === 1 ? " canje" : " canjes")) + '</p></div><button class="event-button secondary" data-code-toggle="' +
      escape(c.code) + '" data-enabled="' + !c.enabled + '">' + (c.enabled ? "Desactivar" : "Activar") + '</button></div>').join("");
  }
  async function rpc(name, args = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await window.supabaseClient.rpc(name, args).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timer); }
  }
  async function load(announce = true) {
    try {
      state = await rpc("promptober_state");
      render();
      if (announce) message("");
      if (pending) noticeRetry();
      return true;
    } catch (error) {
      state = null;
      controls();
      const missing = ["PGRST202", "42883", "42P01"].includes(error.code);
      message(missing ? "El evento aún no está disponible. ¡Vuelve pronto!" : "No pudimos cargar tu progreso. Revisa la conexión e inténtalo de nuevo.", "error");
      const button = document.createElement("button");
      button.className = "event-button secondary"; button.textContent = "Reintentar"; button.onclick = () => load();
      $("event-status").append(button);
      console.error("Promptober:", error);
      return false;
    }
  }
  async function mutate(action, payload, retry = false) {
    if (busy || (pending && !retry)) return;
    busy = true;
    try {
      if (!retry) {
        const request = { action, payload, id: crypto.randomUUID() };
        // Persist BEFORE sending: even a lost response/reload cannot reroll a visit.
        sessionStorage.setItem(storageKey, JSON.stringify(request));
        pending = request;
      }
      controls();
      message("Guardando tu operación…");
      const result = await rpc("promptober_action", { p_action: pending.action, p_payload: pending.payload, p_request_id: pending.id });
      sessionStorage.removeItem(storageKey);
      pending = null;
      document.querySelectorAll(".event-dialog[open]").forEach(d => d.close());
      const refreshed = await load(false);
      if (refreshed) message(result.message, "success");
      if (action === "visit") showEncounter(result.reward);
    } catch (error) {
      // SQL/PostgREST rejections are definitive. Transport failures are uncertain.
      if (error.code && (/^[0-9A-Z]{5}$/.test(error.code) || error.code.startsWith("PGRST"))) {
        sessionStorage.removeItem(storageKey); pending = null;
        await load(false);
        message(error.message || "No se pudo completar la operación.", "error");
        const dialog = document.querySelector(".event-dialog[open]");
        if (dialog) {
          let inline = dialog.querySelector(".dialog-error");
          if (!inline) { inline = document.createElement("p"); inline.className = "dialog-error event-status error"; inline.setAttribute("role", "alert"); dialog.append(inline); }
          inline.textContent = error.message;
        }
      } else if (pending) {
        noticeRetry();
        document.querySelectorAll(".event-dialog[open]").forEach(d => d.close());
      } else message("El navegador no pudo guardar la solicitud. Permite el almacenamiento de sesión para continuar.", "error");
      console.error("Promptober:", error);
    } finally { busy = false; $("encounter-art").classList.remove("knocking"); controls(); }
  }
  // Susto del "Truco": sonido sintetizado (sin archivos) y el Pokémon a pantalla completa.
  let audioCtx = null;
  function primeAudio() {
    // Se crea dentro del clic en la puerta: los navegadores solo permiten audio tras un gesto del usuario.
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch { audioCtx = null; }
  }
  function playScare() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime, out = audioCtx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    out.connect(audioCtx.destination);
    // Acorde disonante que se desploma.
    [220, 233, 311].forEach(f => {
      const o = audioCtx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(f / 2, t + 1.1);
      o.connect(out); o.start(t); o.stop(t + 1.2);
    });
    // Golpe de ruido al inicio.
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioCtx.createBufferSource(), noiseGain = audioCtx.createGain();
    noise.buffer = buffer; noiseGain.gain.value = 0.25;
    noise.connect(noiseGain).connect(audioCtx.destination); noise.start(t);
  }
  function showScare(id) {
    const overlay = document.createElement("div");
    overlay.className = "scare-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<img src="' + pokemonSprite(id) + '" alt=""><strong>¡Truco!</strong>';
    const close = () => overlay.remove();
    overlay.onclick = close;
    document.body.append(overlay);
    setTimeout(close, 1800);
  }
  function showEncounter(reward) {
    const amount = reward.candies;
    const art = $("encounter-art");
    let text;
    if (amount === 0) {
      const [id, name] = tricksters[Math.floor(Math.random() * tricksters.length)];
      art.className = "encounter-art trick";
      art.innerHTML = '<img class="encounter-pokemon" src="' + pokemonSprite(id) + '" alt="">';
      text = "¡Un " + name + " salió de la puerta! ¡Truco!";
      playScare(); showScare(id);
    } else {
      const [id, name] = residents[(reward.house || selectedHouse) - 1];
      art.className = "encounter-art treat" + (amount === 10 ? " jackpot" : "");
      art.innerHTML = '<img class="encounter-pokemon" src="' + pokemonSprite(id) + '" alt=""><span class="candy-row">' +
        Array.from({ length: amount }, (_, i) => '<img src="' + candySprite + '" alt="" style="--i:' + i + '">').join("") + '</span>';
      text = amount === 10 ? "¡" + name + " vació su cesta para ti: 10 dulces!" : name + " te abre la puerta: +" + amount + (amount === 1 ? " dulce." : " dulces.");
    }
    if (reward.milestone) text += " ¡Hito alcanzado: 2 Balls en tu inventario!";
    $("encounter-text").textContent = text;
  }
  function confirmPurchase(text, action, payload) {
    if (busy || pending || !state) return;
    confirmation = { action, payload };
    $("confirm-description").textContent = text;
    $("confirm-dialog").querySelector(".dialog-error")?.remove();
    $("confirm-dialog").showModal();
  }
  function bind() {
    document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => tabs(b.dataset.tab));
    document.querySelector(".event-tabs").addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const buttons = [...document.querySelectorAll("[data-tab]")].filter(b => !b.hidden);
      const i = buttons.indexOf(document.activeElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      e.preventDefault(); buttons[next].focus(); tabs(buttons[next].dataset.tab);
    });
    document.querySelectorAll("[data-dialog]").forEach(b => b.onclick = () => openDialog(b.dataset.dialog));
    document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
    $("knock-door").onclick = () => {
      if (busy || pending || !state) return;
      primeAudio();
      $("encounter-art").className = "encounter-art knocking";
      $("encounter-art").innerHTML = '<span class="door-art"></span>';
      $("encounter-text").textContent = "Toc, toc… ¡Truco o trato!";
      mutate("visit", { house: selectedHouse });
    };
    $("prompt-number").onchange = fillSubmission;
    $("submission-resend").onclick = () => {
      $("submission-dialog").close();
      openDialog("prompt-dialog"); populatePrompt(Number($("submission-resend").dataset.prompt));
    };
    $("prompt-form").onsubmit = e => {
      e.preventDefault();
      const url = safeURL($("prompt-url").value.trim());
      if (!url) { $("prompt-url").setCustomValidity("Usa un enlace http o https válido."); $("prompt-url").reportValidity(); return; }
      mutate("submit", { prompt: Number($("prompt-number").value), format: $("prompt-format").value, url });
    };
    $("prompt-url").oninput = () => $("prompt-url").setCustomValidity("");
    $("gift-form").onsubmit = e => { e.preventDefault(); mutate("gift", { code: $("gift-code").value.trim().toUpperCase() }); };
    $("ghost-form").onsubmit = e => {
      e.preventDefault();
      const choice = document.querySelector('input[name="ghost"]:checked')?.value;
      const ghost = state.ghosts.find(g => g.id === choice);
      if (!ghost) { message("Elige primero a tu compañero fantasma.", "error"); return; }
      confirmPurchase("Estás a punto de usar tus 200 dulces en: " + ghost.name + ". ¿Estás de acuerdo? Llegará a tu caja Pokémon en nivel 1, con " +
        (ghost.pokemon.genderless ? "personalidad" : "género y personalidad") + " al azar. Solo puedes elegir un Pokémon durante el evento.", "ghost", { id: ghost.id });
    };
    $("confirm-purchase").onclick = () => { if (confirmation) mutate(confirmation.action, confirmation.payload); };
    $("code-create-form").onsubmit = e => {
      e.preventDefault();
      mutate("create_code", { code: $("new-code").value.trim().toUpperCase(), expires_at: new Date($("code-expiry").value).toISOString(), single_use: $("code-type").value === "single" });
    };
    $("refresh-admin").onclick = () => load();
    $("promptober").addEventListener("click", e => {
      const day = e.target.closest("[data-prompt]");
      if (day && state && !busy && !pending) {
        const n = Number(day.dataset.prompt), s = state.submissions.find(s => s.prompt === n);
        if (s) { showSubmission(s); return; }
        openDialog("prompt-dialog"); populatePrompt(n);
      }
      const infoButton = e.target.closest("[data-info]");
      if (infoButton) {
        const card = infoButton.closest(".shop-item");
        $("item-info-title").textContent = card.querySelector("h3").textContent;
        $("item-info-image").src = card.querySelector("img").src;
        $("item-info-image").classList.toggle("wide", infoButton.dataset.info === "ghost");
        $("item-info-text").textContent = SHOP_INFO[infoButton.dataset.info] || "Pronto tendremos más detalles de este objeto.";
        $("item-info-dialog").showModal();
        return;
      }
      if (e.target.closest("#open-ghost:not(:disabled)")) openDialog("ghost-dialog");
      const buy = e.target.closest("[data-buy]");
      if (buy && !buy.disabled) {
        const item = state.catalog.find(i => i.id === buy.dataset.buy);
        confirmPurchase("¿Canjear " + item.price + " tickets por " + item.quantity + " × " + item.name + "? " + (item.category === "notes" ? "Se anotará en las notas de tu inventario." : item.category === "fossil" ? "Recibirás un fósil al azar en tu inventario." : "Se añadirá a tu inventario."), "buy", { id: item.id });
      }
      const review = e.target.closest("[data-review]");
      if (review && !review.disabled) {
        const s = state.pending.find(s => s.id === review.dataset.review);
        const note = document.querySelector('[data-note="' + s.id + '"]').value.trim();
        if (review.dataset.decision === "rejected" && !note) { message("Indica el motivo del rechazo para que el participante pueda corregirlo.", "error"); return; }
        mutate("review", { id: s.id, revision: s.revision, decision: review.dataset.decision, note });
      }
      const code = e.target.closest("[data-code-toggle]");
      if (code && !code.disabled) mutate("toggle_code", { code: code.dataset.codeToggle, enabled: code.dataset.enabled === "true" });
    });
  }
  function buildMap() {
    names.forEach((name, i) => {
      const button = document.createElement("button");
      button.className = "house";
      button.innerHTML = '<svg viewBox="0 0 110 100" aria-hidden="true"><path d="M18 46V91H92V46L55 16Z" fill="#efe2ff" stroke="currentColor" stroke-width="3"/><path d="M8 46L55 5L102 46L97 52L55 17L13 52Z" fill="#dac5ef" stroke="currentColor" stroke-width="3"/><rect x="33" y="61" width="19" height="30" rx="3" fill="#b39acb" stroke="currentColor" stroke-width="2"/><circle cx="46" cy="78" r="2" fill="currentColor"/><rect x="64" y="58" width="17" height="18" fill="#f5ffd7" stroke="currentColor" stroke-width="2"/><path d="M72 58V76M64 67H81" stroke="currentColor" stroke-width="2"/><circle cx="55" cy="39" r="8" fill="#faf3ff" stroke="currentColor" stroke-width="2"/><path d="M55 31V47M47 39H63" stroke="currentColor" stroke-width="2"/></svg><span class="house-label">Casa ' + (i + 1) + '</span>';
      button.onclick = () => {
        if (busy || pending) return;
        selectedHouse = i + 1; renderHouses();
        $("house-title").textContent = "Casa " + selectedHouse + " · " + name;
        $("encounter-art").className = "encounter-art";
        $("encounter-art").innerHTML = '<span class="door-art"></span>';
        $("encounter-text").textContent = "¿Quién estará detrás de la puerta?";
      };
      $("village-map").append(button);
    });
    renderHouses();
  }
  document.addEventListener("DOMContentLoaded", async () => {
    buildMap(); bind();
    const user = await initProtectedPage();
    if (!user) return;
    storageKey = "promptober-2026-pending-" + user.id;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved?.id && saved?.action && saved?.payload) pending = saved;
    } catch { /* No request was sent if session storage was unavailable. */ }
    $("btn-menu").onclick = () => $("side-menu").classList.remove("hidden");
    $("btn-close-menu").onclick = () => $("side-menu").classList.add("hidden");
    $("side-menu").onclick = e => { if (e.target === $("side-menu")) $("side-menu").classList.add("hidden"); };
    if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
    await Promise.all([renderTrainerLabelFromGame(), load()]);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !busy && !document.querySelector(".event-dialog[open]")) load();
    });
  });
})();


/* Música de fondo de Eventos (Lavender Town, Pokémon Dreams: Blue Version de Brickmason).
   Los navegadores bloquean el audio hasta que el usuario interactúa, así que empieza apagada;
   si el usuario la dejó encendida, se reanuda con su primer clic o tecla en la página. */
(() => {
  "use strict";
  const KEY = "promptober-music";
  const button = document.getElementById("music-toggle"), audio = document.getElementById("event-music");
  if (!button || !audio) return;
  audio.volume = 0.35;
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = value => { try { localStorage.setItem(KEY, value); } catch { /* Solo se pierde la preferencia. */ } };
  const paint = on => {
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Silenciar música de fondo" : "Activar música de fondo");
    button.querySelector("i").className = "fa " + (on ? "fa-volume-up" : "fa-volume-off");
    button.classList.toggle("on", on);
  };
  // El icono cambia al instante; mientras el archivo carga, el botón late suavemente.
  const play = () => {
    paint(true); button.classList.add("loading");
    audio.play().catch(() => paint(false)).finally(() => button.classList.remove("loading"));
  };
  button.onclick = () => {
    if (audio.paused) { save("on"); play(); }
    else { save("off"); audio.pause(); paint(false); }
  };
  paint(false);
  if (read() === "on") {
    const resume = e => {
      if (e.target.closest && e.target.closest("#music-toggle")) return;
      if (audio.paused) play();
    };
    document.addEventListener("pointerdown", resume, { once: true, capture: true });
    document.addEventListener("keydown", resume, { once: true, capture: true });
  }
})();
