// notifications.js - Buzón de notificaciones de intercambio, compartido en todas las páginas
// ================================================================================================
(function () {
  const GAME_TABLE = "user_game_data";
  const TRAINER_TABLE = "trainer_inventory";
  const LOG_TABLE = "trainer_log";
  const TRADE_TABLE = "trainer_trades";
  const GACHA_PROGRESS_TABLE = "gacha_event_progress";
  const FICHA_TO_POKECOIN_RATE = 10; // 1 ticket de cartas repetidas = 10 pokecoins

  let activeNotificationsList = []; // Lista maestra de la bandeja de entrada
  let activeReceivedTradeRow = null;

  function $(id) { return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!$("btn-noti-bell") || !$("modal-notification-inbox")) return; // Página sin buzón integrado

    if (!window.supabaseClient) return;
    if (!window.currentUserId) {
      const { data } = await window.supabaseClient.auth.getUser();
      window.currentUserId = data?.user?.id || null;
    }
    if (!window.currentUserId) return;

    await checkAllNotifications();
  });

  // ==========================================
  // FUNCIONES HELPER DE REESCRITURA RPG
  // ==========================================
  function extractPokemonFromTrainer(gameRow, targetTemplate) {
    if (Array.isArray(gameRow.party_data)) {
      for (let i = 0; i < gameRow.party_data.length; i++) {
        let p = gameRow.party_data[i];
        if (p && p.id === targetTemplate.id && p.nombre === targetTemplate.nombre && p.nivel === targetTemplate.nivel && p.personalidad === targetTemplate.personalidad) {
          let extracted = { ...p, forTrade: false };
          gameRow.party_data[i] = null;
          return extracted;
        }
      }
    }
    if (gameRow.box_data?.boxes) {
      for (let b = 0; b < gameRow.box_data.boxes.length; b++) {
        let box = gameRow.box_data.boxes[b];
        if (Array.isArray(box)) {
          for (let s = 0; s < box.length; s++) {
            let p = box[s];
            if (p && p.id === targetTemplate.id && p.nombre === targetTemplate.nombre && p.nivel === targetTemplate.nivel && p.personalidad === targetTemplate.personalidad) {
              let extracted = { ...p, forTrade: false };
              box[s] = null;
              return extracted;
            }
          }
        }
      }
    }
    return null;
  }

  function injectPokemonIntoFirstEmptySlot(gameRow, pkmToInject) {
    if (gameRow.box_data?.boxes) {
      for (let b = 0; b < gameRow.box_data.boxes.length; b++) {
        let box = gameRow.box_data.boxes[b];
        if (Array.isArray(box)) {
          let emptyIdx = box.findIndex(slot => slot === null);
          if (emptyIdx !== -1) {
            box[emptyIdx] = pkmToInject;
            return true;
          }
        }
      }
    }
    return false;
  }

  // ==========================================
  // MONITOR DE NOTIFICACIONES: BUZÓN INTEGRADO
  // ==========================================
  async function checkAllNotifications() {
    const supabase = window.supabaseClient;
    const myId = window.currentUserId;

    try {
      activeNotificationsList = [];

      const { data: incoming } = await supabase.from(TRADE_TABLE).select("*").eq("receiver_id", myId).eq("status", "pending");
      if (incoming) {
        incoming.forEach(trade => {
          activeNotificationsList.push({ type: "incoming_proposal", data: trade });
        });
      }

      const { data: resolved } = await supabase.from(TRADE_TABLE).select("*").eq("sender_id", myId).in("status", ["accepted", "declined"]);
      if (resolved) {
        resolved.forEach(trade => {
          activeNotificationsList.push({ type: "resolved_status", data: trade });
        });
      }

      const { data: gachaProgress } = await supabase.from(GACHA_PROGRESS_TABLE).select("fichas").eq("user_id", myId).maybeSingle();
      if (gachaProgress && gachaProgress.fichas > 0) {
        activeNotificationsList.push({
          type: "ficha_conversion",
          data: { fichas: gachaProgress.fichas, pokecoins: gachaProgress.fichas * FICHA_TO_POKECOIN_RATE }
        });
      }

      if (activeNotificationsList.length > 0) {
        $("noti-count").textContent = activeNotificationsList.length;
        $("btn-noti-bell").classList.remove("hidden");
        $("btn-noti-bell").onclick = openNotificationInboxModal;
      } else {
        $("btn-noti-bell").classList.add("hidden");
      }

    } catch (err) { console.error("Error cargando buzón de alertas:", err); }
  }

  // ==========================================
  // COMPONENTE: RENDERIZAR LA LISTA DEL INBOX
  // ==========================================
  async function openNotificationInboxModal() {
    const supabase = window.supabaseClient;
    const container = $("inbox-list-container");
    container.innerHTML = "";

    const { data: allUsers } = await supabase.from(GAME_TABLE).select("id, trainer_name");
    let nameMap = {};
    if (allUsers) allUsers.forEach(u => nameMap[u.id] = u.trainer_name);

    activeNotificationsList.forEach((item) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; gap:10px; background:#f7fafc; border:1px solid #e2e8f0; padding:10px; border-radius:8px; cursor:pointer; transition:all 0.15s;";

      row.onmouseover = () => { row.style.borderColor = "#c957b0"; row.style.background = "#fffaf0"; };
      row.onmouseout = () => { row.style.borderColor = "#e2e8f0"; row.style.background = "#f7fafc"; };

      if (item.type === "incoming_proposal") {
        const senderName = nameMap[item.data.sender_id] || "Entrenador";
        row.innerHTML = `<span style="color:#2b6cb0; font-size:1.1rem;"><i class="fa fa-dot-circle-o"></i></span>
                         <div style="flex:1; font-size:0.78rem; color:#2d3748;">Propuesta entrante de <strong>${senderName}</strong></div>`;
        row.onclick = () => {
          $("modal-notification-inbox").classList.add("hidden");
          activeReceivedTradeRow = item.data;
          openViewProposalModal();
        };
      } else if (item.type === "resolved_status") {
        const receiverName = nameMap[item.data.receiver_id] || "Entrenador";
        const iconColor = item.data.status === "declined" ? "#e53e3e" : "#48bb78";
        const iconType = item.data.status === "declined" ? "fa-times-circle" : "fa-check-circle";

        row.innerHTML = `<span style="color:${iconColor}; font-size:1.1rem;"><i class="fa ${iconType}"></i></span>
                         <div style="flex:1; font-size:0.78rem; color:#2d3748;">Respuesta de <strong>${receiverName}</strong> sobre tu oferta</div>`;
        row.onclick = () => {
          $("modal-notification-inbox").classList.add("hidden");
          openResolvedStatusModal(item.data, nameMap[item.data.receiver_id]);
        };
      } else if (item.type === "ficha_conversion") {
        row.innerHTML = `<span style="color:#f3ca3b; font-size:1.1rem;"><i class="fa fa-ticket"></i></span>
                         <div style="flex:1; font-size:0.78rem; color:#2d3748;">Tus tickets del evento Gachapón se transformaron en pokecoins</div>`;
        row.onclick = () => {
          $("modal-notification-inbox").classList.add("hidden");
          openFichaConversionModal(item.data);
        };
      }

      container.appendChild(row);
    });

    $("modal-notification-inbox").classList.remove("hidden");
  }

  // ==========================================
  // COMPONENTE: MODAL DE REVISIÓN ENTRANTE
  // ==========================================
  async function openViewProposalModal() {
    if (!activeReceivedTradeRow) return;

    const row = activeReceivedTradeRow;
    const supabase = window.supabaseClient;

    const { data: senderGame } = await supabase.from(GAME_TABLE).select("trainer_name").eq("id", row.sender_id).maybeSingle();
    const senderName = senderGame?.trainer_name || "Un Entrenador";

    $("view-proposal-headline").innerHTML = `<strong>${senderName}</strong> te propone el siguiente intercambio:`;

    const pA = row.sender_pokemon;
    $("view-card-sender").innerHTML = `
      <span style="color:#38a169; font-weight:800; font-size:0.75rem;">TE OFRECE:</span><br>
      <img src="${pA.sprite}" style="height:60px;"/><br>
      <strong>${pA.nombre}</strong> (Lv.${pA.nivel})<br>${pA.isShiny ? '✨ SHINY':''}
    `;

    const pB = row.receiver_pokemon;
    $("view-card-receiver").innerHTML = `
      <span style="color:#2b6cb0; font-weight:800; font-size:0.75rem;">A CAMBIO DE TU:</span><br>
      <img src="${pB.sprite}" style="height:60px;"/><br>
      <strong>${pB.nombre}</strong> (Lv.${pB.nivel})<br>${pB.isShiny ? '✨ SHINY':''}
    `;

    $("btn-proposal-close").onclick = () => {
      $("modal-view-proposal").classList.add("hidden");
      $("modal-notification-inbox").classList.remove("hidden");
    };

    $("btn-proposal-decline").onclick = () => processTradeResolution("declined");
    $("btn-proposal-accept").onclick = () => processTradeResolution("accepted");

    $("modal-view-proposal").classList.remove("hidden");
  }

  // ==========================================
  // RECLAMACIÓN Y CONSUMO CON ERROR CHECK (USUARIO A)
  // ==========================================
  function openResolvedStatusModal(trade, rawReceiverName) {
    const supabase = window.supabaseClient;
    const myId = window.currentUserId;
    const receiverName = rawReceiverName || "un entrenador";
    if ($("noti-status-title")) $("noti-status-title").innerHTML = `<i class="fa fa-bullhorn"></i> Alerta de Intercambio`;

    if (trade.status === "declined") {
      $("noti-status-message").innerHTML = `Tu propuesta enviada a <strong>${receiverName}</strong> (<span style="color:#c957b0;">${trade.sender_pokemon.nombre}</span> por <span style="color:#2b6cb0;">${trade.receiver_pokemon.nombre}</span>) fue <strong>rechazada</strong>.`;

      $("btn-noti-status-close").onclick = async () => {
        $("modal-noti-status").classList.add("hidden");
        await supabase.from(TRADE_TABLE).update({ status: "archived_declined" }).eq("id", trade.id);

        await supabase.from(LOG_TABLE).insert({
          user_id: myId,
          activity_type: "trade",
          activity_name: `Recibió un rechazo de intercambio por parte de ${receiverName} (${trade.sender_pokemon.nombre} por ${trade.receiver_pokemon.nombre})`,
          money_reward: 0,
          xp_reward: 0
        });
        location.reload();
      };
    } else if (trade.status === "accepted") {
      const pkmA = trade.sender_pokemon;
      const pkmB = trade.receiver_pokemon;

      $("noti-status-message").innerHTML = `¡Felicidades! Tu propuesta enviada a <strong>${receiverName}</strong> fue <strong>aceptada</strong>.<br>Al pulsar Entendido, se consumirá <span style="color:#c957b0;">1x Ticket de Intercambio</span> para transferir a <span style="color:#2b6cb0;">${pkmB.nombre}</span> a tu caja y retirar a ${pkmA.nombre}.`;

      $("btn-noti-status-close").onclick = async () => {
        $("btn-noti-status-close").disabled = true;
        $("btn-noti-status-close").textContent = "Transfiriendo...";

        try {
          const { data: invA } = await supabase.from(TRAINER_TABLE).select("inventory").eq("user_id", myId).maybeSingle();
          const myMetaA = invA?.inventory || {};
          myMetaA.items = myMetaA.items || {};
          if ((myMetaA.items.tradeToken || 0) <= 0) {
            throw new Error("No cuentas con tickets de intercambio para reclamar este Pokémon.");
          }

          const { data: gameA } = await supabase.from(GAME_TABLE).select("*").eq("id", myId).maybeSingle();
          if (!gameA) throw new Error("No se encontraron tus casilleros de juego.");

          myMetaA.items.tradeToken -= 1;

          extractPokemonFromTrainer(gameA, pkmA);
          const secureA = injectPokemonIntoFirstEmptySlot(gameA, { ...pkmB, forTrade: false });
          if (!secureA) throw new Error("Tus cajas están totalmente llenas. Libera espacio para recibir el Pokémon.");

          const { error: errorGame } = await supabase.from(GAME_TABLE).upsert({ id: myId, box_data: gameA.box_data, party_data: gameA.party_data });
          if (errorGame) throw errorGame;

          const { error: errorInv } = await supabase.from(TRAINER_TABLE).upsert(
            { user_id: myId, inventory: myMetaA, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
          if (errorInv) throw errorInv;

          await supabase.from(TRADE_TABLE).update({ status: "archived_accepted" }).eq("id", trade.id);

          await supabase.from(LOG_TABLE).insert([
            { user_id: myId, activity_type: "trade", activity_name: `Intercambió exitosamente a ${pkmA.nombre} por el ${pkmB.nombre} de ${receiverName}`, money_reward: 0, xp_reward: 0 },
            { user_id: myId, activity_type: "consume", activity_name: "1x Ticket de Intercambio (Aprobado)", money_reward: 0, xp_reward: 0 }
          ]);

          $("modal-noti-status").classList.add("hidden");
          location.reload();

        } catch (err) {
          alert("Fallo al reclamar la pieza: " + err.message);
          $("btn-noti-status-close").disabled = false;
          $("btn-noti-status-close").textContent = "Entendido";
        }
      };
    }

    $("modal-noti-status").classList.remove("hidden");
  }

  // ==========================================
  // CIERRE DE EVENTO: CONVERSIÓN DE TICKETS A POKECOINS
  // ==========================================
  function openFichaConversionModal(info) {
    const supabase = window.supabaseClient;
    const myId = window.currentUserId;

    if ($("noti-status-title")) $("noti-status-title").innerHTML = `<i class="fa fa-ticket"></i> Cierre de Evento`;
    $("noti-status-message").innerHTML = `El evento Gachapón ha finalizado. Tus <strong>${info.fichas}</strong> ticket(s) de cartas repetidas se transformaron en <strong style="color:#0fb86b;">₽${info.pokecoins}</strong> pokecoins.`;

    $("btn-noti-status-close").onclick = async () => {
      $("btn-noti-status-close").disabled = true;
      $("btn-noti-status-close").textContent = "Reclamando...";

      try {
        const { data: freshProgress } = await supabase.from(GACHA_PROGRESS_TABLE).select("fichas").eq("user_id", myId).maybeSingle();
        const fichas = freshProgress?.fichas || 0;
        if (fichas <= 0) {
          $("modal-noti-status").classList.add("hidden");
          return;
        }
        const pokecoins = fichas * FICHA_TO_POKECOIN_RATE;

        const { data: invRow } = await supabase.from(TRAINER_TABLE).select("inventory").eq("user_id", myId).maybeSingle();
        const meta = invRow?.inventory || {};
        meta.economy = meta.economy || { biIncome: 0, savings: 0, spent: 0 };
        meta.economy.biIncome = (Number(meta.economy.biIncome) || 0) + pokecoins;

        const { error: invErr } = await supabase.from(TRAINER_TABLE).upsert(
          { user_id: myId, inventory: meta, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
        if (invErr) throw invErr;

        const { error: progressErr } = await supabase.from(GACHA_PROGRESS_TABLE).update({ fichas: 0 }).eq("user_id", myId);
        if (progressErr) throw progressErr;

        await supabase.from(LOG_TABLE).insert({
          user_id: myId,
          activity_type: "gacha_close",
          activity_name: `Cierre del evento Gachapón: ${fichas} ticket(s) de cartas repetidas transformados en pokecoins`,
          money_reward: pokecoins,
          xp_reward: 0
        });

        $("modal-noti-status").classList.add("hidden");
        location.reload();

      } catch (err) {
        alert("Fallo al reclamar tus pokecoins: " + err.message);
        $("btn-noti-status-close").disabled = false;
        $("btn-noti-status-close").textContent = "Entendido";
      }
    };

    $("modal-noti-status").classList.remove("hidden");
  }

  // ==========================================
  // MOTOR CRÍTICO CON ERROR CHECK (USUARIO B)
  // ==========================================
  async function processTradeResolution(resolutionType) {
    if (!activeReceivedTradeRow) return;

    const supabase = window.supabaseClient;
    const tradeId = activeReceivedTradeRow.id;

    if (resolutionType === "declined") {
      if (!confirm("¿Deseas rechazar esta propuesta de intercambio?")) return;
      try {
        await supabase.from(TRADE_TABLE).update({ status: "declined" }).eq("id", tradeId);

        const sId = activeReceivedTradeRow.sender_id;
        const rId = activeReceivedTradeRow.receiver_id;
        const pkmA = activeReceivedTradeRow.sender_pokemon;
        const pkmB = activeReceivedTradeRow.receiver_pokemon;

        const { data: gameA } = await supabase.from(GAME_TABLE).select("trainer_name").eq("id", sId).maybeSingle();
        const senderName = gameA?.trainer_name || "un entrenador";

        await supabase.from(LOG_TABLE).insert({
          user_id: rId,
          activity_type: "trade",
          activity_name: `Rechazó la propuesta de intercambio de ${senderName} (${pkmA.nombre} por su ${pkmB.nombre})`,
          money_reward: 0,
          xp_reward: 0
        });

        alert("Propuesta rechazada correctamente.");
        location.reload();
      } catch (err) { console.error(err); }
      return;
    }

    if (!confirm("¿Estás listo para realizar el intercambio? El pokémon se añadirá a tu caja.")) return;

    $("btn-proposal-accept").disabled = true;
    $("btn-proposal-accept").textContent = "Transfiriendo...";

    try {
      const sId = activeReceivedTradeRow.sender_id;
      const rId = activeReceivedTradeRow.receiver_id;
      const pkmA = activeReceivedTradeRow.sender_pokemon;
      const pkmB = activeReceivedTradeRow.receiver_pokemon;

      const { data: invB } = await supabase.from(TRAINER_TABLE).select("inventory").eq("user_id", rId).maybeSingle();
      const myMetaB = invB?.inventory || {};
      myMetaB.items = myMetaB.items || {};
      if ((myMetaB.items.tradeToken || 0) <= 0) {
        throw new Error("No cuentas con tickets de intercambio para completar esta acción.");
      }

      const { data: gameB } = await supabase.from(GAME_TABLE).select("*").eq("id", rId).maybeSingle();
      if (!gameB) throw new Error("No se pudieron verificar tus casilleros de entrenador.");

      myMetaB.items.tradeToken -= 1;

      const exactPkmFromB = extractPokemonFromTrainer(gameB, pkmB);
      if (!exactPkmFromB) throw new Error(`Ya no tienes a ${pkmB.nombre} disponible en tu caja.`);

      const secureB = injectPokemonIntoFirstEmptySlot(gameB, { ...pkmA, forTrade: false });
      if (!secureB) throw new Error("Fallo de espacio: Tus cajas están totalmente llenas.");

      const { error: errorGame = null } = await supabase.from(GAME_TABLE).upsert({ id: rId, box_data: gameB.box_data, party_data: gameB.party_data });
      if (errorGame) throw errorGame;

      const { error: errorInv } = await supabase.from(TRAINER_TABLE).upsert(
        { user_id: rId, inventory: myMetaB, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (errorInv) throw errorInv;

      await supabase.from(TRADE_TABLE).update({ status: "accepted" }).eq("id", tradeId);

      const { data: gameA } = await supabase.from(GAME_TABLE).select("trainer_name").eq("id", sId).maybeSingle();
      const senderName = gameA?.trainer_name || "un entrenador";

      await supabase.from(LOG_TABLE).insert([
        { user_id: rId, activity_type: "trade", activity_name: `Intercambió exitosamente a ${pkmB.nombre} por el ${pkmA.nombre} de ${senderName}`, money_reward: 0, xp_reward: 0 },
        { user_id: rId, activity_type: "consume", activity_name: "1x Ticket de Intercambio (Aprobado)", money_reward: 0, xp_reward: 0 }
      ]);

      $("modal-view-proposal").classList.add("hidden");
      alert(`¡Felicidades! ${pkmA.nombre} ahora es parte de tu equipo.\nNo olvides acordar con tu compañero tu escrito de intercambio y registrarlo en la publicación correspondiente.`);
      location.reload();

    } catch (err) {
      alert("Fallo crítico en el enroque: " + err.message);
      $("btn-proposal-accept").disabled = false;
      $("btn-proposal-accept").textContent = "Aceptar Intercambio";
    }
  }
})();
