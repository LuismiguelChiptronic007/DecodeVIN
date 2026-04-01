import { createDecoder } from "./decoder.js";

// Carrega as regras de decodificação usadas para interpretar chassi e VIN.
async function loadRules() {
  const res = await fetch("./data/manufacturers.json");
  return await res.json();
}

// Faz requisições com timeout para evitar que a interface fique travada.
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Timeout na requisição');
    }
    throw error;
  }
}

async function consultarKePlaca(placa) {
  try {
    if (window.consultarKePlaca) {
      return await window.consultarKePlaca(placa);
    }
    return null; 
  } catch (e) {
    console.error("Erro KePlaca (Wrapper):", e);
    return null;
  }
}

// Consulta a API de placa e normaliza a resposta para o fluxo da tela.
async function consultarPlacaPHP(placa, chassiDigitado = "") {
  try {
    console.log("Consultando Worker para placa:", placa);

    let workerUrl = `https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev/?placa=${placa}`;
    if (chassiDigitado) {
      workerUrl += `&chassi=${chassiDigitado}`;
    }

    const resp = await fetchWithTimeout(workerUrl, { timeout: 15000 });
    const data = await resp.json();

    console.log("Resposta do Worker:", data);

    if (data.status !== "ok" && !(data.marca || data.modelo || data.chassi_completo || data.chassi_raw_api)) {
      return {
        status: "erro",
        mensagem: data.mensagem || "Placa não encontrada."
      };
    }

    if (data.marca || data.modelo || data.chassi_completo || data.chassi_raw_api) {
      data.status = "ok";
    }

    return data;

  } catch (e) {
    console.error("Erro ao consultar Worker:", e);
    return {
      status: "erro",
      mensagem: e.message === "Timeout na requisição"
        ? "Tempo limite excedido."
        : "Erro de conexão com o servidor."
    };
  }
}

async function buscarFallbackKePlaca(placa) {
  try {
    const workerUrl = `https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev/?placa=${placa}`;
    const resp = await fetchWithTimeout(workerUrl, { timeout: 10000 });
    const data = await resp.json();
    if (data.status === "ok" || data.marca || data.modelo) {
      return data;
    }
    return null;
  } catch (e) {
    console.error("Erro ao buscar fallback KePlaca:", e);
    return null;
  }
}

function el(id) {
  return document.getElementById(id);
}

const TOOLTIPS = {
  "WMI": "World Manufacturer Identifier: Identifica o fabricante e o país de origem.",
  "VDS": "Vehicle Descriptor Section: Contém informações sobre o modelo, tipo de motor e carroceria.",
  "VIS": "Vehicle Identifier Section: Identifica o veículo específico (número de série e ano).",
  "MODELO DO CHASSI": "Nome comercial ou código interno do modelo do chassi.",
  "CARROCERIA": "Tipo de estrutura ou aplicação para a qual o chassi foi projetado.",
  "POSIÇÃO DO MOTOR": "Localização onde o motor é instalado no chassi.",
  "MOTOR": "Modelo ou família do motor que equipa o veículo.",
  "ANO MODELO": "O ano referente ao modelo do veículo (não necessariamente o ano de fabricação).",
  "DÍGITO VERIFICADOR": "Algoritmo usado para validar a autenticidade do número do chassi.",
  "NORMA DE EMISSÕES": "Classificação ambiental do motor (ex: Euro 5, Proconve P7).",
  "TIPO DE MOTOR/INSTALAÇÃO": "Orientação e posicionamento do motor (Ex: Longitudinal, Transversal).",
  "POTÊNCIA APROXIMADA (CV)": "Cavalaria estimada baseada no código do fabricante.",
  "ADAPTAÇÃO": "Configuração do chassi (Ex: Articulado, Convencional).",
  "TRAÇÃO": "Configuração de eixos (Ex: 4x2, 6x2).",
  "ALTURA DO CHASSI/PISO": "Nível do piso em relação ao solo (Ex: Piso baixo, Rodoviário).",
  "CÓDIGO COMERCIAL DO CHASSI": "Identificação simplificada usada pelo fabricante para vendas.",
  "ENCARROÇADORA": "Fabricante da estrutura externa (carroceria) do ônibus.",
  "EMPRESA": "Operador ou proprietário registrado do veículo.",
  "CHASSI (OB)": "Modelo do chassi conforme registrado no Ônibus Brasil."
};

function isMfrMatch(m1, m2) {
  if (!m1 || !m2 || m1 === "—" || m2 === "—") return true; 
  const s1 = m1.toLowerCase();
  const s2 = m2.toLowerCase();
  
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const n1 = norm(s1);
  const n2 = norm(s2);

  const brands = [
    { keys: ["mercedes", "mb", "daimler"], label: "mercedes" },
    { keys: ["volks", "vw", "man"], label: "volkswagen" },
    { keys: ["scania"], label: "scania" },
    { keys: ["volvo"], label: "volvo" },
    { keys: ["iveco"], label: "iveco" },
    { keys: ["agrale"], label: "agrale" },
    { keys: ["marcopolo"], label: "marcopolo" },
    { keys: ["caio"], label: "caio" },
    { keys: ["mascarello"], label: "mascarello" },
    { keys: ["comil"], label: "comil" },
    { keys: ["neobus"], label: "neobus" }
  ];

  for (const b of brands) {
    const m1Match = b.keys.some(k => n1.includes(k));
    const m2Match = b.keys.some(k => n2.includes(k));
    if (m1Match && m2Match) return true;
  }
  
  return n1.includes(n2) || n2.includes(n1);
}

function isChassisMatch(vin, partial) {
  if (!vin || !partial || partial === "—") return true;
  const v = vin.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const p = partial.toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  const hasNumbers = /[0-9]/.test(p);
  const isLikelySerial = hasNumbers && p.length >= 4;
  
  const isModel = !isLikelySerial && p.length < 17 && (
    p.length < 4 ||
    /^[A-Z]+$/.test(p) ||
    p.includes("-") || p.includes(" ")
  );

  if (isModel) {
    console.log(`[Validando Chassi] Ignorando validação estrita: '${p}' parece ser um NOME DE MODELO.`);
    return true; 
  }

  console.log(`[Validando Chassi] Digitado: ${v} | Retornado da API: ${p}`);

  if (p.length === 17) {
    const match = v === p;
    console.log(`[Validando Chassi] Comparação 17 chars: ${match ? "OK" : "DIVERGENTE"}`);
    return match;
  }

  if (p.length === 8) {
    const match = v.endsWith(p);
    console.log(`[Validando Chassi] Comparação 8 chars (final): ${match ? "OK" : "DIVERGENTE"}`);
    return match;
  }
  
  const match = v.includes(p);
  console.log(`[Validando Chassi] Comparação parcial (${p.length} chars): ${match ? "OK" : "DIVERGENTE"}`);
  return match;
}

function card(label, value, badge = null) {
  const d = document.createElement("div");
  d.className = "card";
  
  const exists = value && value !== "—" && value !== "undefined";
  const displayValue = exists ? String(value) : "Não encontrado na API";
  if (!exists) d.style.opacity = "0.5";

  if (badge) {
    const b = document.createElement("div");
    b.style.cssText = "position:absolute;top:6px;right:6px;font-size:9px;background:rgba(56,189,248,0.15);color:var(--accent-2);border:1px solid var(--accent-2);border-radius:4px;padding:1px 5px;font-weight:600;";
    b.textContent = badge;
    d.style.position = "relative";
    d.appendChild(b);
  }

  const tooltipText = TOOLTIPS[label.toUpperCase()];
  if (tooltipText) {
    const icon = document.createElement("div");
    icon.className = "help-icon";
    icon.textContent = "?";
    icon.setAttribute("data-tooltip", tooltipText);
    d.appendChild(icon);
  }
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "value";
  v.textContent = displayValue;
  d.appendChild(l);
  d.appendChild(v);
  return d;
}

function cardSkeleton() {
  const d = document.createElement("div");
  d.className = "card loading";
  
  const l = document.createElement("div");
  l.className = "label skeleton skeleton-text";
  
  const v = document.createElement("div");
  v.className = "value skeleton skeleton-value";
  
  d.appendChild(l);
  d.appendChild(v);
  return d;
}

function showToast(message, type = "success") {
  const existing = document.querySelector(".custom-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "custom-toast";
  
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-elev);
    border: 2px solid ${type === "error" ? "var(--danger)" : "var(--accent)"};
    padding: 24px 32px;
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5), var(--shadow);
    z-index: 9999;
    color: var(--text);
    text-align: center;
    max-width: 400px;
    width: 90%;
    animation: toast-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    font-weight: 500;
    line-height: 1.5;
  `;

  toast.innerHTML = `
    <div style="font-size: 32px; margin-bottom: 12px;">${type === "error" ? "⚠️" : "✅"}</div>
    <div style="font-size: 16px;">${message}</div>
    <button style="margin-top: 20px; width: 100%;" onclick="this.parentElement.remove()">OK</button>
  `;

  document.body.appendChild(toast);

  if (!document.getElementById("toast-styles")) {
    const style = document.createElement("style");
    style.id = "toast-styles";
    style.innerHTML = `
      @keyframes toast-in {
        from { opacity: 0; transform: translate(-50%, -40%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

window.showToast = showToast;

function showSkeletons(container, count = 4) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    container.appendChild(cardSkeleton());
  }
  centerGrid(container);
}

function centerGrid(container) {
  if (!container) return;
  container.style.display = "grid";
  container.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 280px))";
  container.style.justifyContent = "center";
  container.style.gap = "15px";
  container.style.width = "100%";
}

window.centerGrid = centerGrid;

function toggleValueSkeletons(container, isLoading, restoreValue = true) {
  if (!container) return;
  const values = container.querySelectorAll(".value");
  values.forEach(v => {
    if (isLoading) {
      v.classList.add("skeleton");
      v.classList.add("skeleton-value");
      v.dataset.oldValue = v.textContent;
      v.textContent = "";
    } else {
      v.classList.remove("skeleton");
      v.classList.remove("skeleton-value");
      if (restoreValue && v.dataset.oldValue) v.textContent = v.dataset.oldValue;
    }
  });
}

function renderResult(result, text) {
  const segs = el("segments");
  const cards = el("cards");
  const errors = el("errors");

  if (segs) {
    segs.innerHTML = "";
    segs.style.display = "none";
  }

  if (cards) {
    cards.innerHTML = "";
    const fragment = document.createDocumentFragment();
    result.tokens.forEach(t => {
      if (t.value != null && t.value !== "—") {
        fragment.appendChild(card(t.label, t.value));
      }
    });
    cards.appendChild(fragment);
    centerGrid(cards);
  }

  if (errors) {
    errors.innerHTML = "";
    if (result.errors && result.errors.length > 0) {
      result.errors.forEach(e => {
        const d = document.createElement("div");
        d.className = "error";
        d.textContent = e;
        errors.appendChild(d);
      });
    }
  }
}

window.toggleValueSkeletons = toggleValueSkeletons;
window.showSkeletons = showSkeletons;

function setSegments(result, container) {
  if (!container) container = el("segments");
  if (!container) return;
  container.innerHTML = "";
  container.style.display = "none";
}

function setCards(result, targetContainer) {
  const c = targetContainer || el("cards");
  if (!c) return;
  c.innerHTML = "";
  if (!result || result.type === "UNKNOWN") return;
  const fragment = document.createDocumentFragment();
  result.tokens.forEach(t => {
    if (t.value != null && t.value !== "—") {
      fragment.appendChild(card(t.label, t.value));
    }
  });
  c.appendChild(fragment);
}

function setErrors(result) {
  const e = el("errors");
  if (!e) return;
  e.innerHTML = "";
  const errs = result.errors || [];
  if (!errs.length) return;
  const d = document.createElement("div");
  d.className = "error";
  d.textContent = errs.join(" • ");
  e.appendChild(d);
}

let currentHistoryPage = 1;
let currentGroupHistoryPage = 1;
const HISTORY_PAGE_SIZE = 10;
let singleHistoryFetchGen = 0;
let groupHistoryFetchGen = 0;

function addHistoryEntry(input, plateOverride = "") {
  const key = "decodevin.history";
  const pInput = el("plateInputSingle");
  const plate = plateOverride || (pInput ? pInput.value.trim().toUpperCase() : "");
  if (!input && !plate) return;
  const entry = { input, plate, ts: Date.now() };
  const token = localStorage.getItem("dvb_token");

  function pushLocalOnly() {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const newList = [entry, ...list.filter(x => x.input !== input || (input === "" && x.plate !== plate))].slice(0, 100);
    localStorage.setItem(key, JSON.stringify(newList));
    currentHistoryPage = 1;
    renderHistory();
  }

  if (token && typeof window.dvbHistoricoUsuarioPost === "function") {
    window.dvbHistoricoUsuarioPost("single", entry).then((r) => {
      if (r && r.ok) {
        currentHistoryPage = 1;
        renderHistory();
        return;
      }
      pushLocalOnly();
    });
    return;
  }
  pushLocalOnly();
}

function addGroupHistoryEntry(vins, plates) {
  const key = "decodevin.groupHistory";
  if (!vins && !plates) return;

  const fInput = el("fleetName");
  const fleetName = fInput ? fInput.value.trim() : "";

  const entry = { vins, plates, fleetName, ts: Date.now() };
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const lastEntry = list[0];
  if (lastEntry && lastEntry.vins === vins && lastEntry.plates === plates && lastEntry.fleetName === fleetName) return;

  const token = localStorage.getItem("dvb_token");

  function pushLocalOnly() {
    const cur = JSON.parse(localStorage.getItem(key) || "[]");
    const newList = [entry, ...cur].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(newList));
    currentGroupHistoryPage = 1;
    renderHistory();
  }

  if (token && typeof window.dvbHistoricoUsuarioPost === "function") {
    window.dvbHistoricoUsuarioPost("group", entry).then((r) => {
      if (r && r.ok) {
        currentGroupHistoryPage = 1;
        renderHistory();
        if (fInput) fInput.value = "";
        return;
      }
      pushLocalOnly();
      if (fInput) fInput.value = "";
    });
    return;
  }
  pushLocalOnly();
  if (fInput) fInput.value = "";
}

