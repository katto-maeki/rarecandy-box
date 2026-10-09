// core.js
// =======================
// Configuración Supabase
// =======================
const SUPABASE_URL = "https://gsxfoebmxxgxyghltyra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzeGZvZWJteHhneHlnaGx0eXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjEwNzcsImV4cCI6MjA3OTgzNzA3N30.Xc0KHEWVNNrE9SKCQhCaLxmD162oYv17ApisorEPCAs";

// 👇 Ya NO sobreescribimos window.supabase
if (!window.supabase || !window.supabase.createClient) {
  console.error("Supabase CDN no se cargó correctamente.");
} else {
  const { createClient } = window.supabase;
  // Cliente real que vamos a usar en la app
  window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

if (!window.supabaseClient) {
  console.error("No se pudo inicializar supabaseClient.");
}

// ID del usuario logueado disponible para todos
window.currentUserId = null;

// =======================
// Helper: proteger páginas
// =======================
window.initProtectedPage = async function initProtectedPage(options = {}) {
  const { redirectToLogin = "index.html" } = options;

  if (!window.supabaseClient) {
    console.error("supabaseClient no está inicializado.");
    window.location.href = redirectToLogin;
    return null;
  }

  try {
    const { data, error } = await window.supabaseClient.auth.getUser();

    if (error || !data.user) {
      window.location.href = redirectToLogin;
      return null;
    }

    window.currentUserId = data.user.id;
    return data.user;
  } catch (e) {
    console.error("Error en initProtectedPage:", e);
    window.location.href = redirectToLogin;
    return null;
  }
};

// =======================
// Helper: renderizar nombre
// =======================
window.renderTrainerLabelFromGame =
  async function renderTrainerLabelFromGame() {
    try {
      if (!window.supabaseClient) return;

      if (!window.currentUserId) {
        const { data } = await window.supabaseClient.auth.getUser();
        window.currentUserId = data.user?.id || null;
      }
      if (!window.currentUserId) return;

      const { data, error } = await window.supabaseClient
        .from("user_game_data")
        .select("trainer_name")
        .eq("id", window.currentUserId)
        .maybeSingle();

      if (error) {
        console.error("Error leyendo trainer_name:", error);
        return;
      }

      const trainerName = data?.trainer_name || "Entrenador";
      const label = document.getElementById("trainer-label");
      if (label) {
        label.textContent = `Entrenador: ${trainerName}`;
      }

      window.currentTrainerName = trainerName;
    } catch (e) {
      console.error("Error en renderTrainerLabelFromGame:", e);
    }
  };

// =======================
// Helper: sprites vía CDN (evita el rate-limit de raw.githubusercontent.com)
// =======================
window.MYSTERY_EGG_SPRITE = "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/mystery-egg.png";

window.toCdnSpriteUrl = function toCdnSpriteUrl(url, fallback = "") {
  if (!url || typeof url !== "string") return fallback;
  if (url.includes("raw.githubusercontent.com/PokeAPI/sprites/master")) {
    return url.replace(
      "raw.githubusercontent.com/PokeAPI/sprites/master",
      "cdn.jsdelivr.net/gh/PokeAPI/sprites@master"
    );
  }
  return url;
};

// =======================
// Helper: botón de logout
// =======================
window.setupLogoutButton = function setupLogoutButton(buttonId = "btn-logout") {
  const logoutBtn = document.getElementById(buttonId);
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    if (!window.supabaseClient) {
      alert("Supabase no está inicializado.");
      return;
    }

    const confirmed = confirm("¿Estás seguro que deseas cerrar sesión?");
    if (!confirmed) return;

    const { error } = await window.supabaseClient.auth.signOut();
    if (error) {
      alert("Ocurrió un error al cerrar sesión. Intenta nuevamente.");
      console.error(error);
      return;
    }

    window.location.href = "index.html";
  });
};

// DESCRIPCIONES DE USO DE ÍTEMS (Inventario: panel de detalle; Tienda: botón ⓘ)
const ITEM_DESCRIPTIONS = {
  egg: "Dependiendo el tiempo que pase en la guardería pokémon, obtendrás pokémon: baby, comunes y raros.",
  evoStone: "Permite evolucionar a Pokémon que requieren una piedra elemental.",
  friendship: "Objeto necesario para Pokémon que evolucionan por amistad.",
  starCrystal: "Cristal cargado de energía estelar. Funciona como llave de evolución para Pokémon con condiciones especiales: por intercambio, por un objeto específico u otros requisitos únicos.",
  tradeToken: "Token que permite intercambiar pokémon entre integrantes. Ambos deben tener el token para hacerlo efectivo.",
  passport: "Pasaporte que permite a ciertos pokémon evolucionar a su versión regional (Galar, Alola, etc).",
  panquecito: "Un panquecito para que, a pesar de utilizar una Super, Ultra o Master Ball para asegurar tu captura, únicamente atrapes al pokémon base sin evolución.",
  curry: "Un curry contundente que asegura que el pokémon que captures sea su segunda o tercera evolución.",
  poke: "Probabilidad baja de captura. Ideal para Pokémon básicos/base.",
  super: "Mejor que la Poké Ball. Aumenta la posibilidad de captura. Pequeña posibilidad de capturar una evolución del pokémon.",
  ultra: "Excelente para capturar pokémon. Pequeña posibilidad de capturar una evolución del pokémon.",
  master: "Captura 100% efectiva. Pequeña posibilidad de capturar una evolución del pokémon.",
  shinyTicket: "Si capturas un Pokémon en encounter o safari, puedes usar tu Ticket Shiny para convertirlo en shiny.",
  daycarePass: "Te permite acceder a una parte secreta de la guardería, donde hay un Ditto especializado en crianza. Solo puedes obtener un huevo de un Pokémon que ya tengas en tu caja Pokémon.",
  refresco: "Repone estamina al jugador para hacer un tercer intento de captura de un mismo Pokémon en encounter o safari.",
  fossilHelix: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilDome: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  oldAmber: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilRoot: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilClaw: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilSkull: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilArmor: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilCover: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilPlume: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilJaw: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
  fossilSail: "Un fósil antiguo. Llévalo con un poke-guía para revivir al pokémon que guarda.",
};
