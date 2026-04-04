// tablas.js - Control de pestañas y Menú Hamburguesa

// ==========================================
// LÓGICA DEL MENÚ HAMBURGUESA
// ==========================================
function initHamburgerMenu() {
    const btnMenu = document.getElementById("btn-menu");
    const sideMenu = document.getElementById("side-menu");
    const btnClose = document.getElementById("btn-close-menu");
    const btnLogoutSide = document.getElementById("btn-logout-side");

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
    if (btnLogoutSide) {
        btnLogoutSide.onclick = (e) => {
            e.preventDefault();
            const originalLogout = document.getElementById("btn-logout");
            if (originalLogout) {
                originalLogout.click();
            } else {
                // Fallback si no hay botón original en el DOM
                window.supabaseClient.auth.signOut().then(() => {
                    window.location.href = "index.html";
                });
            }
        };
    }
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
        if(typeof setupLogoutButton === 'function') setupLogoutButton();
    } catch (e) { 
        console.log("Init core skipped"); 
    }

    // 2. Inicializar Menú Hamburguesa
    initHamburgerMenu();

    // 3. Lógica de Tabs (Pestañas de evolución)
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
});