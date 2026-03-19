// ============================================================
// DecodeVINBus — Auth Frontend
// Coloque este script ANTES do app.js no index.html
// ============================================================

const AUTH_WORKER = 'https://decodevinbus-auth.luismiguelgomesoliveira-014.workers.dev';

// ---------- Helpers ----------

function getToken() { return localStorage.getItem('dvb_token'); }
function getUser()  { return JSON.parse(localStorage.getItem('dvb_user') || 'null'); }

function salvarSessao(token, nome, admin) {
  localStorage.setItem('dvb_token', token);
  localStorage.setItem('dvb_user', JSON.stringify({ nome, admin }));
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
      mostrarApp(data.usuario);
    } else {
      limparSessao();
      mostrarTelaLogin();
    }
  } catch {
    limparSessao();
    mostrarTelaLogin();
  }
}

// ---------- Tela de Login/Cadastro ----------

function mostrarTelaLogin() {
  // Esconde o conteúdo do site
  document.body.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'dvb-auth-overlay';
  overlay.innerHTML = `
    <div style="
      position:fixed; inset:0; z-index:99999;
      background:#0f172a;
      display:flex; align-items:center; justify-content:center;
      font-family:'Segoe UI',sans-serif;
    ">
      <div style="
        background:#1e293b; border-radius:16px; padding:40px 36px;
        width:100%; max-width:400px; box-shadow:0 25px 60px rgba(0,0,0,0.5);
        color:#f1f5f9;
      ">
        <h1 style="margin:0 0 4px; font-size:22px; font-weight:700; color:#38bdf8;">
          🚌 DecodeVINBus
        </h1>
        <p style="margin:0 0 28px; font-size:13px; color:#94a3b8;">
          Sistema de decodificação de chassi
        </p>

        <!-- Tabs -->
        <div style="display:flex; gap:8px; margin-bottom:24px;">
          <button id="tab-login" onclick="dvbShowTab('login')" style="
            flex:1; padding:8px; border-radius:8px; border:none; cursor:pointer;
            background:#38bdf8; color:#0f172a; font-weight:600; font-size:14px;
          ">Entrar</button>
          <button id="tab-cadastro" onclick="dvbShowTab('cadastro')" style="
            flex:1; padding:8px; border-radius:8px; border:none; cursor:pointer;
            background:#334155; color:#94a3b8; font-weight:600; font-size:14px;
          ">Cadastrar</button>
        </div>

        <!-- Form Login -->
        <div id="form-login">
          <input id="login-email" type="email" placeholder="E-mail" style="${inputStyle()}">
          <input id="login-senha" type="password" placeholder="Senha" style="${inputStyle()}">
          <button onclick="dvbLogin()" style="${btnStyle()}">Entrar</button>
        </div>

        <!-- Form Cadastro -->
        <div id="form-cadastro" style="display:none;">
          <input id="cad-nome" type="text" placeholder="Seu nome" style="${inputStyle()}">
          <input id="cad-email" type="email" placeholder="E-mail" style="${inputStyle()}">
          <input id="cad-senha" type="password" placeholder="Senha (mín. 6 caracteres)" style="${inputStyle()}">
          <button onclick="dvbCadastrar()" style="${btnStyle()}">Solicitar acesso</button>
          <p style="font-size:12px; color:#64748b; margin-top:12px; text-align:center;">
            Após o cadastro, aguarde aprovação do administrador.
          </p>
        </div>

        <!-- Mensagem -->
        <div id="dvb-msg" style="
          margin-top:16px; padding:10px 14px; border-radius:8px;
          font-size:13px; display:none;
        "></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.display = '';
}

function inputStyle() {
  return `
    display:block; width:100%; box-sizing:border-box;
    margin-bottom:12px; padding:10px 14px;
    background:#0f172a; border:1px solid #334155; border-radius:8px;
    color:#f1f5f9; font-size:14px; outline:none;
  `;
}

function btnStyle() {
  return `
    width:100%; padding:11px; border-radius:8px; border:none; cursor:pointer;
    background:#38bdf8; color:#0f172a; font-weight:700; font-size:15px;
    margin-top:4px;
  `;
}

window.dvbShowTab = function(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-cadastro').style.display = tab === 'cadastro' ? 'block' : 'none';
  document.getElementById('tab-login').style.background    = tab === 'login'    ? '#38bdf8' : '#334155';
  document.getElementById('tab-login').style.color         = tab === 'login'    ? '#0f172a' : '#94a3b8';
  document.getElementById('tab-cadastro').style.background = tab === 'cadastro' ? '#38bdf8' : '#334155';
  document.getElementById('tab-cadastro').style.color      = tab === 'cadastro' ? '#0f172a' : '#94a3b8';
  dvbMsg('', '');
};

function dvbMsg(texto, tipo) {
  const el = document.getElementById('dvb-msg');
  if (!texto) { el.style.display = 'none'; return; }
  el.style.display    = 'block';
  el.style.background = tipo === 'erro' ? '#450a0a' : '#052e16';
  el.style.color      = tipo === 'erro' ? '#fca5a5' : '#86efac';
  el.style.border     = `1px solid ${tipo === 'erro' ? '#7f1d1d' : '#14532d'}`;
  el.textContent      = texto;
}

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

    salvarSessao(data.token, data.nome, data.admin);
    document.getElementById('dvb-auth-overlay').remove();
    mostrarApp({ nome: data.nome, admin: data.admin });
  } catch {
    dvbMsg('Erro de conexão com o servidor.', 'erro');
  }
};

window.dvbCadastrar = async function() {
  const nome  = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;
  if (!nome || !email || !senha) { dvbMsg('Preencha todos os campos.', 'erro'); return; }
  if (senha.length < 6) { dvbMsg('Senha deve ter pelo menos 6 caracteres.', 'erro'); return; }

  dvbMsg('Enviando cadastro...', 'ok');
  try {
    const res  = await fetch(`${AUTH_WORKER}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha })
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
  // Injeta barra de usuário no topo
  const barra = document.createElement('div');
  barra.id = 'dvb-user-bar';
  barra.innerHTML = `
    <div style="
      background:#1e293b; color:#94a3b8;
      padding:6px 16px; font-size:12px; font-family:'Segoe UI',sans-serif;
      display:flex; justify-content:flex-end; align-items:center; gap:12px;
    ">
      <span>👤 ${usuario.nome}</span>
      ${usuario.admin ? '<a href="#" onclick="dvbAdmin()" style="color:#38bdf8; text-decoration:none;">⚙️ Admin</a>' : ''}
      <a href="#" onclick="dvbLogout()" style="color:#f87171; text-decoration:none;">Sair</a>
    </div>
  `;
  document.body.prepend(barra);
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

  const modal = document.createElement('div');
  modal.id    = 'dvb-admin-modal';

  const linhas = data.usuarios.map(u => `
    <tr style="border-bottom:1px solid #334155;">
      <td style="padding:8px;">${u.nome}</td>
      <td style="padding:8px;">${u.email}</td>
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
      <td style="padding:8px; font-size:11px; color:#64748b;">${u.last_login || '-'}</td>
    </tr>
  `).join('');

  modal.innerHTML = `
    <div style="
      position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7);
      display:flex; align-items:center; justify-content:center;
      font-family:'Segoe UI',sans-serif;
    ">
      <div style="
        background:#1e293b; border-radius:16px; padding:32px;
        width:90%; max-width:800px; color:#f1f5f9;
        max-height:80vh; overflow-y:auto;
      ">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2 style="margin:0; color:#38bdf8;">⚙️ Gerenciar Usuários</h2>
          <button onclick="document.getElementById('dvb-admin-modal').remove()" style="
            background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;
          ">✕</button>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="color:#64748b; text-align:left; border-bottom:1px solid #334155;">
              <th style="padding:8px;">Nome</th>
              <th style="padding:8px;">E-mail</th>
              <th style="padding:8px; text-align:center;">Acesso</th>
              <th style="padding:8px; text-align:center;">Nível</th>
              <th style="padding:8px;">Último login</th>
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

// ---------- Iniciar ----------
verificarSessao();