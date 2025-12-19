// script.js (index → pantalla de login)

// Supabase se carga por CDN en el HTML y el cliente
// se crea en core.js como window.supabaseClient.

const supabase = window.supabaseClient;

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
  if (!user || !supabase) return;

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
      await upsertUserRow(data.user);
      window.location.href = "cajapkm.html";
    }
  } catch (e) {
    console.error("Error comprobando sesión existente:", e);
  }
})();

// Click en "Ingresar"
if (btnEnter) {
  btnEnter.addEventListener("click", async () => {
    if (!supabase) {
      if (errorBox) {
        errorBox.textContent = "Error interno: Supabase no está inicializado.";
      }
      return;
    }

    if (errorBox) errorBox.textContent = "";

    const email = (emailInput?.value || "").trim();
    const password = (passInput?.value || "").trim();

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent = "Escribe tu usuario (correo) y contraseña.";
      }
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
        if (errorBox) {
          errorBox.textContent = "No se pudo iniciar sesión. Revisa tus datos.";
        }
        btnEnter.disabled = false;
        btnEnter.textContent = "Ingresar";
        return;
      }

      await upsertUserRow(data.user);

      // ✅ Login correcto → vamos a la caja Pokémon
      window.location.href = "cajapkm.html";
    } catch (e) {
      console.error("Error inesperado en el login:", e);
      if (errorBox) {
        errorBox.textContent =
          "Ocurrió un error inesperado al iniciar sesión.";
      }
      btnEnter.disabled = false;
      btnEnter.textContent = "Ingresar";
    }
  });
} else {
  console.error("No encontré el botón #btn-enter. Revisa el HTML del login.");
}
