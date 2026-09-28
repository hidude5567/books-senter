(function () {
  "use strict";

  var SUPABASE_URL = "https://wgyrpvrzafubezcxqrzy.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndneXJwdnJ6YWZ1YmV6Y3hxcnp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODI2NjYsImV4cCI6MjEwNTc1ODY2Nn0.rGn52ohlPcbKKoiRU3vsd1IrPeE5id6eriDD_JR8jco";
  /* Login stays username+password. Signup collects username + email +
     password; the email is stored on the account (user_metadata.email)
     for future use — the internal auth address stays username@gmail.com
     so username login keeps working. */
  var AUTH_EMAIL_DOMAIN = "gmail.com";

  var bootEl = document.getElementById("bootStatus");
  function setBoot(t, err) {
    if (!bootEl) return;
    if (!t) { bootEl.hidden = true; return; }
    bootEl.hidden = false;
    bootEl.textContent = t;
    bootEl.classList.toggle("boot-status-error", !!err);
  }

  function usernameToEmail(username) {
    var local = String(username).trim().toLowerCase().split("@")[0].replace(/\s+/g, "");
    return local + "@" + AUTH_EMAIL_DOMAIN;
  }
  function friendly(msg) {
    msg = String(msg || "");
    if (/already registered|already exists|duplicate/i.test(msg)) return "That username is already taken.";
    if (/invalid login credentials/i.test(msg)) return "Wrong username or password.";
    if (/password.*(least|short|6)/i.test(msg)) return "Password needs to be at least 6 characters.";
    if (/invalid.*email|email.*invalid/i.test(msg)) return "That email address doesn't look right.";
    if (/rate limit/i.test(msg)) return "Too many attempts — wait a moment and try again.";
    if (/not confirmed|confirm/i.test(msg)) return "This account needs email confirmation enabled off — ask the site owner to check Supabase Auth settings.";
    return msg || "Something went wrong — try again.";
  }

  function loadClient() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("The account library timed out loading (cdn.jsdelivr.net may be blocked on this network)."));
      }, 10000);
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(window.supabase || null);
      };
      s.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error("The account library failed to load."));
      };
      document.head.appendChild(s);
    });
  }

  var db = null;
  var authMode = "login";

  function setMode(mode) {
    authMode = mode;
    document.getElementById("tabLogin").classList.toggle("active", mode === "login");
    document.getElementById("tabLogin").setAttribute("aria-selected", mode === "login");
    document.getElementById("tabSignup").classList.toggle("active", mode === "signup");
    document.getElementById("tabSignup").setAttribute("aria-selected", mode === "signup");
    document.getElementById("authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
    document.getElementById("emailField").style.display = mode === "signup" ? "" : "none";
    document.getElementById("authEmail").required = mode === "signup";
    document.getElementById("authError").style.display = "none";
  }

  async function boot() {
    setBoot("Loading…");
    try {
      var supa = await loadClient();
      db = supa.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          fetch: function (url, options) {
            return fetch(url, Object.assign({}, options, { signal: AbortSignal.timeout(15000) }));
          }
        }
      });
      setBoot("Checking for an existing session…");
      var session = null;
      for (var i = 0; i < 4 && !session; i++) {
        try {
          var r = await db.auth.getSession();
          session = r && r.data && r.data.session;
        } catch (e) {}
        if (!session && i < 3) await new Promise(function (res) { setTimeout(res, 1200); });
      }
      setBoot("");
      if (session && session.user) {
        window.location.replace("index.html");
        return;
      }
    } catch (e) {
      setBoot("Account service unreachable: " + ((e && e.message) || "unknown") + " — you can still use \u201cSkip for now\u201d.", true);
    }
    wireForm();
  }

  function wireForm() {
    // the submit button starts disabled in the HTML; only enable it once
    // the form is actually wired up
    document.getElementById("authSubmit").disabled = false;
    document.getElementById("tabLogin").addEventListener("click", function () { setMode("login"); });
    document.getElementById("tabSignup").addEventListener("click", function () { setMode("signup"); });

    document.getElementById("authForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!db) return;
      var username = document.getElementById("authUser").value.trim();
      var password = document.getElementById("authPass").value;
      var email = document.getElementById("authEmail").value.trim();
      var errEl = document.getElementById("authError");
      var statusEl = document.getElementById("authStatus");
      var btn = document.getElementById("authSubmit");
      errEl.style.display = "none";

      if (authMode === "signup" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = "Enter a valid email address (it's saved to your account, not verified yet).";
        errEl.style.display = "block";
        return;
      }

      btn.disabled = true;
      statusEl.innerHTML = '<span class="spinner"></span> ' + (authMode === "login" ? "Logging in…" : "Creating your account…");
      var wd = setTimeout(function () {
        btn.disabled = false;
        statusEl.textContent = "";
        errEl.textContent = "Supabase didn't answer — is the project paused? Check the dashboard, or try again.";
        errEl.style.display = "block";
      }, 20000);

      try {
        var result;
        if (authMode === "login") {
          result = await db.auth.signInWithPassword({ email: usernameToEmail(username), password: password });
        } else {
          result = await db.auth.signUp({
            email: usernameToEmail(username),
            password: password,
            options: { data: { username: username, email: email } }
          });
        }
        if (result.error) throw result.error;
        clearTimeout(wd);
        statusEl.textContent = "";
        btn.disabled = false;
        if (authMode === "signup" && !(result.data && result.data.session)) {
          statusEl.textContent = "Account created, but sign-in needs email confirmation switched OFF in Supabase (Authentication → Settings → Confirm email). Ask the site owner, then log in.";
          return;
        }
        window.location.replace("index.html");
      } catch (err) {
        clearTimeout(wd);
        btn.disabled = false;
        statusEl.textContent = "";
        errEl.textContent = friendly(err && err.message);
        errEl.style.display = "block";
      }
    });

    document.getElementById("skipAuthBtn").addEventListener("click", function () {
      try { sessionStorage.setItem("catalogLocalOnly", "1"); } catch (e) {}
      window.location.href = "index.html";
    });
  }

  setMode("login");
  boot();
})();
