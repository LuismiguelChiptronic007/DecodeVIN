// ============================================================
// DecodeVINBus — Auth Worker
// Bindings: DB (D1 → decodevinbus-users), JWT_SECRET (Secrets Store)
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function randomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(payload));
  const enc    = new TextEncoder();
  const key    = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const pad = sig.length % 4 === 0 ? '' : '='.repeat(4 - (sig.length % 4));
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/') + pad),
      c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  return verifyJWT(token, env.JWT_SECRET);
}

function getUserId(payload) {
  const v = payload.sub ?? payload.id ?? payload.userId;
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

const MAX_PAYLOAD = 450000;

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const method = request.method;
    const path   = url.pathname;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      // ============================================================
      // POST /register
      // ============================================================
      if (method === 'POST' && path === '/register') {
      const { nome, email, senha, setor } = await request.json();
      if (!nome || !email || !senha || !setor)
        return json({ erro: 'Todos os campos são obrigatórios (nome, email, senha, setor)' }, 400);

      const existe = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existe) return json({ erro: 'E-mail já cadastrado' }, 409);

      const salt      = randomSalt();
      const senhaHash = await hashPassword(senha, salt);
      await env.DB.prepare(
        'INSERT INTO users (nome, email, senha_hash, salt, setor) VALUES (?, ?, ?, ?, ?)'
      ).bind(nome, email, senhaHash, salt, setor).run();

      return json({ ok: true, mensagem: 'Cadastro realizado! Aguarde aprovação do administrador.' });
    }

    // ============================================================
    // POST /login
    // ============================================================
    if (method === 'POST' && path === '/login') {
      const { email, senha } = await request.json();
      if (!email || !senha) return json({ erro: 'E-mail e senha obrigatórios' }, 400);

      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ erro: 'Usuário não encontrado' }, 404);
      if (!user.aprovado) return json({ erro: 'Conta aguardando aprovação do administrador' }, 403);

      const hash = await hashPassword(senha, user.salt);
      if (hash !== user.senha_hash) return json({ erro: 'Senha incorreta' }, 401);

      await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(user.id).run();

      const token = await signJWT(
        {
          sub: user.id,
          email: user.email,
          nome: user.nome,
          setor: user.setor,
          admin: !!user.admin,
          exp: Math.floor(Date.now() / 1000) + 86400 * 7
        },
        env.JWT_SECRET
      );

      return json({ ok: true, token, nome: user.nome, email: user.email, setor: user.setor, admin: !!user.admin });
    }

    // ============================================================
    // GET /verify
    // ============================================================
    if (method === 'GET' && path === '/verify') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Token inválido ou expirado' }, 401);

      const user = await env.DB.prepare(
        'SELECT id, nome, email, setor, admin, aprovado FROM users WHERE id = ?'
      ).bind(payload.sub).first();

      if (!user || !user.aprovado) return json({ erro: 'Usuário inativo ou não encontrado' }, 401);

      return json({
        ok: true,
        usuario: { sub: user.id, nome: user.nome, email: user.email, setor: user.setor, admin: !!user.admin }
      });
    }

    // ============================================================
    // GET /admin/users
    // ============================================================
    if (method === 'GET' && path === '/admin/users') {
      const payload = await requireAuth(request, env);
      if (!payload || !payload.admin) return json({ erro: 'Acesso negado' }, 403);

      const { results } = await env.DB.prepare(
        'SELECT id, nome, email, setor, aprovado, admin, created_at, last_login, reset_senha_pendente FROM users ORDER BY created_at DESC'
      ).all();
      return json({ usuarios: results });
    }

    // ============================================================
    // POST /admin/approve
    // ============================================================
    if (method === 'POST' && path === '/admin/approve') {
      const payload = await requireAuth(request, env);
      if (!payload || !payload.admin) return json({ erro: 'Acesso negado' }, 403);
      const { id, aprovado } = await request.json();
      await env.DB.prepare('UPDATE users SET aprovado = ? WHERE id = ?').bind(aprovado ? 1 : 0, id).run();
      return json({ ok: true });
    }

    // ============================================================
    // POST /admin/promote
    // ============================================================
    if (method === 'POST' && path === '/admin/promote') {
      const payload = await requireAuth(request, env);
      if (!payload || !payload.admin) return json({ erro: 'Acesso negado' }, 403);
      const { id, admin } = await request.json();
      await env.DB.prepare('UPDATE users SET admin = ? WHERE id = ?').bind(admin ? 1 : 0, id).run();
      return json({ ok: true });
    }

    // ============================================================
    // POST /admin/delete
    // ============================================================
    if (method === 'POST' && path === '/admin/delete') {
      const payload = await requireAuth(request, env);
      if (!payload || !payload.admin) return json({ erro: 'Acesso negado' }, 403);
      const { id } = await request.json();
      if (id === payload.sub) return json({ erro: 'Você não pode excluir sua própria conta' }, 400);
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // ============================================================
    // POST /audit/search
    // ============================================================
    if (method === 'POST' && path === '/audit/search') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autenticado' }, 401);

      const userId = payload.sub ?? payload.id ?? null;
      if (!userId) return json({ erro: 'user_id ausente no token' }, 400);

      const body = await request.json().catch(() => ({}));

      await env.DB.prepare(
        `INSERT INTO search_audit (user_id, email, nome, tipo, placa, vin, detalhe, fleet_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        String(userId),
        String(payload.email ?? ''),
        String(payload.nome  ?? ''),
        String(body.tipo      ?? '').slice(0, 30),
        String(body.placa     ?? '').slice(0, 20),
        String(body.vin       ?? '').slice(0, 20),
        String(body.detalhe   ?? '').slice(0, 120),
        String(body.fleetName ?? '').slice(0, 80)
      ).run();

      return json({ ok: true }, 201);
    }

    // ============================================================
    // GET /admin/search-audit
    // ============================================================
    if (method === 'GET' && path === '/admin/search-audit') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autenticado' }, 401);
      if (!payload.admin) return json({ erro: 'Acesso negado' }, 403);

      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200'), 1000);

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, email, nome, tipo, placa, vin, detalhe, fleet_name, created_at
         FROM search_audit ORDER BY id DESC LIMIT ?`
      ).bind(limit).all();

      return json({ ok: true, results });
    }

    // ============================================================
    // GET /user/history
    // ============================================================
    if (method === 'GET' && path === '/user/history') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autorizado' }, 401);

      const userId = getUserId(payload);
      if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

      const { results } = await env.DB.prepare(
        `SELECT id, kind, payload, created_at FROM user_history WHERE user_id = ? ORDER BY id DESC LIMIT 150`
      ).bind(userId).all();

      const single = [];
      const group  = [];

      for (const row of results || []) {
        let p;
        try { p = JSON.parse(row.payload); } catch { continue; }

        if (row.kind === 'single') {
          single.push({ id: row.id, input: p.input || '', plate: p.plate || '', ts: typeof p.ts === 'number' ? p.ts : Date.now() });
        } else if (row.kind === 'group') {
          group.push({ id: row.id, vins: p.vins || '', plates: p.plates || '', fleetName: p.fleetName || '', ts: typeof p.ts === 'number' ? p.ts : Date.now() });
        }
      }

      return json({ ok: true, single, group });
    }

    // ============================================================
    // POST /user/history
    // ============================================================
    if (method === 'POST' && path === '/user/history') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autorizado' }, 401);

      const userId = getUserId(payload);
      if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

      const email = String(payload.email ?? '');
      const nome  = String(payload.nome  ?? '');

      const body = await request.json().catch(() => ({}));
      const kind = body.kind === 'group' ? 'group' : 'single';
      const raw  = JSON.stringify(body.payload != null ? body.payload : {});
      if (raw.length > MAX_PAYLOAD) return json({ erro: 'Payload grande demais' }, 413);

      const r = await env.DB.prepare(
        `INSERT INTO user_history (user_id, email, nome, kind, payload) VALUES (?, ?, ?, ?, ?)`
      ).bind(userId, email, nome, kind, raw).run();

      const id = r.meta?.last_row_id;
      return json({ ok: true, id: id != null ? id : undefined }, 201);
    }

    // ============================================================
    // DELETE /user/history
    // ============================================================
    if (method === 'DELETE' && path === '/user/history') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autorizado' }, 401);

      const userId = getUserId(payload);
      if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

      const body = await request.json().catch(() => ({}));
      const id   = body.id ? parseInt(String(body.id), 10) : null;
      
      if (id) {
        // Deleta um registro específico
        await env.DB.prepare(
          `DELETE FROM user_history WHERE id = ? AND user_id = ?`
        ).bind(id, userId).run();
      } else if (body.all === true) {
        // Deleta TODO o histórico do usuário
        await env.DB.prepare(
          `DELETE FROM user_history WHERE user_id = ?`
        ).bind(userId).run();
        
        // Também limpa os veículos de frota associados ao usuário
        await env.DB.prepare(
          `DELETE FROM fleet_vehicles WHERE user_id = ?`
        ).bind(String(userId)).run();
      } else if (body.global_reset === true && payload.admin) {
        // RESET GLOBAL: Deleta histórico de TODOS os usuários (Apenas Admin)
        await env.DB.prepare(`DELETE FROM user_history`).run();
        await env.DB.prepare(`DELETE FROM fleet_vehicles`).run();
      } else {
        return json({ erro: 'id inválido ou permissão insuficiente' }, 400);
      }

      return json({ ok: true });
    }

    // ============================================================
    // GET /admin/user-history
    // ============================================================
    if (method === 'GET' && path === '/admin/user-history') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autorizado' }, 401);
      if (!payload.admin) return json({ erro: 'Acesso negado' }, 403);

      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '300', 10) || 300));

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, email, nome, kind, payload, created_at
         FROM user_history ORDER BY id DESC LIMIT ?`
      ).bind(limit).all();

      const entries = (results || []).map(row => ({
        id: row.id,
        user_id: row.user_id,
        email: row.email || '',
        nome: row.nome || '',
        kind: row.kind,
        payload: row.payload,
        created_at: row.created_at
      }));

      return json({ ok: true, entries });
    }

    // ============================================================
    // POST /admin/notify-registration
    // ============================================================
    if (method === 'POST' && path === '/admin/notify-registration') {
      const { nome, setor, email } = await request.json().catch(() => ({}));
      if (!nome || !setor || !email)
        return json({ erro: 'Campos obrigatórios: nome, setor, email' }, 400);

      if (!env.RESEND_API_KEY)
        return json({ erro: 'RESEND_API_KEY não configurada no Worker' }, 500);

      const htmlBody = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#1d4ed8;padding:24px 32px">
            <h2 style="margin:0;color:#fff;font-size:20px">DecodeVINBus — Novo Cadastro</h2>
          </div>
          <div style="padding:24px 32px">
            <p style="margin:0 0 16px;color:#374151">Um novo usuário solicitou acesso ao sistema:</p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:8px 0;color:#6b7280;width:80px">Nome</td>
                <td style="padding:8px 0;color:#111827;font-weight:600">${nome}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280">Setor</td>
                <td style="padding:8px 0;color:#111827;font-weight:600">${setor}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280">E-mail</td>
                <td style="padding:8px 0;color:#111827;font-weight:600">${email}</td>
              </tr>
            </table>
            <p style="margin:24px 0 8px;color:#374151">
              Acesse o <strong>Painel Administrativo</strong> para aprovar ou rejeitar este acesso.
            </p>
            <a href="https://decodevin.duckdns.org"
               style="display:inline-block;margin-top:12px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
              Abrir Painel
            </a>
          </div>
        </div>
      `;

      let mailOk = false;
      let mailDetail = '';

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'DecodeVINBus <onboarding@resend.dev>',
            to: ['luismiguel.oliveira@chiptronic.com.br'],
            subject: '🔔 Novo Usuário Cadastrado — Aguardando Aprovação',
            html: htmlBody,
          }),
        });

        mailOk = res.ok;
        if (!mailOk) mailDetail = await res.text().catch(() => `HTTP ${res.status}`);
      } catch (err) {
        mailDetail = String(err);
      }

      if (!mailOk)
        return json({ ok: false, erro: mailDetail }, 502);

      return json({ ok: true, notificados: 1 });
    }

    // ============================================================
    // POST /user/forgot-password
    // ============================================================
    if (method === 'POST' && path === '/user/forgot-password') {
      const body  = await request.json().catch(() => ({}));
      const email = String(body.email ?? '').trim().toLowerCase();

      if (!email)
        return json({ ok: true, mensagem: 'Solicitação recebida.' });

      const user = await env.DB.prepare(
        'SELECT nome FROM users WHERE email = ?'
      ).bind(email).first();

      if (user && env.RESEND_API_KEY) {
        const htmlBody = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <div style="background:#1d4ed8;padding:24px 32px">
              <h2 style="margin:0;color:#fff;font-size:20px">DecodeVINBus — Recuperação de Senha</h2>
            </div>
            <div style="padding:24px 32px">
              <p style="margin:0 0 16px;color:#374151">
                O usuário abaixo solicitou a <strong>redefinição de senha</strong>:
              </p>
              <table style="border-collapse:collapse;width:100%">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;width:80px">Nome</td>
                  <td style="padding:8px 0;color:#111827;font-weight:600">${user.nome}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280">E-mail</td>
                  <td style="padding:8px 0;color:#111827;font-weight:600">${email}</td>
                </tr>
              </table>
              <p style="margin:24px 0 8px;color:#374151">
                Acesse o <strong>Painel Administrativo</strong> para redefinir a senha manualmente
                ou entre em contato com o usuário.
              </p>
              <a href="https://decodevin.duckdns.org"
                 style="display:inline-block;margin-top:12px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
                Abrir Painel
              </a>
            </div>
          </div>
        `;

        try {
          const mailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'DecodeVINBus <onboarding@resend.dev>',
              to: ['luismiguel.oliveira@chiptronic.com.br'],
              subject: '🔑 Solicitação de Recuperação de Senha',
              html: htmlBody,
            }),
          });
          if (!mailRes.ok) {
            const errText = await mailRes.text().catch(() => `HTTP ${mailRes.status}`);
            console.error('[forgot-password] Resend error:', errText);
          }
        } catch (mailErr) {
          console.error('[forgot-password] fetch error:', String(mailErr));
        }
      }

      return json({ ok: true, mensagem: 'Se este e-mail estiver cadastrado, os administradores serão notificados.' });
    }

    // ============================================================
    // POST /user/update-profile
    // ============================================================
    if (method === 'POST' && path === '/user/update-profile') {
      const payload = await requireAuth(request, env);
      if (!payload) return json({ erro: 'Não autorizado' }, 401);

      const userId = getUserId(payload);
      if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

      const body  = await request.json().catch(() => ({}));
      const nome  = String(body.nome  ?? '').trim();
      const setor = String(body.setor ?? '').trim();
      const senha = body.senha ? String(body.senha) : null;

      if (!nome || !setor)
        return json({ erro: 'Nome e setor são obrigatórios' }, 400);

      if (senha) {
        const salt      = randomSalt();
        const senhaHash = await hashPassword(senha, salt);
        await env.DB.prepare(
          'UPDATE users SET nome = ?, setor = ?, senha_hash = ?, salt = ? WHERE id = ?'
        ).bind(nome, setor, senhaHash, salt, userId).run();
      } else {
        await env.DB.prepare(
          'UPDATE users SET nome = ?, setor = ? WHERE id = ?'
        ).bind(nome, setor, userId).run();
      }

      return json({ ok: true, mensagem: 'Perfil atualizado com sucesso!' });
    }

    // ============================================================
    // POST /user/request-password-reset — usuário propõe nova senha
    // Rota pública (sem token)
    // ============================================================
    if (method === 'POST' && path === '/user/request-password-reset') {
      const body  = await request.json().catch(() => ({}));
      const email = String(body.email ?? '').trim().toLowerCase();
      const senha = String(body.senha ?? '').trim();

      if (!email || !senha)
        return json({ ok: true, mensagem: 'Solicitação recebida.' });

      const user = await env.DB.prepare(
        'SELECT id, nome FROM users WHERE email = ?'
      ).bind(email).first();

      if (user && env.RESEND_API_KEY) {
        const salt      = randomSalt();
        const senhaHash = await hashPassword(senha, salt);

        await env.DB.prepare(
          'UPDATE users SET reset_senha_pendente = 1, nova_senha_hash = ?, nova_senha_salt = ? WHERE id = ?'
        ).bind(senhaHash, salt, user.id).run();

        const htmlBody = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <div style="background:#1d4ed8;padding:24px 32px">
              <h2 style="margin:0;color:#fff;font-size:20px">DecodeVINBus — Redefinição de Senha Pendente</h2>
            </div>
            <div style="padding:24px 32px">
              <p style="margin:0 0 16px;color:#374151">
                O usuário abaixo solicitou a <strong>redefinição de senha</strong> e aguarda aprovação:
              </p>
              <table style="border-collapse:collapse;width:100%">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;width:80px">Nome</td>
                  <td style="padding:8px 0;color:#111827;font-weight:600">${user.nome}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280">E-mail</td>
                  <td style="padding:8px 0;color:#111827;font-weight:600">${email}</td>
                </tr>
              </table>
              <p style="margin:24px 0 8px;color:#374151">
                Acesse o <strong>Painel Administrativo</strong> para aprovar ou rejeitar esta solicitação.
              </p>
              <a href="https://decodevin.duckdns.org"
                 style="display:inline-block;margin-top:12px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
                Abrir Painel
              </a>
            </div>
          </div>
        `;

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'DecodeVINBus <onboarding@resend.dev>',
              to: ['luismiguel.oliveira@chiptronic.com.br'],
              subject: '🔑 Solicitação de Redefinição de Senha — Aprovação Necessária',
              html: htmlBody,
            }),
          });
        } catch (err) {
          console.error('[request-password-reset] mail error:', String(err));
        }
      }

      return json({ ok: true, mensagem: 'Solicitação enviada. Aguarde aprovação do administrador.' });
    }

    // ============================================================
    // POST /admin/approve-password-reset — admin aprova ou rejeita
    // ============================================================
    if (method === 'POST' && path === '/admin/approve-password-reset') {
      const payload = await requireAuth(request, env);
      if (!payload || !payload.admin) return json({ erro: 'Acesso negado' }, 403);

      const body     = await request.json().catch(() => ({}));
      const id       = parseInt(String(body.id ?? ''), 10);
      const aprovar  = !!body.aprovar;

      if (!Number.isFinite(id)) return json({ erro: 'id inválido' }, 400);

      if (aprovar) {
        const user = await env.DB.prepare(
          'SELECT nova_senha_hash, nova_senha_salt FROM users WHERE id = ? AND reset_senha_pendente = 1'
        ).bind(id).first();

        if (!user || !user.nova_senha_hash)
          return json({ erro: 'Nenhuma solicitação pendentce para este usuário' }, 404);

        await env.DB.prepare(
          'UPDATE users SET senha_hash = ?, salt = ?, reset_senha_pendente = 0, nova_senha_hash = NULL, nova_senha_salt = NULL WHERE id = ?'
        ).bind(user.nova_senha_hash, user.nova_senha_salt, id).run();
      } else {
        await env.DB.prepare(
          'UPDATE users SET reset_senha_pendente = 0, nova_senha_hash = NULL, nova_senha_salt = NULL WHERE id = ?'
        ).bind(id).run();
      }

      return json({ ok: true });
    }

