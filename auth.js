/* ═══════════════════════════════════════════════════════════
   auth.js — Connexion gestionnaire, partagée par toutes les pages
   Parc à fluides · PAGANETTI THERMIQUE

   Simple verrou d'interface : il remplace l'ancien code PIN.
   - Identifiants dans le Sheet (onglet Configuration, ligne « gestionnaire » :
     B = nom · C = adresse mail · D = mot de passe). Rien n'est écrit dans les pages.
   - Le navigateur ne garde jamais le mot de passe, seulement un jeton fourni par le script.
     Ce jeton devient invalide si le mot de passe ou l'adresse change dans le Sheet,
     ou si le gestionnaire est supprimé : la connexion est alors coupée au chargement suivant.
   - Pas de durée d'expiration : la connexion reste active tant qu'elle est valable.
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const KEY       = 'pf_auth';        // connexion mémorisée { email, token, name }
    const KEY_EMAIL = 'pf_last_email';  // dernière adresse utilisée (pré-remplissage)

    let verified = false;               // connexion confirmée par le script depuis le chargement de la page
    let pending  = null;                // fenêtre de connexion déjà ouverte
    const listeners = [];

    // ── Session mémorisée ───────────────────────
    function getSession() {
        try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
    }
    function setSession(s) {
        try {
            localStorage.setItem(KEY, JSON.stringify({ email: s.email, token: s.token, name: s.name }));
            localStorage.setItem(KEY_EMAIL, s.email);
        } catch (e) { /* navigation privée : la connexion ne sera pas mémorisée */ }
        verified = true;
        notify();
    }
    function clearSession() {
        try { localStorage.removeItem(KEY); } catch (e) {}
        verified = false;
        notify();
    }
    function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

    // ── Appels au script ────────────────────────
    async function api(scriptUrl, action, data) {
        const u = new URL(scriptUrl);
        u.searchParams.set('action', action);
        u.searchParams.set('data', JSON.stringify(data));
        const r = await fetch(u.toString());
        return r.json();
    }

    // La connexion mémorisée est-elle encore valable ? (réseau indisponible : on la conserve)
    async function verify(scriptUrl) {
        const s = getSession();
        if (!s) return false;
        if (verified) return true;
        try {
            const res = await api(scriptUrl, 'checkSession', { email: s.email, token: s.token });
            if (res && res.ok) {
                verified = true;
                if (res.name && res.name !== s.name) setSession({ email: s.email, token: s.token, name: res.name });
                return true;
            }
            clearSession();
            return false;
        } catch (e) {
            return true;
        }
    }

    async function login(scriptUrl, email, password) {
        const res = await api(scriptUrl, 'login', { email: email, password: password });
        if (!res || !res.ok) throw new Error((res && res.error) || 'Connexion impossible.');
        setSession(res);
        return getSession();
    }

    function logout() { clearSession(); }

    // ── Fenêtre de connexion ────────────────────
    function injectStyle() {
        if (document.getElementById('pf-auth-style')) return;
        const st = document.createElement('style');
        st.id = 'pf-auth-style';
        st.textContent = [
            '.pf-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif;}',
            '.pf-ov.modal{background:rgba(13,33,55,.6);}',
            '.pf-ov.gate{background:#EDF0F3;}',
            '.pf-box{background:#fff;border:1px solid #D2D8DF;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);width:100%;max-width:380px;padding:26px 24px;color:#0D2137;}',
            '.pf-title{font-size:17px;font-weight:800;margin-bottom:4px;}',
            '.pf-msg{font-size:13px;color:#6B7A8A;line-height:1.5;margin-bottom:18px;}',
            '.pf-box label{display:block;font-size:11px;font-weight:700;color:#6B7A8A;letter-spacing:.05em;text-transform:uppercase;margin:0 0 6px;}',
            '.pf-box input{width:100%;padding:12px 14px;border:1.5px solid #D2D8DF;border-radius:10px;font-size:16px;font-family:inherit;margin-bottom:14px;background:#fff;color:#0D2137;}',
            '.pf-box input:focus{outline:none;border-color:#0D2137;}',
            '.pf-err{min-height:18px;font-size:12px;font-weight:600;color:#C0392B;margin:-4px 0 10px;}',
            '.pf-ok{width:100%;padding:13px;border:none;border-radius:10px;background:#0D2137;color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;}',
            '.pf-ok:disabled{opacity:.6;cursor:default;}',
            '.pf-cancel{width:100%;margin-top:8px;padding:10px;border:none;background:transparent;color:#6B7A8A;font-size:13px;font-family:inherit;cursor:pointer;text-decoration:underline;}',
            '.pf-back{display:block;text-align:center;margin-top:12px;font-size:13px;color:#6B7A8A;}',
            '.pf-chip{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:600;}',
            '.pf-chip a{color:inherit;opacity:.85;text-decoration:underline;cursor:pointer;}'
        ].join('');
        document.head.appendChild(st);
    }

    // opts : { message, cancellable, gate, backHref }
    function showLogin(scriptUrl, opts) {
        if (pending) return pending;
        opts = opts || {};
        injectStyle();

        pending = new Promise(function (resolve) {
            const ov = document.createElement('div');
            ov.className = 'pf-ov ' + (opts.gate ? 'gate' : 'modal');
            ov.innerHTML =
                '<form class="pf-box" autocomplete="on">' +
                  '<div class="pf-title">Connexion gestionnaire</div>' +
                  '<div class="pf-msg"></div>' +
                  '<label for="pf-email">Adresse mail</label>' +
                  '<input id="pf-email" name="username" type="email" autocomplete="username" autocapitalize="off" required>' +
                  '<label for="pf-pass">Mot de passe</label>' +
                  '<input id="pf-pass" name="password" type="password" autocomplete="current-password" required>' +
                  '<div class="pf-err"></div>' +
                  '<button type="submit" class="pf-ok">Se connecter</button>' +
                '</form>';
            document.body.appendChild(ov);

            const form = ov.querySelector('form');
            const msg  = ov.querySelector('.pf-msg');
            const err  = ov.querySelector('.pf-err');
            const mail = ov.querySelector('#pf-email');
            const pass = ov.querySelector('#pf-pass');
            const btn  = ov.querySelector('.pf-ok');

            msg.textContent = opts.message || 'Saisissez vos identifiants pour continuer.';
            try { mail.value = localStorage.getItem(KEY_EMAIL) || ''; } catch (e) {}

            if (opts.cancellable) {
                const c = document.createElement('button');
                c.type = 'button'; c.className = 'pf-cancel'; c.textContent = 'Annuler';
                c.onclick = function () { close(null); };
                form.appendChild(c);
            }
            if (opts.backHref) {
                const a = document.createElement('a');
                a.className = 'pf-back'; a.href = opts.backHref; a.textContent = '← Retour au tableau de bord';
                form.appendChild(a);
            }

            function close(result) {
                ov.remove();
                pending = null;
                resolve(result);
            }

            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                err.textContent = '';
                btn.disabled = true; btn.textContent = 'Connexion…';
                try {
                    const s = await login(scriptUrl, mail.value.trim(), pass.value);
                    close(s);
                } catch (ex) {
                    err.textContent = ex.message;
                    btn.disabled = false; btn.textContent = 'Se connecter';
                    pass.value = ''; pass.focus();
                }
            });

            setTimeout(function () { (mail.value ? pass : mail).focus(); }, 50);
        });
        return pending;
    }

    // ── Utilisation par les pages ───────────────

    // Page réservée : bloque l'affichage tant qu'aucun gestionnaire n'est connecté.
    async function gate(scriptUrl, opts) {
        opts = opts || {};
        if (await verify(scriptUrl)) return getSession();
        return showLogin(scriptUrl, {
            gate: true,
            backHref: opts.backHref,
            message: opts.message || 'Cette page est réservée aux gestionnaires.'
        });
    }

    // Action réservée dans une page publique : ouvre la fenêtre de connexion si besoin.
    // Retourne true si un gestionnaire est connecté, false si la personne annule.
    async function ensure(scriptUrl, message) {
        if (await verify(scriptUrl)) return true;
        const s = await showLogin(scriptUrl, {
            cancellable: true,
            message: message || 'Connexion gestionnaire requise.'
        });
        return !!s;
    }

    // « 👤 Nom · Se déconnecter » (ou « 🔒 Se connecter » dans les pages publiques)
    function renderChip(el, scriptUrl, opts) {
        opts = opts || {};
        injectStyle();
        function draw() {
            const s = getSession();
            el.textContent = '';
            el.classList.add('pf-chip');
            if (s) {
                const n = document.createElement('span');
                n.textContent = '👤 ' + (s.name || s.email);
                const o = document.createElement('a');
                o.textContent = 'Se déconnecter';
                o.onclick = function (e) {
                    e.preventDefault();
                    logout();
                    if (opts.reloadOnLogout) location.reload();
                };
                el.appendChild(n); el.appendChild(o);
            } else if (!opts.hideLogin) {
                const i = document.createElement('a');
                i.textContent = '🔒 Se connecter';
                i.onclick = function (e) {
                    e.preventDefault();
                    ensure(scriptUrl, opts.message);
                };
                el.appendChild(i);
            }
        }
        listeners.push(draw);
        draw();
    }

    window.PFAuth = {
        getSession: getSession, setSession: setSession, logout: logout,
        verify: verify, login: login, gate: gate, ensure: ensure, renderChip: renderChip
    };
})();
