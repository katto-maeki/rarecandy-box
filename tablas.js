// tablas.js - Control de pestañas, FAQ y Menú Hamburguesa

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");

    if (btnMenu && sideMenu) {
        // Abrir menú (desde la izquierda según tu CSS)
        btnMenu.onclick = () => {
            sideMenu.classList.remove("hidden");
        };

        // Cerrar menú con la X
        if (btnClose) {
            btnClose.onclick = () => {
                sideMenu.classList.add("hidden");
            };
        }

        // Cerrar al hacer clic en el fondo oscuro
        sideMenu.onclick = (e) => {
            if (e.target === sideMenu) {
                sideMenu.classList.add("hidden");
            }
        };
    }

    // Botón de salir en el menú lateral
    if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

// ==========================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Auth & Header
    try {
        const user = await initProtectedPage(); 
        if (!user) return;
        
        if(typeof renderTrainerLabelFromGame === 'function') await renderTrainerLabelFromGame();
    } catch (e) {
        console.log("Init core skipped"); 
    }

    // 2. Inicializar Menú Hamburguesa
    initHamburgerMenu();

    // 3. Lógica de Tabs (Pestañas de evolución, XP y FAQ)
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const targetId = tab.dataset.target;

                // Quitar activo de todos los botones y contenidos
                tabs.forEach(t => t.classList.remove("active"));
                contents.forEach(c => c.classList.remove("active"));

                // Activar el botón clicado y su contenido correspondiente
                tab.classList.add("active");
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add("active");
                }
            });
        });
    }

    // NUEVO 4. Lógica de apertura/cierre para el Acordeón de las FAQs
    const faqQuestions = document.querySelectorAll(".faq-question");
    if (faqQuestions.length > 0) {
        faqQuestions.forEach(q => {
            q.addEventListener("click", () => {
                const item = q.parentElement;
                item.classList.toggle("open");
            });
        });
    }
});