// ============================================================
// NOVAS ROTAS — Cole dentro do seu Worker existente,
// antes do último: return json({ erro: 'Rota não encontrada' }, 404);
// ============================= ===============================

// ============================================================
// POST /fleet/vehicles  — salva veículos de um lote decodificado
// Body: { fleet_name, history_id, vehicles: [...] }
// Cada veículo: { vin, placa, montadora, modelo, submodelo, ano, carroceria, encarrocadora, segmento }
// ============================================================
if (method === 'POST' && path === '/fleet/vehicles') {
  try {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ erro: 'Não autorizado' }, 401);

    const userId = getUserId(payload);
    if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

    const body = await request.json().catch(() => ({}));
    const { fleet_name, history_id, vehicles } = body;

    if (!Array.isArray(vehicles) || vehicles.length === 0)
      return json({ erro: 'vehicles deve ser um array não vazio' }, 400);

    if (vehicles.length > 500)
      return json({ erro: 'Máximo de 500 veículos por requisição' }, 400);

    // Deleta registros antigos da mesma frota ou lote antes de inserir novos
    if (history_id) {
      await env.DB.prepare(
        'DELETE FROM fleet_vehicles WHERE user_id = ? AND history_id = ?'
      ).bind(String(userId), history_id).run();
    }
    if (fleet_name) {
      await env.DB.prepare(
        'DELETE FROM fleet_vehicles WHERE user_id = ? AND fleet_name = ?'
      ).bind(String(userId), String(fleet_name)).run();
    }

    // Insere em batch usando múltiplos INSERTs
    const stmt = env.DB.prepare(
      `INSERT INTO fleet_vehicles
         (user_id, history_id, fleet_name, vin, placa, montadora, modelo, submodelo, ano, carroceria, encarrocadora, segmento, fipe_codigo, fipe_modelo, 
          wmi, motor, posicao_motor, emissoes, combustivel, cor, municipio_uf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const batch = vehicles.map(v =>
      stmt.bind(
        String(userId),
        history_id ? Number(history_id) : null,
        String(fleet_name || '').slice(0, 120),
        String(v.vin         || '').slice(0, 20).toUpperCase(),
        String(v.placa       || '').slice(0, 10).toUpperCase(),
        String(v.montadora   || '').slice(0, 60).toUpperCase(),
        String(v.modelo      || '').slice(0, 80).toUpperCase(),
        String(v.submodelo   || '').slice(0, 80).toUpperCase(),
        String(v.ano         || '').slice(0, 20),
        String(v.carroceria  || '').slice(0, 80),
        String(v.encarrocadora || '').slice(0, 80),
        String(v.segmento    || '').slice(0, 40),
        String(v.fipe_codigo || '').slice(0, 20),
        String(v.fipe_modelo || '').slice(0, 120),
        String(v.wmi         || '').slice(0, 10),
        String(v.motor       || '').slice(0, 80),
        String(v.posicao_motor || '').slice(0, 40),
        String(v.emissoes    || '').slice(0, 60),
        String(v.combustivel || '').slice(0, 40),
        String(v.cor         || '').slice(0, 40),
        String(v.municipio_uf || '').slice(0, 100)
      )
    );

    await env.DB.batch(batch);

    return json({ ok: true, inseridos: vehicles.length }, 201);
  } catch (err) {
    return json({ erro: 'Erro interno: ' + String(err) }, 500);
  }
}

// ============================================================
// GET /fleet/search  — busca veículos com filtros
// Query params: montadora, modelo, submodelo, ano, segmento,
//               placa, fleet_name, limit, offset
// ============================================================
if (method === 'GET' && path === '/fleet/search') {
  try {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ erro: 'Não autorizado' }, 401);

    const userId  = getUserId(payload);
    if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

    const isAdmin = !!payload.admin;

    const montadora    = url.searchParams.get('montadora')    || '';
    const modelo       = url.searchParams.get('modelo')       || '';
    const submodelo    = url.searchParams.get('submodelo')    || '';
    const ano          = url.searchParams.get('ano')          || '';
    const segmento     = url.searchParams.get('segmento')     || '';
    const placa        = url.searchParams.get('placa')        || '';
    const fleet_name   = url.searchParams.get('fleet_name')   || '';
    const history_ids  = url.searchParams.get('history_ids')  || '';
    const q = url.searchParams.get('q') || '';
    const limit        = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')  || '100')));
    const offset       = Math.max(0, parseInt(url.searchParams.get('offset') || '0'));

    let whereClauses = [];
    let bindings     = [];

    // Admin vê tudo, usuário comum vê só os seus
    if (!isAdmin) {
      whereClauses.push('user_id = ?');
      bindings.push(String(userId));
    }

    if (montadora)  { whereClauses.push('montadora = ?');          bindings.push(montadora.toUpperCase()); }
    if (modelo)     { whereClauses.push('modelo LIKE ?');           bindings.push('%' + modelo.toUpperCase() + '%'); }
    if (submodelo)  { whereClauses.push('submodelo LIKE ?');        bindings.push('%' + submodelo.toUpperCase() + '%'); }
    if (ano)        { whereClauses.push('ano LIKE ?');              bindings.push('%' + ano + '%'); }
    if (segmento)   { whereClauses.push('segmento = ?');            bindings.push(segmento); }
    if (placa)      { whereClauses.push('placa LIKE ?');            bindings.push('%' + placa.toUpperCase() + '%'); }
    if (fleet_name) { whereClauses.push('fleet_name LIKE ?');       bindings.push('%' + fleet_name + '%'); }

    if (history_ids) {
      const ids = history_ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      if (ids.length > 0) {
        whereClauses.push(`history_id IN (${ids.map(() => '?').join(',')})`);
        bindings.push(...ids.map(id => Number(id)));
      }
    }

    // Busca global (q) - combinada com os filtros acima
    if (q) {
      const qUp = '%' + q.toUpperCase().trim() + '%';
      whereClauses.push(`(
        placa LIKE ? OR vin LIKE ? OR montadora LIKE ? OR modelo LIKE ? OR 
        fleet_name LIKE ? OR encarrocadora LIKE ? OR fipe_modelo LIKE ?
      )`);
      bindings.push(qUp, qUp, qUp, qUp, qUp, qUp, qUp);
    }

    const where = whereClauses.length > 0 ? ('WHERE ' + whereClauses.join(' AND ')) : '';

    // Total de resultados (para paginação no front)
    const countSQL = `SELECT COUNT(*) as total FROM fleet_vehicles ${where}`;
    const countRow = await env.DB.prepare(countSQL).bind(...bindings).first();
    const total    = countRow ? countRow.total : 0;

    // Busca paginada
    const dataSQL = `
      SELECT id, user_id, fleet_name, vin, placa, montadora, modelo, submodelo, ano,
             carroceria, encarrocadora, segmento, fipe_codigo, fipe_modelo,
             wmi, motor, posicao_motor, emissoes, combustivel, cor, municipio_uf, created_at
      FROM fleet_vehicles
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await env.DB.prepare(dataSQL)
      .bind(...bindings, limit, offset)
      .all();

    return json({ ok: true, total, limit, offset, results: results || [] });
  } catch (err) {
    return json({ erro: 'Erro interno: ' + String(err) }, 500);
  }
}

