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

  function loginScreen() {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Sign in</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">Enter your email and we\'ll ' +
      "send you a one-click sign-in link.</p>" +
      '<input id="authEmail" type="email" placeholder="you@company.com" ' +
      'style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;' +
      'border:1px solid #2a2a2e;border-radius:8px;background:#0b0b0c;color:#eee;" />' +
      '<button id="authSend" style="width:100%;padding:10px;border-radius:8px;border:0;' +
      'background:#4f7cff;color:#fff;cursor:pointer;">Send magic link</button>' +
      '<div id="authMsg" style="margin-top:12px;font-size:13px;color:#999;"></div>'
    );
    const emailEl = el.querySelector("#authEmail");
    const btn = el.querySelector("#authSend");
    const msg = el.querySelector("#authMsg");
    btn.addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      if (!email) { msg.textContent = "Enter your email."; return; }
      btn.disabled = true; btn.textContent = "Sending…";
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOtp({
        email: email, options: { emailRedirectTo: redirectTo },
      });
      btn.disabled = false; btn.textContent = "Send magic link";
      msg.textContent = error
        ? "Couldn't send link: " + error.message
        : "Check your inbox for the sign-in link, then return to this tab.";
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
      const { data } = await client.auth.getSession();
      await evaluate(data.session);
      client.auth.onAuthStateChange(function (_event, session) { evaluate(session); });
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
    window.location.href = "/";
  };

  window.Auth = Auth;
})();
