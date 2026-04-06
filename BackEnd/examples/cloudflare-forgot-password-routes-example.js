/**
 * Rotas para recuperação de senha SEM e-mail.
 * Integre no seu Worker decodevinbus-auth.
 *
 * SQL (D1) - Execute estas alterações no seu banco:
 * ALTER TABLE usuarios ADD COLUMN reset_senha_pendente INTEGER DEFAULT 0;
 * ALTER TABLE usuarios ADD COLUMN nova_senha_proposta TEXT;
 */

// Função auxiliar para gerar hash de senha (se o seu worker não tiver uma)
// Note: Se você já usa uma biblioteca como bcrypt ou similar, use-a.
// Este exemplo assume que você salva a senha diretamente ou via algum hash simples no worker.

export async function handleRequestPasswordReset(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, novaSenha } = body;

  if (!email || !novaSenha) {
    return new Response(JSON.stringify({ erro: "E-mail e nova senha são obrigatórios." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Verifica se o usuário existe
  const user = await env.DB.prepare("SELECT id FROM usuarios WHERE email = ?")
    .bind(email)
    .first();

  if (!user) {
    return new Response(JSON.stringify({ erro: "E-mail não encontrado no sistema." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Salva a solicitação (em produção, você deve dar hash na senha aqui)
  // Exemplo: const hash = await someHashFunction(novaSenha);
  await env.DB.prepare(
    "UPDATE usuarios SET reset_senha_pendente = 1, nova_senha_proposta = ? WHERE id = ?"
  )
    .bind(novaSenha, user.id)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function handleApprovePasswordReset(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return new Response(JSON.stringify({ erro: "Não autorizado" }), { status: 401 });

  // Validação de Admin (reutilize sua função verifyHs256Jwt)
  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return new Response(JSON.stringify({ erro: "Token inválido" }), { status: 401 });
  }

  if (!payload.admin) {
    return new Response(JSON.stringify({ erro: "Acesso negado" }), { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id, aprovado } = body;

  if (id == null) return new Response(JSON.stringify({ erro: "ID do usuário é obrigatório." }), { status: 400 });

  if (aprovado) {
    // Busca a senha proposta
    const user = await env.DB.prepare("SELECT nova_senha_proposta FROM usuarios WHERE id = ?")
      .bind(id)
      .first();

    if (user && user.nova_senha_proposta) {
      // Efetiva a nova senha e limpa a solicitação
      await env.DB.prepare(
        "UPDATE usuarios SET senha = ?, reset_senha_pendente = 0, nova_senha_proposta = NULL WHERE id = ?"
      )
        .bind(user.nova_senha_proposta, id)
        .run();
    }
  } else {
    // Apenas recusa e limpa a solicitação
    await env.DB.prepare(
      "UPDATE usuarios SET reset_senha_pendente = 0, nova_senha_proposta = NULL WHERE id = ?"
    )
      .bind(id)
      .run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * No fetch principal do seu Worker, adicione:
 *
 *  if (url.pathname === '/user/request-password-reset' && request.method === 'POST') {
 *    return handleRequestPasswordReset(request, env);
 *  }
 *  if (url.pathname === '/admin/approve-password-reset' && request.method === 'POST') {
 *    return handleApprovePasswordReset(request, env);
 *  }
 */
