// theme.js - Temas de temporada
// Se carga en el <head> de cada página (justo después de base.css) para que
// el tema se aplique antes de pintar y no haya "parpadeo" del estilo normal.
//
// - Halloween se activa solo en octubre y noviembre; el 1 de diciembre la web
//   vuelve sola a su estética de siempre.
// - Interruptor manual para probar: ?tema=halloween fuerza el tema,
//   ?tema=normal lo apaga y ?tema=auto vuelve a decidir por fecha.
//   La elección se recuerda en este navegador.

(function () {
    const STORAGE_KEY = "rc-tema";
    const HALLOWEEN_LOGO = "img/logo-halloween.png";

    let choice = "auto";
    try {
        const fromUrl = new URLSearchParams(location.search).get("tema");
        if (fromUrl === "halloween" || fromUrl === "normal") {
            localStorage.setItem(STORAGE_KEY, fromUrl);
        } else if (fromUrl === "auto") {
            localStorage.removeItem(STORAGE_KEY);
        }
        choice = localStorage.getItem(STORAGE_KEY) || "auto";
    } catch (e) { /* sin storage: decidir por fecha */ }

    const month = new Date().getMonth(); // 0 = enero
    const isHalloweenSeason = month === 9 || month === 10; // octubre-noviembre
    const useHalloween = choice === "halloween" || (choice === "auto" && isHalloweenSeason);

    if (!useHalloween) return;

    document.documentElement.classList.add("theme-halloween");

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "halloween.css";
    document.head.appendChild(link);

    // Logo de temporada (solo existe en la página de login)
    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".logo-img").forEach(img => { img.src = HALLOWEEN_LOGO; });
    });
})();
