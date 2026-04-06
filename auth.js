

const AUTH_WORKER = 'https://decodevinbus-auth.luismiguelgomesoliveira-014.workers.dev';

// Lê a sessão local para manter o usuário autenticado entre recarregamentos.
function getToken() { return localStorage.getItem('dvb_token'); }
function getUser()  { return JSON.parse(localStorage.getItem('dvb_user') || 'null'); }

let dvbAuditCache = null;
let dvbAuditCacheAt = 0;
const DVB_AUDIT_CACHE_MS = 4000;

let dvbHistoricoUserCache = null;
let dvbHistoricoUserCacheAt = 0;
let dvbHistoricoAdminCache = null;
let dvbHistoricoAdminCacheAt = 0;
const DVB_HISTORICO_CACHE_MS = 4000;

window.dvbHistoricoInvalidateCache = function() {
  dvbHistoricoUserCache = null;
  dvbHistoricoUserCacheAt = 0;
  dvbHistoricoAdminCache = null;
  dvbHistoricoAdminCacheAt = 0;
  dvbAuditCache = null;
  dvbAuditCacheAt = 0;
};

window.dvbHistoricoUsuarioGet = async function() {
  const token = getToken();
  if (!token) return { ok: false, single: [], group: [] };
  const now = Date.now();
  if (dvbHistoricoUserCache && now - dvbHistoricoUserCacheAt < DVB_HISTORICO_CACHE_MS) {
    return dvbHistoricoUserCache;
  }
  try {
    const res = await fetch(`${AUTH_WORKER}/user/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, single: [], group: [] };
    const out = {
      ok: true,
      single: Array.isArray(data.single) ? data.single : [],
      group: Array.isArray(data.group) ? data.group : []
    };
    dvbHistoricoUserCache = out;
    dvbHistoricoUserCacheAt = now;
    return out;
  } catch (_) {
    return { ok: false, single: [], group: [] };
  }
};

window.dvbHistoricoUsuarioPost = async function(kind, payload) {
  const token = getToken();
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${AUTH_WORKER}/user/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    dvbHistoricoInvalidateCache();
    return { ok: true, id: data.id };
  } catch (_) {
    return { ok: false };
  }
};

window.dvbHistoricoUsuarioDelete = async function(id) {
  const token = getToken();
  if (!token || id == null) return { ok: false };
  try {
    const res = await fetch(`${AUTH_WORKER}/user/history`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id })
    });
    if (!res.ok) return { ok: false };
    dvbHistoricoInvalidateCache();
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
};

window.dvbHistoricoAdminGet = async function() {
  const token = getToken();
  const u = getUser();
  if (!token || !u || !u.admin) return { ok: false, entries: [] };
  const now = Date.now();
  if (dvbHistoricoAdminCache && now - dvbHistoricoAdminCacheAt < DVB_HISTORICO_CACHE_MS) {
    return dvbHistoricoAdminCache;
  }
  try {
    const res = await fetch(`${AUTH_WORKER}/admin/user-history?limit=500`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, entries: [] };
    const out = { ok: true, entries: Array.isArray(data.entries) ? data.entries : [] };
    dvbHistoricoAdminCache = out;
    dvbHistoricoAdminCacheAt = now;
    return out;
  } catch (_) {
    return { ok: false, entries: [] };
  }
};

window.dvbRegistrarPesquisa = async function(payload) {
  const token = getToken();
  if (!token) return;
  const body = {
    tipo: String(payload.tipo || 'outro').slice(0, 32),
    placa: String(payload.placa || '').slice(0, 12).toUpperCase(),
    vin: String(payload.vin || '').slice(0, 24).toUpperCase(),
    detalhe: String(payload.detalhe || '').slice(0, 500),
    fleetName: String(payload.fleetName || '').slice(0, 120)
  };
  try {
    await fetch(`${AUTH_WORKER}/audit/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    dvbAuditCache = null;
  } catch (_) {}
};

window.dvbFetchSearchAuditLogs = async function() {
  const token = getToken();
  const u = getUser();
  if (!token || !u || !u.admin) return { ok: false, logs: [] };
  const now = Date.now();
  if (dvbAuditCache && now - dvbAuditCacheAt < DVB_AUDIT_CACHE_MS) return dvbAuditCache;
  try {
    const res = await fetch(`${AUTH_WORKER}/admin/search-audit?limit=500`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = { ok: false, logs: [], erro: data.erro };
      dvbAuditCache = err;
      dvbAuditCacheAt = now;
      return err;
    }
    const logs = Array.isArray(data.logs) ? data.logs : (Array.isArray(data.pesquisas) ? data.pesquisas : []);
    const ok = { ok: true, logs };
    dvbAuditCache = ok;
    dvbAuditCacheAt = now;
    return ok;
  } catch (_) {
    return { ok: false, logs: [] };
  }
};

function sanitizeNomeInput(value) {
  if (!value) return "";
  return value
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
}

function isNomeValido(value) {
  if (!value) return false;
  const nome = value.trim();
  return /^[\p{L}][\p{L}\s'-]*$/u.test(nome);
}

function salvarSessao(token, nome, setor, email, admin, id) {
  const o = { nome, setor, email, admin };
  if (id != null && id !== '') o.id = id;
  localStorage.setItem('dvb_token', token);
  localStorage.setItem('dvb_user', JSON.stringify(o));
}

function limparSessao() {
  localStorage.removeItem('dvb_token');
  localStorage.removeItem('dvb_user');
}

async function verificarSessao() {
  const token = getToken();
  if (!token) { mostrarTelaLogin(); return; }

  try {
    const res = await fetch(`${AUTH_WORKER}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const u = data.usuario;

      salvarSessao(token, u.nome, u.setor, u.email, u.admin, u.id);
      mostrarApp(u);
    } else {
      limparSessao();
      mostrarTelaLogin();
    }
  } catch {

    const user = getUser();
    if (user) mostrarApp(user);
    else mostrarTelaLogin();
  }
}

// Monta a interface de login e cadastro e conecta os eventos da tela.
function mostrarTelaLogin() {
  document.body.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'dvb-auth-overlay';
  overlay.innerHTML = `
    <div class="auth-overlay-scroll" style="
      position:fixed; inset:0; z-index:99999;
      background: radial-gradient(1000px 600px at 10% -10%, rgba(56,189,248,.15), transparent 60%),
                  radial-gradient(800px 500px at 90% 10%, rgba(34,197,94,.12), transparent 60%),
                  linear-gradient(180deg, var(--bg-elev), var(--bg));
      display:flex; align-items:flex-start; justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;
      padding: 20px;
      overflow-y:auto;
    ">
      <div style="
        position:absolute; inset:0; pointer-events:none; z-index:-1;
        background: linear-gradient(0deg, transparent 24%, rgba(255,255,255,.02) 25%, rgba(255,255,255,.02) 26%, transparent 27%),
                    linear-gradient(90deg, transparent 24%, rgba(255,255,255,.02) 25%, rgba(255,255,255,.02) 26%, transparent 27%);
        background-size: 40px 40px;
      "></div>

      <div class="auth-panel-scroll" style="
        background: var(--card); border: 1px solid var(--border); border-radius: 24px; 
        padding: clamp(24px, 4vh, 48px) clamp(20px, 4vw, 40px); width: 100%; max-width: 420px; 
        box-shadow: var(--shadow), 0 0 40px rgba(56,189,248,0.1);
        color: var(--text); position: relative; overflow-x: hidden; overflow-y: auto;
        max-height: calc(100vh - 40px);
        margin: auto 0;
      ">
        <div style="position:absolute; top:0; left:0; width:100%; height:4px; background:linear-gradient(90deg, var(--accent-2), var(--accent));"></div>
        
        <div style="text-align:center; margin-bottom:32px;">
          <div style="margin-bottom:16px;">
            <img src="assets/logo.svg" alt="Logo" style="width: 64px; height: 64px; filter: drop-shadow(0 0 10px rgba(56,189,248,0.4));">
          </div>
          <h1 style="
            margin:0; font-size:32px; font-weight:800; 
            background: linear-gradient(90deg, var(--text), #9fd8ff);
            -webkit-background-clip: text; background-clip: text; color: transparent;
            letter-spacing: -0.5px;
          ">DecodeVIN</h1>
          <p style="margin:8px 0 0; font-size:14px; color:var(--muted); font-weight:500;">
            Advanced Chassis Intelligence System
          </p>
        </div>

        <div style="display:flex; background:var(--bg); padding:4px; border-radius:12px; gap:4px; margin-bottom:32px; border:1px solid var(--border);">
          <button id="tab-login" onclick="dvbSwitchAuth(true)" style="
            flex:1; padding:10px; border-radius:8px; border:none; cursor:pointer;
            background:var(--accent-2); color:#000; font-weight:700; font-size:14px;
            transition: all 0.2s ease;
          ">Acessar</button>
          <button id="tab-cadastro" onclick="dvbSwitchAuth(false)" style="
            flex:1; padding:10px; border-radius:8px; border:none; cursor:pointer;
            background:transparent; color:var(--muted); font-weight:600; font-size:14px;
            transition: all 0.2s ease;
          ">Criar Conta</button>
        </div>

        <!-- Form Login -->
        <div id="form-login">
          <div style="margin-bottom:20px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">E-mail</label>
            <input id="login-email" type="email" placeholder="nome@exemplo.com" style="${inputStyle()}">
          </div>
          <div style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <label style="margin:0; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px;">Senha</label>
              <a href="#" onclick="dvbEsqueceuSenha(); return false;" style="font-size:11px; color:var(--muted); text-decoration:none; font-weight:600; transition:color 0.2s;" onmouseover="this.style.color='var(--accent-2)'" onmouseout="this.style.color='var(--muted)'">Esqueceu a senha?</a>
            </div>
            <div style="position:relative;">
              <input id="login-senha" type="password" placeholder="••••••••" style="${inputStyle()} padding-right:45px;">
              <button onclick="dvbTogglePass(event, 'login-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:5px;">👁️</button>
            </div>
          </div>
          <button onclick="dvbLogin()" style="${btnStyle()}">Entrar no Sistema</button>
        </div>

        <!-- Form Cadastro -->
        <div id="form-cadastro" style="display:none;">
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Nome Completo</label>
            <input id="cad-nome" type="text" placeholder="Seu nome" style="${inputStyle()}">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Setor</label>
            <select id="cad-setor" style="${inputStyle()} appearance:none; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2338bdf8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 12px top 50%; background-size: 12px auto; padding-right: 40px;">
              <option value="" disabled selected>Selecione seu setor</option>
              <option value="APLICAÇÃO">APLICAÇÃO</option>
              <option value="CRIPTO">CRIPTO</option>
              <option value="DIESELDIAG">DIESELDIAG</option>
              <option value="ECU TEST">ECU TEST</option>
              <option value="HARDWARE">HARDWARE</option>
              <option value="MOBILE">MOBILE</option>
              <option value="MOTODIAG">MOTODIAG</option>
              <option value="OBDMAP">OBDMAP</option>
              <option value="PROJETOS ESPECIAIS">PROJETOS ESPECIAIS</option>
              <option value="RESOLVE">RESOLVE</option>
              <option value="T.I INTERNO">T.I INTERNO</option>
              <option value="T.I TELEMETRIA">T.I TELEMETRIA</option>
              <option value="TELEMETRIA ADM">TELEMETRIA ADM</option>
              <option value="TELEMETRIA HW">TELEMETRIA HW</option>
              <option value="TELEMETRIA SW">TELEMETRIA SW</option>
            </select>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">E-mail Corporativo</label>
            <input id="cad-email" type="email" placeholder="seu@email.com" style="${inputStyle()}">
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Defina uma Senha</label>
            <div style="position:relative;">
              <input id="cad-senha" type="password" placeholder="Mínimo 6 caracteres" style="${inputStyle()} padding-right:45px;">
              <button onclick="dvbTogglePass(event, 'cad-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:5px;">👁️</button>
            </div>
            <p style="margin:8px 0 0; font-size:11px; color:var(--muted); font-style:italic;">
              Requisito: Mínimo 6 caracteres, uma letra maiúscula e um caracter especial.
            </p>
          </div>
          <button onclick="dvbCadastrar()" style="${btnStyle('var(--accent)')}">Solicitar Credenciais</button>
        </div>

        <div id="dvb-msg" style="
          margin-top:20px; padding:12px 16px; border-radius:12px;
          font-size:13px; display:none; font-weight:500; text-align:center;
          animation: slideUp 0.3s ease-out;
        "></div>
      </div>
    </div>
    <style>
      @keyframes slideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      #dvb-auth-overlay input:focus { border-color: var(--accent-2) !important; box-shadow: 0 0 0 3px rgba(56,189,248,0.15) !important; }
      #dvb-auth-overlay .auth-overlay-scroll,
      #dvb-auth-overlay .auth-panel-scroll {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      #dvb-auth-overlay .auth-overlay-scroll::-webkit-scrollbar,
      #dvb-auth-overlay .auth-panel-scroll::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
    </style>
  `;
  document.body.appendChild(overlay);
  document.body.style.display = '';

  const nomeInput = document.getElementById('cad-nome');
  if (nomeInput) {
    nomeInput.addEventListener('input', () => {
      const sanitized = sanitizeNomeInput(nomeInput.value);
      if (sanitized !== nomeInput.value) nomeInput.value = sanitized;
    });
  }
}

function inputStyle() {
  return `
    display:block; width:100%; box-sizing:border-box;
    padding:12px 16px;
    background: var(--bg); border: 1px solid var(--border); border-radius:10px;
    color: var(--text); font-size:14px; outline:none;
    transition: all 0.2s ease;
  `;
}

function btnStyle(bg = 'var(--accent-2)') {
  const color = bg === 'var(--accent-2)' ? '#000' : '#052e16';
  return `
    width:100%; padding:14px; border-radius:12px; border:none; cursor:pointer;
    background: ${bg}; color: ${color}; font-weight:800; font-size:15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: transform 0.1s ease, filter 0.2s ease;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  `;
}

window.dvbConfirm = function(titulo, mensagem, callback) {
  const existing = document.getElementById('dvb-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dvb-confirm-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
    z-index: 1000002; display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.3s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--card); border: 1px solid var(--border); border-radius: 24px;
      width: 90%; max-width: 400px; padding: 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      text-align: center; animation: slideUp 0.3s ease-out;
    ">
      <div style="font-size: 40px; margin-bottom: 20px;">⚠️</div>
      <h3 style="margin: 0 0 12px; color: var(--text); font-size: 20px; font-weight: 800;">${titulo}</h3>
      <p style="margin: 0 0 32px; color: var(--muted); font-size: 14px; line-height: 1.6;">${mensagem}</p>
      
      <div style="display: flex; gap: 12px;">
        <button id="dvb-confirm-cancel" style="
          flex: 1; padding: 14px; border-radius: 12px; border: 1px solid var(--border);
          background: rgba(255,255,255,0.03); color: var(--text); font-size: 14px;
          font-weight: 700; cursor: pointer; transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
          Cancelar
        </button>
        <button id="dvb-confirm-ok" style="
          flex: 1; padding: 14px; border-radius: 12px; border: none;
          background: var(--danger); color: white; font-size: 14px;
          font-weight: 700; cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
        " onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
          Confirmar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('dvb-confirm-cancel').onclick = () => overlay.remove();
  document.getElementById('dvb-confirm-ok').onclick = () => {
    overlay.remove();
    if (callback) callback();
  };
};

function dvbMsg(texto, tipo) {
  const el = document.getElementById('dvb-msg');
  if (!texto) { el.style.display = 'none'; return; }
  el.style.display    = 'block';
  el.style.background = tipo === 'erro' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)';
  el.style.color      = tipo === 'erro' ? '#fca5a5' : '#86efac';
  el.style.border     = `1px solid ${tipo === 'erro' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`;
  el.textContent      = (tipo === 'erro' ? '⚠️ ' : '✅ ') + texto;
}

window.dvbTogglePass = function(event, id) {
  const el = document.getElementById(id);
  if (el.type === 'password') {
    el.type = 'text';
    event.target.textContent = '🙈';
  } else {
    el.type = 'password';
    event.target.textContent = '👁️';
  }
};

window.dvbLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  if (!email || !senha) { dvbMsg('Preencha e-mail e senha.', 'erro'); return; }

  dvbMsg('Verificando...', 'ok');
  try {
    const res  = await fetch(`${AUTH_WORKER}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (!res.ok) { dvbMsg(data.erro || 'Erro ao entrar.', 'erro'); return; }

    salvarSessao(data.token, data.nome, data.setor, data.email, data.admin, data.id);
    document.getElementById('dvb-auth-overlay').remove();
    mostrarApp({ nome: data.nome, setor: data.setor, email: data.email, admin: data.admin, id: data.id });
  } catch {
    dvbMsg('Erro de conexão com o servidor.', 'erro');
  }
};

// Valida e envia os dados de cadastro para o worker de autenticação.
window.dvbCadastrar = async function() {
  const nomeInput = document.getElementById('cad-nome');
  const nome  = sanitizeNomeInput((nomeInput?.value || '').trim());
  const setor = document.getElementById('cad-setor').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;
  if (!nome || !setor || !email || !senha) { dvbMsg('Preencha todos os campos.', 'erro'); return; }
  if (!isNomeValido(nome)) {
    dvbMsg('O nome deve conter apenas letras e espaços (sem caracteres especiais).', 'erro');
    return;
  }
  if (nomeInput) nomeInput.value = nome;

  if (!email.toLowerCase().endsWith('@chiptronic.com.br')) {
    dvbMsg('Apenas e-mails @chiptronic.com.br são permitidos.', 'erro');
    return;
  }

  if (senha.length < 6) { dvbMsg('Senha deve ter pelo menos 6 caracteres.', 'erro'); return; }
  if (!/[A-Z]/.test(senha) || !/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
    dvbMsg('A senha deve conter uma letra maiúscula e um caracter especial.', 'erro');
    return;
  }

  dvbMsg('Enviando cadastro...', 'ok');
  try {
    const res = await fetch(`${AUTH_WORKER}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, setor, email, senha })
    });
    const data = await res.json();
    if (!res.ok) { dvbMsg(data.erro || 'Erro ao cadastrar.', 'erro'); return; }
    
    // Notifica os administradores sobre o novo cadastro
    try {
      await fetch(`${AUTH_WORKER}/admin/notify-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, setor, email })
      });
    } catch (err) {
      console.warn("Falha ao notificar administradores:", err);
    }

    dvbMsg('Cadastro enviado! Aguarde aprovação do administrador.', 'ok');
  } catch {
    dvbMsg('Erro de conexão com o servidor.', 'erro');
  }
};

function mostrarApp(usuario) {
  const oldBar = document.getElementById('dvb-user-bar');
  if (oldBar) oldBar.remove();

  const barra = document.createElement('div');
  barra.id = 'dvb-user-bar';
  barra.style.cssText = `
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 56px;
    font-family: system-ui, -apple-system, sans-serif;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  `;

  const iniciais = usuario.nome
    ? usuario.nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const setorExibido = usuario.setor || 'Operador';
  const emailExibido = usuario.email || '';

  const notificationIcon = usuario.admin ? `
    <div id="dvb-notif-trigger" style="position:relative; cursor:pointer; margin-right:15px; display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border); transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
      <span style="font-size:18px;">🔔</span>
      <div id="dvb-notif-badge" style="position:absolute; top:-5px; right:-5px; background:var(--danger); color:white; font-size:10px; font-weight:800; width:18px; height:18px; border-radius:50%; display:none; align-items:center; justify-content:center; border:2px solid var(--bg-elev); box-shadow:0 2px 5px rgba(0,0,0,0.3);">0</div>
      
      <style>
        @keyframes pulseNotif {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { transform: scale(1.2); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .notif-pulse { animation: pulseNotif 2s infinite; }
      </style>

      <div id="dvb-notif-dropdown" style="position:absolute; top:120%; right:0; width:300px; background:var(--card); border:1px solid var(--border); border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.4); display:none; flex-direction:column; overflow:hidden; z-index:1001; animation:slideUp 0.2s ease-out;">
        <div style="padding:15px; border-bottom:1px solid var(--border); background:rgba(255,255,255,0.02); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; font-weight:700; color:var(--text);">Notificações</span>
          <span id="dvb-notif-count-text" style="font-size:11px; color:var(--muted);">0 pendentes</span>
        </div>
        <div id="dvb-notif-list" style="max-height:350px; overflow-y:auto; padding:5px;">
          <div style="padding:20px; text-align:center; color:var(--muted); font-size:12px;">Nenhuma notificação nova</div>
        </div>
        <div style="padding:10px; border-top:1px solid var(--border); text-align:center;">
          <a href="#" onclick="dvbAdmin(); return false;" style="font-size:11px; color:var(--accent-2); text-decoration:none; font-weight:600;">Ver todos os usuários</a>
        </div>
      </div>
    </div>
  ` : '';

  barra.innerHTML = `
    <div onclick="dvbGoToMenu()" style="display:flex; align-items:center; gap:12px; cursor:pointer;" title="Voltar ao Menu">
      <img src="assets/logo.svg" alt="Logo" style="width: 32px; height: 32px;">
      <div style="display:flex; flex-direction:column;">
        <span style="color:var(--text); font-weight:800; font-size:18px; letter-spacing:-0.5px; line-height:1;">DecodeVIN</span>
        <span style="color:var(--accent-2); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Chiptronic</span>
      </div>
    </div>

    <div style="display:flex; align-items:center;">
      ${notificationIcon}
      <div style="position:relative;">
        <div id="dvb-user-trigger" style="
          display:flex; align-items:center; gap:12px; padding:6px 12px; border-radius:12px;
          background: rgba(255,255,255,0.03); border: 1px solid var(--border); cursor:pointer;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
          <div style="
            width:32px; height:32px; border-radius:50%; background:var(--accent-2);
            display:flex; align-items:center; justify-content:center;
            color:#000; font-weight:800; font-size:14px;
          ">${iniciais}</div>
          <div style="display:flex; flex-direction:column; text-align:left;">
            <span style="color:var(--text); font-size:13px; font-weight:700; line-height:1.2;">${usuario.nome}</span>
            <span style="color:var(--muted); font-size:11px; font-weight:500;">${setorExibido}</span>
          </div>
          <span style="color:var(--muted); font-size:10px; transition: transform 0.2s;" id="dvb-arrow">▲</span>
        </div>

        <div id="dvb-user-dropdown" style="
          position:absolute; top:110%; right:0; width:260px; 
          background: var(--card); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.4); display:none; flex-direction:column;
          overflow:hidden; animation: slideUp 0.2s ease-out;
        ">
          <div style="padding:20px; border-bottom:1px solid var(--border); background:rgba(255,255,255,0.02);">
            <div style="color:var(--text); font-size:14px; font-weight:700;">${usuario.nome}</div>
            <div style="color:var(--accent-2); font-size:11px; margin-top:2px; font-weight:600;">${setorExibido}</div>
            <div style="color:var(--muted); font-size:11px; margin-top:4px; word-break:break-all;">${emailExibido}</div>
          </div>
          
          <div style="padding:8px;">
            ${usuario.admin ? `
              <a href="#" onclick="dvbAdmin(); return false;" style="
                display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px;
                color:var(--text); text-decoration:none; font-size:13px; font-weight:600;
                transition: background 0.2s;
              " onmouseover="this.style.background='rgba(56,189,248,0.1)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:16px;">⚙️</span> Painel Admin
              </a>
            ` : ''}
            
            <a href="#" onclick="dvbEditarPerfil(); return false;" style="
              display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px;
              color:var(--text); text-decoration:none; font-size:13px; font-weight:600;
              transition: background 0.2s;
            " onmouseover="this.style.background='rgba(56,189,248,0.1)'" onmouseout="this.style.background='transparent'">
              <span style="font-size:16px;">👤</span> Editar Perfil
            </a>

            <a href="#" onclick="dvbLogout(); return false;" style="
              display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px;
              color:var(--danger); text-decoration:none; font-size:13px; font-weight:600;
              transition: background 0.2s;
            " onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
              <span style="font-size:16px;">↪️</span> Sair
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.prepend(barra);

  const trigger  = document.getElementById('dvb-user-trigger');
  const dropdown = document.getElementById('dvb-user-dropdown');
  const arrow    = document.getElementById('dvb-arrow');

  trigger.onclick = (e) => {
    e.stopPropagation();
    if (usuario.admin) {
      document.getElementById('dvb-notif-dropdown').style.display = 'none';
    }
    const isOpen = dropdown.style.display === 'flex';
    dropdown.style.display = isOpen ? 'none' : 'flex';
    arrow.style.transform  = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  };

  if (usuario.admin) {
    const notifTrigger = document.getElementById('dvb-notif-trigger');
    const notifDropdown = document.getElementById('dvb-notif-dropdown');
    notifTrigger.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = 'none';
      arrow.style.transform = 'rotate(0deg)';
      const isOpen = notifDropdown.style.display === 'flex';
      notifDropdown.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen) checkNewRegistrations();
    };
  }

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
    arrow.style.transform  = 'rotate(0deg)';
    if (usuario.admin) {
      document.getElementById('dvb-notif-dropdown').style.display = 'none';
    }
  });

  if (usuario.admin) {
    checkNewRegistrations();
    setInterval(checkNewRegistrations, 10000); // Checa a cada 10 segundos para ser "em tempo real"
  }

  if (typeof window.renderHistory === 'function') window.renderHistory();
}

// Alterna entre as abas de login e cadastro
window.dvbSwitchAuth = function(isLogin) {
  const formLogin = document.getElementById('form-login');
  const formCad   = document.getElementById('form-cadastro');
  if (formLogin) formLogin.style.display = isLogin ? 'block' : 'none';
  if (formCad) formCad.style.display = isLogin ? 'none' : 'block';

  const tabLogin = document.getElementById('tab-login');
  const tabCad   = document.getElementById('tab-cadastro');

  if (tabLogin) {
    tabLogin.style.background = isLogin ? 'var(--accent-2)' : 'transparent';
    tabLogin.style.color      = isLogin ? '#000' : 'var(--muted)';
    tabLogin.style.fontWeight = isLogin ? '700' : '600';
  }

  if (tabCad) {
    tabCad.style.background   = isLogin ? 'transparent' : 'var(--accent-2)';
    tabCad.style.color        = isLogin ? 'var(--muted)' : '#000';
    tabCad.style.fontWeight   = isLogin ? '600' : '700';
  }

  if (!isLogin) {
    const cadNome = document.getElementById('cad-nome');
    const cadSetor = document.getElementById('cad-setor');
    const cadEmail = document.getElementById('cad-email');
    const cadSenha = document.getElementById('cad-senha');
    if (cadNome) cadNome.value = '';
    if (cadSetor) cadSetor.selectedIndex = 0;
    if (cadEmail) cadEmail.value = '';
    if (cadSenha) cadSenha.value = '';
  }

  dvbMsg('', '');
};

async function checkNewRegistrations() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${AUTH_WORKER}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    
    console.log("DEBUG: Resposta do Worker /admin/users:", data);
    
    // Filtra usuários não aprovados (novos cadastros)
    const pendentes = (data.usuarios || []).filter(u => !u.aprovado);
    
    // Filtra usuários que solicitaram reset de senha (que tenham reset_senha_pendente no DB)
    const resets = (data.usuarios || []).filter(u => u.reset_senha_pendente == 1 || u.reset_senha_pendente === true || u.reset_senha_pendente === '1');

    const badge = document.getElementById('dvb-notif-badge');
    const list = document.getElementById('dvb-notif-list');
    const countText = document.getElementById('dvb-notif-count-text');

    const totalNotif = pendentes.length + resets.length;
    
    console.log("DEBUG: Pendentes:", pendentes.length, "Resets:", resets.length);

    if (totalNotif > 0) {
      badge.style.display = 'flex';
      badge.textContent = totalNotif;
      badge.classList.add('notif-pulse');
      countText.textContent = `${totalNotif} pendentes`;
      
      let html = '';
      
      // Lista novos cadastros
      pendentes.forEach(u => {
        html += `
          <div style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
            <div style="font-size:10px; color:#fbbf24; font-weight:800; text-transform:uppercase; margin-bottom:4px;">🆕 Novo Cadastro</div>
            <div style="font-size:12px; font-weight:700; color:var(--text);">${u.nome}</div>
            <div style="font-size:10px; color:var(--accent-2); text-transform:uppercase;">${u.setor || 'Geral'}</div>
            <div style="font-size:10px; color:var(--muted); margin-top:2px;">${u.email}</div>
            <div style="margin-top:8px; display:flex; gap:5px;">
              <button onclick="dvbAprovarNotif(${u.id}, 1)" style="flex:1; padding:5px; border-radius:6px; border:none; background:#14532d; color:#86efac; font-size:10px; font-weight:700; cursor:pointer;">Aprovar</button>
              <button onclick="dvbDeletarNotif(${u.id}, '${u.nome}')" style="padding:5px; border-radius:6px; border:none; background:#3f0f0f; color:#fca5a5; font-size:10px; font-weight:700; cursor:pointer;">Excluir</button>
            </div>
          </div>
        `;
      });

      // Lista solicitações de senha
      resets.forEach(u => {
        html += `
          <div style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
            <div style="font-size:10px; color:#38bdf8; font-weight:800; text-transform:uppercase; margin-bottom:4px;">🔑 Reset de Senha</div>
            <div style="font-size:12px; font-weight:700; color:var(--text);">${u.nome}</div>
            <div style="font-size:10px; color:var(--muted); margin-top:2px;">${u.email}</div>
            <div style="margin-top:8px; display:flex; gap:5px;">
              <button onclick="dvbAprovarResetNotif(${u.id}, '${u.nome}')" style="flex:1; padding:5px; border-radius:6px; border:none; background:#1e3a8a; color:#bfdbfe; font-size:10px; font-weight:700; cursor:pointer;">Aprovar Nova Senha</button>
              <button onclick="dvbRecusarResetNotif(${u.id})" style="padding:5px; border-radius:6px; border:none; background:#3f0f0f; color:#fca5a5; font-size:10px; font-weight:700; cursor:pointer;">Recusar</button>
            </div>
          </div>
        `;
      });

      list.innerHTML = html;
    } else {
      badge.style.display = 'none';
      badge.classList.remove('notif-pulse');
      countText.textContent = '0 pendentes';
      list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted); font-size:12px;">Nenhuma notificação nova</div>';
    }
  } catch (err) {
    console.error("Erro ao checar notificações:", err);
  }
}

window.dvbAprovarResetNotif = async function(id, nome) {
  window.dvbConfirm('Aprovar Senha', `Deseja aprovar a nova senha solicitada por ${nome}?`, async () => {
    const token = getToken();
    try {
      const res = await fetch(`${AUTH_WORKER}/admin/approve-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, aprovar: true })
      });
      if (!res.ok) {
        const data = await res.json();
        dvbAlert('Erro', data.erro || 'Erro ao aprovar reset.', 'erro');
      }
      checkNewRegistrations();
    } catch (err) {
      dvbAlert('Erro de Conexão', 'Não foi possível contatar o servidor.', 'erro');
    }
  });
};