function renderHistory() {
  renderSingleHistory();
  renderGroupHistory();
}
window.renderHistory = renderHistory;

  const parseHistoricoPayload = (raw) => {
    if (raw == null) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return {};
    }
  };

  const normHistVin = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normHistPlate = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  function dedupeSingleHistoryList(list) {
    const map = new Map();
    for (const item of list) {
      const userKey =
        item.auditEmail ||
        (item.userId != null ? String(item.userId) : "") ||
        (item.fromServer ? "self" : "local");
      const q = `${normHistVin(item.input)}|${normHistPlate(item.plate)}`;
      const k = `${userKey}::${q}`;
      const prev = map.get(k);
      if (!prev || item.ts >= prev.ts) map.set(k, item);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }

  function dedupeGroupHistoryList(list) {
    const map = new Map();
    for (const item of list) {
      const userKey =
        item.auditEmail ||
        (item.userId != null ? String(item.userId) : "") ||
        (item.fromServer ? "self" : "local");
      const body = `${String(item.vins || "").trim()}|${String(item.plates || "").trim()}|${String(item.fleetName || "").trim()}`;
      const k = `${userKey}::${body}`;
      const prev = map.get(k);
      if (!prev || item.ts >= prev.ts) map.set(k, item);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }

  const renderSingleHistory = async () => {
    const key = "decodevin.history";
    let list = JSON.parse(localStorage.getItem(key) || "[]");
    const sessUser = JSON.parse(localStorage.getItem("dvb_user") || "null");
    const token = localStorage.getItem("dvb_token");
    singleHistoryFetchGen++;
    const gen = singleHistoryFetchGen;

    if (token && sessUser && sessUser.admin && typeof window.dvbHistoricoAdminGet === "function") {
      try {
        const res = await window.dvbHistoricoAdminGet();
        if (gen !== singleHistoryFetchGen) return;
        if (res && res.ok && Array.isArray(res.entries)) {
          list = res.entries
            .filter(e => e.kind === "single")
            .map(e => {
              const p = parseHistoricoPayload(e.payload);
              const vin = String(p.input || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
              const plate = String(p.plate || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
              return {
                input: vin,
                plate,
                ts: typeof p.ts === "number" ? p.ts : new Date(e.created_at || Date.now()).getTime(),
                serverId: e.id,
                userId: e.user_id,
                auditBy: e.nome || "—",
                auditEmail: e.email || "",
                adminGlobal: true
              };
            })
            .filter(x => x.input || x.plate)
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 250);
        }
      } catch (_) {
        if (gen !== singleHistoryFetchGen) return;
      }
    } else if (token && typeof window.dvbHistoricoUsuarioGet === "function") {
      try {
        const res = await window.dvbHistoricoUsuarioGet();
        if (gen !== singleHistoryFetchGen) return;
        if (res && res.ok && Array.isArray(res.single) && res.single.length > 0) {
          list = res.single
            .map(s => ({
              input: String(s.input || ""),
              plate: String(s.plate || ""),
              ts: typeof s.ts === "number" ? s.ts : Date.now(),
              serverId: s.id,
              fromServer: true
            }))
            .filter(x => x.input || x.plate);
        }
      } catch (_) {
        if (gen !== singleHistoryFetchGen) return;
      }
    } else if (gen !== singleHistoryFetchGen) {
      return;
    }

    list = dedupeSingleHistoryList(list);

    const h = el("history");
    if (!h) return;
    h.innerHTML = "";

    if (sessUser && sessUser.admin) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;";
      note.textContent =
        "Visão de administrador: histórico de todos os usuários (👤). Você só remove as linhas que forem suas.";
      h.appendChild(note);
    } else if (token) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;";
      note.textContent =
        "Histórico ligado à sua conta — o mesmo em qualquer PC ou celular após login.";
      h.appendChild(note);
    }

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Buscar no histórico (chassi, placa ou nome)…";
    searchInput.style.marginBottom = "12px";
    searchInput.style.fontSize = "13px";
    searchInput.style.width = "100%";
    searchInput.style.boxSizing = "border-box";
    searchInput.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      renderSingleHistoryItems(list.filter(item =>
        (item.input || "").toLowerCase().includes(term) ||
        (item.plate || "").toLowerCase().includes(term) ||
        (item.auditBy || "").toLowerCase().includes(term) ||
        (item.auditEmail || "").toLowerCase().includes(term)
      ), sessUser);
    };
    h.appendChild(searchInput);

    const listContainer = document.createElement("div");
    listContainer.id = "singleHistoryList";
    h.appendChild(listContainer);

    renderSingleHistoryItems(list, sessUser);
  };

  const historicoPodeRemoverSingle = (item, sessUser) => {
    if (item.adminGlobal) {
      if (sessUser && sessUser.id != null && item.userId != null) {
        return Number(item.userId) === Number(sessUser.id);
      }
      if (sessUser && sessUser.email && item.auditEmail) {
        return String(item.auditEmail).toLowerCase() === String(sessUser.email).toLowerCase();
      }
      return false;
    }
    return true;
  };

  const renderSingleHistoryItems = (list, sessUser) => {
    const h = el("singleHistoryList");
    if (!h) return;
    h.innerHTML = "";

    if (list.length === 0) {
      h.innerHTML = `<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item encontrado.</div>`;
      return;
    }

    const totalPages = Math.ceil(list.length / HISTORY_PAGE_SIZE);
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
    if (currentHistoryPage < 1) currentHistoryPage = 1;

    const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
    const end = start + HISTORY_PAGE_SIZE;
    const pageList = list.slice(start, end);

    pageList.forEach((item, idx) => {
      const indexInFullList = start + idx;
      const row = document.createElement("div");
      row.className = "item clickable";
      
      const v = document.createElement("div");
      v.style.flex = "1";
      v.style.display = "flex";
      v.style.flexDirection = "column";
      v.style.gap = "4px";

      const main = document.createElement("div");
      main.textContent = (item.input || "Placa: " + item.plate);
      if (item.input && item.plate) {
        const p = document.createElement("span");
        p.style.fontSize = "12px"; p.style.color = "var(--accent)"; p.style.marginLeft = "8px";
        p.textContent = `[${item.plate}]`;
        main.appendChild(p);
      }
      v.appendChild(main);

      if (item.auditBy) {
        const sub = document.createElement("div");
        sub.style.fontSize = "11px";
        sub.style.color = "var(--muted)";
        sub.textContent =
          `👤 ${item.auditBy}` + (item.auditEmail ? ` · ${item.auditEmail}` : "");
        v.appendChild(sub);
      }
      
      v.onclick = () => {
        const vInput = el("vinInputSingle");
        const pInput = el("plateInputSingle");
        const bSingle = el("btnDecodeSingle");
        const bPlate = el("btnPlateSingle");
        
        const vinVal = (item.input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const plateVal = (item.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

        const curVinVal = (vInput ? vInput.value : "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const curPlateVal = (pInput ? pInput.value : "").toUpperCase().replace(/[^A-Z0-9]/g, "");

        const isFieldsEmpty = !curVinVal && !curPlateVal;

        // Verifica se este item já está decodificado na tela
        const currentFingerprint = JSON.stringify({ vin: vinVal, plate: plateVal });

        if (!isFieldsEmpty && window.currentSingleResult && window.lastSingleFingerprint === currentFingerprint) {
          // Se já estiver na tela, apenas muda para a tela de busca única se necessário
          const singleDecoder = el("singleDecoder");
          if (singleDecoder && singleDecoder.style.display === "none") {
            const optSingle = el("optSingle");
            if (optSingle) optSingle.click();
          }
          return;
        }

        if (item.input && vInput) vInput.value = item.input;
        if (item.plate && pInput) pInput.value = item.plate;

        if (item.plate && bPlate) {
          bPlate.disabled = false;
          bPlate.click();
        } else if (item.input && bSingle) {
          bSingle.disabled = false;
          bSingle.click();
        }
      };

      const podeRemover = historicoPodeRemoverSingle(item, sessUser);

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete-item";
      btnDelete.innerHTML = "&times;";
      btnDelete.title = "Remover este item";
      btnDelete.style.zIndex = "10";
      btnDelete.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!podeRemover) return;
        if (item.serverId && typeof window.dvbHistoricoUsuarioDelete === "function") {
          const dr = await window.dvbHistoricoUsuarioDelete(item.serverId);
          if (dr && dr.ok) {
            const currentList = JSON.parse(localStorage.getItem("decodevin.history") || "[]");
            const newList = currentList.filter(x => x.ts !== item.ts);
            localStorage.setItem("decodevin.history", JSON.stringify(newList));
            renderSingleHistory();
          }
          return;
        }
        const currentList = JSON.parse(localStorage.getItem("decodevin.history") || "[]");
        const newList = currentList.filter(x => x.ts !== item.ts);
        localStorage.setItem("decodevin.history", JSON.stringify(newList));
        renderSingleHistory();
      };
      if (!podeRemover) {
        btnDelete.style.visibility = "hidden";
        btnDelete.style.pointerEvents = "none";
      }

      row.appendChild(v);
      row.appendChild(btnDelete);
      h.appendChild(row);
    });

    if (totalPages > 1) {
      const pagination = document.createElement("div");
      pagination.className = "history-pagination";
      pagination.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px; padding: 10px;";

      const btnPrev = document.createElement("button");
      btnPrev.textContent = "← Anterior";
      btnPrev.disabled = currentHistoryPage === 1;
      btnPrev.className = "btn-page";
      btnPrev.onclick = () => { currentHistoryPage--; renderSingleHistory(); };

      const pageInfo = document.createElement("span");
      pageInfo.textContent = `Página ${currentHistoryPage} de ${totalPages}`;
      pageInfo.style.fontSize = "14px";
      pageInfo.style.color = "var(--muted)";

      const btnNext = document.createElement("button");
      btnNext.textContent = "Próximo →";
      btnNext.disabled = currentHistoryPage === totalPages;
      btnNext.className = "btn-page";
      btnNext.onclick = () => { currentHistoryPage++; renderSingleHistory(); };

      pagination.appendChild(btnPrev);
      pagination.appendChild(pageInfo);
      pagination.appendChild(btnNext);
      h.appendChild(pagination);
    }
  };

  window.renderSingleHistory = renderSingleHistory;

  const renderGroupHistory = async () => {
    const key = "decodevin.groupHistory";
    let list = JSON.parse(localStorage.getItem(key) || "[]");
    const sessUser = JSON.parse(localStorage.getItem("dvb_user") || "null");
    const token = localStorage.getItem("dvb_token");
    groupHistoryFetchGen++;
    const gen = groupHistoryFetchGen;

    if (token && sessUser && sessUser.admin && typeof window.dvbHistoricoAdminGet === "function") {
      try {
        const res = await window.dvbHistoricoAdminGet();
        if (gen !== groupHistoryFetchGen) return;
        if (res && res.ok && Array.isArray(res.entries)) {
          list = res.entries
            .filter(e => e.kind === "group")
            .map(e => {
              const p = parseHistoricoPayload(e.payload);
              const vins = String(p.vins || "");
              const plates = String(p.plates || "");
              const hasLines = !!(vins.trim() || plates.trim());
              return {
                vins,
                plates,
                fleetName: String(p.fleetName || "").slice(0, 200),
                ts: typeof p.ts === "number" ? p.ts : new Date(e.created_at || Date.now()).getTime(),
                serverId: e.id,
                userId: e.user_id,
                auditBy: e.nome || "—",
                auditEmail: e.email || "",
                adminGlobal: true,
                auditOnly: !hasLines
              };
            })
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 120);
        }
      } catch (_) {
        if (gen !== groupHistoryFetchGen) return;
      }
    } else if (token && typeof window.dvbHistoricoUsuarioGet === "function") {
      try {
        const res = await window.dvbHistoricoUsuarioGet();
        if (gen !== groupHistoryFetchGen) return;
        if (res && res.ok && Array.isArray(res.group) && res.group.length > 0) {
          list = res.group.map(g => ({
            vins: String(g.vins || ""),
            plates: String(g.plates || ""),
            fleetName: String(g.fleetName || ""),
            ts: typeof g.ts === "number" ? g.ts : Date.now(),
            serverId: g.id,
            fromServer: true,
            auditOnly: false
          }));
        }
      } catch (_) {
        if (gen !== groupHistoryFetchGen) return;
      }
    } else if (gen !== groupHistoryFetchGen) {
      return;
    }

    list = dedupeGroupHistoryList(list);

    const h = el("groupHistory");
    if (!h) return;
    h.innerHTML = "";

    if (sessUser && sessUser.admin) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;";
      note.textContent =
        "Lotes de todos os usuários; linhas sem chassis/placas no servidor são só registro (não reexecutam).";
      h.appendChild(note);
    } else if (token) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;";
      note.textContent =
        "Histórico de lotes ligado à sua conta — o mesmo em qualquer aparelho após login.";
      h.appendChild(note);
    }

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Buscar no histórico (nome, placa, chassi, operador)…";
    searchInput.style.marginBottom = "12px";
    searchInput.style.fontSize = "13px";
    searchInput.style.width = "100%";
    searchInput.style.boxSizing = "border-box";
    searchInput.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      renderGroupHistoryItems(list.filter(item =>
        (item.fleetName || "").toLowerCase().includes(term) ||
        (item.vins || "").toLowerCase().includes(term) ||
        (item.plates || "").toLowerCase().includes(term) ||
        (item.auditBy || "").toLowerCase().includes(term) ||
        (item.auditEmail || "").toLowerCase().includes(term)
      ), sessUser);
    };
    h.appendChild(searchInput);

    const listContainer = document.createElement("div");
    listContainer.id = "groupHistoryList";
    h.appendChild(listContainer);

    renderGroupHistoryItems(list, sessUser);
  };

  // Gera os dados do relatório de um lote salvo no histórico sem reprocessar a tela.
  const montarRelatorioDoHistorico = async (historyItem, onProgress = null) => {
    const vLines = String(historyItem?.vins || "").split("\n").map(l => l.trim()).filter(Boolean);
    const pLines = String(historyItem?.plates || "").split("\n").map(l => l.trim()).filter(Boolean);
    const total = Math.max(vLines.length, pLines.length);
    const data = [];

    for (let i = 0; i < total; i++) {
      const vin = (vLines[i] || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const plate = (pLines[i] || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      let decoded = { type: "UNKNOWN", tokens: [], manufacturerName: "Desconhecido" };
      if (vin) {
        try {
          const dec = window.currentDecoder;
          decoded = dec && typeof dec.decode === "function" ? dec.decode(vin) : decoded;
        } catch (_) {
          decoded = { type: "UNKNOWN", tokens: [], manufacturerName: "Desconhecido" };
        }
      }
      const itemData = {
        tipo: vin && plate ? "COMBINADO" : (vin ? "VIN" : "PLATE"),
        vin,
        placa: plate,
        fabricante: decoded.manufacturerName || "Desconhecido",
        result: JSON.parse(JSON.stringify(decoded)),
        ob: {},
        ob_data: {},
        status: "pending"
      };

      if (plate) {
        try {
          const apiResult = (typeof consultarPlacaPHP === "function")
            ? await consultarPlacaPHP(plate, vin || "")
            : { status: "erro", mensagem: "Consulta de placa indisponível." };
          if (apiResult.status === "ok") {
            itemData.status = "ok";
            itemData.apiResult = apiResult;
            itemData.fabricante = apiResult.marca || apiResult.fabricante || apiResult.brand || apiResult.texto_marca || itemData.fabricante;

            if (!vin && (apiResult.chassi_completo || apiResult.chassi)) {
              itemData.vin = apiResult.chassi_completo || apiResult.chassi;
            }

            if (window.buscarDadosOnibusBrasil) {
              try {
                const obData = await window.buscarDadosOnibusBrasil(plate, false);
                if (obData && !obData.erro) {
                  itemData.ob_data = obData;
                  itemData.ob = {
                    ob_carroceria: obData.carroceria || "—",
                    ob_encarrocadeira: obData.encarrocadeira || obData.encarrocadora || "—",
                    ob_fabricante_chassi: obData.fabricante_chassi || obData.fabricante || apiResult.marca || "—",
                    ob_chassi: obData.modelo_chassi || obData.chassi || apiResult.modelo || "—"
                  };
                }
              } catch (_) {}
            }
          } else {
            itemData.status = "error";
            itemData.error_detail = apiResult.mensagem;
            itemData.apiResult = apiResult;
          }
        } catch (e) {
          itemData.status = "error";
          itemData.error_detail = e.message || "Falha ao consultar API.";
        }
      } else if (vin) {
        itemData.status = "ok";
      } else {
        itemData.status = "orphan";
      }

      data.push(itemData);
      if (onProgress) onProgress(i + 1, total);
    }

    return data;
  };

  const formatarTempo = (ms) => {
    const totalSeg = Math.max(0, Math.round(ms / 1000));
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
  };

  const criarModalProgressoLote = (titulo = "Preparando relatório...") => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;";

    const box = document.createElement("div");
    box.style.cssText = "width:min(520px,92vw);background:var(--bg-elev);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,0.5);";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;color:var(--text);margin-bottom:10px;";
    title.textContent = titulo;

    const status = document.createElement("div");
    status.style.cssText = "font-size:13px;color:var(--muted);margin-bottom:10px;";
    status.textContent = "Iniciando...";

    const barWrap = document.createElement("div");
    barWrap.style.cssText = "width:100%;height:10px;background:var(--bg);border:1px solid var(--border);border-radius:999px;overflow:hidden;";

    const bar = document.createElement("div");
    bar.style.cssText = "width:0%;height:100%;background:linear-gradient(90deg,var(--accent-2),var(--accent));transition:width .2s ease;";
    barWrap.appendChild(bar);

    box.appendChild(title);
    box.appendChild(status);
    box.appendChild(barWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    return {
      update: (done, total, elapsedMs) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        bar.style.width = `${pct}%`;
        const mediaPorItem = done > 0 ? elapsedMs / done : 0;
        const restanteMs = mediaPorItem * Math.max(0, total - done);
        status.textContent = `${done}/${total} itens • ${pct}% • Tempo: ${formatarTempo(elapsedMs)} • Restante aprox.: ${formatarTempo(restanteMs)}`;
      },
      close: () => overlay.remove()
    };
  };

  const renderGroupHistoryItems = (list, sessUser) => {
    const h = el("groupHistoryList");
    if (!h) return;
    h.innerHTML = "";

    if (list.length === 0) {
      h.innerHTML = `<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item encontrado.</div>`;
      return;
    }

    const totalPages = Math.ceil(list.length / HISTORY_PAGE_SIZE);
    if (currentGroupHistoryPage > totalPages) currentGroupHistoryPage = totalPages;
    if (currentGroupHistoryPage < 1) currentGroupHistoryPage = 1;

    const start = (currentGroupHistoryPage - 1) * HISTORY_PAGE_SIZE;
    const end = start + HISTORY_PAGE_SIZE;
    const pageList = list.slice(start, end);

    pageList.forEach((item, idx) => {
      const podeRemover = historicoPodeRemoverSingle(item, sessUser);
      const indexInFullList = start + idx;
      const row = document.createElement("div");
      row.className = "item clickable";
      row.style.padding = "12px 15px";
      
      const v = document.createElement("div");
      v.style.flex = "1";
      v.style.display = "flex";
      v.style.flexDirection = "column";
      v.style.gap = "4px";

      const vCount = (item.vins || "").split("\n").filter(Boolean).length;
      const pCount = (item.plates || "").split("\n").filter(Boolean).length;
      const totalCount = Math.max(vCount, pCount);
      
      const dataHora = new Date(item.ts).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const title = document.createElement("div");
      title.style.fontWeight = "600";
      title.style.color = "var(--accent)";
      title.textContent = item.fleetName ? `📦 ${item.fleetName}` : `📦 Lote #${list.length - indexInFullList}`;
      
      const details = document.createElement("div");
      details.style.fontSize = "13px";
      details.style.color = "var(--text)";
      details.textContent = item.auditOnly
        ? `${dataHora} · registro global`
        : `${totalCount} itens • ${dataHora}`;

      const auditLine = document.createElement("div");
      auditLine.style.fontSize = "11px";
      auditLine.style.color = "var(--muted)";
      if (item.auditBy) {
        auditLine.textContent =
          `👤 ${item.auditBy}` + (item.auditEmail ? ` · ${item.auditEmail}` : "");
      }

      const preview = document.createElement("div");
      preview.style.fontSize = "11px";
      preview.style.color = "var(--muted)";
      preview.style.fontStyle = "italic";
      const vList = (item.vins || "").split("\n").filter(Boolean);
      const pList = (item.plates || "").split("\n").filter(Boolean);
      const previewText = [];
      for(let i=0; i<Math.min(2, totalCount); i++) {
        previewText.push(`${vList[i] || ""}${pList[i] ? " ["+pList[i]+"]" : ""}`);
      }
      preview.textContent = previewText.join(", ") + (totalCount > 2 ? "..." : "");

      v.appendChild(title);
      v.appendChild(details);
      if (item.auditBy) v.appendChild(auditLine);
      if (previewText.length > 0) v.appendChild(preview);
      
      v.onclick = () => {
        if (item.auditOnly) {
          if (typeof showToast === "function") {
            showToast("Sem lista de chassis no servidor — só o registro da pesquisa.", "error");
          }
          return;
        }

        const gInput = el("groupInput");
        const gPlateInput = el("groupPlateInput");
        const bGroup = el("btnGroupDecode");
        const fleetEl = el("fleetName");

        const fleetNameValue = item.fleetName || `Lote_${new Date(item.ts).getTime()}`;

        const isFieldsEmpty = !gInput.value.trim() && !gPlateInput.value.trim();

        // Verifica se este lote já está decodificado na tela
        const currentFingerprint = JSON.stringify({
          fleetName: fleetNameValue,
          vins: item.vins || "",
          plates: item.plates || ""
        });

        if (!isFieldsEmpty && window.currentGroupResults && window.currentGroupResults.length > 0 && window.lastGroupLotFingerprint === currentFingerprint) {
          // Se já estiver na tela, apenas muda para a tela de grupo se necessário
          const groupDecoder = el("groupDecoder");
          if (groupDecoder && groupDecoder.style.display === "none") {
            const optGroup = el("optGroup");
            if (optGroup) optGroup.click();
          }
          return;
        }

        if (fleetEl) {
          fleetEl.value = fleetNameValue;
          fleetEl.dispatchEvent(new Event("input"));
        }
        if (gInput) {
          gInput.value = item.vins || "";
          gInput.dispatchEvent(new Event("input"));
        }
        if (gPlateInput) {
          gPlateInput.value = item.plates || "";
          gPlateInput.dispatchEvent(new Event("input"));
        }
        
        if (bGroup) { 
          bGroup.disabled = false; 
          // Delay ligeiramente maior para garantir que as validações de input terminaram
          setTimeout(() => {
            if (bGroup.disabled === false) {
              bGroup.click();
            } else {
              // Se por algum motivo continuar desabilitado, forçamos a validação e tentamos novamente
              if (typeof window.validateGroupForm === "function") window.validateGroupForm();
              setTimeout(() => bGroup.click(), 50);
            }
          }, 100);
        }
      };

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.alignItems = "center";
      actions.style.gap = "8px";

      const btnExportLot = document.createElement("button");
      btnExportLot.className = "btn-page";
      btnExportLot.textContent = "📄";
      btnExportLot.title = "Exportar este lote sem redecodificar";
      btnExportLot.style.padding = "6px 10px";
      btnExportLot.style.minWidth = "36px";
      btnExportLot.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.auditOnly) {
          if (typeof showToast === "function") {
            showToast("Exportação indisponível — lote só existe como registro no servidor.", "error");
          }
          return;
        }
        const oldTxt = btnExportLot.textContent;
        btnExportLot.disabled = true;
        btnExportLot.textContent = "⏳";
        const progresso = criarModalProgressoLote("Gerando relatório do lote...");
        const t0 = Date.now();
        try {
          const reportData = await montarRelatorioDoHistorico(item, (done, total) => {
            progresso.update(done, total, Date.now() - t0);
          });
          if (!reportData || reportData.length === 0) {
            showToast("Não foi possível montar o relatório deste lote.", "error");
            return;
          }
          const loteNome = (item.fleetName || `Lote_${new Date(item.ts).getTime()}`).replace(/\s+/g, "_");
          openReportOptions(reportData, `Relatorio_${loteNome}`);
        } catch (err) {
          showToast("Erro ao preparar relatório do histórico.", "error");
        } finally {
          progresso.close();
          btnExportLot.disabled = false;
          btnExportLot.textContent = oldTxt;
        }
      };
      if (item.auditOnly) {
        btnExportLot.style.opacity = "0.35";
        btnExportLot.title = "Sem dados de lote no servidor";
      }

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete-item";
      btnDelete.innerHTML = "&times;";
      btnDelete.title = "Remover este lote";
      btnDelete.style.zIndex = "10";
      btnDelete.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!podeRemover) return;
        if (item.serverId && typeof window.dvbHistoricoUsuarioDelete === "function") {
          const dr = await window.dvbHistoricoUsuarioDelete(item.serverId);
          if (dr && dr.ok) {
            const storageKey = "decodevin.groupHistory";
            const currentList = JSON.parse(localStorage.getItem(storageKey) || "[]");
            const newList = currentList.filter(x => x.ts !== item.ts);
            localStorage.setItem(storageKey, JSON.stringify(newList));
            renderGroupHistory();
          }
          return;
        }
        const storageKey = "decodevin.groupHistory";
        const currentList = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const newList = currentList.filter(x => x.ts !== item.ts);
        localStorage.setItem(storageKey, JSON.stringify(newList));
        renderGroupHistory();
      };
      if (!podeRemover) {
        btnDelete.style.visibility = "hidden";
        btnDelete.style.pointerEvents = "none";
      }

      actions.appendChild(btnExportLot);
      actions.appendChild(btnDelete);
      row.appendChild(v);
      row.appendChild(actions);
      h.appendChild(row);
    });

    if (totalPages > 1) {
      const pagination = document.createElement("div");
      pagination.className = "history-pagination";
      pagination.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px; padding: 10px;";

      const btnPrev = document.createElement("button");
      btnPrev.textContent = "← Anterior";
      btnPrev.disabled = currentGroupHistoryPage === 1;
      btnPrev.className = "btn-page";
      btnPrev.onclick = () => { currentGroupHistoryPage--; renderGroupHistory(); };

      const pageInfo = document.createElement("span");
      pageInfo.textContent = `Página ${currentGroupHistoryPage} de ${totalPages}`;
      pageInfo.style.fontSize = "14px";
      pageInfo.style.color = "var(--muted)";

      const btnNext = document.createElement("button");
      btnNext.textContent = "Próximo →";
      btnNext.disabled = currentGroupHistoryPage === totalPages;
      btnNext.className = "btn-page";
      btnNext.onclick = () => { currentGroupHistoryPage++; renderGroupHistory(); };

      pagination.appendChild(btnPrev);
      pagination.appendChild(pageInfo);
      pagination.appendChild(btnNext);
      h.appendChild(pagination);
    }
  };

  window.renderGroupHistory = renderGroupHistory;

