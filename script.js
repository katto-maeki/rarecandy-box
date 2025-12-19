// script.js (login)

if (!window.supabaseClient) {
  console.error("supabaseClient no está inicializado.");
}

// DOM
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const btnEnter = document.getElementById("btn-enter");
const errorBox = document.getElementById("error-message");

// Helper
async function upsertUserRow(user) {
  if (!user || !window.supabaseClient) return;

  try {
    const { error } = await window.supabaseClient
      .from("user_game_data")
      .upsert(
        {
          id: user.id,
          email: user.email,
          last_login: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("Error haciendo upsert:", error);
    }
  } catch (e) {
    console.error("Error inesperado en upsert:", e);
  }
}

// Auto-login
(async () => {
  if (!window.supabaseClient) return;

  try {
    const { data, error } =
      await window.supabaseClient.auth.getUser();

    if (!error && data.user) {
      await upsertUserRow(data.user);
      window.location.href = "cajapkm.html";
    }
  } catch (e) {
    console.error("Error comprobando sesión:", e);
  }
})();

// Click login
if (btnEnter) {
  btnEnter.addEventListener("click", async () => {
    if (!window.supabaseClient) {
      errorBox.textContent = "Error interno.";
      return;
    }

    errorBox.textContent = "";

    const email = emailInput.value.trim();
    const password = passInput.value.trim();

    if (!email || !password) {
      errorBox.textContent = "Escribe correo y contraseña.";
      return;
    }

    btnEnter.disabled = true;
    btnEnter.textContent = "Ingresando...";

    try {
      const { data, error } =
        await window.supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        errorBox.textContent = "Credenciales incorrectas.";
        btnEnter.disabled = false;
        btnEnter.textContent = "Ingresar";
        return;
      }

      await upsertUserRow(data.user);
      window.location.href = "cajapkm.html";
    } catch (e) {
      console.error(e);
      errorBox.textContent = "Error inesperado.";
      btnEnter.disabled = false;
      btnEnter.textContent = "Ingresar";
    }
  });
}