// ============================================================
// GET /fleet/options  — retorna os valores únicos disponíveis
// para popular os selects de filtro (montadoras, modelos, etc.)
// ============================================================
if (method === 'GET' && path === '/fleet/options') {
  try {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ erro: 'Não autorizado' }, 401);

    const userId  = getUserId(payload);
    if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

    const isAdmin = !!payload.admin;
    const userFilter = isAdmin ? '' : `WHERE user_id = '${String(userId)}'`;

    const run = async (col) => {
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT ${col} FROM fleet_vehicles ${userFilter} AND ${col} != '' ORDER BY ${col}`
          .replace('AND', userFilter ? 'AND' : 'WHERE')
          .replace(/\s+/g, ' ')
      ).all().catch(() => ({ results: [] }));
      return (results || []).map(r => r[col]).filter(Boolean);
    };

    // Query mais simples e segura
    const q = async (col) => {
      const sql = isAdmin
        ? `SELECT DISTINCT ${col} FROM fleet_vehicles WHERE ${col} != '' ORDER BY ${col}`
        : `SELECT DISTINCT ${col} FROM fleet_vehicles WHERE user_id = ? AND ${col} != '' ORDER BY ${col}`;
      const stmt = isAdmin
        ? env.DB.prepare(sql)
        : env.DB.prepare(sql).bind(String(userId));
      const { results } = await stmt.all().catch(() => ({ results: [] }));
      return (results || []).map(r => r[col]).filter(Boolean);
    };

    const [montadoras, modelos, submodelos, anos, segmentos, frotas] = await Promise.all([
      q('montadora'),
      q('modelo'),
      q('submodelo'),
      q('ano'),
      q('segmento'),
      q('fleet_name'),
    ]);

    return json({ ok: true, montadoras, modelos, submodelos, anos, segmentos, frotas });
  } catch (err) {
    return json({ erro: 'Erro interno: ' + String(err) }, 500);
  }
}

// ============================================================
    // DELETE /fleet/vehicles  — remove veículos de um lote
    // ============================================================
    if (method === 'DELETE' && path === '/fleet/vehicles') {
      try {
        const payload = await requireAuth(request, env);
        if (!payload) return json({ erro: 'Não autorizado' }, 401);

        const userId = getUserId(payload);
        if (!userId) return json({ erro: 'user_id inválido no token' }, 400);

        const body       = await request.json().catch(() => ({}));
        const history_id = body.history_id ? Number(body.history_id) : null;
        const fleet_name = body.fleet_name ? String(body.fleet_name) : null;

        if (!history_id && !fleet_name)
          return json({ erro: 'Informe history_id ou fleet_name' }, 400);

        if (history_id) {
          await env.DB.prepare(
            'DELETE FROM fleet_vehicles WHERE user_id = ? AND history_id = ?'
          ).bind(String(userId), history_id).run();
        } else {
          await env.DB.prepare(
            'DELETE FROM fleet_vehicles WHERE user_id = ? AND fleet_name = ?'
          ).bind(String(userId), fleet_name).run();
        }

        return json({ ok: true });
      } catch (err) {
        return json({ erro: 'Erro interno: ' + String(err) }, 500);
      }
    }

    // GET /admin/placas-cache
    if (path === '/admin/placas-cache' && method === 'GET') {
      return handleAdminPlacasCache(request, env);
    }

    return json({ erro: 'Rota não encontrada' }, 404);
    } catch (err) {
      // Garante CORS mesmo em erro 500 inesperado 
      return json({ erro: 'Erro interno: ' + String(err) }, 500);
    }
  },
};

async function handleAdminPlacasCache(request, env) {
  // ✅ USE: JWT como o resto do Worker 
  const payload = await verifyJWT(
    (request.headers.get('Authorization') || '').replace('Bearer ', '').trim(),
    env.JWT_SECRET
  );

  if (!payload) return json({ ok: false, mensagem: 'Não autenticado' }, 401);
   if (!payload.admin) return json({ ok: false, mensagem: 'Acesso negado' }, 403);
 
   // ✅ GUARDA: verifica se o binding KV existe 
   if (!env.PLACAS_CACHE) { 
     return json({ ok: false, mensagem: 'KV binding PLACAS_CACHE não configurado no Worker' }, 503); 
   } 
 
   // Lê os parâmetros de paginação e busca 
  const searchParams = new URL(request.url).searchParams;
  const cursor       = searchParams.get('cursor') || undefined;
  const prefix       = searchParams.get('prefix') || 'ob:';  // padrão: cache do OnibusBrasil 
  const limit        = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const busca        = (searchParams.get('q') || '').toUpperCase().trim();

  // Lista as chaves do KV com paginação via cursor 
  const listResult = await env.PLACAS_CACHE.list({
    prefix,
    limit,
    cursor: cursor || undefined,
  });

  // Busca os valores de cada chave em paralelo (lotes de 20 para não sobrecarregar) 
  const LOTE = 20;
  const entries = [];

  for (let i = 0; i < listResult.keys.length; i += LOTE) {
    const batch = listResult.keys.slice(i, i + LOTE);
    const values = await Promise.all(
      batch.map(k => env.PLACAS_CACHE.get(k.name, { type: 'json' }))
    );
    batch.forEach((k, idx) => {
      const val = values[idx];
      if (!val) return;
      // Filtro de busca no servidor se informado 
      if (busca && !(k.name + JSON.stringify(val)).toUpperCase().includes(busca)) return;
      entries.push({ key: k.name, ...val });
    });
  }

  return json({
    ok: true,
    entries,
    cursor:      listResult.cursor     || null,
    list_complete: listResult.list_complete ?? true,
    total_this_page: entries.length,
  });
}