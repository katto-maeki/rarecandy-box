// script.js (index → pantalla de login)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// 🔹 Pega aquí tus valores reales de Supabase
const SUPABASE_URL = "https://gsxfoebmxxgxyghltyra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzeGZvZWJteHhneHlnaGx0eXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjEwNzcsImV4cCI6MjA3OTgzNzA3N30.Xc0KHEWVNNrE9SKCQhCaLxmD162oYv17ApisorEPCAs";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Guard global por si luego quieres reusar supabase en consola
window.supabase = supabase;

const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const btnEnter = document.getElementById("btn-enter");
const errorBox = document.getElementById("error-message");

// Si ya está logueado, lo mandamos directo a la caja
(async () => {
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    window.location.href = "cajapkm.html";
  }
})();

btnEnter.addEventListener("click", async () => {
  errorBox.textContent = "";

  const email = emailInput.value.trim();
  const password = passInput.value.trim();

  if (!email || !password) {
    errorBox.textContent = "Escribe tu usuario (correo) y contraseña.";
    return;
  }

  btnEnter.disabled = true;
  btnEnter.textContent = "Ingresando...";

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error(error);
    errorBox.textContent = "No se pudo iniciar sesión. Revisa tus datos.";
    btnEnter.disabled = false;
    btnEnter.textContent = "Ingresar";
    return;
  }

  // ✅ Login correcto → vamos a la caja Pokémon
  window.location.href = "cajapkm.html";
});

// Ejemplo después de signIn/signUp
const {
  data: { user },
  error,
} = await supabase.auth.getUser();

if (!error && user) {
  // Crear/actualizar fila básica del jugador
  await supabase.from("user_game_data").upsert(
    {
      id: user.id,
      email: user.email,
      // trainer_name lo puedes actualizar luego desde trainer.html
      last_login: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}
