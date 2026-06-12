// actividades.js - Gestión de Log de Entrenador y Menú Hamburguesa

const LOG_TABLE = "trainer_log";
const TRAINER_TABLE = "trainer_inventory";

const REWARDS_CONFIG = {
    encounter:     { individual: [100, 80], pareja: [150, 100], grupal: [200, 120] },
    exploration:   { individual: [150, 80], pareja: [200, 100], grupal: [250, 120] },
    coloring:      { individual: [80, 50] },
    egg_challenge: { individual: [0, 150] },
    quest:         { individual: [120, 100], pareja: [170, 120], grupal: [220, 140] },
    pokedex_comu:  { individual: [100, 80] },
    pokedex_legen: { individual: [100, 80] },
    pokewords:     { individual: [100, 100], pareja: [150, 120], grupal: [200, 140] },
    freemode:      { individual: [100, 80], pareja: [150, 100], grupal: [200, 120] },
    passport:      { individual: [80, 80], pareja: [130, 100], grupal: [180, 120] },
    evolution_narrative: { individual: [100, 0] },
    trade_narrative:     { pareja: [100, 0] }, // <-- Cambiado aquí para diferenciar de la web
    checkpoint:    { individual: [100, 0] }
};

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");
    const btnLogoutSide = document.getElementById("btn-logout-side");

    if (btnMenu && sideMenu) {
        btnMenu.onclick = () => sideMenu.classList.remove("hidden");
        if (btnClose) btnClose.onclick = () => sideMenu.classList.add("hidden");
        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) sideMenu.classList.add("hidden");
        };
    }

    if (btnLogoutSide) {
        btnLogoutSide.onclick = (e) => {
            e.preventDefault();
            window.supabaseClient.auth.signOut().then(() => {
                window.location.href = "index.html";
            });
        };
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const user = await initProtectedPage();
    if (!user) return;
    
    await renderTrainerLabelFromGame();
    
    // Inicializar Menú
    initHamburgerMenu();
    
    // Cargar historial
    loadActivityLog();

    const selectAct = document.getElementById("select-activity");
    const selectPart = document.getElementById("select-participation");
    const qtyRow = document.getElementById("encounter-qty-row");

    if (selectAct) {
        selectAct.addEventListener("change", () => {
            const val = selectAct.value;
            const customRow = document.getElementById("custom-rewards-row");
            
            customRow.classList.add("hidden");
            qtyRow.classList.add("hidden");
            selectPart.disabled = false;

            if (val === "encounter" || val === "coloring") {
                qtyRow.classList.remove("hidden");
            } 
            
            if (val === "otros_manual") {
                customRow.classList.remove("hidden");
            } else if (["pokedex_comu", "pokedex_legen", "evolution_narrative", "checkpoint", "coloring", "egg_challenge"].includes(val)) {
                selectPart.value = "individual";
                selectPart.disabled = true;
            } else if (val === "trade_narrative") { // <-- Corregido para que bloquee el select con la nueva clave
                selectPart.value = "pareja";
                selectPart.disabled = true;
            }
        });
    }

    document.getElementById("btn-add-activity")?.addEventListener("click", handleRegisterActivity);
});