const exportCSV = (data, name, includeFipe = true) => {
  const uniqueData = [];
  const seen = new Set();

  (data || []).forEach((item) => {
    const api = item?.apiResult || {};
    const placa = String(item?.placa || api?.placa || "").trim().toUpperCase();
    const chassi = String(item?.vin || api?.chassi_completo || api?.chassi || "").trim().toUpperCase();
    const key = `${placa}|${chassi}`;
    if (key === "|") return;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueData.push(item);
  });

  let columns = [];
  
  if (includeFipe) {
    columns = [
      "MONTADORA",
      "CHASSI",
      "PLACA",
      "ANO",
      "CARROCERIA",
      "ENCARROÇADEIRA",
      "MOTOR",
      "MODELO CHASSI",
      "CODIGO FIPE",
      "MODELO FIPE",
      "COMBUSTIVEL",
      "COR",
      "CIDADE/UF"
    ];
  } else {
    columns = [
      "MONTADORA",
      "CHASSI",
      "PLACA",
      "ANO",
      "MOTOR",
      "CARROCERIA",
      "ENCARROÇADEIRA",
      "MODELO CHASSI",
      "CIDADE/UF"
    ];
  }

  let csv = "\ufeff" + columns.join(";") + "\n";

  uniqueData.forEach(item => {
    const tokens = item.result?.tokens || [];
    const ob = item.ob_data || item.ob || {};
    const api = item.apiResult || {};
    
    const findToken = (label) => {
      const t = tokens.find(t => t.label === label || t.key === label.toLowerCase().replace(/ /g, "_"));
      return t ? t.value : "—";
    };

    let bestFipe = null;
    
    const findFipeDeepCSV = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const res = findFipeDeepCSV(item);
          if (res) return res;
        }
        return null;
      }
      if (obj.codigo_fipe || obj.fipe_codigo || obj.CODIGO_FIPE || obj.FIPE_CODIGO) return [obj];
      const keys = ["fipe", "fipe_data", "dados_fipe", "fipe_valor", "results", "data", "list", "FIPE", "FIPE_DATA", "DADOS_FIPE"];
      for (const k of keys) {
        if (obj[k]) {
          const val = obj[k];
          const list = Array.isArray(val) ? val : [val];
          if (list.some(f => f && (f.codigo_fipe || f.fipe_codigo || f.CODIGO_FIPE || f.FIPE_CODIGO))) return list;
        }
      }
      for (const k in obj) {
        if (obj[k] && typeof obj[k] === 'object' && !keys.includes(k)) {
          const res = findFipeDeepCSV(obj[k]);
          if (res) return res;
        }
      }
      return null;
    };

    const potentialList = findFipeDeepCSV(api) || [];
    if (potentialList.length > 0) {
      const valid = potentialList.filter(f => f && (f.codigo_fipe || f.fipe_codigo || f.texto_modelo || f.modelo || f.CODIGO_FIPE || f.FIPE_CODIGO || f.MODELO));
      bestFipe = valid.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    }

    const fipeCodFinal = bestFipe ? (bestFipe.codigo_fipe || bestFipe.fipe_codigo || "—") : (api.fipe_codigo || "—");
    const fipeModFinal = bestFipe ? (bestFipe.texto_modelo || bestFipe.modelo || "—") : (api.fipe_modelo || "—");

    let row = [];
    if (includeFipe) {
      row = [
        item.fabricante || api.marca || api.fabricante || findToken("Fabricante") || "—",
        item.vin || api.chassi_completo || api.chassi || "—",
        item.placa || api.placa || "—",
        api.ano_modelo || api.ano || findToken("Ano Modelo") || "—",
        ob.carroceria || "—",
        ob.encarrocadeira || ob.encarrocadora || "—",
        findToken("Motor") || "—",
        ob.modelo_chassi || ob.chassi || api.modelo || findToken("Modelo") || "—",
        fipeCodFinal,
        fipeModFinal,
        api.combustivel || "—",
        api.cor || "—",
        (api.municipio && api.uf) ? `${api.municipio} / ${api.uf}` : (api.cidade || "—")
      ];
    } else {
      row = [
        item.fabricante || api.marca || api.fabricante || findToken("Fabricante") || "—",
        item.vin || api.chassi_completo || api.chassi || "—",
        item.placa || api.placa || "—",
        api.ano_modelo || api.ano || findToken("Ano Modelo") || "—",
        findToken("Motor") || "—",
        ob.carroceria || "—",
        ob.encarrocadeira || ob.encarrocadora || "—",
        ob.modelo_chassi || ob.chassi || api.modelo || findToken("Modelo") || "—",
        (api.municipio && api.uf) ? `${api.municipio} / ${api.uf}` : (api.cidade || "—")
      ];
    }

    csv += row.map(val => {
      let s = String(val).trim();
      return (s === "" || s === "—" || s === "undefined") ? "—" : s.replace(/;/g, ",");
    }).join(";") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}_${new Date().getTime()}.csv`;
  link.click();
};

  const btnExportCSV = el("btnExportCSV");
  const reportModal = el("reportModal");
  let exportDataBuffer = null;
  let exportNameBuffer = "";

  const openReportOptions = (data, name) => {
    exportDataBuffer = data;
    exportNameBuffer = name;
    if (reportModal) reportModal.style.display = "flex";
  };

  if (el("closeReportModal")) {
    el("closeReportModal").onclick = () => { if (reportModal) reportModal.style.display = "none"; };
  }

  if (el("btnExportFull")) {
    el("btnExportFull").onclick = () => {
      if (exportDataBuffer) exportCSV(exportDataBuffer, exportNameBuffer, true);
      if (reportModal) reportModal.style.display = "none";
    };
  }

  if (el("btnExportBasic")) {
    el("btnExportBasic").onclick = () => {
      if (exportDataBuffer) exportCSV(exportDataBuffer, exportNameBuffer, false);
      if (reportModal) reportModal.style.display = "none";
    };
  }

  if (btnExportCSV) {
    btnExportCSV.onclick = () => {
      if (window.currentGroupResults) openReportOptions(window.currentGroupResults, "Relatorio_Frota");
    };
  }

let currentGroupPage = 1;
const GROUP_PAGE_SIZE = 10;

function renderGroupResults(filteredList = null) {
  const gResults = el("groupResults");
  if (!gResults || !window.currentGroupResults) return;
  gResults.innerHTML = "";

  const displayList = filteredList || window.currentGroupResults;
  const totalPages = Math.ceil(displayList.length / GROUP_PAGE_SIZE);
  if (currentGroupPage > totalPages) currentGroupPage = totalPages;
  if (currentGroupPage < 1) currentGroupPage = 1;

  const start = (currentGroupPage - 1) * GROUP_PAGE_SIZE;
  const end = start + GROUP_PAGE_SIZE;
  const pageList = displayList.slice(start, end);

  const fragment = document.createDocumentFragment();

  pageList.forEach(itemData => {
    const item = document.createElement("div");
    item.className = "group-item";
    
    if (itemData.status === 'ok') {
      item.style.borderLeft = "4px solid #2ecc71";
    } else if (itemData.status === 'error') {
      item.style.borderLeft = "4px solid #e74c3c";
      item.style.background = "rgba(231, 76, 60, 0.05)";
    } else if (itemData.status === 'pending') {
      item.style.borderLeft = "4px solid var(--muted)";
    } else {
      item.style.borderLeft = "4px solid #f1c40f";
    }

    const vin = itemData.vin;
    const plate = itemData.placa;

    let layout = "";
    if (vin && plate) {
      const isMismatch = itemData.status === 'error' && String(itemData.error_detail || "").includes("não pertence");
      const labelColor = isMismatch ? '#e74c3c' : 'var(--accent)';
      const labelText = isMismatch ? 'DIVERGÊNCIA ENCONTRADA' : 'VERIFICANDO PAR';
      layout = `<div class="code"><span style="color:${labelColor};font-size:10px;display:block">${labelText}</span>${vin} / ${plate}</div>`;
    } else if (vin) {
      layout = `<div class="code"><span style="color:#e74c3c;font-size:10px;display:block">SEM PLACA</span>${vin}</div>`;
    } else {
      layout = `<div class="code"><span style="color:#e74c3c;font-size:10px;display:block">SEM CHASSI</span>${plate}</div>`;
    }

    let statusHtml = "";
    if (itemData.status === 'ok') {
      statusHtml = `<span style="color:#2ecc71">✔ Confirmado</span>`;
    } else if (itemData.status === 'error') {
      if (String(itemData.error_detail).includes("402")) {
        statusHtml = `<span style="color:#e74c3c">🔴 API SEM SALDO</span>`;
      } else {
        statusHtml = `<span style="color:#e74c3c">⚠ Divergência</span>`;
      }
    } else if (itemData.status === 'pending') {
      statusHtml = `<span style="color:var(--muted)">Aguardando...</span>`;
    } else {
      statusHtml = `<span style="color:#f1c40f">Item Órfão</span>`;
    }

    let modelInfo = "";
    if (itemData.apiResult) {
      const api = itemData.apiResult;
      const mBasico = api.modelo || api.model || api.texto_modelo || "";
      const vBasico = api.versao || api.version || "";
      const mod = (mBasico && vBasico && !mBasico.includes(vBasico)) ? `${mBasico} ${vBasico}` : (mBasico || vBasico || "");
      if (mod) modelInfo = ` • <span class="model-val">${mod}</span>`;

      const anoFab = api.ano || api.ano_fabricacao || api.year || api.anoFabricacao;
      const anoMod = api.ano_modelo || api.model_year || api.anoModelo;
      const anoCompleto = (anoFab && anoMod && anoFab !== anoMod) ? `${anoFab}/${anoMod}` : (anoFab || anoMod || "");
      if (anoCompleto) modelInfo += ` • <span class="model-val">${anoCompleto}</span>`;
    } else if (itemData.ob && itemData.ob.ob_chassi) {
      modelInfo = ` • <span class="model-val">${itemData.ob.ob_chassi}</span>`;
    }

    const fleetInfo = (itemData.fleetName || "").trim();
    const fleetHtml = fleetInfo ? ` • <span class="model-val">${fleetInfo}</span>` : "";
    item.innerHTML = `${layout}<div class="info"><span>${itemData.fabricante || "—"}${modelInfo}${fleetHtml}</span><span class="status-msg">${statusHtml}</span></div>`;
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const chassiParaModal = (vin && vin !== "") ? vin : (itemData.apiResult?.chassi_completo || itemData.apiResult?.chassi || "");
      const isPlateOnly = !chassiParaModal;
      const linked = (chassiParaModal && plate) ? plate : null;
      
      openModal(itemData.result, chassiParaModal || plate, isPlateOnly, linked, itemData);
    });

    fragment.appendChild(item);
  });

  gResults.appendChild(fragment);

  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "group-pagination";
    pagination.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 25px; padding: 20px 0; border-top: 1px solid var(--border); width: 100%; grid-column: 1 / -1;";

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "← Anterior";
    btnPrev.disabled = currentGroupPage === 1;
    btnPrev.className = "btn-page";
    btnPrev.onclick = (e) => { e.stopPropagation(); currentGroupPage--; renderGroupResults(filteredList); };

    const pageInfo = document.createElement("span");
    pageInfo.textContent = `Página ${currentGroupPage} de ${totalPages}`;
    pageInfo.style.fontSize = "14px";
    pageInfo.style.color = "var(--muted)";

    const btnNext = document.createElement("button");
    btnNext.textContent = "Próximo →";
    btnNext.disabled = currentGroupPage === totalPages;
    btnNext.className = "btn-page";
    btnNext.onclick = (e) => { e.stopPropagation(); currentGroupPage++; renderGroupResults(filteredList); };

    pagination.appendChild(btnPrev);
    pagination.appendChild(pageInfo);
    pagination.appendChild(btnNext);
    gResults.appendChild(pagination);
  }
}

async function openModal(result, code, isPlate = false, linkedPlate = null, itemData = null) {
  const mTitle = el("modalTitle");
  const mSegs = el("modalSegments");
  const mCards = el("modalCards");
  const modal = el("detailModal");

  if (!modal) return;

  if (itemData && itemData.apiResult && (itemData.apiResult.chassi_completo || itemData.apiResult.chassi)) {
    const apiChassi = itemData.apiResult.chassi_completo || itemData.apiResult.chassi;

    const hasVin = itemData.vin && itemData.vin !== "";
    if (itemData.placa && isPlate && hasVin) {
      code = apiChassi;
      linkedPlate = itemData.placa;
      isPlate = false;
      if (!result || result.type === "UNKNOWN") {
        if (window.currentDecoder) {
           result = window.currentDecoder.decode(apiChassi);
           if (itemData) itemData.result = result;
        }
      }
    }
  }

  mTitle.textContent = linkedPlate
    ? `Análise Completa: ${linkedPlate}`
    : (isPlate ? `Dados OB: ${code}` : `Detalhes: ${code}`);
  mSegs.innerHTML = "";
  mCards.innerHTML = "";
  mCards.removeAttribute("style");
  modal.style.display = "flex";

  if (itemData && itemData.status === 'error') {
    const isNoBalance = String(itemData.error_detail || "").includes("402");
    
    if (isNoBalance) {
      mSegs.innerHTML = `<div class="seg" style="background:#e74c3c;color:white">🔴 API SEM SALDO</div>`;
    } else {
      mSegs.innerHTML = `<div class="seg" style="background:#e74c3c;color:white">⚠ DIVERGÊNCIA DETECTADA</div>`;
    }

    const errorCard = document.createElement("div");
    errorCard.className = "error";
    errorCard.style.cssText = "background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 20px; border-radius: 8px; margin: 20px; font-weight: 600; text-align: center; grid-column: 1/-1;";
    
    if (isNoBalance) {
       errorCard.innerHTML = `As consultas de validação de placa estão suspensas por falta de créditos na WDAPI.<br><small style="font-weight:normal">Por favor, recarregue seu saldo para continuar.</small>`;
    } else if (String(itemData.error_detail || "").includes("não pertence")) {
      let api = itemData.apiResult || {};
      let marcaPlaca =
        api.marca ||
        api.fabricante ||
        api.brand ||
        api.texto_marca ||
        api.MARCA ||
        api.FABRICANTE ||
        api.marcaNome ||
        api?.extra?.marca ||
        "";
      let modeloPlaca =
        api.modelo ||
        api.texto_modelo ||
        api.model ||
        api.MODELO ||
        api.modelo_nome ||
        api?.extra?.modelo ||
        api?.extra?.submodelo ||
        "";

      // Em divergência, a API pode retornar só a mensagem de erro.
      // Faz uma consulta extra por placa para exibir o veículo real no resumo.
      if ((!marcaPlaca || !modeloPlaca) && linkedPlate) {
        try {
          const apiSomentePlaca = await consultarPlacaPHP(linkedPlate, "");
          if (apiSomentePlaca && apiSomentePlaca.status === "ok") {
            api = { ...api, ...apiSomentePlaca };
            marcaPlaca =
              marcaPlaca ||
              apiSomentePlaca.marca ||
              apiSomentePlaca.fabricante ||
              apiSomentePlaca.brand ||
              apiSomentePlaca.texto_marca ||
              apiSomentePlaca.MARCA ||
              apiSomentePlaca.FABRICANTE ||
              apiSomentePlaca.marcaNome ||
              apiSomentePlaca?.extra?.marca ||
              "";
            modeloPlaca =
              modeloPlaca ||
              apiSomentePlaca.modelo ||
              apiSomentePlaca.texto_modelo ||
              apiSomentePlaca.model ||
              apiSomentePlaca.MODELO ||
              apiSomentePlaca.modelo_nome ||
              apiSomentePlaca?.extra?.modelo ||
              apiSomentePlaca?.extra?.submodelo ||
              "";
          }
        } catch (_) {}
      }

      if (!marcaPlaca) marcaPlaca = "Desconhecida";
      if (!modeloPlaca) modeloPlaca = "Não informado";
      const marcaChassi = result?.manufacturerName || itemData.fabricante || "Não identificado";
      const resumo = `
        <div style="margin-top:10px; text-align:left; display:inline-block; max-width:760px; font-weight:500; color:#fecaca;">
          <div><strong>Resumo da divergência:</strong></div>
          <div>• Chassi informado: <strong>${code}</strong> (${marcaChassi})</div>
          <div>• Veículo retornado pela placa ${linkedPlate}: <strong>${marcaPlaca} ${modeloPlaca}</strong></div>
          <div>• Motivo: os dados de chassi e placa apontam para veículos diferentes.</div>
        </div>
      `;
      errorCard.innerHTML = `Este chassi (${code}) não pertence à placa (${linkedPlate}).<br><small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos foram bloqueados.</small>${resumo}`;
     } else {
       errorCard.innerHTML = `Não foi possível localizar os dígitos do chassi para a placa ${linkedPlate} em fontes públicas.<br><small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos não serão exibidos.</small>`;
     }
    
    mCards.appendChild(errorCard);
    return;
  }

  const renderKePlacaFallback = (container, kpData, titulo = "📋 Dados do Veículo (KePlaca)") => {
    const h = document.createElement("h3");
    h.textContent = titulo;
    h.style.cssText = "font-size: 16px; color: var(--accent-2); margin: 20px 0 12px; border-top: 1px solid var(--border); padding-top: 20px; text-align: center; width: 100%;";
    container.appendChild(h);

    const kpCards = document.createElement("div");
    kpCards.className = "cards";
    centerGrid(kpCards);
    container.appendChild(kpCards);

    const kp = kpData || {};
    const mBasico  = kp.modelo  || "";
    const vBasico  = kp.versao  || "";
    const modeloFull = (mBasico && vBasico && !mBasico.includes(vBasico))
      ? `${mBasico} ${vBasico}` : (mBasico || "—");
    const anoFab = kp.ano || "";
    const anoMod = kp.ano_modelo || "";
    const anoFull = (anoFab && anoMod && anoFab !== anoMod)
      ? `${anoFab}/${anoMod}` : (anoFab || anoMod || "—");
    const temFipe = kp.fipe_codigo && kp.fipe_codigo !== "—";

    if (kp.logo) {
      const logoWrapper = document.createElement("div");
      logoWrapper.style.cssText = "grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; margin-bottom: 4px;";
      const logoImg = document.createElement("img");
      logoImg.src = kp.logo;
      logoImg.style.cssText = "height: 28px; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.75;";
      logoWrapper.appendChild(logoImg);
      kpCards.appendChild(logoWrapper);
    }

    kpCards.appendChild(card("Montadora",       kp.marca       || "—", "KePlaca"));
    kpCards.appendChild(card("Modelo",          modeloFull,              "KePlaca"));
    kpCards.appendChild(card("Ano Fab./Modelo", anoFull,                 "KePlaca"));
    kpCards.appendChild(card("Código FIPE",     temFipe ? kp.fipe_codigo : "—", "KePlaca"));
    kpCards.appendChild(card("Modelo FIPE",     temFipe ? kp.fipe_modelo : "—", "KePlaca"));
    kpCards.appendChild(card("Combustível",     kp.combustivel || "—",   "KePlaca"));
    kpCards.appendChild(card("Cor",             kp.cor         || "—",   "KePlaca"));
    const cidade = (kp.municipio && kp.uf) ? `${kp.municipio} / ${kp.uf}` : "—";
    kpCards.appendChild(card("Município / UF",  cidade,                  "KePlaca"));
    kpCards.appendChild(card("Situação",        kp.situacao    || "—",   "KePlaca"));

    if (!temFipe) {
      kpCards.querySelectorAll(".card").forEach(c => {
        const lbl = c.querySelector(".label");
        if (lbl && (lbl.textContent.includes("FIPE") || lbl.textContent.includes("Código"))) {
          c.style.opacity = "0.5";
        }
      });
    }
  };

  const injectOB = (p, container, kpFallback = null) => {
    const obWrapper = document.createElement("div");
    obWrapper.style.marginTop = "16px";
    obWrapper.style.borderTop = "1px solid var(--border)";
    obWrapper.style.paddingTop = "20px";
    container.appendChild(obWrapper);

    const statusDiv = document.createElement("div");
    statusDiv.style.textAlign = "center";
    statusDiv.style.marginBottom = "16px";
    statusDiv.style.fontSize = "14px";
    statusDiv.textContent = `Buscando ${p}...`;
    obWrapper.appendChild(statusDiv);

    const obCards = document.createElement("div");
    obCards.className = "cards";
    obWrapper.appendChild(obCards);
    centerGrid(obCards);
    showSkeletons(obCards, 4);

    const mediaBox = document.createElement("div");
    mediaBox.style.display = "flex";
    mediaBox.style.flexDirection = "column";
    mediaBox.style.alignItems = "center";
    mediaBox.style.gap = "16px";
    mediaBox.style.marginTop = "20px";
    obWrapper.appendChild(mediaBox);

    const fallbackContainer = document.createElement("div");
    fallbackContainer.style.width = "100%";
    obWrapper.appendChild(fallbackContainer);

    let obFieldsPresent = {
      encarrocadeira: false,
      carroceria: false,
      fabricante: false
    };

    let obFieldCount = 0;
    let cleared = false;
    let fipeAdded = false;
    let apiExtrasAdded = false;

    const checkClear = () => {
      if (!cleared) {
        obCards.innerHTML = "";
        cleared = true;
      }
    };

    const addFipe = () => {
      if (!fipeAdded && kpFallback && kpFallback.fipe_codigo && kpFallback.fipe_codigo !== "—") {
        checkClear();
        obCards.appendChild(card("Código FIPE", kpFallback.fipe_codigo));
        obCards.appendChild(card("Modelo FIPE", kpFallback.fipe_modelo || "—"));
        fipeAdded = true;
      }
    };

    const addApiExtras = () => {
      if (apiExtrasAdded || !kpFallback) return;
      const chassiApi = kpFallback.chassi_completo || kpFallback.chassi || kpFallback.final_chassi || kpFallback.vin || kpFallback.CHASSI || kpFallback.vin_completo;
      const anoFab = kpFallback.ano || kpFallback.ano_fabricacao || kpFallback.year || kpFallback.anoFabricacao;
      const anoMod = kpFallback.ano_modelo || kpFallback.model_year || kpFallback.anoModelo;
      const anoCompleto = (anoFab && anoMod && anoFab !== anoMod) ? `${anoFab}/${anoMod}` : (anoFab || anoMod || null);

      if (chassiApi && chassiApi !== "—") {
        checkClear();
        obCards.appendChild(card("Chassi API", chassiApi));
      }
      if (anoCompleto && anoCompleto !== "—") {
        checkClear();
        obCards.appendChild(card("Ano Fab./Modelo", anoCompleto));
      }
      apiExtrasAdded = true;
    };

    const mockUI = {
      getElementById: (id) => {
        if (id === "secao-onibusbrasil") return obWrapper;
        if (id === "ob_status") return {
          set textContent(v) {
            statusDiv.textContent = v;

            if (v.includes("✅") || v.includes("Aviso") || v.includes("Erro") || v.includes("sem ficha") || v.includes("Não encontrada")) {
              addFipe();
              addApiExtras();
              checkClear();
              if (obFieldCount === 0 && kpFallback) {
                statusDiv.textContent = "ℹ️ OnibusBrasil sem dados — exibindo dados da KePlaca";
                statusDiv.style.color = "var(--accent-2)";
                renderKePlacaFallback(fallbackContainer, kpFallback, "📋 Dados do Veículo");
              }
            }
          },
          style: { set color(c) { statusDiv.style.color = c; } }
        };
        if (id === "ob_encarrocadeira") return { set textContent(v) {
          if (v && v !== "—") { 
            checkClear(); obFieldCount++; obFieldsPresent.encarrocadeira = true;
            obCards.appendChild(card("Encarroçadora", v)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_encarrocadeira = v; 
            }
          }
        }};
        if (id === "ob_carroceria") return { set textContent(v) {
          if (v && v !== "—") { 
            checkClear(); obFieldCount++; obFieldsPresent.carroceria = true;
            obCards.appendChild(card("Carroceria", v)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_carroceria = v; 
            }
          }
        }};
        if (id === "ob_fabricante_chassi") return { set textContent(v) {
          const fab = (v && v !== "—") ? v : null;
          if (fab) { 
            checkClear(); obFieldCount++; obFieldsPresent.fabricante = true;
            obCards.appendChild(card("Fabricante Chassi", fab)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_fabricante_chassi = fab; 
            }
          }
        }};
        if (id === "ob_chassi") return { set textContent(v) {
          const chassiOB = (v && v !== "—") ? v : (kpFallback?.modelo || "—");
          if (chassiOB !== "—") { 
            checkClear(); obFieldCount++; 
            obCards.appendChild(card("Modelo Chassi", chassiOB)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_chassi = chassiOB; 
            }
          }
        }};
        if (id === "ob_foto") return { set src(v) { if(v) { const i=document.createElement("img"); i.src=v; i.loading="lazy"; i.decoding="async"; i.style.width="100%"; i.style.maxWidth="600px"; i.style.borderRadius="12px"; i.style.boxShadow="var(--shadow)"; i.style.border="1px solid var(--border)"; mediaBox.prepend(i); } }, style: { set display(v) {} } };
        if (id === "ob_fonte") return { set href(v) { if(v) { const a=document.createElement("a"); a.href=v; a.target="_blank"; a.textContent="🔗 Ficha Completa no Ônibus Brasil"; a.style.cssText="display:inline-block;padding:12px 24px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px solid var(--accent-2);color:var(--accent-2);font-size:14px;font-weight:600;"; mediaBox.appendChild(a); } }, style: { set display(v) {} } };
        if (id === "singleReportButtons") return { style: { set display(v) {} } };
        return null;
      }
    };

    const d = itemData ? (itemData.ob_data || itemData.ob) : null;
    const hasExistingData = d && (d.success === true || (d.ob_encarrocadeira && d.ob_encarrocadeira !== "—"));

    if (hasExistingData) {
      statusDiv.textContent = "✅ Dados carregados!";
      statusDiv.style.color = "var(--accent)";
      
      const obDataObj = itemData.ob_data || {};
      const obObj = itemData.ob || {};

      const enc = obDataObj.encarrocadeira || obDataObj.encarrocadora || obObj.ob_encarrocadeira;
      const carr = obDataObj.carroceria || obObj.ob_carroceria;
      const fab = obDataObj.fabricante_chassi || obDataObj.fabricante || obObj.ob_fabricante_chassi || kpFallback?.marca;
      const mod = obDataObj.modelo_chassi || obDataObj.chassi || obObj.ob_chassi || kpFallback?.modelo;

      if (enc && enc !== "—") { checkClear(); obFieldCount++; obFieldsPresent.encarrocadeira = true; obCards.appendChild(card("Encarroçadora", enc)); }
      if (carr && carr !== "—") { checkClear(); obFieldCount++; obFieldsPresent.carroceria = true; obCards.appendChild(card("Carroceria", carr)); }
      if (fab && fab !== "—") { checkClear(); obFieldCount++; obFieldsPresent.fabricante = true; obCards.appendChild(card("Fabricante Chassi", fab)); }
      if (mod && mod !== "—") { checkClear(); obFieldCount++; obCards.appendChild(card("Modelo Chassi", mod)); }
      addApiExtras();

      addFipe();

      const foto = obDataObj.foto_url || obDataObj.foto;
      if (foto) {
        const i=document.createElement("img"); i.src=foto; i.loading="lazy"; i.decoding="async"; i.style.width="100%"; i.style.maxWidth="600px"; i.style.borderRadius="12px"; i.style.boxShadow="var(--shadow)"; i.style.border="1px solid var(--border)"; mediaBox.prepend(i);
      }
      
      const linkOB = obDataObj.fonte || `https://onibusbrasil.com/placa/${p}`;
      const a=document.createElement("a"); a.href=linkOB; a.target="_blank"; a.textContent="🔗 Ficha Completa no Ônibus Brasil"; a.style.cssText="display:inline-block;padding:12px 24px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px solid var(--accent-2);color:var(--accent-2);font-size:14px;font-weight:600;"; mediaBox.appendChild(a);
      
      return;
    }

    window.buscarDadosOnibusBrasil(p, true, mockUI);
  };

  if (linkedPlate) {
    mSegs.innerHTML = `<div class="seg" style="background:var(--accent);color:black">${linkedPlate}</div>`;
    
    const c1 = document.createElement("div");
    c1.className = "cards";
    centerGrid(c1);
    mCards.appendChild(c1);
    setCards(result, c1);
    
    const apiResult = itemData ? itemData.apiResult : (window.currentSingleResult ? window.currentSingleResult.apiResult : null);

    const apiTipo = String(apiResult?.tipo || apiResult?.category || "").toLowerCase();
    
    console.log("[Modal] Diagnóstico:", {
      placa: linkedPlate,
      chassi: code,
      hasApiResult: !!apiResult,
      is_onibus: apiResult?.is_onibus,
      ob_success: apiResult?.ob_data?.success,
      apiTipo: apiTipo
    });

    const isBus = apiResult 
      ? (apiResult.is_onibus === true || 
         (apiResult.ob_data && apiResult.ob_data.success === true) || 
         apiTipo.includes("onibus") || 
         apiTipo.includes("ônibus"))
      : true;

    if (isBus) {
      const h = document.createElement("h3");
      h.textContent = "🚌 Dados Carroceria";
      h.style.cssText = "font-size: 18px; color: var(--accent-2); margin: 24px 0 16px; border-top: 1px solid var(--border); padding-top: 24px; text-align: center; width: 100%;";
      mCards.appendChild(h);

      injectOB(linkedPlate, mCards, apiResult);

    } else {

      const h = document.createElement("h3");
      h.textContent = "🚗 Dados do Veículo";
      h.style.cssText = "font-size: 18px; color: var(--accent); margin: 24px 0 16px; border-top: 1px solid var(--border); padding-top: 24px; text-align: center; width: 100%;";
      mCards.appendChild(h);

      const genCards = document.createElement("div");
      genCards.className = "cards";
      centerGrid(genCards);
      mCards.appendChild(genCards);

      const api = apiResult || {};

      if (api.logo) {
        const logoWrapper = document.createElement("div");
        logoWrapper.style.cssText = "grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; margin-bottom: 8px;";
        const logoImg = document.createElement("img");
        logoImg.src = api.logo;
        logoImg.style.cssText = "height: 32px; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.8;";
        logoWrapper.appendChild(logoImg);
        genCards.appendChild(logoWrapper);
      }

      const mBasico = api.modelo || api.model || api.texto_modelo || "";
      const vBasico  = api.versao  || api.version || "";
      const modeloCompleto = (mBasico && vBasico && !mBasico.includes(vBasico))
        ? `${mBasico} ${vBasico}` : (mBasico || vBasico || "—");

      const anoFab = api.ano || api.ano_fabricacao;
      const anoMod = api.ano_modelo;
      const anoCompleto = (anoFab && anoMod && anoFab !== anoMod)
        ? `${anoFab}/${anoMod}` : (anoFab || anoMod || "—");

      const findFipe = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.fipe_codigo || obj.codigo_fipe || obj.FIPE_CODIGO) return obj;
        const keys = ["fipe", "fipe_data", "dados_fipe", "results", "data"];
        for (let k of keys) {
          if (obj[k]) {
            const val = obj[k];
            const list = Array.isArray(val) ? val : [val];
            const found = list.find(f => f && (f.fipe_codigo || f.codigo_fipe || f.FIPE_CODIGO));
            if (found) return found;
          }
        }
        return null;
      };
      
      const fData   = findFipe(api);
      const fipeCod = fData ? (fData.fipe_codigo || fData.codigo_fipe || fData.FIPE_CODIGO) : (api.fipe_codigo || api.codigo_fipe);
      const fipeMod = fData ? (fData.fipe_modelo || fData.modelo || fData.texto_modelo || fData.MODELO) : (api.fipe_modelo || api.modelo_fipe);
      const temFipe = fipeCod && fipeCod !== "—";

      const mfr        = api.marca        || api.fabricante || api.brand || api.texto_marca || "—";
      const chassiReal = api.chassi_completo || api.chassi   || api.vin  || "—";
      const combustivel= api.combustivel  || api.fuel        || api.texto_combustivel || "—";
      const cor        = api.cor          || api.color       || "—";
      const cidade     = (api.municipio && api.uf)
        ? `${api.municipio} / ${api.uf}` : (api.cidade || api.municipio || "—");
      const situacao   = api.situacao     || "—";

      genCards.appendChild(card("Montadora",       mfr));
      genCards.appendChild(card("Modelo",          modeloCompleto));
      genCards.appendChild(card("Chassi",          chassiReal));
      genCards.appendChild(card("Código FIPE",     temFipe ? fipeCod : "Não encontrado na API"));
      genCards.appendChild(card("Modelo FIPE",     temFipe ? fipeMod : "Não encontrado na API"));
      genCards.appendChild(card("Ano Fab./Modelo", anoCompleto));
      genCards.appendChild(card("Combustível",     combustivel));
      genCards.appendChild(card("Cor",             cor));
      genCards.appendChild(card("Município / UF",  cidade));
      genCards.appendChild(card("Situação",        situacao));

      if (!temFipe) {
        const allCards = genCards.querySelectorAll(".card");
        Array.from(allCards)
          .filter(c => {
            const lbl = c.querySelector(".label");
            return lbl && (lbl.textContent.includes("FIPE") || lbl.textContent.includes("Código"));
          })
          .forEach(c => c.style.opacity = "0.5");
      }
    }

  } else if (isPlate) {
    mSegs.innerHTML = `<div class="seg">${code}</div>`;
    injectOB(code, mCards, null);
  } else {
    setSegments(result, mSegs);
    setCards(result, mCards);
    centerGrid(mCards);
  }
}

