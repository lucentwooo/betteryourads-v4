// Shared browser auth: magic-link login, approval gate, and authed fetch.
// Requires the Supabase UMD bundle (window.supabase) to be loaded first.
(function () {
  const Auth = {};
  let client = null;
  let cachedToken = null;

  Auth.init = async function () {
    if (client) return client;
    const cfg = await fetch("/config").then((r) => r.json());
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error("Supabase is not configured on the server (.env).");
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    Auth.client = client;
    return client;
  };

  function overlay(innerHtml) {
    let el = document.getElementById("authOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "authOverlay";
      el.style.cssText =
        "position:fixed;inset:0;background:#0b0b0c;color:#eee;display:flex;" +
        "align-items:center;justify-content:center;z-index:9999;padding:24px;" +
        "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<div style="max-width:380px;width:100%;border:1px solid #2a2a2e;border-radius:12px;' +
      'padding:24px;background:#141416;">' + innerHtml + "</div>";
    el.style.display = "flex";
    return el;
  }
  function clearOverlay() {
    const el = document.getElementById("authOverlay");
    if (el) el.style.display = "none";
  }

  // Shared inline styles for the auth screens.
  var inputStyle =
    "width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;" +
    "border:1px solid #2a2a2e;border-radius:8px;background:#0b0b0c;color:#eee;";
  var primaryBtnStyle =
    "width:100%;padding:10px;border-radius:8px;border:0;background:#4f7cff;color:#fff;cursor:pointer;";
  var linkBtnStyle =
    "background:none;border:0;color:#7fa0ff;cursor:pointer;font-size:13px;padding:0;";
  var msgStyle = "margin-top:12px;font-size:13px;color:#999;min-height:18px;";

  function loginScreen() {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Sign in</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">Enter your email and password.</p>' +
      '<input id="authEmail" type="email" placeholder="you@company.com" style="' + inputStyle + '" />' +
      '<input id="authPassword" type="password" placeholder="Password" style="' + inputStyle + '" />' +
      '<button id="authSignin" style="' + primaryBtnStyle + '">Sign in</button>' +
      '<div id="authMsg" style="' + msgStyle + '"></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;">' +
        '<button id="authForgot" style="' + linkBtnStyle + '">Forgot password?</button>' +
        '<button id="authToSignup" style="' + linkBtnStyle + '">Create account</button>' +
      '</div>' +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #2a2a2e;text-align:center;">' +
        '<button id="authMagic" style="' + linkBtnStyle + '">Email me a sign-in link instead</button>' +
      '</div>'
    );
    const emailEl = el.querySelector("#authEmail");
    const pwEl = el.querySelector("#authPassword");
    const msg = el.querySelector("#authMsg");

    el.querySelector("#authSignin").addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      const password = pwEl.value || "";
      if (!email || !password) { msg.textContent = "Enter your email and password."; return; }
      const btn = el.querySelector("#authSignin");
      btn.disabled = true; btn.textContent = "Signing in…";
      const { error } = await client.auth.signInWithPassword({ email: email, password: password });
      btn.disabled = false; btn.textContent = "Sign in";
      // On success, onAuthStateChange resolves the guard and clears this overlay.
      if (error) msg.textContent = "Couldn't sign in: " + error.message;
    });

    el.querySelector("#authForgot").addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      if (!email) { msg.textContent = "Enter your email first, then tap Forgot password."; return; }
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      msg.textContent = error
        ? "Couldn't send reset email: " + error.message
        : "Check your inbox for a link to set a new password.";
    });

    el.querySelector("#authToSignup").addEventListener("click", signUpScreen);

    el.querySelector("#authMagic").addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      if (!email) { msg.textContent = "Enter your email first."; return; }
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOtp({
        email: email, options: { emailRedirectTo: redirectTo },
      });
      msg.textContent = error
        ? "Couldn't send link: " + error.message
        : "Check your inbox for the sign-in link, then return to this tab.";
    });

    pwEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") el.querySelector("#authSignin").click();
    });
  }

  function signUpScreen() {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Create account</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">Pick an email and password to get started.</p>' +
      '<input id="authEmail" type="email" placeholder="you@company.com" style="' + inputStyle + '" />' +
      '<input id="authPassword" type="password" placeholder="Password (at least 6 characters)" style="' + inputStyle + '" />' +
      '<button id="authSignup" style="' + primaryBtnStyle + '">Create account</button>' +
      '<div id="authMsg" style="' + msgStyle + '"></div>' +
      '<div style="margin-top:8px;text-align:center;">' +
        '<button id="authToSignin" style="' + linkBtnStyle + '">Already have an account? Sign in</button>' +
      '</div>'
    );
    const emailEl = el.querySelector("#authEmail");
    const pwEl = el.querySelector("#authPassword");
    const msg = el.querySelector("#authMsg");

    el.querySelector("#authSignup").addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      const password = pwEl.value || "";
      if (!email || !password) { msg.textContent = "Enter your email and a password."; return; }
      if (password.length < 6) { msg.textContent = "Password must be at least 6 characters."; return; }
      const btn = el.querySelector("#authSignup");
      btn.disabled = true; btn.textContent = "Creating…";
      const redirectTo = window.location.origin + window.location.pathname;
      const { data, error } = await client.auth.signUp({
        email: email, password: password, options: { emailRedirectTo: redirectTo },
      });
      btn.disabled = false; btn.textContent = "Create account";
      if (error) { msg.textContent = "Couldn't create account: " + error.message; return; }
      // When email confirmation is required, Supabase returns no session yet.
      msg.textContent = data && data.session
        ? "Account created. Signing you in…"
        : "Account created. Check your inbox to confirm your email, then sign in.";
    });

    el.querySelector("#authToSignin").addEventListener("click", loginScreen);
    pwEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") el.querySelector("#authSignup").click();
    });
  }

  function pendingScreen(email) {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Awaiting approval</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">You\'re signed in as ' +
      "<strong>" + (email || "") + "</strong>, but your account hasn't been approved yet. " +
      "You'll get access once it's approved.</p>" +
      '<button id="authSignout" style="width:100%;padding:10px;border-radius:8px;border:0;' +
      'background:#2a2a2e;color:#eee;cursor:pointer;">Sign out</button>'
    );
    el.querySelector("#authSignout").addEventListener("click", function () { Auth.signOut(); });
  }

  async function getProfile(userId) {
    const { data, error } = await client
      .from("profiles").select("approved,email,is_admin").eq("id", userId).single();
    if (error) return null;
    return data;
  }

  // Resolves with { session, profile, userId } only for an approved user.
  // Otherwise renders the appropriate gate and keeps the app hidden.
  Auth.guard = function () {
    return new Promise(async function (resolve) {
      await Auth.init();
      let resolved = false;
      async function evaluate(session) {
        cachedToken = session ? session.access_token : null;
        if (!session) { loginScreen(); return; }
        const profile = await getProfile(session.user.id);
        if (profile && profile.approved) {
          clearOverlay();
          if (!resolved) {
            resolved = true;
            resolve({ session: session, profile: profile, userId: session.user.id });
          }
        } else {
          pendingScreen(session.user.email);
        }
      }
      // Shown after a "Forgot password?" link is clicked: lets the user set a new password.
      function recoveryScreen() {
        const el = overlay(
          '<h2 style="margin:0 0 8px;font-size:18px;">Set a new password</h2>' +
          '<p style="margin:0 0 16px;color:#999;font-size:13px;">Choose a new password for your account.</p>' +
          '<input id="authNewPassword" type="password" placeholder="New password (at least 6 characters)" style="' + inputStyle + '" />' +
          '<button id="authSetPassword" style="' + primaryBtnStyle + '">Update password</button>' +
          '<div id="authMsg" style="' + msgStyle + '"></div>'
        );
        const pwEl = el.querySelector("#authNewPassword");
        const msg = el.querySelector("#authMsg");
        el.querySelector("#authSetPassword").addEventListener("click", async function () {
          const password = pwEl.value || "";
          if (password.length < 6) { msg.textContent = "Password must be at least 6 characters."; return; }
          const btn = el.querySelector("#authSetPassword");
          btn.disabled = true; btn.textContent = "Updating…";
          const { error } = await client.auth.updateUser({ password: password });
          btn.disabled = false; btn.textContent = "Update password";
          if (error) { msg.textContent = "Couldn't update password: " + error.message; return; }
          // Strip the recovery token from the URL, then continue into the app.
          history.replaceState(null, "", window.location.origin + window.location.pathname);
          const { data: s } = await client.auth.getSession();
          await evaluate(s.session);
        });
      }

      client.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY") { recoveryScreen(); return; }
        evaluate(session);
      });
      // A password-reset link lands here with type=recovery in the URL hash.
      if (window.location.hash && window.location.hash.indexOf("type=recovery") !== -1) {
        recoveryScreen();
        return;
      }
      const { data } = await client.auth.getSession();
      await evaluate(data.session);
    });
  };

  Auth.getToken = async function () {
    if (cachedToken) return cachedToken;
    const { data } = await client.auth.getSession();
    cachedToken = data.session ? data.session.access_token : null;
    return cachedToken;
  };

  Auth.authedFetch = async function (url, opts) {
    opts = opts || {};
    const token = await Auth.getToken();
    const headers = Object.assign({}, opts.headers, token ? { Authorization: "Bearer " + token } : {});
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  };

  Auth.signOut = async function () {
    if (client) await client.auth.signOut();
    cachedToken = null;
    // Reload the current page so it re-renders its sign-in screen. (Avoids
    // hard-redirecting to "/", which is now the public marketing landing page.)
    window.location.reload();
  };

  window.Auth = Auth;
})();