window.dvbRecusarResetNotif = async function(id) {
  const token = getToken();
  try {
    const res = await fetch(`${AUTH_WORKER}/admin/approve-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, aprovar: false })
    });
    if (!res.ok) {
      const data = await res.json();
      dvbAlert('Erro', data.erro || 'Erro ao recusar reset.', 'erro');
    }
    checkNewRegistrations();
  } catch (err) {
    dvbAlert('Erro de Conexão', 'Não foi possível contatar o servidor.', 'erro');
  }
};

window.dvbAprovarNotif = async function(id, aprovado) {
  await window.dvbAprovar(id, aprovado);
  checkNewRegistrations();
};

window.dvbDeletarNotif = async function(id, nome) {
  window.dvbConfirm('Excluir Cadastro', `Deseja realmente excluir o cadastro de ${nome}?`, async () => {
    const token = getToken();
    await fetch(`${AUTH_WORKER}/admin/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id })
    });
    checkNewRegistrations();
  });
};

window.dvbLogout = function() {
  limparSessao();
  location.reload();
};

window.dvbEditarPerfil = function() {
  const user = getUser();
  if (!user) return;

  const existing = document.getElementById('dvb-edit-profile-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dvb-edit-profile-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
    z-index: 1000005; display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.3s ease;
  `;

  const setores = [
    "APLICAÇÃO", "CRIPTO", "DIESELDIAG", "ECU TEST", "HARDWARE", 
    "MOBILE", "MOTODIAG", "OBDMAP", "PROJETOS ESPECIAIS", "RESOLVE", 
    "T.I INTERNO", "T.I TELEMETRIA", "TELEMETRIA ADM", "TELEMETRIA HW", "TELEMETRIA SW"
  ];

  const setorOptions = setores.map(s => 
    `<option value="${s}" ${user.setor === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  // Estilos locais para garantir funcionamento fora do escopo de login
  const localInputStyle = `width:100%; padding:12px 16px; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:12px; outline:none; font-size:14px; transition:all 0.2s;`;
  const localBtnStyle = `width:100%; padding:14px; background:var(--accent-2); color:#000; border:none; border-radius:12px; font-weight:700; font-size:15px; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 15px rgba(56,189,248,0.2);`;

  overlay.innerHTML = `
    <div style="
      background: var(--card); border: 1px solid var(--border); border-radius: 24px;
      width: 95%; max-width: 450px; padding: 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      animation: slideUp 0.3s ease-out; position: relative;
    ">
      <button onclick="document.getElementById('dvb-edit-profile-overlay').remove()" style="position:absolute; right:20px; top:20px; background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px;">&times;</button>
      
      <h2 style="margin: 0 0 24px; color: var(--text); font-size: 22px; font-weight: 800; text-align:center;">Editar Perfil</h2>
      
      <div id="edit-msg" style="margin-bottom:20px; padding:10px; border-radius:10px; font-size:12px; display:none; text-align:center;"></div>

      <div style="margin-bottom:16px;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:8px;">Nome Completo</label>
        <input id="edit-nome" type="text" value="${user.nome}" style="${localInputStyle}">
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:8px;">Setor</label>
        <select id="edit-setor" style="${localInputStyle} appearance:none; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2338bdf8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 12px top 50%; background-size: 12px auto;">
          ${setorOptions}
        </select>
      </div>

      <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid var(--border);">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:12px;">Alterar Senha (Opcional)</label>
        <div style="position:relative; margin-bottom:10px;">
          <input id="edit-senha" type="password" placeholder="Nova senha (deixe vazio para manter)" style="${localInputStyle} padding-right:45px;">
          <button onclick="dvbTogglePass(event, 'edit-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px;">👁️</button>
        </div>
        <p style="margin:8px 0 0; font-size:11px; color:var(--muted); font-style:italic;">
          Requisito: Mínimo 6 caracteres, uma letra maiúscula e um caracter especial.
        </p>
      </div>

      <button onclick="dvbSalvarPerfil()" style="${localBtnStyle}">Salvar Alterações</button>
    </div>
  `;

  document.body.appendChild(overlay);
};

window.dvbSalvarPerfil = async function() {
  const nome = document.getElementById('edit-nome').value.trim();
  const setor = document.getElementById('edit-setor').value;
  const senha = document.getElementById('edit-senha').value;
  const msgEl = document.getElementById('edit-msg');
  const token = getToken();

  if (!nome) {
    msgEl.textContent = "Nome não pode ficar vazio.";
    msgEl.style.color = "#fca5a5";
    msgEl.style.display = "block";
    return;
  }

  if (senha) {
    if (senha.length < 6) {
      msgEl.textContent = "A senha deve ter pelo menos 6 caracteres.";
      msgEl.style.color = "#fca5a5"; msgEl.style.display = "block";
      return;
    }
    if (!/[A-Z]/.test(senha) || !/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
      msgEl.textContent = "A senha deve conter uma letra maiúscula e um caracter especial.";
      msgEl.style.color = "#fca5a5"; msgEl.style.display = "block";
      return;
    }
  }

  msgEl.textContent = "Salvando...";
  msgEl.style.color = "var(--accent-2)";
  msgEl.style.display = "block";

  try {
    const res = await fetch(`${AUTH_WORKER}/user/update-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nome, setor, senha: senha || undefined })
    });

    const data = await res.json();
    if (!res.ok) {
      msgEl.textContent = data.erro || "Erro ao salvar.";
      msgEl.style.color = "#fca5a5";
      return;
    }

    // Atualiza a sessão local
    const user = getUser();
    user.nome = nome;
    user.setor = setor;
    localStorage.setItem('dvb_user', JSON.stringify(user));

    msgEl.textContent = "Perfil atualizado com sucesso!";
    msgEl.style.color = "#86efac";
    
    setTimeout(() => {
      const editOverlay = document.getElementById('dvb-edit-profile-overlay');
      if (editOverlay) editOverlay.remove();
      location.reload(); // Recarrega para atualizar o nome na barra superior
    }, 1500);

  } catch (err) {
    msgEl.textContent = "Erro de conexão.";
    msgEl.style.color = "#fca5a5";
  }
};

window.dvbEsqueceuSenha = function() {
  const existing = document.getElementById('dvb-forgot-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dvb-forgot-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
    z-index: 1000010; display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.3s ease;
  `;

  const localInputStyle = `width:100%; padding:12px 16px; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:12px; outline:none; font-size:14px; transition:all 0.2s;`;
  const localBtnStyle = `width:100%; padding:14px; background:var(--accent-2); color:#000; border:none; border-radius:12px; font-weight:700; font-size:15px; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 15px rgba(56,189,248,0.2);`;

  overlay.innerHTML = `
    <div style="
      background: var(--card); border: 1px solid var(--border); border-radius: 24px;
      width: 95%; max-width: 400px; padding: 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      animation: slideUp 0.3s ease-out; position: relative;
    ">
      <button onclick="document.getElementById('dvb-forgot-overlay').remove()" style="position:absolute; right:20px; top:20px; background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px;">&times;</button>
      
      <div style="font-size: 40px; margin-bottom: 20px; text-align:center;">🔑</div>
      <h2 style="margin: 0 0 12px; color: var(--text); font-size: 22px; font-weight: 800; text-align:center;">Recuperar Acesso</h2>
      <p style="margin: 0 0 24px; color: var(--muted); font-size: 14px; line-height: 1.6; text-align:center;">
        Informe seu e-mail e a nova senha desejada. Um administrador aprovará sua solicitação.
      </p>
      
      <div id="forgot-msg" style="margin-bottom:20px; padding:10px; border-radius:10px; font-size:12px; display:none; text-align:center;"></div>

      <div style="margin-bottom:16px;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:8px;">Seu E-mail</label>
        <input id="forgot-email" type="email" placeholder="seu@email.com" style="${localInputStyle}">
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:8px;">Nova Senha</label>
        <div style="position:relative;">
          <input id="forgot-senha" type="password" placeholder="Mínimo 6 caracteres" style="${localInputStyle} padding-right:45px;">
          <button onclick="dvbTogglePass(event, 'forgot-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px;">👁️</button>
        </div>
        <p style="margin:8px 0 0; font-size:11px; color:var(--muted); font-style:italic;">
          Requisito: Mínimo 6 caracteres, uma letra maiúscula e um caracter especial.
        </p>
      </div>

      <div style="margin-bottom:24px;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--accent-2); text-transform:uppercase; margin-bottom:8px;">Confirmar Nova Senha</label>
        <div style="position:relative;">
          <input id="forgot-senha-conf" type="password" placeholder="Repita a nova senha" style="${localInputStyle} padding-right:45px;">
          <button onclick="dvbTogglePass(event, 'forgot-senha-conf')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px;">👁️</button>
        </div>
      </div>

      <button onclick="dvbEnviarRecuperacao()" style="${localBtnStyle}">Solicitar Nova Senha</button>
    </div>
  `;

  document.body.appendChild(overlay);
};

window.dvbEnviarRecuperacao = async function() {
  const email = document.getElementById('forgot-email').value.trim();
  const senha = document.getElementById('forgot-senha').value;
  const conf  = document.getElementById('forgot-senha-conf').value;
  const msgEl = document.getElementById('forgot-msg');

  if (!email || !email.includes('@')) {
    msgEl.textContent = "Informe um e-mail válido.";
    msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)"; msgEl.style.display = "block";
    return;
  }
  if (senha.length < 6) {
    msgEl.textContent = "A senha deve ter pelo menos 6 caracteres.";
    msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)"; msgEl.style.display = "block";
    return;
  }
  if (!/[A-Z]/.test(senha) || !/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
    msgEl.textContent = "A senha deve conter uma letra maiúscula e um caracter especial.";
    msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)"; msgEl.style.display = "block";
    return;
  }
  if (senha !== conf) {
    msgEl.textContent = "As senhas não coincidem.";
    msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)"; msgEl.style.display = "block";
    return;
  }

  msgEl.textContent = "Enviando solicitação...";
  msgEl.style.color = "var(--accent-2)"; msgEl.style.background = "rgba(56, 189, 248, 0.1)"; msgEl.style.display = "block";

  try {
    const res = await fetch(`${AUTH_WORKER}/user/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    if (res.ok) {
      msgEl.textContent = "Solicitação enviada! Um administrador aprovará sua nova senha em breve.";
      msgEl.style.color = "#86efac"; msgEl.style.background = "rgba(34, 197, 94, 0.1)";

      setTimeout(() => {
        const forgotOverlay = document.getElementById('dvb-forgot-overlay');
        if (forgotOverlay) forgotOverlay.remove();
      }, 5000);
    } else {
      const data = await res.json();
      msgEl.textContent = data.erro || "Erro no servidor.";
      msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)";
    }
  } catch (err) {
    msgEl.textContent = "Erro de conexão.";
    msgEl.style.color = "#fca5a5"; msgEl.style.background = "rgba(239, 68, 68, 0.1)";
  }
};

window.dvbGoToMenu = function() {

  const single = document.getElementById('singleDecoder');
  const group = document.getElementById('groupDecoder');
  if (single) single.style.display = 'none';
  if (group) group.style.display = 'none';

  const selection = document.getElementById('selectionScreen');
  if (selection) selection.style.display = 'flex';

  if (window.clearUI) window.clearUI();
};

window.dvbAdmin = async function() {
  const token = getToken();
  const res   = await fetch(`${AUTH_WORKER}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data  = await res.json();

  const existing = document.getElementById('dvb-admin-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'dvb-admin-modal';

  const users = data.usuarios || [];
  const resets = users.filter(u => u.reset_senha_pendente == 1 || u.reset_senha_pendente === true || u.reset_senha_pendente === '1');

  const linhasUsers = users.map(u => `
    <tr id="user-row-${u.id}" style="border-bottom:1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
      <td style="padding:16px;">
        <div style="font-weight:600; color:var(--text);">${u.nome}</div>
        <div style="font-size:11px; color:var(--accent-2); text-transform:uppercase;">${u.setor || 'Geral'}</div>
      </td>
      <td style="padding:16px; color:var(--muted); font-size:12px;">${u.email}</td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbAprovar(${u.id}, ${u.aprovado ? 0 : 1})" style="padding:4px 10px; border-radius:6px; border:none; cursor:pointer; background:${u.aprovado ? '#7f1d1d' : '#14532d'}; color:${u.aprovado ? '#fca5a5' : '#86efac'}; font-size:12px;">${u.aprovado ? 'Revogar' : 'Aprovar'}</button>
      </td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbPromover(${u.id}, ${u.admin ? 0 : 1})" style="padding:4px 10px; border-radius:6px; border:none; cursor:pointer; background:#1e3a5f; color:#7dd3fc; font-size:12px;">${u.admin ? 'Remover admin' : 'Tornar admin'}</button>
      </td>
      <td style="padding:8px; font-size:11px; color:#64748b;">${u.last_login || '—'}</td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbDeletar(event, ${u.id}, '${u.nome.replace(/'/g, "\\'")}')" style="padding:4px 10px; border-radius:6px; border:none; cursor:pointer; background:#3f0f0f; color:#fca5a5; font-size:12px;">🗑 Excluir</button>
      </td>
    </tr>
  `).join('');

  const linhasResets = resets.map(u => `
    <tr style="border-bottom:1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
      <td style="padding:16px;">
        <div style="font-weight:600; color:var(--text);">${u.nome}</div>
        <div style="font-size:11px; color:var(--muted);">${u.email}</div>
      </td>
      <td style="padding:16px; text-align:center;">
        <div style="display:flex; gap:8px; justify-content:center;">
          <button onclick="dvbAprovarResetSenha(${u.id}, true)" style="padding:6px 12px; border-radius:8px; border:none; cursor:pointer; background:#1e3a8a; color:#bfdbfe; font-size:12px; font-weight:700;">Aprovar Nova Senha</button>
          <button onclick="dvbAprovarResetSenha(${u.id}, false)" style="padding:6px 12px; border-radius:8px; border:none; cursor:pointer; background:#3f0f0f; color:#fca5a5; font-size:12px; font-weight:700;">Rejeitar</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="padding:40px; text-align:center; color:var(--muted);">Nenhuma redefinição pendente</td></tr>';

  modal.innerHTML = `
    <div style="position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.8); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; font-family:system-ui,-apple-system,sans-serif;">
      <div style="background:var(--card); border:1px solid var(--border); border-radius:24px; padding:32px; width:95%; max-width:1000px; color:var(--text); max-height:85vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h2 style="margin:0; color:var(--accent-2); font-size:24px; font-weight:800;">⚙️ Painel de Controle Admin</h2>
            <p style="margin:4px 0 0; font-size:13px; color:var(--muted);">Gerencie usuários e solicitações do sistema</p>
          </div>
          <button onclick="document.getElementById('dvb-admin-modal').remove()" style="background:none; border:none; color:var(--muted); font-size:24px; cursor:pointer;">&times;</button>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:24px; border-bottom:1px solid var(--border); padding-bottom:16px;">
          <button id="admin-tab-users" onclick="dvbAdminTab('users')" style="padding:10px 20px; border-radius:10px; border:none; cursor:pointer; background:var(--accent-2); color:#000; font-weight:700; font-size:14px; transition:all 0.2s;">Operadores (${users.length})</button>
          <button id="admin-tab-resets" onclick="dvbAdminTab('resets')" style="padding:10px 20px; border-radius:10px; border:none; cursor:pointer; background:transparent; color:var(--muted); font-weight:600; font-size:14px; transition:all 0.2s;">Redefinições Pendentes ${resets.length > 0 ? `<span style="background:var(--danger); color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:6px;">${resets.length}</span>` : ''}</button>
        </div>

        <div id="admin-view-users">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="color:var(--muted); text-align:left; border-bottom:1px solid var(--border);">
                <th style="padding:12px;">Operador</th>
                <th style="padding:12px;">E-mail</th>
                <th style="padding:12px; text-align:center;">Status</th>
                <th style="padding:12px; text-align:center;">Nível</th>
                <th style="padding:12px;">Última Atividade</th>
                <th style="padding:12px; text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>${linhasUsers}</tbody>
          </table>
        </div>

        <div id="admin-view-resets" style="display:none;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="color:var(--muted); text-align:left; border-bottom:1px solid var(--border);">
                <th style="padding:12px;">Usuário</th>
                <th style="padding:12px; text-align:center;">Ações de Recuperação</th>
              </tr>
            </thead>
            <tbody>${linhasResets}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.dvbAdminTab = function(tab) {
  const isUsers = tab === 'users';
  document.getElementById('admin-view-users').style.display = isUsers ? 'block' : 'none';
  document.getElementById('admin-view-resets').style.display = isUsers ? 'none' : 'block';
  
  const btnUsers = document.getElementById('admin-tab-users');
  const btnResets = document.getElementById('admin-tab-resets');
  
  btnUsers.style.background = isUsers ? 'var(--accent-2)' : 'transparent';
  btnUsers.style.color = isUsers ? '#000' : 'var(--muted)';
  btnUsers.style.fontWeight = isUsers ? '700' : '600';
  
  btnResets.style.background = isUsers ? 'transparent' : 'var(--accent-2)';
  btnResets.style.color = isUsers ? 'var(--muted)' : '#000';
  btnResets.style.fontWeight = isUsers ? '600' : '700';
};

window.dvbAprovarResetSenha = async function(id, aprovado) {
  const token = getToken();
  try {
    const res = await fetch(`${AUTH_WORKER}/admin/approve-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, aprovar: aprovado })
    });
    if (res.ok) {
      dvbAdmin(); // Recarrega o painel
      checkNewRegistrations(); // Atualiza o badge
    } else {
      const data = await res.json();
      dvbAlert('Erro', data.erro || 'Erro ao processar solicitação.', 'erro');
    }
  } catch (err) {
    dvbAlert('Erro', 'Falha de conexão com o servidor.', 'erro');
  }
};

window.dvbAprovar = async function(id, aprovado) {
  const token = getToken();
  await fetch(`${AUTH_WORKER}/admin/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, aprovado })
  });
  document.getElementById('dvb-admin-modal').remove();
  dvbAdmin();
};

window.dvbPromover = async function(id, admin) {
  const token = getToken();
  await fetch(`${AUTH_WORKER}/admin/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, admin })
  });
  document.getElementById('dvb-admin-modal').remove();
  dvbAdmin();
};

function dvbAlert(titulo, texto, tipo = 'info') {
  const modalAlert = document.createElement('div');
  modalAlert.id = 'dvb-alert-modal';
  const color = tipo === 'erro' ? 'var(--danger)' : 'var(--accent-2)';
  const icon = tipo === 'erro' ? '❌' : 'ℹ️';

  modalAlert.innerHTML = `
    <div style="
      position:fixed; inset:0; z-index:100001; background:rgba(0,0,0,0.85);
      backdrop-filter: blur(8px); display:flex; align-items:center; justify-content:center;
      font-family:system-ui,-apple-system,sans-serif; padding:20px;
    ">
      <div style="
        background: var(--bg-elev); border: 1px solid var(--border); border-radius: 20px; 
        padding: 32px; width: 100%; max-width: 400px; color: var(--text);
        box-shadow: var(--shadow);
        animation: slideUp 0.3s ease-out; text-align: center;
      ">
        <div style="font-size: 40px; margin-bottom: 16px;">${icon}</div>
        <h3 style="margin: 0 0 12px; color: ${color}; font-size: 20px; font-weight: 800;">${titulo}</h3>
        <p style="margin: 0 0 24px; color: var(--muted); font-size: 14px; line-height: 1.6;">${texto}</p>
        <button id="alert-close" style="
          width: 100%; padding: 12px; border-radius: 10px; border: none;
          background: ${color}; color: ${tipo === 'erro' ? 'white' : '#000'}; 
          font-weight: 700; cursor: pointer; transition: all 0.2s;
        ">Entendido</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalAlert);
  document.getElementById('alert-close').onclick = () => modalAlert.remove();
}

window.dvbDeletar = async function(event, id, nome) {
  const modalConfirm = document.createElement('div');
  modalConfirm.id = 'dvb-confirm-modal';
  modalConfirm.innerHTML = `
    <div style="position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.85);
      backdrop-filter: blur(8px); display:flex; align-items:center; justify-content:center;
      font-family:system-ui,-apple-system,sans-serif; padding:20px;">
      <div style="background: var(--bg-elev); border: 1px solid var(--border); border-radius: 20px; 
        padding: 32px; width: 100%; max-width: 400px; color: var(--text);
        box-shadow: var(--shadow), 0 0 30px rgba(239, 68, 68, 0.1);
        animation: slideUp 0.3s ease-out; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 16px;">⚠️</div>
        <h3 style="margin: 0 0 12px; color: var(--danger); font-size: 20px; font-weight: 800;">Confirmar Exclusão</h3>
        <p style="margin: 0 0 24px; color: var(--muted); font-size: 14px; line-height: 1.6;">
          Tem certeza que deseja excluir permanentemente o operador <strong style="color:var(--text)">"${nome}"</strong>?<br>
          <span style="font-size: 12px; opacity: 0.8;">Esta ação não pode ser desfeita.</span>
        </p>
        <div style="display: flex; gap: 12px;">
          <button id="confirm-cancel" style="flex: 1; padding: 12px; border-radius: 10px; border: 1px solid var(--border);
            background: var(--bg); color: var(--text); font-weight: 600; cursor: pointer;">Cancelar</button>
          <button id="confirm-yes" style="flex: 1; padding: 12px; border-radius: 10px; border: none;
            background: var(--danger); color: white; font-weight: 700; cursor: pointer;">Excluir Agora</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalConfirm);

  return new Promise((resolve) => {
    document.getElementById('confirm-cancel').onclick = () => {
      modalConfirm.remove();
      resolve(false);
    };
    document.getElementById('confirm-yes').onclick = async () => {
      modalConfirm.remove();
      const token = getToken();
      const btn = event.target.closest('button');
      const oldHtml = btn ? btn.innerHTML : '🗑️';
      try {
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }
        const res = await fetch(`${AUTH_WORKER}/admin/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id })
        });
        if (res.ok) {
          setTimeout(() => {
            if (document.getElementById('dvb-admin-modal')) document.getElementById('dvb-admin-modal').remove();
            dvbAdmin();
          }, 500);
        } else {
          const data = await res.json();
          dvbAlert('Erro ao excluir', data.erro || 'Ação não permitida', 'erro');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
          }
        }
      } catch (e) {
        console.error(e);
        dvbAlert('Erro de conexão', 'Não foi possível contatar o servidor.', 'erro');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = oldHtml;
        }
      }
    };
  });
};

