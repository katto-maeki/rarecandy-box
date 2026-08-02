// eventos.js - Sección de Eventos (sin evento activo)
// ==========================================

function initHamburgerMenu() {
  const btnMenu = document.getElementById("btn-menu");
  const sideMenu = document.getElementById("side-menu");
  const btnClose = document.getElementById("btn-close-menu");

  if (btnMenu && sideMenu) {
    btnMenu.onclick = () => sideMenu.classList.remove("hidden");
    if (btnClose) btnClose.onclick = () => sideMenu.classList.add("hidden");
    sideMenu.onclick = (e) => { if (e.target === sideMenu) sideMenu.classList.add("hidden"); };
  }

  if (typeof setupLogoutButton === "function") setupLogoutButton("btn-logout-side");
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await initProtectedPage();
  if (!user) return;

  if (typeof renderTrainerLabelFromGame === "function") await renderTrainerLabelFromGame();
  initHamburgerMenu();
});
