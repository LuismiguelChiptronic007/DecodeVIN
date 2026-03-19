// ============================================================
// DecodeVINBus — Auth Frontend
// Coloque este script ANTES do app.js no index.html
// ============================================================

const AUTH_WORKER = 'https://decodevinbus-auth.luismiguelgomesoliveira-014.workers.dev';

// ---------- Helpers ----------

function getToken() { return localStorage.getItem('dvb_token'); }
function getUser()  { return JSON.parse(localStorage.getItem('dvb_user') || 'null'); }

function salvarSessao(token, nome, setor, email, admin) {
  localStorage.setItem('dvb_token', token);
  localStorage.setItem('dvb_user', JSON.stringify({ nome, setor, email, admin }));
}

function limparSessao() {
  localStorage.removeItem('dvb_token');
  localStorage.removeItem('dvb_user');
}

// ---------- Verificar token ao carregar ----------

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
      // Atualiza sessão local com dados frescos do banco
      salvarSessao(token, u.nome, u.setor, u.email, u.admin);
      mostrarApp(u);
    } else {
      limparSessao();
      mostrarTelaLogin();
    }
  } catch {
    // Offline: usa dados locais se disponíveis
    const user = getUser();
    if (user) mostrarApp(user);
    else mostrarTelaLogin();
  }
}

// ---------- Tela de Login/Cadastro ----------