let inatividadeTimer;
const TEMPO_INATIVIDADE = 10 * 60 * 1000;

function resetarTimerInatividade() {
  if (inatividadeTimer) clearTimeout(inatividadeTimer);

  if (getToken()) {
    inatividadeTimer = setTimeout(() => {
      console.log("Sessão expirada por inatividade.");
      dvbLogout();
    }, TEMPO_INATIVIDADE);
  }
}

['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetarTimerInatividade, { passive: true });
});

// Atalhos de teclado: Enter para submeter e ESC para fechar modais
window.addEventListener('keydown', (e) => {
  // ESC: Fechar modais abertos
  if (e.key === 'Escape') {
    const modais = [
      'dvb-auth-overlay',
      'dvb-admin-modal',
      'dvb-edit-profile-overlay',
      'dvb-forgot-overlay',
      'dvb-confirm-overlay',
      'dvb-alert-modal',
      'dvb-confirm-modal'
    ];
    
    for (const id of modais) {
      const el = document.getElementById(id);
      if (el) {
        el.remove();
        // Se fechar o menu de admin, pode ser útil recarregar ou resetar estados
        if (id === 'dvb-admin-modal') checkNewRegistrations();
        break; // Fecha apenas o último modal aberto (o que estiver no topo)
      }
    }
  }

  // ENTER: Submeter formulários ativos
  if (e.key === 'Enter') {
    // Verifica qual formulário está visível/ativo
    const authOverlay = document.getElementById('dvb-auth-overlay');
    if (authOverlay) {
      const loginVisible = document.getElementById('form-login').style.display !== 'none';
      if (loginVisible) {
        dvbLogin();
      } else {
        dvbCadastrar();
      }
      return;
    }

    const forgotOverlay = document.getElementById('dvb-forgot-overlay');
    if (forgotOverlay) {
      dvbEnviarRecuperacao();
      return;
    }

    const editOverlay = document.getElementById('dvb-edit-profile-overlay');
    if (editOverlay) {
      dvbSalvarPerfil();
      return;
    }

    // Se houver um modal de confirmação (confirm/alert), o Enter pode confirmar
    const confirmOk = document.getElementById('dvb-confirm-ok') || document.getElementById('alert-close') || document.getElementById('confirm-yes');
    if (confirmOk) {
      confirmOk.click();
    }
  }
});

resetarTimerInatividade();
verificarSessao();