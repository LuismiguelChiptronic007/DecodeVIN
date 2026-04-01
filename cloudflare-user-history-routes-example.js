/**
 * Rotas de histórico por CONTA (visível em qualquer aparelho após login).
 * Integre no Worker decodevinbus-auth junto com cloudflare-audit-routes-example.js.
 *
 * SQL (D1):
 * CREATE TABLE IF NOT EXISTS user_history (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   user_id INTEGER NOT NULL,
 *   email TEXT,
 *   nome TEXT,
 *   kind TEXT NOT NULL,
 *   payload TEXT NOT NULL,
 *   created_at TEXT DEFAULT (datetime('now'))
 * );
 * CREATE INDEX IF NOT EXISTS idx_user_history_uid ON user_history(user_id, id DESC);
 *
 * No fetch, antes do 404:
 *   if (url.pathname === '/user/history' && request.method === 'GET') return handleUserHistoryGet(request, env);
 *   if (url.pathname === '/user/history' && request.method === 'POST') return handleUserHistoryPost(request, env);
 *   if (url.pathname === '/user/history' && request.method === 'DELETE') return handleUserHistoryDelete(request, env);
 *   if (url.pathname === '/admin/user-history' && request.method === 'GET') return handleAdminUserHistoryGet(request, env);
 */

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
  const jsonTxt = new TextDecoder().decode(
    Uint8Array.from(atob(payloadB64 + pad2), (c) => c.charCodeAt(0))
  );
  return JSON.parse(jsonTxt);
}

function getUserIdFromPayload(payload) {
  const v = payload.userId ?? payload.id ?? payload.sub;
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) throw new Error("no user id in token");
  return n;
}

const MAX_PAYLOAD = 450000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function handleUserHistoryGet(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ erro: "Não autorizado" }, 401);

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return json({ erro: "Token inválido" }, 401);
  }
  const userId = getUserIdFromPayload(payload);

  const { results } = await env.DB.prepare(
    `SELECT id, kind, payload, created_at FROM user_history WHERE user_id = ? ORDER BY id DESC LIMIT 150`
  )
    .bind(userId)
    .all();

  const single = [];
  const group = [];
  for (const row of results || []) {
    let p;
    try {
      p = JSON.parse(row.payload);
    } catch {
      continue;
    }
    if (row.kind === "single") {
      single.push({
        id: row.id,
        input: p.input || "",
        plate: p.plate || "",
        ts: typeof p.ts === "number" ? p.ts : Date.now()
      });
    } else if (row.kind === "group") {
      group.push({
        id: row.id,
        vins: p.vins || "",
        plates: p.plates || "",
        fleetName: p.fleetName || "",
        ts: typeof p.ts === "number" ? p.ts : Date.now()
      });
    }
  }
  return json({ single, group }, 200);
}

export async function handleUserHistoryPost(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ erro: "Não autorizado" }, 401);

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return json({ erro: "Token inválido" }, 401);
  }
  const userId = getUserIdFromPayload(payload);
  const email = payload.email != null ? String(payload.email) : "";
  const nome = payload.nome != null ? String(payload.nome) : "";

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "group" ? "group" : "single";
  const raw = JSON.stringify(body.payload != null ? body.payload : {});
  if (raw.length > MAX_PAYLOAD) return json({ erro: "Payload grande demais" }, 413);

  const r = await env.DB.prepare(
    `INSERT INTO user_history (user_id, email, nome, kind, payload) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(userId, email, nome, kind, raw)
    .run();

  const id = r.meta?.last_row_id;
  return json({ ok: true, id: id != null ? id : undefined });
}

export async function handleUserHistoryDelete(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ erro: "Não autorizado" }, 401);

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return json({ erro: "Token inválido" }, 401);
  }
  const userId = getUserIdFromPayload(payload);

  const body = await request.json().catch(() => ({}));
  const id = parseInt(String(body.id || ""), 10);
  if (!Number.isFinite(id)) return json({ erro: "id inválido" }, 400);

  await env.DB.prepare(`DELETE FROM user_history WHERE id = ? AND user_id = ?`).bind(id, userId).run();
  return json({ ok: true });
}

export async function handleAdminUserHistoryGet(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ erro: "Não autorizado" }, 401);

  let payload;
  try {
    payload = await verifyHs256Jwt(token, env.JWT_SECRET);
  } catch {
    return json({ erro: "Token inválido" }, 401);
  }
  if (!payload.admin) return json({ erro: "Acesso negado" }, 403);

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "300", 10) || 300));

  const { results } = await env.DB.prepare(
    `SELECT id, user_id, email, nome, kind, payload, created_at
     FROM user_history ORDER BY id DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  const entries = (results || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email || "",
    nome: row.nome || "",
    kind: row.kind,
    payload: row.payload,
    created_at: row.created_at
  }));

  return json({ entries });
}
