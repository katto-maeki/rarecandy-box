// tablas.js - Control de pestañas

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Auth & Header
    try {
        const user = await initProtectedPage(); 
        if (!user) return;
        
        if(typeof renderTrainerLabelFromGame === 'function') await renderTrainerLabelFromGame();
        if(typeof setupLogoutButton === 'function') setupLogoutButton();
    } catch (e) { console.log("Init core skipped"); }

    // 2. Lógica de Tabs
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const targetId = tab.dataset.target;

            // Quitar activo de todos
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));

            // Activar actual
            tab.classList.add("active");
            document.getElementById(targetId).classList.add("active");
        });
    });
});