// ==========================================
// REGISTRO Y LOG
// ==========================================
async function handleRegisterActivity() {
    const name = document.getElementById("activity-name-input").value.trim();
    const type = document.getElementById("select-activity").value;
    const participation = document.getElementById("select-participation").value;
    const link = document.getElementById("activity-link").value.trim();
    const quantity = parseInt(document.getElementById("input-qty-pkm").value) || 1;

    // 1. Validaciones iniciales
    if (!name || !type || !link) return alert("Completa todos los campos obligatorios.");

    let baseMoney = 0;
    let baseXP = 0;

    // 2. Cálculo de recompensas
    if (type === "otros_manual") {
        baseMoney = parseInt(document.getElementById("custom-money").value) || 0;
        baseXP = parseInt(document.getElementById("custom-xp").value) || 0;
    } else {
        const reward = REWARDS_CONFIG[type][participation] || REWARDS_CONFIG[type]["individual"];
        baseMoney = reward[0];
        baseXP = reward[1];
    }

    const isMultiplied = (type === "encounter" || type === "coloring");
    const finalMoney = isMultiplied ? (baseMoney * quantity) : baseMoney;
    const finalXP = isMultiplied ? (baseXP * quantity) : baseXP;

    try {
        console.log("Iniciando registro para el usuario:", window.currentUserId);

        // 3. Insertar en el Log de Actividades
        const { error: logErr } = await window.supabaseClient.from(LOG_TABLE).insert([{
            user_id: window.currentUserId,
            activity_name: isMultiplied ? `${name} (x${quantity})` : name,
            activity_type: type,
            participation: participation,
            money_reward: finalMoney,
            xp_reward: finalXP,
            link: link
        }]);

        if (logErr) throw new Error("Error al insertar en Log: " + logErr.message);

        // 4. Obtener Inventario actual del Entrenador
        const { data: inv, error: fetchErr } = await window.supabaseClient
            .from(TRAINER_TABLE)
            .select("inventory")
            .eq("user_id", window.currentUserId)
            .maybeSingle();

        if (fetchErr) throw new Error("Error al obtener inventario: " + fetchErr.message);

        // 5. Preparar el objeto Meta (Inventario)
        let meta = inv?.inventory || { 
            economy: { biIncome: 0, savings: 0, spent: 0 }, 
            xp: 0,
            items: {},
            balls: {}
        };

        if (!meta.economy) meta.economy = { biIncome: 0, savings: 0, spent: 0 };
        
        meta.economy.biIncome = (meta.economy.biIncome || 0) + finalMoney;
        meta.xp = (meta.xp || 0) + finalXP;
        meta.lastUpdated = new Date().toISOString();

        // 6. Guardar (Upsert) el Inventario actualizado
        const { error: upsertErr } = await window.supabaseClient
            .from(TRAINER_TABLE)
            .upsert({ 
                user_id: window.currentUserId, 
                inventory: meta,
                updated_at: new Date().toISOString() 
            }, { onConflict: 'user_id' });

        if (upsertErr) throw new Error("Error al actualizar puntos: " + upsertErr.message);

        // 7. Éxito total
        alert(`¡Registro exitoso!\nHas ganado: ₽${finalMoney} y ${finalXP} XP.`);
        location.reload();

    } catch (err) {
        console.error("Detalle del error:", err);
        alert("Error al guardar: " + err.message);
    }
}

async function loadActivityLog() {
    const container = document.getElementById("activity-log-container");
    
    try {
        const { data: rawData, error } = await window.supabaseClient
            .from(LOG_TABLE)
            .select("*")
            .eq("user_id", window.currentUserId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error de Supabase:", error);
            container.innerHTML = `<p class="empty-msg">Error al conectar con la base de datos.</p>`;
            return;
        }

        // =========================================================================
        // LISTA BLANCA ESTRICTA: Ahora también filtra los intercambios automáticos ("trade")
        // =========================================================================
        const allowedTypes = [
            "encounter", 
            "exploration", 
            "quest", 
            "egg_challenge", 
            "pokedex_comu", 
            "pokedex_legen", 
            "coloring", 
            "pokewords", 
            "freemode", 
            "passport", 
            "checkpoint", 
            "evolution_narrative",
            "otros_manual",
            "trade_narrative" // <-- Cambiado de "trade" a "trade_narrative"
        ];

        const data = rawData ? rawData.filter(act => allowedTypes.includes(act.activity_type)) : [];

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="empty-msg">No hay actividades recientes.</p>`;
            return;
        }

        const typeNames = {
            encounter: "Encounter", quest: "Quest", pokedex_comu: "Pokedex Comu.",
            pokedex_legen: "Pokedex Leg.", pokewords: "Pokéwords", freemode: "Freemode",
            passport: "Passport", evolution_narrative: "Evolución", trade_narrative: "Intercambio", // <-- Mapeado aquí
            checkpoint: "Checkpoint", otros_manual: "Otros", 
            exploration: "Exploración", coloring: "Coloreo",
            egg_challenge: "Reto Huevo"
        };

        let tableHTML = `
            <div class="log-table-container">
                <table class="activities-table">
                    <thead>
                        <tr>
                            <th style="width: 60px;">Fecha</th>
                            <th>Nombre</th>
                            <th>Actividad</th>
                            <th>Part.</th>
                            <th>Recompensa</th>
                            <th style="text-align: center;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(act => {
            const dateObj = new Date(act.created_at);
            const dateStr = dateObj.toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit'
            });

            const typeLabel = typeNames[act.activity_type] || act.activity_type || "Otros";
            const participationStr = act.participation || "individual";
            const partLabel = participationStr.charAt(0).toUpperCase() + participationStr.slice(1);

            tableHTML += `
                <tr>
                    <td class="td-date">${dateStr}</td>
                    
                    <td>
                        <div class="td-activity-name">${act.activity_name || "Sin nombre"}</div>
                        <a href="${act.link || '#'}" target="_blank" class="td-link">Ver post <i class="fa fa-external-link"></i></a>
                    </td>
                    
                    <td><span class="badge badge-type">${typeLabel}</span></td>
                    
                    <td><span class="badge badge-part">${partLabel}</span></td>
                    
                    <td>
                        <div class="td-money">+₽${act.money_reward || 0}</div>
                        <div class="td-xp">+${act.xp_reward || 0} XP</div>
                    </td>
                    
                    <td>
                        <div class="actions-cell">
                            <button class="btn-action-table btn-edit-table" onclick="openEditModal('${act.id}', '${act.activity_name || ""}', '${act.link || ""}')">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button class="btn-action-table btn-delete-table" onclick="deleteLogEntryInline('${act.id}')">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table></div>`;
        container.innerHTML = tableHTML;

    } catch (globalErr) {
        console.error("Error crítico en loadActivityLog:", globalErr);
        container.innerHTML = `<p class="empty-msg">Error inesperado al procesar los registros.</p>`;
    }
}