window.renderGroupResults = renderGroupResults;
window.openModal = openModal;

async function main() {

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('PWA: Service Worker registrado com sucesso!', reg.scope))
        .catch(err => console.error('PWA: Erro ao registrar Service Worker:', err));
    });
  }

  try {
    console.log("Iniciando DecodeVIN...");
    const rules = await loadRules();
    console.log("Regras carregadas:", rules ? "Sim" : "Não");
    const decoder = createDecoder(rules);
    window.currentDecoder = decoder;

    const selectionScreen = el("selectionScreen");
    const singleDecoder = el("singleDecoder");
    const groupDecoder = el("groupDecoder");
    const vinInputSingle = el("vinInputSingle");
    const plateInputSingle = el("plateInputSingle");
    const btnSingle = el("btnDecodeSingle");
    const btnPlateSingle = el("btnPlateSingle");
    const gInput = el("groupInput");
    const gPlateInput = el("groupPlateInput");
    const combined = el("combinedMode");
    const gBtn = el("btnGroupDecode");
    const gResults = el("groupResults");

    const showScreen = (screen) => {
      [selectionScreen, singleDecoder, groupDecoder].forEach(s => {
        if (s) {
          s.style.display = "none";
          s.classList.remove("screen-fade-in");
        }
      });
      
      clearUI(true);
      
      if (screen) {
        screen.style.display = screen === selectionScreen ? "flex" : "block";
        void screen.offsetWidth;
        screen.classList.add("screen-fade-in");
      }
    };

    el("optSingle").onclick = () => {
      showScreen(singleDecoder);
      if (plateInputSingle) setTimeout(() => plateInputSingle.focus(), 50);
    };
    el("optGroup").onclick = () => {
      showScreen(groupDecoder);
      const fn = el("fleetName");
      if (fn) setTimeout(() => fn.focus(), 50);
      else if (gPlateInput) setTimeout(() => gPlateInput.focus(), 50);
    };
    el("backFromSingle").onclick = () => {
      showScreen(selectionScreen);
      clearUI(false);
    };
    el("backFromGroup").onclick = () => {
      showScreen(selectionScreen);
      clearUI(false);
    };

    const showReports = (mode, show) => {
      const id = mode === "single" ? "singleReportButtons" : "reportButtons";
      const e = el(id);
      if (e) e.style.display = show ? "flex" : "none";
    };

    const clearUI = (keepInputs = false) => {
      ["segments", "cards", "errors", "groupResults"].forEach(id => {
        const e = el(id);
        if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
      });
      showReports("single", false);
      showReports("group", false);
      const rt = el("resultTitle"); if (rt) rt.style.display = "none";
      const ob = el("secao-onibusbrasil"); if (ob) ob.style.display = "none";
      const gen = el("secao-veiculo-generico"); if (gen) gen.style.display = "none";
      
      const genericCards = ["card_gen_montadora", "card_gen_modelo", "card_gen_chassi", "card_gen_ano", "card_gen_combustivel", "card_gen_cor", "card_gen_cidade", "card_fipe_codigo", "card_fipe_modelo"];
      genericCards.forEach(id => {
        const e = el(id);
        if (e) e.style.opacity = "1";
      });
      
      const excelInput = el("excelFileInput");
      if (excelInput) excelInput.value = "";

      if (!keepInputs) {
        const fInput = el("fleetName");
        if (fInput) fInput.value = "";
        [vinInputSingle, plateInputSingle, gInput, gPlateInput].forEach(e => { if (e) e.value = ""; });
        window.currentGroupResults = null;
        window.currentSingleResult = null;
        window.lastGroupLotFingerprint = null;
        window.lastSingleFingerprint = null;
      }
      if (typeof window.validateGroupForm === "function") window.validateGroupForm();
    };

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    let isPlateValidated = false;
    let isValidating = false;

    async function runVIN(force = false) {
      if (!vinInputSingle || (isValidating && !force)) return;
      const text = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (text.length === 0) return;

      const plate = plateInputSingle ? plateInputSingle.value.trim().toUpperCase() : "";
      
      window.lastSingleFingerprint = JSON.stringify({ vin: text, plate: plate });

      if (plate !== "" && !isPlateValidated && !force) {
          console.log("Placa presente mas não validada. Iniciando busca automática...");
          await runPlate();
          return;
      }

      el("errors").innerHTML = "";
      const result = decoder.decode(text);
      
      if (result.type === "UNKNOWN" && text.length === 17) {
        result.type = "VIN";
        result.input = text;
        result.tokens = [{ key: "wmi", label: "WMI", value: text.slice(0, 3) }];
      }

      if (result.type === "UNKNOWN") {
        el("errors").innerHTML = `<div class="error">Chassi não reconhecido. Certifique-se de que o código está correto.</div>`;
        return;
      }

      const rt = el("resultTitle"); if (rt) rt.style.display = "block";
      const segs = el("segments"); if (segs) { segs.innerHTML = ""; segs.style.display = "none"; }
      
      renderResult(result, text);
      
      if (!window.currentSingleResult) {
        window.currentSingleResult = {
          tipo: result.type,
          vin: text,
          placa: plate,
          fabricante: result.manufacturerName || "Desconhecido",
          result: result,
          ob: {}
        };
      } else {
        window.currentSingleResult.tipo = result.type;
        window.currentSingleResult.vin = text;
        window.currentSingleResult.result = result;
        if (!window.currentSingleResult.fabricante || window.currentSingleResult.fabricante === "Desconhecido") {
          window.currentSingleResult.fabricante = result.manufacturerName || "Desconhecido";
        }
      }

      const fromPlateFlow = !!window._dvbSkipVinAudit;
      if (fromPlateFlow) {
        window._dvbSkipVinAudit = false;
      } else {
        addHistoryEntry(text);
      }
      if (window.dvbRegistrarPesquisa && !fromPlateFlow) {
        window.dvbRegistrarPesquisa({ tipo: "unico_vin", vin: text, placa: plate || "" });
      }
    }

    // Orquestra toda a busca por placa: API principal, OB e atualização da UI.
    async function runPlate() {
      if (!plateInputSingle || isValidating) return;
      const p = plateInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const vin = vinInputSingle ? vinInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
      
      window.lastSingleFingerprint = JSON.stringify({ vin: vin, plate: p });

      if (p.length < 6 || p.length > 7) {
        el("errors").innerHTML = `<div class="error">A placa deve ter 6 ou 7 caracteres.</div>`;
        return;
      }

      isValidating = true;
      const btnPlate = el("btnPlateSingle");
      const btnDecode = el("btnDecodeSingle");
      const oldBtnPlateText = btnPlate ? btnPlate.textContent : "";
      if (btnPlate) { btnPlate.disabled = true; btnPlate.textContent = "⏳ Verificando..."; }
      if (btnDecode) btnDecode.disabled = true;

      const copyChassiBtn = el("copy_chassi_btn");
      const copyFipeBtn = el("copy_fipe_btn");
      if (copyChassiBtn) copyChassiBtn.style.display = "none";
      if (copyFipeBtn) copyFipeBtn.style.display = "none";

      isPlateValidated = false;
      window.currentSingleResult = { vin: vin, placa: p, ob: {}, result: null };

      ["segments", "cards", "errors"].forEach(id => {
        const e = el(id);
        if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
      });
      const rt = el("resultTitle"); if (rt) rt.style.display = "none";
      const obSec = el("secao-onibusbrasil"); if (obSec) obSec.style.display = "none";
      const genSec = el("secao-veiculo-generico"); if (genSec) genSec.style.display = "none";
      const verifEl = el("ob_verificacao"); if (verifEl) verifEl.innerHTML = "";
      showReports("single", false);

      el("errors").innerHTML = "";
      
      const chassiDigitado = vinInputSingle ? vinInputSingle.value.trim().toUpperCase() : "";
      if (verifEl) verifEl.innerHTML = `<span style="color:var(--muted); font-weight:normal">Verificando placa...</span>`;

      try {
        const apiResult = await consultarPlacaPHP(p, chassiDigitado);
        console.log("Resultado da verificação de placa:", apiResult);

        if (apiResult.status === "ok") {
          isPlateValidated = true;
          
          let obData = apiResult.ob_data;

          if ((!obData || !obData.success) && window.buscarDadosOnibusBrasil) {
            try {
              const obTry = await window.buscarDadosOnibusBrasil(p, false);
              if (obTry && obTry.success === true) {
                obData = obTry;
                apiResult.ob_data = obTry;
              }
            } catch (e) {
              console.warn("Falha ao consultar ÔnibusBrasil (fallback):", e);
            }
          }
          
          const apiTipo = String(apiResult.tipo || apiResult.category || "").toLowerCase();
          const isBus = apiResult.is_onibus === true || (obData && obData.success) || apiTipo.includes("onibus") || apiTipo.includes("ônibus");
          const apiChassi = apiResult.chassi_completo || apiResult.chassi || apiResult.final_chassi || apiResult.vin || apiResult.CHASSI || apiResult.vin_completo || "—";
          const apiAnoFab = apiResult.ano || apiResult.ano_fabricacao || apiResult.year || apiResult.anoFabricacao;
          const apiAnoMod = apiResult.ano_modelo || apiResult.model_year || apiResult.anoModelo;
          const apiAnoCompleto = (apiAnoFab && apiAnoMod && apiAnoFab !== apiAnoMod)
            ? `${apiAnoFab}/${apiAnoMod}`
            : (apiAnoFab || apiAnoMod || "—");

          if (isBus) {
            if (verifEl) verifEl.innerHTML = `<span style="color:#2ecc71">${apiResult.mensagem || "✔ Veículo identificado (Ônibus)"}</span>`;
            if (obSec) obSec.style.display = "block";

            if (obData && obData.success === true && 
                (obData.encarrocadeira || obData.carroceria || obData.fabricante_chassi || obData.modelo_chassi)) {

              el("ob_status").textContent = "✅ Dados encontrados! (cache)";
              el("ob_status").style.color = "var(--accent)";

              const obContainer = el("ob_container");
              if (obContainer) {

                const cardsParaLimpar = obContainer.querySelectorAll(".card.card-plate");
                cardsParaLimpar.forEach(c => c.remove());
              }

              const camposOB = [
                { label: "Encarroçadora",    valor: obData.encarrocadeira    || obData.encarrocadora || "—", id: "ob_encarrocadeira" },
                { label: "Carroceria",        valor: obData.carroceria        || "—",                        id: "ob_carroceria" },
                { label: "Fabricante Chassi", valor: obData.fabricante_chassi || obData.fabricante   || apiResult.marca || "—", id: "ob_fabricante_chassi" },
                { label: "Modelo Chassi",     valor: obData.modelo_chassi     || obData.chassi        || apiResult.modelo || "—", id: "ob_chassi" },
                { label: "Chassi API",        valor: apiChassi, id: "ob_chassi_api" },
                { label: "Ano Fab./Modelo",   valor: apiAnoCompleto, id: "ob_ano_api" },
                { label: "Código FIPE",       valor: apiResult.fipe_codigo,   id: "ob_fipe_codigo" },
                { label: "Modelo FIPE",       valor: apiResult.fipe_modelo,   id: "ob_fipe_modelo" }
              ];

              camposOB.forEach(({ label, valor, id }) => {
                if (valor && valor !== "—") {
                  const newCard = document.createElement("div");
                  newCard.className = "card card-plate";
                  newCard.innerHTML = `<div class="label">${label}</div><div class="value" id="${id}">${valor}</div>`;
                  obContainer.insertBefore(newCard, el("ob_media_container"));
                }
              });

              if (obData.foto_url && el("ob_foto")) {
                el("ob_foto").src = obData.foto_url;
                el("ob_foto").style.display = "block";
              }
              const fonteEl = el("ob_fonte");
              if (fonteEl) {
                fonteEl.href = `https://onibusbrasil.com/placa/${p}`;
                fonteEl.style.display = "inline-block";
              }

            } else {

              el("ob_status").textContent = "Buscando...";
              toggleValueSkeletons(el("ob_container"), true);
              if (window.buscarDadosOnibusBrasil) {
                const obLive = await window.buscarDadosOnibusBrasil(p);

                const obContainer = el("ob_container");
                if (obContainer) {
                  const cardsParaLimpar = obContainer.querySelectorAll(".card.card-plate");
                  cardsParaLimpar.forEach(c => c.remove());
                  
                  const camposLive = [
                    { label: "Encarroçadora",    valor: obLive?.encarrocadeira    || obLive?.encarrocadora || "—", id: "ob_encarrocadeira" },
                    { label: "Carroceria",        valor: obLive?.carroceria        || "—", id: "ob_carroceria" },
                    { label: "Fabricante Chassi", valor: obLive?.fabricante_chassi || obLive?.fabricante || apiResult.marca || "—", id: "ob_fabricante_chassi" },
                    { label: "Modelo Chassi",     valor: obLive?.modelo_chassi     || obLive?.chassi     || apiResult.modelo || "—", id: "ob_chassi" },
                    { label: "Chassi API",        valor: apiChassi, id: "ob_chassi_api" },
                    { label: "Ano Fab./Modelo",   valor: apiAnoCompleto, id: "ob_ano_api" },
                    { label: "Código FIPE",       valor: apiResult.fipe_codigo,   id: "ob_fipe_codigo" },
                    { label: "Modelo FIPE",       valor: apiResult.fipe_modelo,   id: "ob_fipe_modelo" }
                  ];

                  let hasAnyDataLive = false;
                  camposLive.forEach(({ label, valor, id }) => {
                    if (valor && valor !== "—") {
                      if (["ob_encarrocadeira", "ob_carroceria", "ob_fabricante_chassi"].includes(id)) {
                        hasAnyDataLive = true;
                      }
                      const newCard = document.createElement("div");
                      newCard.className = "card card-plate";
                      newCard.innerHTML = `<div class="label">${label}</div><div class="value" id="${id}">${valor}</div>`;
                      obContainer.insertBefore(newCard, el("ob_media_container"));
                    }
                  });

                  if (el("ob_status")) {
                    el("ob_status").textContent = hasAnyDataLive ? "✅ Dados encontrados!" : "ℹ️ OnibusBrasil sem dados — exibindo dados da KePlaca";
                    el("ob_status").style.color = hasAnyDataLive ? "var(--accent)" : "var(--accent-2)";
                  }
                }
              }
            }

          } else {
            if (verifEl) verifEl.innerHTML = `<span style="color:var(--accent-2)">✔ Veículo identificado</span>`;
            if (genSec) genSec.style.display = "block";

            if (el("card_fipe_codigo")) {
              el("card_fipe_codigo").style.display = "block";
              if (el("gen_fipe_codigo")) el("gen_fipe_codigo").textContent = "—";
            }
            if (el("card_fipe_modelo")) {
              el("card_fipe_modelo").style.display = "block";
              if (el("gen_fipe_modelo")) el("gen_fipe_modelo").textContent = "—";
            }

            const mBasico = apiResult.modelo || apiResult.model || apiResult.texto_modelo || "";
            const vBasico = apiResult.versao || apiResult.version || "";
            const modeloCompleto = (mBasico && vBasico && !mBasico.includes(vBasico)) 
              ? `${mBasico} ${vBasico}` 
              : (mBasico || vBasico || "—");

            const anoFab = apiResult.ano || apiResult.ano_fabricacao || apiResult.year || apiResult.anoFabricacao;
            const anoMod = apiResult.ano_modelo || apiResult.model_year || apiResult.anoModelo;
            const anoCompleto = (anoFab && anoMod && anoFab !== anoMod)
              ? `${anoFab}/${anoMod}`
              : (anoFab || anoMod || "—");

            const mfr = apiResult.marca || apiResult.fabricante || apiResult.brand || apiResult.texto_marca || apiResult.MARCA || apiResult.FABRICANTE || apiResult.marcaNome || "—";
            const chassiReal = apiResult.chassi_completo || apiResult.chassi || apiResult.final_chassi || apiResult.vin || apiResult.CHASSI || apiResult.vin_completo || "—";
            const combustivelReal = apiResult.combustivel || apiResult.fuel || apiResult.texto_combustivel || apiResult.COMBUSTIVEL || apiResult.tipo_combustivel || "—";
            const corReal = apiResult.cor || apiResult.color || apiResult.COR || apiResult.cor_veiculo || "—";
            const cidadeReal = (apiResult.municipio && apiResult.uf) ? `${apiResult.municipio} / ${apiResult.uf}` : (apiResult.cidade || apiResult.municipio || apiResult.MUNICIPIO || apiResult.CIDADE || apiResult.nome_cidade || "—");

            const setValWithStyle = (id, cardId, value) => {
              const elVal = el(id);
              const elCard = el(cardId);
              const exists = value && value !== "—" && value !== "undefined";
              if (elVal) elVal.textContent = exists ? value : "Não encontrado na API";
              if (elCard) elCard.style.opacity = exists ? "1" : "0.5";
            };

            setValWithStyle("gen_montadora", "card_gen_montadora", mfr);
            setValWithStyle("gen_modelo", "card_gen_modelo", modeloCompleto);
            setValWithStyle("gen_chassi", "card_gen_chassi", chassiReal);
            setValWithStyle("gen_ano", "card_gen_ano", anoCompleto);
            setValWithStyle("gen_combustivel", "card_gen_combustivel", combustivelReal);
            setValWithStyle("gen_cor", "card_gen_cor", corReal);
            setValWithStyle("gen_cidade", "card_gen_cidade", cidadeReal);

            if (copyChassiBtn) {
              if (chassiReal && chassiReal.length === 17) {
                copyChassiBtn.style.display = "block";
                copyChassiBtn.onclick = () => {
                  navigator.clipboard.writeText(chassiReal);
                  showToast("Chassi copiado para a área de transferência!");
                };
              } else {
                copyChassiBtn.style.display = "none";
              }
            }

            const genLogo = el("gen_logo");
            if (genLogo) {
              if (apiResult.logo) {
                genLogo.src = apiResult.logo;
                genLogo.style.display = "block";
              } else {
                genLogo.style.display = "none";
              }
            }
          }
          
          window._dvbSkipVinAudit = true;
          await runVIN(true); 
          showReports("single", true);

          if (!window.currentSingleResult) {
            window.currentSingleResult = { tipo: 'PLATE', placa: p, ob: {}, ob_data: obData || {}, apiResult: apiResult };
          } else {
            window.currentSingleResult.placa = p;
            window.currentSingleResult.ob_data = obData || {};
            window.currentSingleResult.apiResult = apiResult;
          }

          if (!isBus) {
            const genSituacao = el("gen_situacao"); 
            const cardSituacao = el("card_situacao");
            const sitReal = apiResult.situacao;
            const sitExists = sitReal && sitReal !== "—";
            if (genSituacao) genSituacao.textContent = sitExists ? sitReal : "Não encontrado na API"; 
            if (cardSituacao) cardSituacao.style.opacity = sitExists ? "1" : "0.5";
            
            const temFipe = apiResult.fipe_codigo && apiResult.fipe_codigo !== "—"; 
            
            const genFipeCodigo = el("gen_fipe_codigo"); 
            if (genFipeCodigo) genFipeCodigo.textContent = temFipe 
              ? apiResult.fipe_codigo 
              : "Não encontrado na API"; 
            
            const genFipeModelo = el("gen_fipe_modelo"); 
            if (genFipeModelo) genFipeModelo.textContent = temFipe 
              ? apiResult.fipe_modelo 
              : "Não encontrado na API"; 
            
            const cardFipeCodigo = el("card_fipe_codigo"); 
            const cardFipeModelo = el("card_fipe_modelo"); 
            if (!temFipe) { 
              if (cardFipeCodigo) cardFipeCodigo.style.opacity = "0.5"; 
              if (cardFipeModelo) cardFipeModelo.style.opacity = "0.5"; 
              if (copyFipeBtn) copyFipeBtn.style.display = "none";
            } else { 
              if (cardFipeCodigo) cardFipeCodigo.style.opacity = "1"; 
              if (cardFipeModelo) cardFipeModelo.style.opacity = "1"; 
              if (copyFipeBtn) {
                copyFipeBtn.style.display = "block";
                copyFipeBtn.onclick = () => {
                  navigator.clipboard.writeText(apiResult.fipe_codigo);
                  showToast("Código FIPE copiado para a área de transferência!");
                };
              }
            } 

            if (!apiResult.fipe_codigo && !apiResult.fipe_modelo && !apiResult.marca && !apiResult.modelo) {
              const errorArea = el("errors");
              if (errorArea) {
                errorArea.innerHTML = `<div class="error" style="background: rgba(56, 189, 248, 0.1); border: 1px solid var(--accent-2); color: var(--accent-2); padding: 15px; border-radius: 8px; margin-top: 10px; text-align: center;">
                  ℹ️ Algumas informações técnicas não foram retornadas pela API para este veículo.
                </div>`;
              }
            }
          }

          addHistoryEntry(vinInputSingle.value, p);
          if (window.dvbRegistrarPesquisa) {
            const vVin = vinInputSingle ? vinInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
            window.dvbRegistrarPesquisa({ tipo: "unico_placa", placa: p, vin: vVin });
          }
          
          if (!window.currentSingleResult) {
            window.currentSingleResult = { tipo: 'PLATE', placa: p, ob: {}, ob_data: obData || {} };
          } else {
            window.currentSingleResult.placa = p;
            window.currentSingleResult.ob_data = obData || {};
          }
          
          if (el("ob_container")) {
            window.currentSingleResult.ob = {
              ob_encarrocadeira: el("ob_encarrocadeira")?.textContent || "",
              ob_carroceria: el("ob_carroceria")?.textContent || "",
              ob_fabricante_chassi: el("ob_fabricante_chassi")?.textContent || "",
              ob_chassi: el("ob_chassi")?.textContent || ""
            };
          }
        } else {
          isPlateValidated = false;
          
          let errorMsg = "";
          let subMsg = "Por segurança, os dados técnicos não serão exibidos.";
          let resumoDivergencia = "";
          
          if (String(apiResult.mensagem).includes("402")) {
            errorMsg = "🔴 API SEM SALDO";
            subMsg = "As consultas de validação de placa estão suspensas por falta de créditos na WDAPI.";
          } else if (String(apiResult.mensagem).includes("não pertence")) {
            errorMsg = `Este chassi (${chassiDigitado}) não pertence à placa (${p}).`;

            // Busca dados da placa sem chassi para explicar o motivo da divergência.
            let apiPlaca = apiResult;
            try {
              const placaOnly = await consultarPlacaPHP(p, "");
              if (placaOnly && placaOnly.status === "ok") apiPlaca = placaOnly;
            } catch (_) {}

            const marcaPlaca =
              apiPlaca.marca ||
              apiPlaca.fabricante ||
              apiPlaca.brand ||
              apiPlaca.texto_marca ||
              apiPlaca.MARCA ||
              apiPlaca.FABRICANTE ||
              "Desconhecida";
            const modeloPlaca =
              apiPlaca.modelo ||
              apiPlaca.texto_modelo ||
              apiPlaca.model ||
              apiPlaca.MODELO ||
              apiPlaca.versao ||
              "Não informado";
            const marcaChassi = window.currentSingleResult?.result?.manufacturerName || "Não identificado";

            resumoDivergencia = `
              <div style="margin-top: 10px; text-align: left; display: inline-block; max-width: 760px; font-weight: 500; color: #fecaca;">
                <div><strong>Resumo da divergência:</strong></div>
                <div>• Chassi informado: <strong>${chassiDigitado || "—"}</strong> (${marcaChassi})</div>
                <div>• Veículo da placa ${p}: <strong>${marcaPlaca} ${modeloPlaca}</strong></div>
                <div>• Motivo: chassi e placa pertencem a veículos diferentes.</div>
              </div>
            `;
          } else {
            errorMsg = `Não foi possível localizar os dígitos do chassi para a placa ${p} em fontes públicas.`;
          }

          if (verifEl) verifEl.innerHTML = `<span style="color:#e74c3c">${errorMsg}</span>`;
          
          if (obSec) obSec.style.display = "none";
          showReports("single", false);

          el("errors").innerHTML = `<div class="error" style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 20px; border-radius: 8px; margin-top: 15px; font-weight: 600; text-align: center; width: 100%;">
            ${errorMsg}
            <br><small style="font-weight: normal; opacity: 0.8; margin-top: 5px; display: block;">${subMsg}</small>
            ${resumoDivergencia}
          </div>`;
        }
      } catch (e) {
        console.error("Erro no fluxo de validação:", e);
        if (verifEl) verifEl.innerHTML = `<span style="color:#e74c3c">Erro de conexão</span>`;
      } finally {
        isValidating = false;
        if (btnPlate) { 
          btnPlate.disabled = false; 
          btnPlate.textContent = oldBtnPlateText; 
        }
        if (btnDecode) {
          btnDecode.disabled = vinInputSingle.value.length === 0;
        }
      }
    }

    if (btnSingle) btnSingle.addEventListener('click', runVIN);
    if (btnPlateSingle) btnPlateSingle.addEventListener('click', runPlate);
    if (vinInputSingle) vinInputSingle.addEventListener('keydown', e => e.key === "Enter" && runVIN());
    if (plateInputSingle) plateInputSingle.addEventListener('keydown', e => e.key === "Enter" && runPlate());

    el("btnClearSingleInputs")?.addEventListener("click", () => {
      if (vinInputSingle) {
        vinInputSingle.value = "";
        vinInputSingle.dispatchEvent(new Event("input"));
      }
      if (plateInputSingle) {
        plateInputSingle.value = "";
        plateInputSingle.dispatchEvent(new Event("input"));
      }
    });

    if (vinInputSingle) {
      vinInputSingle.addEventListener('input', () => {
        const val = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
        vinInputSingle.value = val;
        
        const counter = el("vinCounter");
        if (counter) {
          counter.textContent = `${val.length}/17`;
          if (val.length === 17 || val.length === 8) {
            vinInputSingle.classList.add("input-valid");
            vinInputSingle.classList.remove("input-invalid");
          } else if (val.length > 0) {
            vinInputSingle.classList.add("input-invalid");
            vinInputSingle.classList.remove("input-valid");
          } else {
            vinInputSingle.classList.remove("input-valid", "input-invalid");
          }
        }

        if (btnSingle) btnSingle.disabled = val.length === 0;

        if (val.length === 0) {
          clearUI(true);
          const verif = el("ob_verificacao"); if (verif) verif.innerHTML = "";
          window.currentSingleResult = null;
          return;
        }
      });
    }

    if (plateInputSingle) {
      plateInputSingle.addEventListener('input', () => {
        const val = plateInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
        plateInputSingle.value = val;
        
        const counter = el("plateCounter");
        if (counter) {
          counter.textContent = `${val.length}/7`;
          if (val.length >= 6) {
            plateInputSingle.classList.add("input-valid");
            plateInputSingle.classList.remove("input-invalid");
          } else if (val.length > 0) {
            plateInputSingle.classList.add("input-invalid");
            plateInputSingle.classList.remove("input-valid");
          } else {
            plateInputSingle.classList.remove("input-valid", "input-invalid");
          }
        }
        if (btnPlateSingle) btnPlateSingle.disabled = val.length < 3;
      });
    }

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    const btnExportCSVSingle = el("btnExportCSVSingle");
    if (btnExportCSVSingle) {
      btnExportCSVSingle.onclick = () => {
        if (window.currentSingleResult) openReportOptions([window.currentSingleResult], "Relatorio_Veiculo_" + window.currentSingleResult.vin);
      };
    }

    gInput.addEventListener('input', () => {
      const pos = gInput.selectionStart;
      let val = gInput.value.toUpperCase().replace(/[^A-Z0-9\n\r]/g, "");
      const lines = val.split('\n');
      let newVal = "";
      let offset = 0;
      let currentTotal = 0;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.length > 17) {
          newVal += line.substring(0, 17) + "\n" + line.substring(17);
          if (pos > currentTotal + 17) offset++;
        } else {
          newVal += line;
        }
        if (i < lines.length - 1) newVal += "\n";
        currentTotal += line.length + 1;
      }

      gInput.value = newVal;
      gInput.setSelectionRange(pos + offset, pos + offset);
      validateGBtn();
    });

    gPlateInput.addEventListener('input', () => {
      const pos = gPlateInput.selectionStart;
      let val = gPlateInput.value.toUpperCase().replace(/[^A-Z0-9\n\r]/g, "");
      const lines = val.split('\n');
      let newVal = "";
      let offset = 0;
      let currentTotal = 0;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.length > 7) {
          newVal += line.substring(0, 7) + "\n" + line.substring(7);
          if (pos > currentTotal + 7) offset++;
        } else {
          newVal += line;
        }
        if (i < lines.length - 1) newVal += "\n";
        currentTotal += line.length + 1;
      }

      gPlateInput.value = newVal;
      gPlateInput.setSelectionRange(pos + offset, pos + offset);
      validateGBtn();
    });

    const validateGBtn = () => {
      const fleetOk = (el("fleetName")?.value || "").trim().length > 0;
      const v = gInput.value.trim();
      const p = gPlateInput.value.trim();
      if (combined.checked) {
        const vl = v.split("\n").map(x => x.trim()).filter(Boolean);
        const pl = p.split("\n").map(x => x.trim()).filter(Boolean);
        gBtn.disabled =
          vl.length === 0 ||
          vl.length !== pl.length ||
          !vl.every(x => x.length === 17) ||
          !pl.every(x => x.length >= 6) ||
          !fleetOk;
      } else {
        gBtn.disabled = (!v && !p) || !fleetOk;
      }
    };
    window.validateGroupForm = validateGBtn;

    combined.addEventListener("change", validateGBtn);
    const fleetNameEl = el("fleetName");
    if (fleetNameEl) fleetNameEl.addEventListener("input", validateGBtn);
    validateGBtn();

    el("btnClearGroupInputs")?.addEventListener("click", () => {
      if (gPlateInput) {
        gPlateInput.value = "";
        gPlateInput.dispatchEvent(new Event("input"));
      }
      if (gInput) {
        gInput.value = "";
        gInput.dispatchEvent(new Event("input"));
      }
    });

    const excelFleetModal = el("excelFleetModal");
    const excelFleetNameInput = el("excelFleetNameInput");
    const fecharExcelFleetModal = () => {
      if (excelFleetModal) excelFleetModal.style.display = "none";
    };
    const abrirExcelFleetModal = () => {
      if (excelFleetNameInput) {
        excelFleetNameInput.value = (el("fleetName")?.value || "").trim();
      }
      if (excelFleetModal) excelFleetModal.style.display = "flex";
      setTimeout(() => excelFleetNameInput?.focus(), 80);
    };
    const btnImportExcelBtn = el("btnImportExcel");
    if (btnImportExcelBtn) {
      btnImportExcelBtn.onclick = () => abrirExcelFleetModal();
    }
    el("closeExcelFleetModal")?.addEventListener("click", fecharExcelFleetModal);
    el("excelFleetCancel")?.addEventListener("click", fecharExcelFleetModal);
    el("excelFleetConfirm")?.addEventListener("click", () => {
      const name = (excelFleetNameInput?.value || "").trim();
      if (!name) {
        if (typeof showToast === "function") showToast("Preencha o nome do lote / frota.", "error");
        return;
      }
      const fnFleet = el("fleetName");
      if (fnFleet) fnFleet.value = name;
      validateGBtn();
      fecharExcelFleetModal();
      el("excelFileInput")?.click();
    });
    if (excelFleetNameInput) {
      excelFleetNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          el("excelFleetConfirm")?.click();
        }
      });
    }
    if (excelFleetModal) {
      excelFleetModal.addEventListener("click", (e) => {
        if (e.target === excelFleetModal) fecharExcelFleetModal();
      });
    }

    const gSearch = el("groupSearchInput");
    if (gSearch) {
      gSearch.addEventListener("input", () => {
        if (!window.currentGroupResults) return;
        const term = gSearch.value.toLowerCase().trim();
        if (!term) {
          currentGroupPage = 1;
          renderGroupResults();
          return;
        }

        const filtered = window.currentGroupResults.filter(item => {
          const api = item.apiResult || {};
          const mBasico = (api.modelo || api.model || api.texto_modelo || "").toLowerCase();
          const vBasico = (api.versao || api.version || "").toLowerCase();
          const fab = (item.fabricante || "").toLowerCase();
          const placa = (item.placa || "").toLowerCase();
          const chassi = (item.vin || "").toLowerCase();
          
          // Dados adicionais para filtro
          const combustivel = (api.combustivel || api.fuel || "").toLowerCase();
          const anoFab = String(api.ano || api.ano_fabricacao || api.year || "").toLowerCase();
          const anoMod = String(api.ano_modelo || api.model_year || "").toLowerCase();
          
          // Se o usuário digitou algo como "ano:2018", "placa:ABC", etc.
          if (term.includes(":")) {
            const [key, val] = term.split(":").map(s => s.trim());
            if (key === "ano") return anoFab.includes(val) || anoMod.includes(val);
            if (key === "placa") return placa.includes(val);
            if (key === "montadora" || key === "marca") return fab.includes(val);
            if (key === "modelo") return mBasico.includes(val) || vBasico.includes(val);
            if (key === "combustivel") return combustivel.includes(val);
          }

          // Busca geral
          return fab.includes(term) || 
                 mBasico.includes(term) || 
                 vBasico.includes(term) || 
                 placa.includes(term) || 
                 chassi.includes(term) ||
                 combustivel.includes(term) ||
                 anoFab.includes(term) ||
                 anoMod.includes(term);
        });

        currentGroupPage = 1;
        renderGroupResults(filtered);
      });
    }

    gBtn.onclick = async () => {
      const fleetEl = el("fleetName");
      if (!fleetEl || !fleetEl.value.trim()) {
        if (typeof showToast === "function") {
          showToast("Informe o nome do lote / frota antes de decodificar.", "error");
        }
        return;
      }
      const gResults = el("groupResults");
      if (!gResults) return;
      gResults.innerHTML = "";
      const vLines = gInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      const pLines = gPlateInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      
      const totalItems = Math.max(vLines.length, pLines.length);
      if (totalItems === 0) return;

      const progressContainer = el("progressContainer");
      const progressBar = el("progressBar");
      const groupProgress = el("groupProgress");
      if (progressContainer) progressContainer.style.display = "block";
      if (groupProgress) groupProgress.style.display = "block";
      if (progressBar) progressBar.style.width = "0%";

      const gSearch = el("groupSearchInput");
      if (gSearch) gSearch.value = "";

      addGroupHistoryEntry(gInput.value, gPlateInput.value);

      const fleetNameAtual = (el("fleetName")?.value || "").trim();
      window.currentGroupResults = [];
      window.lastGroupLotFingerprint = JSON.stringify({
        fleetName: fleetNameAtual,
        vins: gInput.value,
        plates: gPlateInput.value
      });
      currentGroupPage = 1;
      
      const allItems = [];
      for (let i = 0; i < totalItems; i++) {
        allItems.push({ vin: vLines[i] || "", plate: pLines[i] || "" });
      }

      const BATCH_SIZE = 5; 
      let currentIndex = 0;

      const processBatch = async () => {
        const batch = allItems.slice(currentIndex, currentIndex + BATCH_SIZE);
        
        if (batch.length === 0) {
          if (progressContainer) progressContainer.style.display = "none";
          if (groupProgress) groupProgress.style.display = "none";
          gResults.innerHTML = ""; 
          showReports("group", true);
          renderGroupResults();
          if (window.dvbRegistrarPesquisa) {
            const fn = el("fleetName");
            const fleetName = fn ? fn.value.trim() : "";
            window.dvbRegistrarPesquisa({
              tipo: "grupo",
              detalhe: `Lote: ${totalItems} veículo(s)`,
              fleetName: fleetName || undefined
            });
          }
          return;
        }

        const progressPercent = (currentIndex / totalItems) * 100;
        if (progressBar) progressBar.style.width = `${progressPercent}%`;
        if (groupProgress) groupProgress.textContent = `Processando ${currentIndex} de ${totalItems} itens...`;

        const apiCalls = batch.map(pair => (async () => {
          const { vin, plate } = pair;
          const res = vin ? decoder.decode(vin) : { type: "UNKNOWN", tokens: [], manufacturerName: "Desconhecido" };
          
          const itemData = { 
            tipo: vin && plate ? 'COMBINADO' : (vin ? 'VIN' : 'PLATE'), 
            vin, 
            placa: plate, 
            fleetName: fleetNameAtual,
            fabricante: res.manufacturerName || "Desconhecido", 
            result: JSON.parse(JSON.stringify(res)), 
            ob: {},
            ob_data: {},
            status: 'pending'
          };
          
          window.currentGroupResults.push(itemData);

          if (plate) {
            try {
              const apiResult = await consultarPlacaPHP(plate, vin || "");

              const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              const chassiDigitadoNorm = norm(vin);

              // Pega os últimos 5 do chassi digitado
              const final5Digitado = chassiDigitadoNorm.slice(-5);

              // Coleta o chassi retornado pela API (todas as fontes possíveis)
              const chassiRetornadoNorm = norm(
                apiResult.chassi_completo || 
                apiResult.chassi || 
                apiResult.chassi_raw_api || 
                ""
              );

              // Compara os últimos 5 dígitos
              const compativelPorFinal5 = 
                chassiDigitadoNorm.length >= 5 &&
                chassiRetornadoNorm.length >= 5 &&
                chassiDigitadoNorm.slice(-5) === chassiRetornadoNorm.slice(-5);

              const confirmouPorFinalParcial = compativelPorFinal5 && apiResult.status !== "ok";

              if (apiResult.status === "ok" || compativelPorFinal5) {
                itemData.status = 'ok';
                itemData.apiResult = apiResult;

                if (confirmouPorFinalParcial) {
                  itemData.apiResult.status = "ok";
                  itemData.apiResult.mensagem = "✔ Compatível por validação dos 5 últimos dígitos";
                }

                itemData.fabricante = apiResult.marca || apiResult.fabricante || itemData.fabricante;

                // Quando confirmou por parcial, NÃO substitui o chassi pelo retornado da API
                // pois ele pode estar incompleto. Mantém o digitado.
                if (!confirmouPorFinalParcial && (apiResult.chassi_completo || apiResult.chassi)) {
                  const apiChassi = apiResult.chassi_completo || apiResult.chassi;
                  itemData.vin = apiChassi;
                  if (window.currentDecoder) {
                    itemData.result = window.currentDecoder.decode(apiChassi);
                  }
                }

                // Busca OnibusBrasil
                let obData = null;
                if (window.buscarDadosOnibusBrasil) {
                  try {
                    obData = await window.buscarDadosOnibusBrasil(plate, false);
                  } catch (e) {
                    console.warn("Falha ao buscar dados no ÔnibusBrasil (grupo):", e);
                  }
                }

                if (obData && !obData.erro) {
                  itemData.ob_data = obData;
                  itemData.apiResult.ob_data = obData;
                  itemData.ob = {
                    ob_carroceria:        obData.carroceria        || "—",
                    ob_encarrocadeira:    obData.encarrocadeira    || obData.encarrocadora || "—",
                    ob_fabricante_chassi: obData.fabricante_chassi || obData.fabricante || apiResult.marca || "—",
                    ob_chassi:            obData.modelo_chassi     || obData.chassi     || apiResult.modelo || "—"
                  };
                } else {
                  itemData.ob = {
                    ob_carroceria:        "—",
                    ob_encarrocadeira:    "—",
                    ob_fabricante_chassi: apiResult.marca  || "—",
                    ob_chassi:            apiResult.modelo || "—"
                  };
                }
              } else {
                itemData.status = 'error';
                itemData.error_detail = apiResult.mensagem;
              }
            } catch (e) { 
              itemData.status = 'error';
              console.error("Erro no par do grupo:", e); 
            }
          } else if (vin) {
            itemData.status = 'ok';
          } else {
            itemData.status = 'orphan';
          }
        })());

        await Promise.all(apiCalls);
        
        currentIndex += BATCH_SIZE;
        
        await new Promise(resolve => setTimeout(resolve, 50)); 
        processBatch(); 
      };

      processBatch(); 
    };

    el("closeModal").onclick = () => el("detailModal").style.display = "none";

    const btnExportCSV = el("btnExportCSV");
    if (btnExportCSV) {
      btnExportCSV.onclick = () => {
        if (window.currentGroupResults) openReportOptions(window.currentGroupResults, "Relatorio_Frota");
      };
    }

    renderHistory();

  } catch (err) {
    console.error("Erro fatal na inicialização:", err);
    const errs = el("errors");
    if (errs) errs.innerHTML = `<div class="error">Erro ao carregar sistema: ${err.message}</div>`;
  }
}

main().catch(console.error);