function mostrarTelaLogin() {
  document.body.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'dvb-auth-overlay';
  overlay.innerHTML = `
    <div style="
      position:fixed; inset:0; z-index:99999;
      background: radial-gradient(1000px 600px at 10% -10%, rgba(56,189,248,.15), transparent 60%),
                  radial-gradient(800px 500px at 90% 10%, rgba(34,197,94,.12), transparent 60%),
                  linear-gradient(180deg, var(--bg-elev), var(--bg));
      display:flex; align-items:center; justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;
      padding: 20px;
    ">
      <div style="
        position:absolute; inset:0; pointer-events:none; z-index:-1;
        background: linear-gradient(0deg, transparent 24%, rgba(255,255,255,.02) 25%, rgba(255,255,255,.02) 26%, transparent 27%),
                    linear-gradient(90deg, transparent 24%, rgba(255,255,255,.02) 25%, rgba(255,255,255,.02) 26%, transparent 27%);
        background-size: 40px 40px;
      "></div>

      <div style="
        background: var(--card); border: 1px solid var(--border); border-radius: 24px; 
        padding: 48px 40px; width: 100%; max-width: 420px; 
        box-shadow: var(--shadow), 0 0 40px rgba(56,189,248,0.1);
        color: var(--text); position: relative; overflow: hidden;
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
          <button id="tab-login" onclick="dvbShowTab('login')" style="
            flex:1; padding:10px; border-radius:8px; border:none; cursor:pointer;
            background:var(--accent-2); color:#000; font-weight:700; font-size:14px;
            transition: all 0.2s ease;
          ">Acessar</button>
          <button id="tab-cadastro" onclick="dvbShowTab('cadastro')" style="
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
            <label style="display:block; font-size:12px; font-weight:700; color:var(--accent-2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Senha</label>
            <div style="position:relative;">
              <input id="login-senha" type="password" placeholder="••••••••" style="${inputStyle()} padding-right:45px;">
              <button onclick="dvbTogglePass('login-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:5px;">👁️</button>
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
              <option value="OBDMAP">OBDMAP</option>
              <option value="DIESELDIAG">DIESELDIAG</option>
              <option value="MOBILE">MOBILE</option>
              <option value="MOTODIAG">MOTODIAG</option>
              <option value="ECU TEST">ECU TEST</option>
              <option value="PROJETOS ESPECIAIS">PROJETOS ESPECIAIS</option>
              <option value="APLICAÇÃO">APLICAÇÃO</option>
              <option value="TELEMETRIA ADM">TELEMETRIA ADM</option>
              <option value="TELEMETRIA HW">TELEMETRIA HW</option>
              <option value="TELEMETRIA SW">TELEMETRIA SW</option>
              <option value="T.I TELEMETRIA">T.I TELEMETRIA</option>
              <option value="T.I INTERNO">T.I INTERNO</option>
              <option value="HARDWARE">HARDWARE</option>
              <option value="CRIPTO">CRIPTO</option>
              <option value="RESOLVE">RESOLVE</option>
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
              <button onclick="dvbTogglePass('cad-senha')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px; padding:5px;">👁️</button>
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
    </style>
  `;
  document.body.appendChild(overlay);
  document.body.style.display = '';
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

window.dvbShowTab = function(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('form-cadastro').style.display = isLogin ? 'none' : 'block';
  const tabLogin = document.getElementById('tab-login');
  const tabCad   = document.getElementById('tab-cadastro');
  tabLogin.style.background = isLogin ? 'var(--accent-2)' : 'transparent';
  tabLogin.style.color      = isLogin ? '#000' : 'var(--muted)';
  tabLogin.style.fontWeight = isLogin ? '700' : '600';
  tabCad.style.background   = isLogin ? 'transparent' : 'var(--accent-2)';
  tabCad.style.color        = isLogin ? 'var(--muted)' : '#000';
  tabCad.style.fontWeight   = isLogin ? '600' : '700';
  dvbMsg('', '');
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

window.dvbTogglePass = function(id) {
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

    // ✅ Salva todos os dados do usuário incluindo email e setor
    salvarSessao(data.token, data.nome, data.setor, data.email, data.admin);
    document.getElementById('dvb-auth-overlay').remove();
    mostrarApp({ nome: data.nome, setor: data.setor, email: data.email, admin: data.admin });
  } catch {
    dvbMsg('Erro de conexão com o servidor.', 'erro');
  }
};

window.dvbCadastrar = async function() {
  const nome  = document.getElementById('cad-nome').value.trim();
  const setor = document.getElementById('cad-setor').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;
  if (!nome || !setor || !email || !senha) { dvbMsg('Preencha todos os campos.', 'erro'); return; }

  if (!email.toLowerCase().endsWith('@chiptronic.com.br')) {
    dvbMsg('Apenas e-mails @chiptronic.com.br são permitidos.', 'erro');
    return;
  }

  if (senha.length < 6) { dvbMsg('Senha deve ter pelo menos 6 caracteres.', 'erro'); return; }
  if (!/[A-Z]/.test(senha) || !/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
    dvbMsg('A senha deve conter uma letra maiúscula e um caractere especial.', 'erro');
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
    dvbMsg('Cadastro enviado! Aguarde aprovação do administrador.', 'ok');
  } catch {
    dvbMsg('Erro de conexão com o servidor.', 'erro');
  }
};

// ---------- Mostrar app autenticado ----------

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

  // ✅ Usa setor e email vindos do banco via /verify ou /login
  const setorExibido = usuario.setor || 'Operador';
  const emailExibido = usuario.email || '';

  barra.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="assets/logo.svg" alt="Logo" style="width: 32px; height: 32px;">
      <div style="display:flex; flex-direction:column;">
        <span style="color:var(--text); font-weight:800; font-size:18px; letter-spacing:-0.5px; line-height:1;">DecodeVIN</span>
        <span style="color:var(--accent-2); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Chiptronic</span>
      </div>
    </div>

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
  `;
  document.body.prepend(barra);

  const trigger  = document.getElementById('dvb-user-trigger');
  const dropdown = document.getElementById('dvb-user-dropdown');
  const arrow    = document.getElementById('dvb-arrow');

  trigger.onclick = (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'flex';
    dropdown.style.display = isOpen ? 'none' : 'flex';
    arrow.style.transform  = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  };

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
    arrow.style.transform  = 'rotate(0deg)';
  });
}

window.dvbLogout = function() {
  limparSessao();
  location.reload();
};

// ---------- Painel Admin ----------

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

  const linhas = data.usuarios.map(u => `
    <tr id="user-row-${u.id}" style="border-bottom:1px solid var(--border); transition: background 0.2s;"
      onmouseover="this.style.background='rgba(255,255,255,0.02)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:16px;">
        <div style="font-weight:600; color:var(--text);">${u.nome}</div>
        <div style="font-size:11px; color:var(--accent-2); text-transform:uppercase; letter-spacing:0.5px;">${u.setor || 'Geral'}</div>
      </td>
      <td style="padding:16px; color:var(--muted); font-size:12px;">${u.email}</td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbAprovar(${u.id}, ${u.aprovado ? 0 : 1})" style="
          padding:4px 10px; border-radius:6px; border:none; cursor:pointer;
          background:${u.aprovado ? '#7f1d1d' : '#14532d'};
          color:${u.aprovado ? '#fca5a5' : '#86efac'}; font-size:12px;
        ">${u.aprovado ? 'Revogar' : 'Aprovar'}</button>
      </td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbPromover(${u.id}, ${u.admin ? 0 : 1})" style="
          padding:4px 10px; border-radius:6px; border:none; cursor:pointer;
          background:#1e3a5f; color:#7dd3fc; font-size:12px;
        ">${u.admin ? 'Remover admin' : 'Tornar admin'}</button>
      </td>
      <td style="padding:8px; font-size:11px; color:#64748b;">${u.last_login || '—'}</td>
      <td style="padding:8px; text-align:center;">
        <button onclick="dvbDeletar(event, ${u.id}, '${u.nome.replace(/'/g, "\\'")}')" style="
          padding:4px 10px; border-radius:6px; border:none; cursor:pointer;
          background:#3f0f0f; color:#fca5a5; font-size:12px;
        ">🗑 Excluir</button>
      </td>
    </tr>
  `).join('');

  modal.innerHTML = `
    <div style="position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7);
      display:flex; align-items:center; justify-content:center; font-family:'Segoe UI',sans-serif;">
      <div style="background:#1e293b; border-radius:16px; padding:32px;
        width:90%; max-width:900px; color:#f1f5f9; max-height:80vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2 style="margin:0; color:#38bdf8;">⚙️ Gestão de Operadores</h2>
          <button onclick="document.getElementById('dvb-admin-modal').remove()"
            style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 16px; font-size:13px; color:#64748b;">Controle de acessos e permissões do sistema</p>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="color:#64748b; text-align:left; border-bottom:1px solid #334155;">
              <th style="padding:8px;">Operador</th>
              <th style="padding:8px;">E-mail</th>
              <th style="padding:8px; text-align:center;">Status Acesso</th>
              <th style="padding:8px; text-align:center;">Nível</th>
              <th style="padding:8px;">Última Atividade</th>
              <th style="padding:8px; text-align:center;">Ações</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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

// ---------- Inatividade (Auto Logout) ----------

let inatividadeTimer;
const TEMPO_INATIVIDADE = 10 * 60 * 1000; // 10 minutos em milissegundos

function resetarTimerInatividade() {
  if (inatividadeTimer) clearTimeout(inatividadeTimer);
  
  // Só ativa o timer se o usuário estiver logado
  if (getToken()) {
    inatividadeTimer = setTimeout(() => {
      console.log("Sessão expirada por inatividade.");
      dvbLogout();
    }, TEMPO_INATIVIDADE);
  }
}

// Listeners para detectar atividade do usuário
['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetarTimerInatividade, { passive: true });
});

// ---------- Iniciar ----------
resetarTimerInatividade();
verificarSessao();