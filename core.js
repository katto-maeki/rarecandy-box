// core.js
// =======================
// Configuración Supabase
// =======================
const SUPABASE_URL = "https://gsxfoebmxxgxyghltyra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzeGZvZWJteHhneHlnaGx0eXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjEwNzcsImV4cCI6MjA3OTgzNzA3N30.Xc0KHEWVNNrE9SKCQhCaLxmD162oYv17ApisorEPCAs";

// Del objeto global 'supabase' que expone el CDN sacamos createClient
const { createClient } = window.supabase;

// Cliente global (el que usarán todas las páginas)
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ID del usuario logueado disponible para todos
window.currentUserId = null;

// =======================
// Helper: proteger páginas
// =======================
window.initProtectedPage = async function initProtectedPage(options = {}) {
  const { redirectToLogin = "index.html" } = options;

  try {
    const { data, error } = await window.supabase.auth.getUser();

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
      if (!window.currentUserId) {
        const { data } = await window.supabase.auth.getUser();
        window.currentUserId = data.user?.id || null;
      }
      if (!window.currentUserId) return;

      const { data, error } = await window.supabase
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

      // por si otras partes lo quieren usar
      window.currentTrainerName = trainerName;
    } catch (e) {
      console.error("Error en renderTrainerLabelFromGame:", e);
    }
  };

// =======================
// Helper: botón de logout
// =======================
window.setupLogoutButton = function setupLogoutButton(buttonId = "btn-logout") {
  const logoutBtn = document.getElementById(buttonId);
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    const confirmed = confirm("¿Estás seguro que deseas cerrar sesión?");
    if (!confirmed) return;

    const { error } = await window.supabase.auth.signOut();
    if (error) {
      alert("Ocurrió un error al cerrar sesión. Intenta nuevamente.");
      console.error(error);
      return;
    }

    window.location.href = "index.html";
  });
};
