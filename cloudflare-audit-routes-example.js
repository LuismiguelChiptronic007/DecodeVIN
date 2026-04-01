/**
 * Trecho para integrar no Worker decodevinbus-auth (Cloudflare).
 *
 * 1) Crie a tabela D1 (SQL abaixo) e faça o bind `DB` no wrangler.toml.
 * 2) Copie as funções e os `if` do fetch para o seu handler, depois de validar JWT
 *    do mesmo jeito que em /verify e /admin/users.
 * 3) Ajuste getUserIdFromPayload() aos campos do seu token (id, sub, etc.).
 *
 * SQL (D1):
 * CREATE TABLE IF NOT EXISTS search_audit (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   user_id INTEGER NOT NULL,
 *   email TEXT,
 *   nome TEXT,
 *   tipo TEXT,
 *   placa TEXT,
 *   vin TEXT,
 *   detalhe TEXT,
 *   fleet_name TEXT,
 *   created_at TEXT DEFAULT (datetime('now'))
 * );
 * CREATE INDEX IF NOT EXISTS idx_search_audit_created ON search_audit(created_at DESC);
 */

// --- Exemplo: validar HS256 com JWT_SECRET (igual muitos Workers simples) ---
async function verifyHs256Jwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("jwt");
  const [h, p, sigB64] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = enc.encode(`${h}.${p}`);
  const pad = sigB64.length % 4 === 0 ? "" : "=".repeat(4 - (sigB64.length % 4));
  const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) throw new Error("sig");
  const payloadB64 = p.replace(/-/g, "+").replace(/_/g, "/");
  const pad2 = payloadB64.length % 4 === 0 ? "" : "=".repeat(4 - (payloadB64.length % 4));
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(payloadB64 + pad2), (c) => c.charCodeAt(0))
  );
  return JSON.parse(json);
}

function getUserIdFromPayload(payload) {
  const v = payload.userId ?? payload.id ?? payload.sub;
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) throw new Error("no user id in token");
  return n;
}

export async function handleAuditSearch(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return new Response(JSON.stringify({ erro: "Não autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return new Response(JSON.stringify({ erro: "Token inválido" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const userId = getUserIdFromPayload(payload);
  const body = await request.json().catch(() => ({}));
  const tipo = String(body.tipo || "outro").slice(0, 32);
  const placa = String(body.placa || "").slice(0, 12);
  const vin = String(body.vin || "").slice(0, 24);
  const detalhe = String(body.detalhe || "").slice(0, 500);
  const fleetName = String(body.fleetName || "").slice(0, 120);

  const email = payload.email != null ? String(payload.email) : "";
  const nome = payload.nome != null ? String(payload.nome) : "";

  await env.DB.prepare(
    `INSERT INTO search_audit (user_id, email, nome, tipo, placa, vin, detalhe, fleet_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, email, nome, tipo, placa, vin, detalhe, fleetName)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function handleAdminSearchAudit(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return new Response(JSON.stringify({ erro: "Não autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return new Response(JSON.stringify({ erro: "Token inválido" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  if (!payload.admin) {
    return new Response(JSON.stringify({ erro: "Acesso negado" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));

  const { results } = await env.DB.prepare(
    `SELECT id, user_id, email, nome, tipo, placa, vin, detalhe, fleet_name, created_at
     FROM search_audit ORDER BY id DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  return new Response(JSON.stringify({ logs: results }), {
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * No fetch do Worker, antes do 404:
 *
 *   if (url.pathname === '/audit/search' && request.method === 'POST') {
 *     return handleAuditSearch(request, env);
 *   }
 *   if (url.pathname === '/admin/search-audit' && request.method === 'GET') {
 *     return handleAdminSearchAudit(request, env);
 *   }
 */