// ==========================================
// MODALES Y EDICIÓN
// ==========================================
window.openEditModal = function(id, name, link) {
    document.getElementById("edit-log-id").value = id;
    document.getElementById("edit-log-name").value = name;
    document.getElementById("edit-log-link").value = link;
    document.getElementById("modal-edit-log").classList.remove("hidden");
};

window.closeEditModal = function() {
    document.getElementById("modal-edit-log").classList.add("hidden");
};

window.saveLogEdit = async function() {
    const id = document.getElementById("edit-log-id").value;
    const newName = document.getElementById("edit-log-name").value.trim();
    const newLink = document.getElementById("edit-log-link").value.trim();

    if (!newName || !newLink) return alert("Los campos no pueden estar vacíos.");

    try {
        const { error } = await window.supabaseClient
            .from(LOG_TABLE)
            .update({ activity_name: newName, link: newLink })
            .eq("id", id);

        if (error) throw error;

        alert("Registro actualizado.");
        closeEditModal();
        loadActivityLog(); 
    } catch (err) {
        console.error(err);
        alert("Error al actualizar el registro.");
    }
};

window.deleteLogEntry = async function() {
    const id = document.getElementById("edit-log-id").value;

    if (!id) {
        console.error("No se encontró el ID para borrar");
        return;
    }

    if (!confirm("¿Estás seguro de eliminar esta actividad? El dinero y la EXP obtenidos se restarán de tu perfil automáticamente.")) {
        return;
    }

    try {
        const { data: activity, error: fetchLogErr } = await window.supabaseClient
            .from(LOG_TABLE)
            .select("money_reward, xp_reward")
            .eq("id", id)
            .single();

        if (fetchLogErr) throw new Error("No se pudo encontrar la actividad.");

        const { data: invRow, error: fetchInvErr } = await window.supabaseClient
            .from(TRAINER_TABLE)
            .select("inventory")
            .eq("user_id", window.currentUserId)
            .single();

        if (fetchInvErr) throw new Error("No se pudo obtener el inventario.");

        let meta = invRow.inventory;

        meta.economy.biIncome = Math.max(0, (meta.economy.biIncome || 0) - activity.money_reward);
        meta.xp = Math.max(0, (meta.xp || 0) - activity.xp_reward);
        meta.lastUpdated = new Date().toISOString();

        const { error: upsertErr } = await window.supabaseClient
            .from(TRAINER_TABLE)
            .upsert(
                { user_id: window.currentUserId, inventory: meta }, 
                { onConflict: 'user_id' }
            );

        if (upsertErr) throw new Error("Error al actualizar el perfil.");

        const { error: deleteError = null } = await window.supabaseClient
            .from(LOG_TABLE)
            .delete()
            .eq("id", id);

        if (deleteError) throw new Error("Error al borrar el registro.");

        alert("Actividad eliminada y puntos restados correctamente.");
        closeEditModal();
        location.reload(); 

    } catch (err) {
        console.error("Error en deleteLogEntry:", err);
        alert("Hubo un fallo: " + err.message);
    }
};

window.deleteLogEntryInline = function(id) {
    const idInput = document.getElementById("edit-log-id");
    if (idInput) {
        idInput.value = id;
        window.deleteLogEntry();
    }
};