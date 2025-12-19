// script.js (index → pantalla de login)

// IMPORTANTE:
// Ya NO usamos "import { createClient } from ..."
// Supabase se carga por CDN en el HTML y el cliente
// se crea en core.js como window.supabaseClient.

window.supabaseClient.auth.signInWithPassword(...)

if (!supabase) {
  console.error(
    "supabaseClient no está inicializado. Revisa el orden de los <script>."
  );
}

// Referencias a elementos del DOM
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const btnEnter = document.getElementById("btn-enter");
const errorBox = document.getElementById("error-message");

// Helper: crear/actualizar fila del jugador en user_game_data
async function upsertUserRow(user) {
  if (!user) return;

  try {
    const { error } = await supabase.from("user_game_data").upsert(
      {
        id: user.id,
        email: user.email,
        // trainer_name lo puedes ajustar luego desde trainer.html
        last_login: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Error haciendo upsert en user_game_data:", error);
    }
  } catch (e) {
    console.error("Error inesperado en upsertUserRow:", e);
  }
}

// Si ya está logueado, lo mandamos directo a la caja
(async () => {
  if (!supabase) return;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      // Actualizamos last_login también aquí
      await upsertUserRow(data.user);
      window.location.href = "cajapkm.html";
    }
  } catch (e) {
    console.error("Error comprobando sesión existente:", e);
  }
})();

// Click en "Ingresar"
btnEnter.addEventListener("click", async () => {
  if (!supabase) {
    errorBox.textContent = "Error interno: Supabase no está inicializado.";
    return;
  }

  errorBox.textContent = "";

  const email = emailInput.value.trim();
  const password = passInput.value.trim();

  if (!email || !password) {
    errorBox.textContent = "Escribe tu usuario (correo) y contraseña.";
    return;
  }

  btnEnter.disabled = true;
  btnEnter.textContent = "Ingresando...";

  try {
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

    // data.user viene en la respuesta de login
    await upsertUserRow(data.user);

    // ✅ Login correcto → vamos a la caja Pokémon
    window.location.href = "cajapkm.html";
  } catch (e) {
    console.error("Error inesperado en el login:", e);
    errorBox.textContent = "Ocurrió un error inesperado al iniciar sesión.";
    btnEnter.disabled = false;
    btnEnter.textContent = "Ingresar";
  }
});

