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

 // BLOCO 1 — Funções de API para fleet_vehicles 
 // Cole logo após as funções fetchWithTimeout / consultarPlacaPHP 

  
 const AUTH_WORKER = 'https://decodevinbus-auth.luismiguelgomesoliveira-014.workers.dev'; // mesmo que você já usa 
  
 // Salva todos os veículos decodificados de um lote no banco 
 async function salvarFrotaNoBanco(fleetName, historyId, results) { 
   const token = localStorage.getItem('dvb_token'); 
   if (!token) return; // usuário não logado, não salva 
  
   const vehicles = (results || []).map(item => { 
     const tech = getTechnicalData(item); 
     const api  = item.apiResult || {}; 
     const ob   = item.ob_data  || item.ob || api.ob_data || api.ob || {}; 
  
     const anoFab = api.ano || api.ano_fabricacao || ''; 
     const anoMod = api.ano_modelo || ''; 
     const ano    = (anoFab && anoMod && anoFab !== anoMod) 
       ? (anoFab + '/' + anoMod) 
       : (anoFab || anoMod || tech.year || ''); 
  
     let fipeCodigo = ''; 
     let fipeModelo = ''; 
     const findFipeDeep = (obj, anoVeiculo) => { 
       if (!obj || typeof obj !== 'object') return null; 
       if (obj.fipe_codigo || obj.codigo_fipe) return obj; 
       for (const k of ['fipe', 'fipe_data', 'dados_fipe', 'results', 'data']) { 
         if (obj[k]) { 
           const list = Array.isArray(obj[k]) ? obj[k] : [obj[k]]; 
           
           // Tenta primeiro encontrar pelo ano correspondente 
           if (anoVeiculo && list.length > 1) { 
             const anoBase = String(anoVeiculo).split('/')[0]; 
             const byYear = list.find(f => f && 
               (f.fipe_codigo || f.codigo_fipe) && 
               String(f.ano_modelo || f.ano || '').includes(anoBase) 
             ); 
             if (byYear) return byYear; 
           } 
           
           // Fallback: primeiro da lista 
           const found = list.find(f => f && (f.fipe_codigo || f.codigo_fipe)); 
           if (found) return found; 
         } 
       } 
       return null; 
     }; 
     const fipeObj = findFipeDeep(api, anoFab || anoMod); 
     if (fipeObj) { 
       fipeCodigo = fipeObj.fipe_codigo || fipeObj.codigo_fipe || ''; 
       fipeModelo = fipeObj.fipe_modelo || fipeObj.texto_modelo || fipeObj.modelo || ''; 
     } else { 
       fipeCodigo = api.fipe_codigo || ''; 
       fipeModelo = api.fipe_modelo || ''; 
     } 
  
     const carroceria = ob.carroceria || ob.ob_carroceria || api.carroceria || api.ob_carroceria || '';
     const encarrocadora = ob.encarrocadeira || ob.ob_encarrocadeira || ob.encarrocadora || ob.ob_encarrocadora || api.encarrocadeira || api.ob_encarrocadeira || '';

     const tokens = item.result?.tokens || [];
     const findTk = (label) => {
       const search = label.toLowerCase();
       const t = tokens.find(tk => {
         const tkLabel = String(tk.label || '').toLowerCase();
         const tkKey   = String(tk.key   || '').toLowerCase();
         // Busca EXATA no label, parcial no key
         return tkLabel === search || tkKey.includes(search);
       });
       return t ? t.value : '';
     };

     const wmi = findTk("WMI") || '';
     const motor = findTk("motor") || '';
     const posicaoMotor = findTk("posição do motor") || findTk("posicao do motor") || '';
     const emissoes = findTk("norma de emissões") || findTk("norma de emissoes") || '';
     const combustivel = api.combustivel || api.fuel || api.texto_combustivel || '';
     const cor = api.cor || api.color || '';
     const municipioUf = (api.municipio && api.uf) ? (api.municipio + " / " + api.uf) : (api.cidade || api.municipio || '');

     return { 
       vin:          String(item.vin   || '').toUpperCase(), 
       placa:        String(item.placa || '').toUpperCase(), 
       montadora:    tech.brand    || '', 
       modelo:       tech.model    || '', 
       submodelo:    tech.submodel || '', 
       ano:          String(ano), 
       carroceria:   carroceria, 
       encarrocadora: encarrocadora, 
       segmento:     tech.segment  || '', 
       fipe_codigo:   fipeCodigo, 
       fipe_modelo:   fipeModelo, 
       wmi:          wmi,
       motor:        motor,
       posicao_motor: posicaoMotor,
       emissoes:     emissoes,
       combustivel:  combustivel,
       cor:          cor,
       municipio_uf: municipioUf
     }; 
   }).filter(v => v.vin || v.placa); // ignora linhas completamente vazias 
  
   if (vehicles.length === 0) return; 
  
   try { 
     await fetch(AUTH_WORKER + '/fleet/vehicles', { 
       method: 'POST', 
       headers: { 
         'Content-Type': 'application/json', 
         'Authorization': 'Bearer ' + token, 
       }, 
       body: JSON.stringify({ fleet_name: fleetName, history_id: historyId, vehicles }), 
     }); 
   } catch (e) { 
     console.warn('[Fleet] Falha ao salvar frota no banco:', e); 
   } 
 } 
  
 // Busca veículos com filtros aplicados 
 async function buscarFrotaNoBanco(filtros = {}) { 
   const token = localStorage.getItem('dvb_token'); 
   if (!token) return null; 
  
   const params = new URLSearchParams(); 
   if (filtros.montadora)  params.set('montadora',  filtros.montadora); 
   if (filtros.modelo)     params.set('modelo',     filtros.modelo); 
   if (filtros.submodelo)  params.set('submodelo',  filtros.submodelo); 
   if (filtros.ano)        params.set('ano',        filtros.ano); 
   if (filtros.segmento)   params.set('segmento',   filtros.segmento); 
   if (filtros.placa)      params.set('placa',      filtros.placa); 
   if (filtros.fleet_name) params.set('fleet_name', filtros.fleet_name); 
   if (filtros.history_ids) params.set('history_ids', filtros.history_ids); 
   if (filtros.q)           params.set('q', filtros.q);
   params.set('limit',  String(filtros.limit  || 200)); 
   params.set('offset', String(filtros.offset || 0)); 
  
   const res  = await fetch(AUTH_WORKER + '/fleet/search?' + params.toString(), { 
     headers: { 'Authorization': 'Bearer ' + token }, 
   }); 
   return await res.json(); 
 } 
  
 // Busca opções disponíveis para popular os selects 
 async function buscarOpcoesFrota() { 
   const token = localStorage.getItem('dvb_token'); 
   if (!token) return null; 
   const res = await fetch(AUTH_WORKER + '/fleet/options', { 
     headers: { 'Authorization': 'Bearer ' + token }, 
   }); 
   return await res.json(); 
 } 

async function buscarPlacasCache(cursor = null, busca = '', prefix = 'ob:') {
  const token = localStorage.getItem('dvb_token');
  if (!token) return null;

  const params = new URLSearchParams();
  params.set('limit', '100');
  params.set('prefix', prefix);
  if (cursor) params.set('cursor', cursor);
  if (busca)  params.set('q', busca);

  try {
    const res = await fetch(AUTH_WORKER + '/admin/placas-cache?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    return await res.json();
  } catch (e) {
    console.error('[PlacasCache] Erro:', e);
    return { ok: false, mensagem: 'Erro de conexão' };
  }
}

function el(id) {
  return document.getElementById(id);
}

// Helper para converter ano em label Euro ou ano real
const getYearLabel = (anoFull) => {
  if (!anoFull) return "";
  const anoStr = String(anoFull);
  // Pega o primeiro ano se for formato 2012/2013
  const anoBase = parseInt(anoStr.split("/")[0], 10);
  if (isNaN(anoBase)) return anoStr;
  
  if (anoBase >= 2023) return "Euro 6";
  if (anoBase >= 2012) return "Euro 5";
  return anoStr; // Inferior a 2012 apresenta o ano real
};

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
  
  toast.style.cssText = [
    "position: fixed",
    "top: 50%",
    "left: 50%",
    "transform: translate(-50%, -50%)",
    "background: var(--bg-elev)",
    "border: 2px solid " + (type === "error" ? "var(--danger)" : "var(--accent)"),
    "padding: 24px 32px",
    "border-radius: 16px",
    "box-shadow: 0 20px 50px rgba(0,0,0,0.5), var(--shadow)",
    "z-index: 20000",
    "color: var(--text)",
    "text-align: center",
    "max-width: 400px",
    "width: 90%",
    "animation: toast-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    "font-weight: 500",
    "line-height: 1.5"
  ].join(";");

  const icon = type === "error" ? "⚠️" : "✅";
  toast.innerHTML = '<div style="font-size: 32px; margin-bottom: 12px;">' + icon + '</div>' +
    '<div style="font-size: 16px;">' + message + '</div>' +
    '<button style="margin-top: 20px; width: 100%;" onclick="this.parentElement.remove()">OK</button>';

  document.body.appendChild(toast);

  if (!document.getElementById("toast-styles")) {
    const style = document.createElement("style");
    style.id = "toast-styles";
    style.innerHTML = "@keyframes toast-in { from { opacity: 0; transform: translate(-50%, -40%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }";
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

function addGroupHistoryEntry(vins, plates, results = []) {
  const key = "decodevin.groupHistory";
  if (!vins && !plates) return;

  const fInput = el("fleetName");
  const fleetName = fInput ? fInput.value.trim() : "";

  // Extrai metadados para permitir filtros no histórico sem reprocessar tudo
  const brands = new Set();
  const models = new Set();
  const submodels = new Set();
  const years = new Set();
  const types = new Set();

  results.forEach(item => {
    const tech = getTechnicalData(item);
    if (tech.brand) brands.add(tech.brand);
    if (tech.model) models.add(tech.model);
    if (tech.submodel) submodels.add(tech.submodel);
    if (tech.year) years.add(tech.year);
    if (tech.type) types.add(tech.type);
  });

  const entry = { 
    vins, 
    plates, 
    fleetName, 
    ts: Date.now(),
    meta: {
      brands: Array.from(brands),
      models: Array.from(models),
      submodels: Array.from(submodels),
      years: Array.from(years),
      types: Array.from(types)
    }
  };
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

function parseHistoricoPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return {};
  }
}

  const normHistVin = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normHistPlate = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  function dedupeSingleHistoryList(list) {
    const map = new Map();
    for (const item of list) {
      const userKey =
        item.auditEmail ||
        (item.userId != null ? String(item.userId) : "") ||
        (item.fromServer ? "self" : "local");
      const q = normHistVin(item.input) + "|" + normHistPlate(item.plate);
      const k = userKey + "::" + q;
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
      const body = String(item.vins || "").trim() + "|" + String(item.plates || "").trim() + "|" + String(item.fleetName || "").trim();
      const k = userKey + "::" + body;
      const prev = map.get(k);
      if (!prev || item.ts >= prev.ts) map.set(k, item);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }

async function renderSingleHistory() {
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
}

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

function renderSingleHistoryItems(list, sessUser) {
  const h = el("singleHistoryList");
  if (!h) return;
  h.innerHTML = "";

  if (list.length === 0) {
    h.innerHTML = '<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item encontrado.</div>';
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
    row.className = "item clickable history-row";
    row.style.padding = "12px 15px";
    if (item.serverId) {
      row.setAttribute('data-id', item.serverId);
    }
    
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
      p.textContent = "[" + item.plate + "]";
      main.appendChild(p);
    }
    v.appendChild(main);

    if (item.auditBy) {
      const sub = document.createElement("div");
      sub.style.fontSize = "11px";
      sub.style.color = "var(--muted)";
      sub.textContent =
        "👤 " + item.auditBy + (item.auditEmail ? " · " + item.auditEmail : "");
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

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.alignItems = "center";
    actions.style.gap = "8px";

    const btnExportSingle = document.createElement("button");
    btnExportSingle.className = "btn-page";
    btnExportSingle.textContent = "📄";
    btnExportSingle.title = "Exportar relatório deste chassi";
    btnExportSingle.style.padding = "6px 10px";
    btnExportSingle.style.minWidth = "36px";
    btnExportSingle.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const oldTxt = btnExportSingle.textContent;
      btnExportSingle.disabled = true;
      btnExportSingle.textContent = "⏳";
      const progresso = criarModalProgressoLote("Gerando relatório...");
      const t0 = Date.now();
      try {
        const reportData = await montarRelatorioDoHistorico({
          vins: item.input || "",
          plates: item.plate || ""
        }, (done, total) => {
          progresso.update(done, total, Date.now() - t0);
        });
        if (!reportData || reportData.length === 0) {
          showToast("Não foi possível montar o relatório.", "error");
          return;
        }
        const fileName = (item.plate || item.input || "Relatorio").replace(/\s+/g, "_");
        openReportOptions(reportData, "Relatorio_" + fileName);
      } catch (err) {
        showToast("Erro ao preparar relatório.", "error");
      } finally {
        progresso.close();
        btnExportSingle.disabled = false;
        btnExportSingle.textContent = oldTxt;
      }
    };

    actions.appendChild(btnExportSingle);
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
    btnPrev.disabled = currentHistoryPage === 1;
    btnPrev.className = "btn-page";
    btnPrev.onclick = () => { currentHistoryPage--; renderSingleHistory(); };

    const pageInfo = document.createElement("span");
    pageInfo.textContent = "Página " + currentHistoryPage + " de " + totalPages;
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
}

  window.renderSingleHistory = renderSingleHistory;

async function renderGroupHistory() {
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
              auditOnly: !hasLines,
              meta: p.meta || null
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
          auditOnly: false,
          meta: g.meta || null
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

  const searchContainer = document.createElement("div");
  searchContainer.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;";

  const filterRow = document.createElement("div");
  filterRow.style.cssText = "display: flex; gap: 8px; flex-wrap: wrap;";

  const createHistorySelect = (id, defaultLabel) => {
    const s = document.createElement("select");
    s.id = id;
    s.style.cssText = "flex: 1; min-width: 120px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px; color: var(--text); font-size: 12px; outline: none; cursor: pointer;";
    s.innerHTML = '<option value="">' + defaultLabel + '</option>';
    return s;
  };

  const hFilterFleet = createHistorySelect("historyFilterFleet", "Frota (Todas)");
  const hFilterBrand = createHistorySelect("historyFilterBrand", "Montadora (Todas)");
  const hFilterModel = createHistorySelect("historyFilterModel", "Modelo (Todos)");
  const hFilterSubModel = createHistorySelect("historyFilterSubModel", "Submodelo (Todos)");
  const hFilterYear = createHistorySelect("historyFilterYear", "Ano (Todos)");

  filterRow.appendChild(hFilterFleet);
  filterRow.appendChild(hFilterBrand);
  filterRow.appendChild(hFilterModel);
  filterRow.appendChild(hFilterSubModel);
  filterRow.appendChild(hFilterYear);

  searchContainer.appendChild(filterRow);

  // ============================================================ 
 // BLOCO 3 — Botão "Pesquisar Frota" na seção do histórico 
 // Cole dentro da função renderGroupHistory(), 
 // logo APÓS a linha: searchContainer.appendChild(filterRow); 
 // (antes de: h.appendChild(searchContainer);) 
 // ============================================================ 
  
 // ----- INÍCIO DO TRECHO A INSERIR EM renderGroupHistory() ----- 
  
 const btnRowFrota = document.createElement('div'); 
 btnRowFrota.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;'; 
  
 const btnPesquisarFrota = document.createElement('button'); 
 btnPesquisarFrota.id        = 'btnPesquisarFrota'; 
 btnPesquisarFrota.className = 'btn-page'; 
 btnPesquisarFrota.style.cssText = [ 
   'display:flex', 
   'align-items:center', 
   'gap:6px', 
   'padding:9px 18px', 
   'background:linear-gradient(135deg, var(--accent-2), var(--accent))', 
   'color:#000', 
   'font-weight:700', 
   'border:none', 
   'border-radius:10px', 
   'cursor:pointer', 
   'font-size:13px', 
   'transition:opacity .2s', 
 ].join(';'); 
 btnPesquisarFrota.innerHTML = '🔍 Pesquisar Frota'; 
  
 btnPesquisarFrota.onmouseenter = () => btnPesquisarFrota.style.opacity = '.85'; 
 btnPesquisarFrota.onmouseleave = () => btnPesquisarFrota.style.opacity = '1'; 
  
 btnPesquisarFrota.onclick = () => { 
   const filtros = { 
     montadora:  (document.getElementById('historyFilterBrand')    || {}).value || '', 
     modelo:     (document.getElementById('historyFilterModel')    || {}).value || '', 
     submodelo:  (document.getElementById('historyFilterSubModel') || {}).value || '', 
     ano:        (document.getElementById('historyFilterYear')     || {}).value || '', 
     fleet_name: (document.getElementById('historyFilterFleet')    || {}).value || '', 
   }; 

   // Pega os IDs dos lotes que estão visíveis após o filtro do histórico
   const visibleHistoryItems = Array.from(document.querySelectorAll('#groupHistoryList .history-row'))
     .map(row => row.getAttribute('data-id'))
     .filter(Boolean);
   
   if (visibleHistoryItems.length > 0) {
     filtros.history_ids = visibleHistoryItems.join(',');
   }
  
   if (typeof window.abrirPesquisaFrota === 'function') { 
     window.abrirPesquisaFrota(filtros); 
   } 
 }; 

 const btnLimparFiltros = document.createElement('button');
 btnLimparFiltros.id        = 'btnLimparFiltrosHistorico';
 btnLimparFiltros.className = 'btn-page';
 btnLimparFiltros.style.cssText = [
   'display:flex',
   'align-items:center',
   'gap:6px',
   'padding:9px 18px',
   'background:var(--card)',
   'color:var(--text)',
   'font-weight:600',
   'border:1px solid var(--border)',
   'border-radius:10px',
   'cursor:pointer',
   'font-size:13px',
   'margin-right:10px',
   'transition:all .2s',
 ].join(';');
 btnLimparFiltros.innerHTML = '🧹 Limpar Filtros';

 btnLimparFiltros.onclick = () => {
   [hFilterFleet, hFilterBrand, hFilterModel, hFilterSubModel, hFilterYear].forEach(s => s.value = "");
   renderGroupHistory(); // Recarrega a lista sem filtros
 };
  
 btnRowFrota.appendChild(btnLimparFiltros);
 btnRowFrota.appendChild(btnPesquisarFrota); 
 searchContainer.appendChild(btnRowFrota);   // <- já existe a variável searchContainer em renderGroupHistory 
  
 // ----- FIM DO TRECHO A INSERIR EM renderGroupHistory() ----- 

  h.appendChild(searchContainer);

  // Popular filtros do histórico
  const hFleets = new Set();
  const hBrands = new Set();
  const hModels = new Set();
  const hSubModels = new Set();
  const hYears = new Set();

  const getOrExtractMeta = (item) => {
    if (item.meta && (item.meta.brands?.length > 0 || item.meta.models?.length > 0)) return item.meta;
    const brands = new Set();
    const models = new Set();
    const submodels = new Set();
    const years = new Set();
    const vins = String(item.vins || "").split(/[\n,]/).filter(Boolean).slice(0, 5);
    vins.forEach(v => {
      const vin = v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (vin.length >= 3 && window.currentDecoder) {
        try {
          const res = window.currentDecoder.decode(vin);
          const mockItem = { result: res, fabricante: res.manufacturerName };
          const tech = getTechnicalData(mockItem);
          if (tech.brand) brands.add(tech.brand);
          if (tech.model) models.add(tech.model);
          if (tech.submodel) submodels.add(tech.submodel);
          if (tech.year) years.add(tech.year);
        } catch (e) {}
      }
    });
    const extracted = { brands: Array.from(brands), models: Array.from(models), submodels: Array.from(submodels), years: Array.from(years) };
    item.meta = extracted; 
    return extracted;
  };

  list.forEach(item => {
    if (item.fleetName) hFleets.add(item.fleetName);
    const meta = getOrExtractMeta(item);
    (meta.brands || []).forEach(b => hBrands.add(normalizeBrand(b)));
    (meta.models || []).forEach(m => { if (m) hModels.add(String(m).trim().toUpperCase()); });
    (meta.submodels || []).forEach(s => { if (s) hSubModels.add(String(s).trim().toUpperCase()); });
    (meta.years || []).forEach(y => hYears.add(y));
  });

  const updateHistorySelect = (sel, values, currentVal = "") => {
    if (!sel) return;
    const defaultLabel = (sel.id === "historyFilterYear" ? "Ano (Todos)" : (sel.id === "historyFilterModel" ? "Modelo (Todos)" : (sel.id === "historyFilterSubModel" ? "Submodelo (Todos)" : (sel.id === "historyFilterFleet" ? "Frota (Todas)" : "Montadora (Todas)"))));
    sel.innerHTML = '<option value="">' + defaultLabel + '</option>';
    const isYearField = (sel.id && sel.id.includes("Year"));
    const labels = new Set();
    if (values) {
      Array.from(values).forEach(v => {
        if (!v) return;
        const lbl = isYearField ? getYearLabel(v) : String(v).trim().toUpperCase();
        if (lbl) labels.add(lbl);
      });
    }
    const sortedValues = Array.from(labels).sort((a, b) => {
      if (isYearField) {
        const numA = parseInt(a, 10); const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return String(b).localeCompare(String(a));
      }
      return String(a).localeCompare(String(b));
    });
    sortedValues.forEach(v => {
      const opt = document.createElement("option"); opt.value = v; opt.textContent = v; sel.appendChild(opt);
    });
    if (currentVal && Array.from(labels).some(l => l === currentVal.toUpperCase())) sel.value = currentVal.toUpperCase();
  };

  const applyHistoryFilters = (rebuildSelects = false) => {
    const fFleet = hFilterFleet.value;
    const fBrand = hFilterBrand.value;
    const fModel = hFilterModel.value;
    const fSubModel = hFilterSubModel.value;
    const fYear = hFilterYear.value;

    const filtered = list.filter(item => {
      const matchFleet = !fFleet || (item.fleetName || "").toUpperCase().includes(fFleet.toUpperCase());

      if (!matchFleet) return false;

      const meta = getOrExtractMeta(item);
      if (fBrand && !(meta.brands || []).some(b => normalizeBrand(b) === fBrand)) return false;
      // Ajuste para busca exata do modelo, evitando STRALIS aparecer quando busca por R
      if (fModel && !(meta.models || []).some(m => String(m).trim().toUpperCase() === fModel.toUpperCase())) return false;
      if (fSubModel && !(meta.submodels || []).some(s => String(s).trim().toUpperCase().includes(fSubModel.toUpperCase()))) return false;
      if (fYear && !(meta.years || []).some(y => getYearLabel(y) === fYear)) return false;

      return true;
    });

    if (rebuildSelects) {
      const newModels = new Set();
      const newSubs = new Set();
      const newYears = new Set();

      filtered.forEach(item => {
        const meta = item.meta || {};
        (meta.models || []).forEach(m => { if (m) newModels.add(m); });
        (meta.submodels || []).forEach(s => { if (s) newSubs.add(s); });
        (meta.years || []).forEach(y => { if (y) newYears.add(y); });
      });

      updateHistorySelect(hFilterModel, newModels, fModel);
      updateHistorySelect(hFilterSubModel, newSubs, fSubModel);
      updateHistorySelect(hFilterYear, newYears, fYear);
    }

    renderGroupHistoryItems(filtered, sessUser);
  };

  updateHistorySelect(hFilterFleet, hFleets);
  updateHistorySelect(hFilterBrand, hBrands);
  updateHistorySelect(hFilterModel, hModels);
  updateHistorySelect(hFilterSubModel, hSubModels);
  updateHistorySelect(hFilterYear, hYears);

  hFilterFleet.onchange = () => {
    hFilterBrand.value = ""; hFilterModel.value = ""; hFilterSubModel.value = ""; hFilterYear.value = "";
    applyHistoryFilters(true);
  };
  hFilterBrand.onchange = () => {
    hFilterModel.value = ""; hFilterSubModel.value = ""; hFilterYear.value = "";
    applyHistoryFilters(true);
  };
  hFilterModel.onchange = () => {
    hFilterSubModel.value = ""; hFilterYear.value = "";
    applyHistoryFilters(true);
  };
  hFilterSubModel.onchange = () => applyHistoryFilters(true);
  hFilterYear.onchange = () => applyHistoryFilters(true);

  const listContainer = document.createElement("div");
  listContainer.id = "groupHistoryList";
  h.appendChild(listContainer);

  renderGroupHistoryItems(list, sessUser);
}

  // Gera os dados do relatório de um lote salvo no histórico sem reprocessar a tela.
async function montarRelatorioDoHistorico(historyItem, onProgress = null) {
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
}

function formatarTempo(ms) {
  const totalSeg = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return min > 0 ? (min + "m " + seg + "s") : (seg + "s");
}

function criarModalProgressoLote(titulo = "Preparando relatório...") {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:20000;display:flex;align-items:center;justify-content:center;";

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
        bar.style.width = pct + "%";
        const mediaPorItem = done > 0 ? elapsedMs / done : 0;
        const restanteMs = mediaPorItem * Math.max(0, total - done);
        status.textContent = done + "/" + total + " itens • " + pct + "% • Tempo: " + formatarTempo(elapsedMs) + " • Restante aprox.: " + formatarTempo(restanteMs);
      },
      close: () => overlay.remove()
    };
  }

function renderGroupHistoryItems(list, sessUser) {
  const h = el("groupHistoryList");
  if (!h) return;
  h.innerHTML = "";

  if (list.length === 0) {
    h.innerHTML = '<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item encontrado.</div>';
    return;
  }

  const totalPages = Math.ceil(list.length / HISTORY_PAGE_SIZE);
  if (currentGroupHistoryPage > totalPages) currentGroupHistoryPage = totalPages;
  if (currentGroupHistoryPage < 1) currentGroupHistoryPage = 1;

  const start = (currentGroupHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const end = start + HISTORY_PAGE_SIZE;
  const pageList = list.slice(start, end);

  pageList.forEach((item, idx) => {
    const indexInFullList = start + idx;
    const row = document.createElement("div");
    row.className = "item clickable history-row";
    row.style.padding = "12px 15px";
    if (item.serverId) {
      row.setAttribute('data-id', item.serverId);
    }
    
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
    title.textContent = item.fleetName ? ("📦 " + item.fleetName) : ("📦 Lote #" + (list.length - indexInFullList));
    
    const details = document.createElement("div");
    details.style.fontSize = "13px";
    details.style.color = "var(--text)";
    details.textContent = item.auditOnly
      ? (dataHora + " · registro global")
      : (totalCount + " itens • " + dataHora);

    const auditLine = document.createElement("div");
    auditLine.style.fontSize = "11px";
    auditLine.style.color = "var(--muted)";
    if (item.auditBy) {
      auditLine.textContent = "👤 " + item.auditBy + (item.auditEmail ? " · " + item.auditEmail : "");
    }

    const preview = document.createElement("div");
    preview.style.fontSize = "11px";
    preview.style.color = "var(--muted)";
    preview.style.fontStyle = "italic";
    const vList = (item.vins || "").split("\n").filter(Boolean);
    const pList = (item.plates || "").split("\n").filter(Boolean);
    const previewText = [];
    for (let i = 0; i < Math.min(2, totalCount); i++) {
      previewText.push((vList[i] || "") + (pList[i] ? " [" + pList[i] + "]" : ""));
    }
    preview.textContent = previewText.join(", ") + (totalCount > 2 ? "..." : "");

    v.appendChild(title);
    v.appendChild(details);
    if (item.auditBy) v.appendChild(auditLine);
    if (previewText.length > 0) v.appendChild(preview);
    
    row.onclick = () => {
      console.log("[History] Clique no item do histórico:", item.fleetName || item.ts);
      if (item.auditOnly) {
        if (typeof showToast === "function") {
          showToast("Sem lista de chassis no servidor — só o registro da pesquisa.", "error");
        }
        return;
      }

      // 1. Alterna para a tela de decodificação de grupo
      if (typeof window.showScreen === "function" && window.groupDecoder) {
        window.showScreen(window.groupDecoder);
      } else {
        const gd = el("groupDecoder");
        if (gd && typeof window.showScreen === "function") {
          window.showScreen(gd);
        } else {
          console.warn("[History] showScreen ou groupDecoder não encontrados!");
        }
      }

      const gInput = el("groupInput");
      const gPlateInput = el("groupPlateInput");
      const bGroup = el("btnGroupDecode");
      const fleetEl = el("fleetName");
      const combinedEl = el("combinedMode");

      if (!gInput || !gPlateInput || !bGroup || !fleetEl) {
        console.error("[History] Elementos do grupo não encontrados no DOM!", { gInput, gPlateInput, bGroup, fleetEl });
        return;
      }

      const fleetNameValue = item.fleetName || ("Lote_" + new Date(item.ts).getTime());

      // 2. Popula os campos
      const vListItems = (item.vins || "").split("\n").filter(Boolean);
      const pListItems = (item.plates || "").split("\n").filter(Boolean);
      const isCombined = vListItems.length > 0 && pListItems.length > 0 && vListItems.length === pListItems.length;

      console.log("[History] Preparando lote:", { fleetName: fleetNameValue, vins: vListItems.length, plates: pListItems.length, isCombined });

      if (combinedEl) {
        combinedEl.checked = isCombined;
      }

      fleetEl.value = fleetNameValue;
      gInput.value = item.vins || "";
      gPlateInput.value = item.plates || "";
      
      // 3. Dispara eventos de input para normalização e validação
      [fleetEl, gInput, gPlateInput].forEach(element => {
        if (element) element.dispatchEvent(new Event("input"));
      });
      if (combinedEl) {
        combinedEl.dispatchEvent(new Event("change"));
      }

      // 4. Força a validação e o clique
      setTimeout(() => {
        if (typeof window.validateGroupForm === "function") {
          console.log("[History] Chamando validateGroupForm global...");
          window.validateGroupForm();
        } else {
          console.warn("[History] window.validateGroupForm não está definida!");
        }
        
        // Garante que o botão esteja habilitado para o clique programático
        console.log("[History] Habilitando bGroup e disparando clique...");
        bGroup.disabled = false; 
        
        // Limpa resultados anteriores
        const gResults = el("groupResults");
        if (gResults) gResults.innerHTML = "";
        
        bGroup.click();
      }, 600); 
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
        const loteNome = (item.fleetName || ("Lote_" + new Date(item.ts).getTime())).replace(/\s+/g, "_");
        openReportOptions(reportData, "Relatorio_" + loteNome);
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

    actions.appendChild(btnExportLot);
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
    pageInfo.textContent = "Página " + currentGroupHistoryPage + " de " + totalPages;
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
}

  window.renderGroupHistory = renderGroupHistory;

function exportCSV(data, name, includeFipe = true) {
  const uniqueData = [];
  const seen = new Set();

  (data || []).forEach((item) => {
    const api = item?.apiResult || {};
    const placa = String(item?.placa || api?.placa || "").trim().toUpperCase();
    const chassi = String(item?.vin || api?.chassi_completo || api?.chassi || "").trim().toUpperCase();
    const key = placa + "|" + chassi;
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
      const valid = potentialList.filter(f => f && (f.codigo_fipe || f.fipe_codigo || f.fipe_modelo || f.texto_modelo || f.modelo || f.CODIGO_FIPE || f.FIPE_CODIGO || f.MODELO || f.MODELO_FIPE || f.FIPE_MODELO));
      bestFipe = valid.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    }

    const fipeCodFinal = bestFipe ? (bestFipe.codigo_fipe || bestFipe.fipe_codigo || bestFipe.CODIGO_FIPE || bestFipe.FIPE_CODIGO || "—") : (api.fipe_codigo || "—");
    
    // Busca o modelo mais completo possível
    let fipeModFinal = "—";
    if (bestFipe) {
      fipeModFinal = [bestFipe.fipe_modelo, bestFipe.texto_modelo, bestFipe.modelo, bestFipe.MODELO, bestFipe.NOME, bestFipe.MODELO_FIPE]
        .filter(s => s && String(s).trim() !== "" && String(s).trim() !== "—")
        .sort((a, b) => String(b).length - String(a).length)[0] || "—";
    }
    if (fipeModFinal === "—") {
      fipeModFinal = [api.fipe_modelo, api.texto_modelo, api.modelo, item.fipe_modelo]
        .filter(s => s && String(s).trim() !== "" && String(s).trim() !== "—")
        .sort((a, b) => String(b).length - String(a).length)[0] || "—";
    }

    // Garantia para quando exportamos da pesquisa de frota ou histórico
    const finalFipeMod = (fipeModFinal === "—" || fipeModFinal === api.modelo || fipeModFinal === item.modelo) 
      ? (api.fipe_modelo || item.fipe_modelo || fipeModFinal) 
      : fipeModFinal;

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
        finalFipeMod,
        api.combustivel || "—",
        api.cor || "—",
        (api.municipio && api.uf) ? (api.municipio + " / " + api.uf) : (api.cidade || "—")
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
        (api.municipio && api.uf) ? (api.municipio + " / " + api.uf) : (api.cidade || "—")
      ];
    }

    csv += row.map(val => {
      let s = String(val).trim().replace(/[\r\n\t]+/g, " ");
      return (s === "" || s === "—" || s === "undefined") ? "—" : s.replace(/;/g, ",");
    }).join(";") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name + "_" + new Date().getTime() + ".csv";
  link.click();
}

let exportDataBuffer = null;
let exportNameBuffer = "";

function openReportOptions(data, name) {
  exportDataBuffer = data;
  exportNameBuffer = name;
  const reportModal = el("reportModal");
  if (reportModal) reportModal.style.display = "flex";
}

let currentGroupPage = 1;
const GROUP_PAGE_SIZE = 10;

const getKnownModels = (brand) => {
  return [];
};

const normalizeBrand = (b) => {
  if (!b) return "";
  const brand = String(b).trim().toUpperCase();
  if (brand.includes("SCANIA")) return "SCANIA";
  if (brand.includes("VOLVO")) return "VOLVO";
  if (brand.includes("IVECO")) return "IVECO";
  if (brand.includes("MERCEDES") || brand.includes("M.BENZ") || brand.includes("MBENZ")) return "MERCEDES-BENZ";
  if (brand.includes("VOLKSWAGEN") || brand.includes("VWCO") || brand.includes("VW") || brand.includes("MAN LATIN AMERICA") || brand === "MAN") return "VOLKSWAGEN";
  if (brand.includes("AGRALE")) return "AGRALE";
  if (brand.includes("DAF")) return "DAF";
  if (brand.includes("MARCOPOLO")) return "MARCOPOLO";
  if (brand.includes("VOLARE")) return "VOLARE";
  if (brand.includes("NEOBUS")) return "NEOBUS";
  if (brand.includes("CAIO")) return "CAIO";
  if (brand.includes("COMIL")) return "COMIL";
  if (brand.includes("MASCARELLO")) return "MASCARELLO";
  if (brand.includes("IRIZAR")) return "IRIZAR";
  if (brand.includes("FORD")) return "FORD";
  if (brand.includes("CHEVROLET") || brand === "GM") return "CHEVROLET";
  return brand; // Retorna sempre em caixa alta para evitar duplicidade por case
};

const getTechnicalData = (item) => { 
   let brand = normalizeBrand(item.fabricante); 
   let modFull = ""; 
   let yearFull = ""; 
   let type = ""; 
   let segment = ""; 
   let model = ""; 
   let submodel = ""; 
 
   const findValueByTerm = (term) => { 
     if (!item.result || !item.result.tokens) return null; 
     const target = term.toLowerCase(); 
     const t = item.result.tokens.find(tk => { 
       const key = String(tk.key || "").toLowerCase(); 
       const label = String(tk.label || "").toLowerCase(); 
       return key.includes(target) || label.includes(target); 
     }); 
     return t ? t.value : null; 
   }; 
 
   if (item.apiResult) { 
     const api = item.apiResult; 
 
     // ✅ FIX: usa os campos separados da API diretamente, sem split manual 
     const mBasico = api.modelo || api.model || api.texto_modelo || ""; 
     const vBasico  = api.versao || api.version || ""; 
     
     // model = campo "modelo" da API inteiro (ex: "APACHE U") 
     // submodel = campo "versao" da API inteiro (ex: "400") 
     model    = mBasico ? String(mBasico).trim().toUpperCase() : ""; 
     submodel = vBasico ? String(vBasico).trim().toUpperCase() : ""; 
 
     // modFull é a junção para exibição 
     modFull = (model && submodel && !model.includes(submodel)) 
       ? (model + " " + submodel) 
       : (model || submodel || ""); 
 
     const anoFab = api.ano || api.ano_fabricacao || api.year || api.anoFabricacao; 
     const anoMod = api.ano_modelo || api.model_year || api.anoModelo; 
     yearFull = (anoFab && anoMod && api.ano !== api.ano_modelo) 
       ? (anoFab + "/" + anoMod) 
       : (anoFab || anoMod || ""); 
     if (!brand) brand = normalizeBrand(api.marca || api.fabricante || api.brand); 
 
     const rawSegment = String(api.segmento || api.tipo_veiculo || api.tipo || api.category || "").trim(); 
     const apiType = rawSegment.toUpperCase(); 
     if (apiType.includes("ONIBUS") || apiType.includes("ÔNIBUS") || apiType.includes("BUS")) { 
       type = "BUS"; segment = "Ônibus"; 
     } else if (apiType.includes("CAMINHAO") || apiType.includes("CAMINHÃO") || apiType.includes("TRUCK")) { 
       type = "TRUCK"; segment = "Caminhão"; 
     } else if (apiType.includes("LEVE")) { 
       type = "CAR"; segment = "Leves"; 
     } else if (apiType.includes("AGRICOLA") || apiType.includes("AGRÍCOLA")) { 
       type = "AGRI"; segment = "Agrícola"; 
     } else if (apiType.includes("FLORESTAL")) { 
       type = "FOREST"; segment = "Florestal"; 
     } else { 
       segment = rawSegment; 
     } 
 
   } else if (item.result && item.result.type !== "UNKNOWN") { 
     modFull = findValueByTerm("modelo") || findValueByTerm("chassi/motor") || findValueByTerm("descrição") || ""; 
     yearFull = item.result.year || findValueByTerm("ano") || ""; 
     if (!brand) brand = normalizeBrand(item.result.manufacturerName || findValueByTerm("fabricante") || findValueByTerm("marca")); 
 
     const resType = String(item.result.type || "").toUpperCase(); 
     if (resType.includes("BUS")) { type = "BUS"; if (!segment) segment = "Ônibus"; } 
     else if (resType.includes("TRUCK")) { type = "TRUCK"; if (!segment) segment = "Caminhão"; } 
 
     // ✅ Para o decodificador (sem API), faz o split como fallback 
     if (modFull) { 
       let sMod = String(modFull).trim(); 
       if (brand === "SCANIA") sMod = sMod.replace(/^SCANIA\s+/i, ""); 
       
       if (sMod.includes("-")) { 
         const parts = sMod.split("-"); 
         model = parts[0].trim().toUpperCase(); 
         submodel = parts.slice(1).join("-").trim().toUpperCase(); 
       } else if (sMod.includes(" ")) { 
         const parts = sMod.split(" "); 
         model = parts[0].trim().toUpperCase(); 
         submodel = parts.slice(1).join(" ").trim().toUpperCase(); 
       } else { 
         const match = sMod.match(/^([A-Za-z]+)([0-9].*)$/); 
         if (match) { model = match[1].trim().toUpperCase(); submodel = match[2].trim().toUpperCase(); } 
         else model = sMod.trim().toUpperCase(); 
       } 
 
       if (brand === "SCANIA" && /^[PRGSLK]\d+/.test(model)) { 
         const m = model.match(/^([PRGSLK])(\d+.*)$/); 
         if (m) { submodel = m[2] + (submodel ? " " + submodel : ""); model = m[1]; } 
       } 
     } 
 
   } else if (item.ob && item.ob.ob_chassi && item.ob.ob_chassi !== "—") { 
     modFull = item.ob.ob_chassi; 
     if (!brand) brand = normalizeBrand(item.ob.ob_fabricante_chassi); 
     type = "BUS"; segment = "Ônibus"; 
     // Split para dados do OB (sem API) 
     if (modFull) { 
       const parts = modFull.trim().split(/[\s-]/); 
       model = parts[0] ? parts[0].toUpperCase() : ""; 
       submodel = parts.slice(1).join(" ").toUpperCase(); 
     } 
   } 
 
   if (!type) { 
     const searchString = (modFull + " " + brand).toUpperCase(); 
     if (searchString.includes("BUS") || searchString.includes("ÔNIBUS") || searchString.includes("MICRO") || searchString.includes("VOLARE") || searchString.includes("MARCOPOLO") || searchString.includes("NEOBUS") || searchString.includes("CAIO") || searchString.includes("COMIL") || searchString.includes("MASCARELLO")) { 
       type = "BUS"; segment = "Ônibus"; 
     } else if (searchString.includes("STRADALE") || searchString.includes("STRALIS") || searchString.includes("TRUCK") || searchString.includes("CAMINHAO") || searchString.includes("CAMINHÃO") || searchString.includes("TRACTOR") || searchString.includes("SCANIA") || searchString.includes("IVECO") || searchString.includes("DAF")) { 
       type = "TRUCK"; segment = "Caminhão"; 
     } 
   } 
 
   const isOnlyYear = /^(\d{4})(\/\d{4})?$/.test(String(modFull).trim()); 
   if (isOnlyYear) { 
     if (!yearFull) yearFull = modFull; 
     modFull = ""; 
     model = ""; submodel = ""; 
   } 
 
   if (brand === "SCANIA" && model && submodel) modFull = model + " " + submodel; 
 
   return { 
     brand: brand || "", 
     model,       // ✅ agora = "APACHE U" (campo modelo da API inteiro) 
     submodel,    // ✅ agora = "400" (campo versao da API inteiro) 
     fullModel: modFull, 
     year: yearFull ? String(yearFull) : "", 
     type: type || "UNKNOWN", 
     segment: segment || "Outros" 
   }; 
 };

function populateGroupFilters(results) {
    const segments = new Set();
    const brands = new Set();

    results.forEach(item => {
      const tech = getTechnicalData(item);
      if (tech.segment && tech.segment !== "Outros") segments.add(tech.segment);
      if (tech.brand && tech.brand !== "Desconhecido") brands.add(tech.brand);
    });

    // Salva os resultados para uso na cascata
    window._lastGroupResults = results;

    const updateSelect = (id, values, defaultLabel) => {
      const s = el(id);
      if (!s) return;
      const currentVal = s.value;
      s.innerHTML = '<option value="">' + defaultLabel + '</option>';
      
      const isYearField = id.includes("Year");
      const labels = new Set();
      
      Array.from(values).forEach(v => {
        if (!v) return;
        const lbl = isYearField ? getYearLabel(v) : String(v).trim();
        if (lbl) labels.add(lbl);
      });

      const sortedValues = Array.from(labels).sort((a, b) => {
        if (isYearField) {
          if (a.startsWith("Euro") && b.startsWith("Euro")) return b.localeCompare(a);
          if (a.startsWith("Euro")) return -1;
          if (b.startsWith("Euro")) return 1;
          const numA = parseInt(a, 10);
          const numB = parseInt(b, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        }
        return String(a).localeCompare(String(b));
      });

      sortedValues.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        s.appendChild(opt);
      });
      if (sortedValues.includes(currentVal)) s.value = currentVal;
    };

    // Popula segmento e montadora (sem cascata ainda)
    updateSelect("filterSegment", segments, "Segmento (Todos)");
    updateSelect("filterBrand", brands, "Montadora (Todas)");

    // Função que atualiza modelo/submodelo/ano baseado na montadora selecionada
    const updateDependentFilters = () => {
      const fBrand = el("filterBrand")?.value || "";
      const fModel = el("filterModel")?.value || "";
      const results = window._lastGroupResults || [];

      const filteredByBrand = fBrand 
        ? results.filter(item => getTechnicalData(item).brand === fBrand) 
        : results;

      const models = new Set();
      const submodels = new Set();
      const years = new Set();

      filteredByBrand.forEach(item => {
        const tech = getTechnicalData(item);
        if (tech.model) models.add(tech.model);
        if (tech.submodel) submodels.add(tech.submodel);
        if (tech.year) years.add(tech.year);
      });

      // FIX 4: enriquece modelos com dicionário fixo para a montadora selecionada
      if (fBrand) getKnownModels(fBrand).forEach(m => models.add(m));

      // Se já tem modelo selecionado, filtra submodelos por ele também
      if (fModel) {
        submodels.clear();
        years.clear();
        filteredByBrand
          .filter(item => {
            const tech = getTechnicalData(item);
            return tech.model === fModel || tech.fullModel === fModel;
          })
          .forEach(item => {
            const tech = getTechnicalData(item);
            if (tech.submodel) submodels.add(tech.submodel);
            if (tech.year) years.add(tech.year);
          });
      }

      updateSelect("filterModel", models, "Modelo (Todos)");
      updateSelect("filterSubModel", submodels, "Submodelo (Todos)");
      updateSelect("filterYear", years, "Ano / Euro (Todos)");

      // Garante que valores obsoletos sejam limpos
      const mSel = el("filterModel");
      const sSel = el("filterSubModel");
      const ySel = el("filterYear");
      
      // Se o valor atual não existe mais nas opções, reseta
      if (mSel && !Array.from(mSel.options).some(o => o.value === fModel)) mSel.value = "";
      if (sSel && sSel.value && !Array.from(sSel.options).some(o => o.value === sSel.value)) sSel.value = "";
      if (ySel && ySel.value && !Array.from(ySel.options).some(o => o.value === ySel.value)) ySel.value = "";
    };

    // Inicializa os filtros dependentes
    updateDependentFilters();

    // Listener de cascata na montadora
    const brandSel = el("filterBrand");
    if (brandSel) {
      // Remove listener antigo para não duplicar
      const newBrandSel = brandSel.cloneNode(true);
      brandSel.parentNode.replaceChild(newBrandSel, brandSel);
      newBrandSel.addEventListener("change", () => {
        // Reseta modelo e submodelo ao trocar montadora
        const modelSel = el("filterModel");
        const subSel = el("filterSubModel");
        if (modelSel) modelSel.value = "";
        if (subSel) subSel.value = "";
        updateDependentFilters();
        applyGroupFilters();
      });
    }

    // Listener de cascata no modelo
    const modelSel = el("filterModel");
    if (modelSel) {
      const newModelSel = modelSel.cloneNode(true);
      modelSel.parentNode.replaceChild(newModelSel, modelSel);
      newModelSel.addEventListener("change", () => {
        const subSel = el("filterSubModel");
        if (subSel) subSel.value = "";
        updateDependentFilters();
        applyGroupFilters();
      });
    }

    // Listener no submodelo e ano (sem cascata, apenas filtra)
    ["filterSubModel", "filterYear"].forEach(id => {
      const s = el(id);
      if (s) {
        const newS = s.cloneNode(true);
        s.parentNode.replaceChild(newS, s);
        newS.addEventListener("change", applyGroupFilters);
      }
    });

    // Segmento também sem cascata
    const segSel = el("filterSegment");
    if (segSel) {
      const newSegSel = segSel.cloneNode(true);
      segSel.parentNode.replaceChild(newSegSel, segSel);
      newSegSel.addEventListener("change", applyGroupFilters);
    }
  }

  function applyGroupFilters() {
    if (!window.currentGroupResults) return;
    
    const fSegment = el("filterSegment")?.value || "";
    const fPlate = el("filterPlate")?.value.toLowerCase().trim() || "";
    const fBrand = el("filterBrand")?.value || "";
    const fModel = el("filterModel")?.value || "";
    const fSubModel = el("filterSubModel")?.value || "";
    const fYear  = el("filterYear")?.value || "";

    const filtered = window.currentGroupResults.filter(item => {
      const plateVal = (item.placa || "").toLowerCase();
      const tech = getTechnicalData(item);
      const yearLabel = tech.year ? getYearLabel(tech.year) : "";

      // Normaliza para comparação case-insensitive
      const norm = (s) => String(s || "").trim().toUpperCase();

      const matchSegment = !fSegment || tech.segment === fSegment;
      const matchPlate   = !fPlate   || plateVal.includes(fPlate);
      const matchBrand   = !fBrand   || norm(tech.brand) === norm(fBrand);
      
      // FIX 3: modelo compara a parte base (model), não fullModel completo
      const matchModel = !fModel || (() => {
        const fModelNorm = norm(fModel);
        const techModel = norm(tech.model);
        const techFull = norm(tech.fullModel);
        return techModel === fModelNorm || techFull === fModelNorm || techFull.startsWith(fModelNorm + " ") || techFull.startsWith(fModelNorm + "-");
      })();
      
      // FIX 1: submodelo compara APENAS o submodel (não confunde com model)
      const matchSub = !fSubModel || (() => {
        const fSubNorm = norm(fSubModel);
        const techSub = norm(tech.submodel);
        const techFull = norm(tech.fullModel);
        return techSub === fSubNorm || techSub.includes(fSubNorm) || techFull.includes(fSubNorm);
      })();
      
      const matchYear = !fYear || yearLabel === fYear;

      return matchSegment && matchPlate && matchBrand && matchModel && matchSub && matchYear;
    });

    currentGroupPage = 1;
    renderGroupResults(filtered);
  }

function renderGroupResults(filteredList = null) {
  const gResults = el("groupResults");
  if (!gResults || !window.currentGroupResults) return;
  
  gResults.innerHTML = "";

  if (!filteredList) {
    populateGroupFilters(window.currentGroupResults);
  }

  // FIX 2: deduplica por vin+placa antes de renderizar
  const rawList = filteredList || window.currentGroupResults;
  const seenKeys = new Set();
  const displayList = rawList.filter(itemData => {
    const vin = String(itemData.vin || "").trim().toUpperCase();
    const plate = String(itemData.placa || "").trim().toUpperCase();
    const key = vin + "|" + plate;
    if (key === "|") return true;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key); return true;
  });
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

    // Monta o layout do item usando DOM em vez de innerHTML para evitar erros de sintaxe
    const codeDiv = document.createElement("div");
    codeDiv.className = "code";

    if (vin && plate) {
      const isMismatch = itemData.status === 'error' && String(itemData.error_detail || "").includes("não pertence");
      const labelColor = isMismatch ? '#e74c3c' : 'var(--accent)';
      const labelText = isMismatch ? 'DIVERGÊNCIA ENCONTRADA' : 'VERIFICANDO PAR';

      const labelSpan = document.createElement("span");
      labelSpan.style.cssText = "color:" + labelColor + ";font-size:10px;display:block";
      labelSpan.textContent = labelText;
      codeDiv.appendChild(labelSpan);

      const vinContainer = document.createElement("span");
      vinContainer.className = "vin-container";
      vinContainer.textContent = vin + " ";
      const btnCopyVin = document.createElement("button");
      btnCopyVin.className = "group-copy-btn btn-copy-vin";
      btnCopyVin.title = "Copiar Chassi";
      btnCopyVin.textContent = "📋";
      vinContainer.appendChild(btnCopyVin);
      codeDiv.appendChild(vinContainer);

      const sep = document.createTextNode(" / ");
      codeDiv.appendChild(sep);

      const plateContainer = document.createElement("span");
      plateContainer.className = "plate-container";
      plateContainer.textContent = plate + " ";
      const btnCopyPlate = document.createElement("button");
      btnCopyPlate.className = "group-copy-btn btn-copy-plate";
      btnCopyPlate.title = "Copiar Placa";
      btnCopyPlate.textContent = "📋";
      plateContainer.appendChild(btnCopyPlate);
      codeDiv.appendChild(plateContainer);

    } else if (vin) {
      const labelSpan = document.createElement("span");
      labelSpan.style.cssText = "color:#e74c3c;font-size:10px;display:block";
      labelSpan.textContent = "SEM PLACA";
      codeDiv.appendChild(labelSpan);

      const vinContainer = document.createElement("span");
      vinContainer.className = "vin-container";
      vinContainer.textContent = vin + " ";
      const btnCopyVin = document.createElement("button");
      btnCopyVin.className = "group-copy-btn btn-copy-vin";
      btnCopyVin.title = "Copiar Chassi";
      btnCopyVin.textContent = "📋";
      vinContainer.appendChild(btnCopyVin);
      codeDiv.appendChild(vinContainer);

    } else {
      const labelSpan = document.createElement("span");
      labelSpan.style.cssText = "color:#e74c3c;font-size:10px;display:block";
      labelSpan.textContent = "SEM CHASSI";
      codeDiv.appendChild(labelSpan);

      const plateContainer = document.createElement("span");
      plateContainer.className = "plate-container";
      plateContainer.textContent = plate + " ";
      const btnCopyPlate = document.createElement("button");
      btnCopyPlate.className = "group-copy-btn btn-copy-plate";
      btnCopyPlate.title = "Copiar Placa";
      btnCopyPlate.textContent = "📋";
      plateContainer.appendChild(btnCopyPlate);
      codeDiv.appendChild(plateContainer);
    }

    item.appendChild(codeDiv);

    // Monta a linha de informações
    let statusHtml = "";
    if (itemData.status === 'ok') {
      statusHtml = '<span style="color:#2ecc71">✔ Confirmado</span>';
    } else if (itemData.status === 'error') {
      if (String(itemData.error_detail).includes("402")) {
        statusHtml = '<span style="color:#e74c3c">🔴 API SEM SALDO</span>';
      } else {
        statusHtml = '<span style="color:#e74c3c">⚠ Divergência</span>';
      }
    } else if (itemData.status === 'pending') {
      statusHtml = '<span style="color:var(--muted)">Aguardando...</span>';
    } else {
      statusHtml = '<span style="color:#f1c40f">Item Órfão</span>';
    }

    const tech = getTechnicalData(itemData);
    
    const modStr = tech.fullModel || "";
    const modelInfo = modStr ? (' • <span class="model-val">' + modStr + '</span>') : "";

    const yearFull = tech.year || "";
    let yearInfo = "";
    if (yearFull) {
      const euroLabel = getYearLabel(yearFull);
      yearInfo = ' • <span class="model-val" style="color:var(--accent-2)">' + euroLabel + '</span>';
    }

    const fleetInfo = (itemData.fleetName || "").trim();
    const fleetHtml = fleetInfo ? (' • <span class="model-val" style="color:var(--muted)">📦 ' + fleetInfo + '</span>') : "";
    
    const segmentInfo = tech.segment ? ('<span class="model-val" style="color:var(--accent); font-weight:700;">' + tech.segment.toUpperCase() + '</span> • ') : "";
    const displayBrand = tech.brand || "—";

    // Lê encarroçadora e carroceria do ob ou ob_data 
    const obRef = itemData.ob_data || itemData.ob || {}; 
    const enc = obRef.encarrocadeira || obRef.ob_encarrocadeira || obRef.encarrocadora || obRef.ob_encarrocadora || ""; 
    const carr = obRef.carroceria || obRef.ob_carroceria || ""; 
    
    const encInfo = enc && enc !== "—" 
      ? ' • <span class="model-val" style="color:var(--accent-2)">🚌 ' + enc + '</span>' 
      : ""; 
    const carrInfo = carr && carr !== "—" 
      ? ' • <span class="model-val" style="color:var(--muted)">' + carr + '</span>' 
      : ""; 

    const infoDiv = document.createElement("div");
    infoDiv.className = "info";
    infoDiv.innerHTML = '<span>' + segmentInfo + displayBrand + modelInfo + yearInfo + encInfo + carrInfo + fleetHtml + '</span>' +
      '<span class="status-msg">' + statusHtml + '</span>';
    item.appendChild(infoDiv);
    
    // Adiciona eventos para os botões de copiar
    const btnCopyVinEl = item.querySelector('.btn-copy-vin');
    if (btnCopyVinEl) {
      btnCopyVinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(vin);
        showToast("Chassi copiado!");
      });
    }

    const btnCopyPlateEl = item.querySelector('.btn-copy-plate');
    if (btnCopyPlateEl) {
      btnCopyPlateEl.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(plate);
        showToast("Placa copiada!");
      });
    }

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
    pageInfo.textContent = "Página " + currentGroupPage + " de " + totalPages;
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

  const fleetName = (itemData?.fleetName || "").trim();
  mTitle.textContent = linkedPlate
    ? ("Análise Completa: " + linkedPlate + (fleetName ? " (" + fleetName + ")" : ""))
    : (isPlate ? ("Dados OB: " + code + (fleetName ? " (" + fleetName + ")" : "")) : ("Detalhes: " + code + (fleetName ? " (" + fleetName + ")" : "")));
  mSegs.innerHTML = "";
  mCards.innerHTML = "";
  mCards.removeAttribute("style");
  modal.style.display = "flex";

  if (itemData && itemData.status === 'error') {
    const isNoBalance = String(itemData.error_detail || "").includes("402");
    
    if (isNoBalance) {
      mSegs.innerHTML = '<div class="seg" style="background:#e74c3c;color:white">🔴 API SEM SALDO</div>';
    } else {
      mSegs.innerHTML = '<div class="seg" style="background:#e74c3c;color:white">⚠ DIVERGÊNCIA DETECTADA</div>';
    }

    const errorCard = document.createElement("div");
    errorCard.className = "error";
    errorCard.style.cssText = "background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 20px; border-radius: 8px; margin: 20px; font-weight: 600; text-align: center; grid-column: 1/-1;";
    
    if (isNoBalance) {
       errorCard.innerHTML = 'As consultas de validação de placa estão suspensas por falta de créditos na WDAPI.<br><small style="font-weight:normal">Por favor, recarregue seu saldo para continuar.</small>';
    } else if (String(itemData.error_detail || "").includes("não pertence")) {
      let api = itemData.apiResult || {};
      let marcaPlaca = normalizeBrand(
        api.marca ||
        api.fabricante ||
        api.brand ||
        api.texto_marca ||
        api.MARCA ||
        api.FABRICANTE ||
        api.marcaNome ||
        api?.extra?.marca ||
        ""
      );
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
      if ((!marcaPlaca || !modeloPlaca) && linkedPlate) {
        try {
          const apiSomentePlaca = await consultarPlacaPHP(linkedPlate, "");
          if (apiSomentePlaca && apiSomentePlaca.status === "ok") {
            api = { ...api, ...apiSomentePlaca };
            marcaPlaca = marcaPlaca || apiSomentePlaca.marca || apiSomentePlaca.fabricante || apiSomentePlaca.brand || apiSomentePlaca.texto_marca || "";
            modeloPlaca = modeloPlaca || apiSomentePlaca.modelo || apiSomentePlaca.texto_modelo || apiSomentePlaca.model || "";
          }
        } catch (_) {}
      }

      if (!marcaPlaca) marcaPlaca = "Desconhecida";
      if (!modeloPlaca) modeloPlaca = "Não informado";
      const marcaChassi = result?.manufacturerName || itemData.fabricante || "Não identificado";
      const resumo = '<div style="margin-top:10px; text-align:left; display:inline-block; max-width:760px; font-weight:500; color:#fecaca;">' +
        '<div><strong>Resumo da divergência:</strong></div>' +
        '<div>• Chassi informado: <strong>' + code + '</strong> (' + marcaChassi + ')</div>' +
        '<div>• Veículo retornado pela placa ' + linkedPlate + ': <strong>' + marcaPlaca + ' ' + modeloPlaca + '</strong></div>' +
        '<div>• Motivo: os dados de chassi e placa apontam para veículos diferentes.</div>' +
        '</div>';
      errorCard.innerHTML = 'Este chassi (' + code + ') não pertence à placa (' + linkedPlate + ').<br>' +
        '<small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos foram bloqueados.</small>' + resumo;
     } else {
       errorCard.innerHTML = 'Não foi possível localizar os dígitos do chassi para a placa ' + linkedPlate + ' em fontes públicas.<br>' +
         '<small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos não serão exibidos.</small>';
     }
    
    mCards.appendChild(errorCard);
    return;
  }

  const renderKePlacaFallback = (container, kpData, titulo) => {
    titulo = titulo || "📋 Dados do Veículo (KePlaca)";
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
      ? (mBasico + " " + vBasico) : (mBasico || "—");
    const anoFab = kp.ano || "";
    const anoMod = kp.ano_modelo || "";
    const anoFull = (anoFab && anoMod && anoFab !== anoMod)
      ? (anoFab + "/" + anoMod) : (anoFab || anoMod || "—");
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

    const tech = getTechnicalData({ apiResult: kp });
    kpCards.appendChild(card("Segmento",        tech.segment || "—",     "KePlaca"));
    kpCards.appendChild(card("Montadora",       normalizeBrand(kp.marca) || "—", "KePlaca"));
    kpCards.appendChild(card("Modelo",          modeloFull,              "KePlaca"));
    kpCards.appendChild(card("Ano Fab./Modelo", anoFull,                 "KePlaca"));
    kpCards.appendChild(card("Código FIPE",     temFipe ? kp.fipe_codigo : "—", "KePlaca"));
    kpCards.appendChild(card("Modelo FIPE",     temFipe ? kp.fipe_modelo : "—", "KePlaca"));
    kpCards.appendChild(card("Combustível",     kp.combustivel || "—",   "KePlaca"));
    kpCards.appendChild(card("Cor",             kp.cor         || "—",   "KePlaca"));
    const cidade = (kp.municipio && kp.uf) ? (kp.municipio + " / " + kp.uf) : "—";
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

  const injectOB = (p, container, kpFallback) => {
    kpFallback = kpFallback || null;
    const obWrapper = document.createElement("div");
    obWrapper.style.marginTop = "16px";
    obWrapper.style.borderTop = "1px solid var(--border)";
    obWrapper.style.paddingTop = "20px";
    container.appendChild(obWrapper);

    const statusDiv = document.createElement("div");
    statusDiv.style.textAlign = "center";
    statusDiv.style.marginBottom = "16px";
    statusDiv.style.fontSize = "14px";
    statusDiv.textContent = "Buscando " + p + "...";
    obWrapper.appendChild(statusDiv);

    const obCards = document.createElement("div");
    obCards.className = "cards";
    obWrapper.appendChild(obCards);
    centerGrid(obCards);
    showSkeletons(obCards, 4);
    
    const tech = getTechnicalData({ apiResult: kpFallback });
    const segmentVal = tech.segment || "Ônibus";
    
    const segmentCard = card("Segmento", segmentVal);
    segmentCard.style.borderLeft = "4px solid var(--accent-2)";
    obCards.appendChild(segmentCard);

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

    let obFieldCount = 0;
    let cleared = false;
    let fipeAdded = false;
    let apiExtrasAdded = false;

    const checkClear = () => {
      if (!cleared) {
        obCards.innerHTML = "";
        const techInner = getTechnicalData({ apiResult: kpFallback });
        const segmentValInner = techInner.segment || "Ônibus";
        obCards.appendChild(card("Segmento", segmentValInner));
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
      const anoCompleto = (anoFab && anoMod && anoFab !== anoMod) ? (anoFab + "/" + anoMod) : (anoFab || anoMod || null);

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
            checkClear(); obFieldCount++;
            obCards.appendChild(card("Encarroçadora", v)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_encarrocadeira = v; 
            }
          }
        }};
        if (id === "ob_carroceria") return { set textContent(v) {
          if (v && v !== "—") { 
            checkClear(); obFieldCount++;
            obCards.appendChild(card("Carroceria", v)); 
            if (itemData) {
               if (!itemData.ob) itemData.ob = {};
               itemData.ob.ob_carroceria = v; 
            }
          }
        }};
        if (id === "ob_fabricante_chassi") return { set textContent(v) {
          const fab = (v && v !== "—") ? normalizeBrand(v) : null;
          if (fab) { 
            checkClear(); obFieldCount++;
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
    const hasExistingData = d && (d.success === true || (d.ob_encarrocadeira && d.ob_encarrocadeira !== "—") || (d.ob_carroceria && d.ob_carroceria !== "—"));

    if (hasExistingData) {
      statusDiv.textContent = "✅ Dados carregados!";
      statusDiv.style.color = "var(--accent)";
      
      const obDataObj = itemData.ob_data || {};
      const obObj = itemData.ob || {};

      const enc = obDataObj.encarrocadeira || obDataObj.encarrocadora || obObj.ob_encarrocadeira || obObj.encarrocadeira || obObj.encarrocadora;
      const carr = obDataObj.carroceria || obObj.ob_carroceria || obObj.carroceria;
      const fab = normalizeBrand(obDataObj.fabricante_chassi || obDataObj.fabricante || obObj.ob_fabricante_chassi || obObj.ob_fabricante || kpFallback?.marca);
      const mod = obDataObj.modelo_chassi || obDataObj.chassi || obObj.ob_chassi || kpFallback?.modelo;

      if (enc && enc !== "—") { checkClear(); obFieldCount++; obCards.appendChild(card("Encarroçadora", enc)); }
      if (carr && carr !== "—") { checkClear(); obFieldCount++; obCards.appendChild(card("Carroceria", carr)); }
      if (fab && fab !== "—") { checkClear(); obFieldCount++; obCards.appendChild(card("Fabricante Chassi", fab)); }
      if (mod && mod !== "—") { checkClear(); obFieldCount++; obCards.appendChild(card("Modelo Chassi", mod)); }
      addApiExtras();
      addFipe();

      const foto = obDataObj.foto_url || obDataObj.foto;
      if (foto) {
        const i=document.createElement("img"); i.src=foto; i.loading="lazy"; i.decoding="async"; i.style.width="100%"; i.style.maxWidth="600px"; i.style.borderRadius="12px"; i.style.boxShadow="var(--shadow)"; i.style.border="1px solid var(--border)"; mediaBox.prepend(i);
      }
      
      const linkOB = obDataObj.fonte || ("https://onibusbrasil.com/placa/" + p);
      const a=document.createElement("a"); a.href=linkOB; a.target="_blank"; a.textContent="🔗 Ficha Completa no Ônibus Brasil"; a.style.cssText="display:inline-block;padding:12px 24px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px solid var(--accent-2);color:var(--accent-2);font-size:14px;font-weight:600;"; mediaBox.appendChild(a);
      
      return;
    }

    window.buscarDadosOnibusBrasil(p, true, mockUI);
  };

  if (linkedPlate) {
    mSegs.innerHTML = '<div class="seg" style="background:var(--accent);color:black">' + linkedPlate + '</div>';
    
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

      const mfr        = normalizeBrand(api.marca || api.fabricante || api.brand || api.texto_marca || "—");
      const chassiReal = api.chassi_completo || api.chassi   || api.vin  || "—";
      const techData   = getTechnicalData({ apiResult: api, fabricante: mfr });
      
      const modeloDisplay = techData.fullModel || "—";
      const anoDisplay    = techData.year || "—";
      const segmentReal    = techData.segment || "Veículos Leves";
      const combustivel    = api.combustivel  || api.fuel        || api.texto_combustivel || "—";
      const cor            = api.cor          || api.color       || "—";
      const cidade         = (api.municipio && api.uf)
        ? (api.municipio + " / " + api.uf) : (api.cidade || api.municipio || "—");
      const situacao       = api.situacao     || "—";
 
       genCards.appendChild(card("Segmento",        segmentReal));
       genCards.appendChild(card("Montadora",       mfr));
       genCards.appendChild(card("Modelo",          modeloDisplay));
       genCards.appendChild(card("Chassi",          chassiReal));
       genCards.appendChild(card("Código FIPE",     temFipe ? fipeCod : "Não encontrado na API"));
       genCards.appendChild(card("Modelo FIPE",     temFipe ? fipeMod : "Não encontrado na API"));
       genCards.appendChild(card("Ano Fab./Modelo", anoDisplay));
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
          .forEach(c => { c.style.opacity = "0.5"; });
      }
    }

  } else if (isPlate) {
    mSegs.innerHTML = '<div class="seg">' + code + '</div>';
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
    window.groupDecoder = groupDecoder;
    const historyScreen = el("historyScreen");
    window.historyScreen = historyScreen;
    const placasCacheScreen = el("placasCacheScreen");
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
      [selectionScreen, singleDecoder, groupDecoder, historyScreen, placasCacheScreen].forEach(s => {
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
    window.showScreen = showScreen;

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
    el("backFromHistory").onclick = () => {
      showScreen(groupDecoder);
    };
    el("backFromPlacasCache").onclick = () => {
      showScreen(selectionScreen);
    };
    el("btnGoToGroupHistory").onclick = () => {
      if (typeof window.showScreen === "function" && window.historyScreen) {
        window.showScreen(window.historyScreen);
      }
      renderGroupHistory();
    };

    const reportModal = el("reportModal");
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

    window.abrirHistorico = () => {
      if (typeof window.showScreen === "function" && window.historyScreen) {
        window.showScreen(window.historyScreen);
      }
      renderGroupHistory();
    };

    // ── Tela Placas Cache (admin aplicação) ────────────────────── 
    const placasCacheCursors = [null]; // índice 0 = primeira página 
    let   placasCachePage   = 0; 
    
    // Botão de acesso — só aparece para admin + setor aplicação 
    const sessUser = JSON.parse(localStorage.getItem('dvb_user') || 'null'); 
    
    // Removida lógica do card central btnAbrirPlacasCache conforme solicitado.
    // O acesso permanece apenas pelo ícone 🗄️ na barra superior (auth.js).
    
    async function carregarPlacasCache(cursor) { 
      const busca  = (el('placasCacheBusca')?.value  || '').trim(); 
      const prefix = (el('placasCachePrefix')?.value || 'ob:'); 
      const cont   = el('placasCacheResults'); 
      const pag    = el('placasCachePagination'); 
    
      if (cont) cont.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ Carregando...</div>'; 
    
      const data = await buscarPlacasCache(cursor, busca, prefix); 
    
      if (!data || !data.ok) { 
        if (cont) cont.innerHTML = '<div style="color:#e74c3c;text-align:center;padding:40px">' + 
          (data?.mensagem || 'Erro ao carregar dados') + '</div>'; 
        return; 
      } 
    
      // Atualiza total 
      const totalEl = el('placasCacheTotal'); 
      if (totalEl) totalEl.textContent = data.entries.length + ' registros nesta página'; 
    
      // Renderiza tabela 
      if (!data.entries.length) { 
        if (cont) cont.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">Nenhum registro encontrado.</div>'; 
        if (pag) pag.style.display = 'none'; 
        return; 
      } 
    
      // Detecta colunas dinamicamente a partir dos dados reais 
      const allKeys = new Set(); 
      data.entries.forEach(row => Object.keys(row).forEach(k => allKeys.add(k))); 
      
      // Prioriza campos importantes na visualização
      const CAMPOS_PRIORITARIOS = ['key', 'query', 'empresa', 'encarrocadora', 'carroceria', 
        'fabricante', 'chassi', 'modelo_completo', 'ano', 'foto_url', 'fonte']; 
      const outrosCampos = Array.from(allKeys) 
        .filter(k => !CAMPOS_PRIORITARIOS.includes(k)) 
        .sort(); 
      const COLUNAS = [...CAMPOS_PRIORITARIOS.filter(k => allKeys.has(k) || k === 'key'), ...outrosCampos]; 
      
      const wrapper = document.createElement('div'); 
      wrapper.style.overflowX = 'auto'; 
    
      const table = document.createElement('table'); 
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;'; 
    
      // Cabeçalho dinâmico 
      const thead = document.createElement('thead'); 
      const trH   = document.createElement('tr'); 
      trH.style.cssText = 'background:var(--bg);border-bottom:2px solid var(--border);'; 
      COLUNAS.forEach(col => { 
        const th = document.createElement('th'); 
        th.style.cssText = 'padding:8px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap;'; 
        th.textContent = col; 
        trH.appendChild(th); 
      }); 
      thead.appendChild(trH); 
      table.appendChild(thead); 
    
      // Corpo dinâmico 
      const tbody = document.createElement('tbody'); 
      data.entries.forEach(row => { 
        const tr = document.createElement('tr'); 
        tr.style.cssText = 'border-bottom:1px solid var(--border);transition:background .15s;cursor:default;'; 
        tr.onmouseenter = () => tr.style.background = 'var(--bg)'; 
        tr.onmouseleave = () => tr.style.background = ''; 
    
        COLUNAS.forEach(col => { 
          const td = document.createElement('td'); 
          td.style.cssText = 'padding:8px 10px;color:var(--text);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;'; 
          const val = row[col]; 
          const display = (val === null || val === undefined) ? '—' : String(val); 
          td.textContent = display; 
          td.title = display; 
          
          // Links especiais 
          if (col === 'foto_url' && val) { 
            td.innerHTML = ''; 
            const a = document.createElement('a'); 
            a.href = val; a.target = '_blank'; 
            a.textContent = '🖼️ Ver foto'; 
            a.style.color = 'var(--accent-2)'; 
            td.appendChild(a); 
          } 
          if (col === 'fonte' && val) { 
            td.innerHTML = ''; 
            const a = document.createElement('a'); 
            a.href = val; a.target = '_blank'; 
            a.textContent = '🔗 OB'; 
            a.style.color = 'var(--accent-2)'; 
            td.appendChild(a); 
          } 
          tr.appendChild(td); 
        }); 
        tbody.appendChild(tr); 
      }); 
      table.appendChild(tbody); 
      wrapper.appendChild(table); 
      if (cont) { cont.innerHTML = ''; cont.appendChild(wrapper); } 
    
      // Paginação via cursor 
      const proxCursor = data.cursor; 
      const isComplete = data.list_complete; 
    
      if (pag) { 
        pag.style.display = 'flex'; 
        const btnAnterior = el('btnPlacasCacheAnterior'); 
        const btnProximo  = el('btnPlacasCacheProximo'); 
        const pagInfo     = el('placasCachePagInfo'); 
    
        if (btnAnterior) btnAnterior.disabled = placasCachePage === 0; 
        if (btnProximo)  btnProximo.disabled  = isComplete || !proxCursor; 
        if (pagInfo)     pagInfo.textContent  = 'Página ' + (placasCachePage + 1); 
    
        if (btnAnterior) { 
          btnAnterior.onclick = () => { 
            if (placasCachePage > 0) { 
              placasCachePage--; 
              carregarPlacasCache(placasCacheCursors[placasCachePage] || null); 
            } 
          }; 
        } 
        if (btnProximo && proxCursor) { 
          btnProximo.onclick = () => { 
            placasCachePage++; 
            if (!placasCacheCursors[placasCachePage]) { 
              placasCacheCursors[placasCachePage] = proxCursor; 
            } 
            carregarPlacasCache(proxCursor); 
          }; 
        } 
      } 
    } 
    
    // Busca ao clicar ou pressionar Enter 
    el('btnPlacasCacheBuscar')?.addEventListener('click', () => { 
      placasCachePage = 0; 
      placasCacheCursors.length = 1; 
      placasCacheCursors[0] = null; 
      carregarPlacasCache(null); 
    }); 
    el('placasCacheBusca')?.addEventListener('keydown', e => { 
      if (e.key === 'Enter') el('btnPlacasCacheBuscar')?.click(); 
    }); 
    el('placasCachePrefix')?.addEventListener('change', () => { 
      el('btnPlacasCacheBuscar')?.click(); 
    }); 

    window.abrirPlacasCache = () => {
      showScreen(placasCacheScreen);
      carregarPlacasCache(null);
    };

    // Atualiza o título dinâmico da frota enquanto o usuário digita
    const fleetInput = el("fleetName");
    const dynamicTitleDiv = el("dynamicFleetTitle");
    if (fleetInput && dynamicTitleDiv) {
      fleetInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const h2 = dynamicTitleDiv.querySelector('h2');
        if (val) {
          h2.textContent = val;
          dynamicTitleDiv.style.display = "block";
        } else {
          dynamicTitleDiv.style.display = "none";
        }
      });
    }

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

      // Limpa o título dinâmico da frota ao limpar a UI
      const dynamicTitleDiv = el("dynamicFleetTitle");
      if (dynamicTitleDiv) dynamicTitleDiv.style.display = "none";
      
      const genericCards = ["card_gen_segmento", "card_gen_montadora", "card_gen_modelo", "card_gen_chassi", "card_gen_ano", "card_gen_combustivel", "card_gen_cor", "card_gen_cidade", "card_fipe_codigo", "card_fipe_modelo"];
      genericCards.forEach(id => {
        const e = el(id);
        if (e) e.style.opacity = "1";
      });
      
      const excelInput = el("excelFileInput");
      if (excelInput) excelInput.value = "";

      ["filterSegment", "filterBrand", "filterModel", "filterSubModel", "filterYear"].forEach(id => {
        const s = el(id);
        if (s) s.value = "";
      });
      const fPlate = el("filterPlate");
      if (fPlate) fPlate.value = "";

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

    ["filterSegment", "filterBrand", "filterModel", "filterSubModel", "filterYear"].forEach(id => {
      const s = el(id);
      if (s) s.addEventListener('change', applyGroupFilters);
    });
    el("filterPlate")?.addEventListener('input', applyGroupFilters);

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
        el("errors").innerHTML = '<div class="error">Chassi não reconhecido. Certifique-se de que o código está correto.</div>';
        return;
      }

      const rt = el("resultTitle"); if (rt) rt.style.display = "block";
      const segs = el("segments"); if (segs) { segs.innerHTML = ""; segs.style.display = "none"; }
      
      const tech = getTechnicalData({ result: result, fabricante: result.manufacturerName });
      if (tech.segment && !result.tokens.some(t => t.label === "Segmento")) {
        result.tokens.unshift({ key: "segment", label: "Segmento", value: tech.segment });
      }

      renderResult(result, text);
      
      if (!window.currentSingleResult) {
        window.currentSingleResult = {
          tipo: result.type,
          vin: text,
          placa: plate,
          fabricante: normalizeBrand(result.manufacturerName) || "Desconhecido",
          result: result,
          ob: {}
        };
      } else {
        window.currentSingleResult.tipo = result.type;
        window.currentSingleResult.vin = text;
        window.currentSingleResult.result = result;
        if (!window.currentSingleResult.fabricante || window.currentSingleResult.fabricante === "Desconhecido") {
          window.currentSingleResult.fabricante = normalizeBrand(result.manufacturerName) || "Desconhecido";
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
        el("errors").innerHTML = '<div class="error">A placa deve ter 6 ou 7 caracteres.</div>';
        return;
      }

      isValidating = true;
      const btnPlate = el("btnPlateSingle");
      const btnDecode = el("btnDecodeSingle");
      const oldBtnPlateText = btnPlate ? btnPlate.textContent : "";
      if (btnPlate) { btnPlate.disabled = true; btnPlate.textContent = "⏳ Verificando..."; }
      if (btnDecode) btnDecode.disabled = true;

      const copyChassiBtn = el("copy_chassi_btn");
      const copyPlateBtn = el("copy_plate_btn");
      const copyPlateBtnOb = el("copy_plate_btn_ob");
      const copyFipeBtn = el("copy_fipe_btn");
      if (copyChassiBtn) copyChassiBtn.style.display = "none";
      if (copyPlateBtn) copyPlateBtn.style.display = "none";
      if (copyPlateBtnOb) copyPlateBtnOb.style.display = "none";
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
      if (verifEl) verifEl.innerHTML = '<span style="color:var(--muted); font-weight:normal">Verificando placa...</span>';

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
            ? (apiAnoFab + "/" + apiAnoMod)
            : (apiAnoFab || apiAnoMod || "—");

          if (isBus) {
            if (verifEl) verifEl.innerHTML = '<span style="color:#2ecc71">' + (apiResult.mensagem || "✔ Veículo identificado (Ônibus)") + '</span>';
            if (obSec) obSec.style.display = "block";

            if (el("ob_placa")) el("ob_placa").textContent = p;
            if (copyPlateBtnOb) {
              copyPlateBtnOb.style.display = "block";
              copyPlateBtnOb.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(p);
                showToast("Placa copiada!");
              };
            }

            if (obData && obData.success === true && 
                (obData.encarrocadeira || obData.carroceria || obData.fabricante_chassi || obData.modelo_chassi)) {

              el("ob_status").textContent = "✅ Dados encontrados! (cache)";
              el("ob_status").style.color = "var(--accent)";

              const obContainer = el("ob_container");
              if (obContainer) {
                const cardsParaLimpar = obContainer.querySelectorAll(".card.card-plate:not(#card_ob_placa)");
                cardsParaLimpar.forEach(c => c.remove());
              }

              const techData = getTechnicalData({ apiResult: apiResult, fabricante: apiResult.marca });
              const segmentVal = techData.segment || "Ônibus";

              const camposOB = [
                { label: "Segmento",          valor: segmentVal, id: "ob_segmento" },
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
                  newCard.innerHTML = '<div class="label">' + label + '</div><div class="value" id="' + id + '">' + valor + '</div>';
                  obContainer.insertBefore(newCard, el("ob_media_container"));
                }
              });

              if (obData.foto_url && el("ob_foto")) {
                el("ob_foto").src = obData.foto_url;
                el("ob_foto").style.display = "block";
              }
              const fonteEl = el("ob_fonte");
              if (fonteEl) {
                fonteEl.href = "https://onibusbrasil.com/placa/" + p;
                fonteEl.style.display = "inline-block";
              }

            } else {

              el("ob_status").textContent = "Buscando...";
              toggleValueSkeletons(el("ob_container"), true);
              if (window.buscarDadosOnibusBrasil) {
                const obLive = await window.buscarDadosOnibusBrasil(p);

                const obContainer = el("ob_container");
                if (obContainer) {
                  const cardsParaLimpar = obContainer.querySelectorAll(".card.card-plate:not(#card_ob_placa)");
                  cardsParaLimpar.forEach(c => c.remove());
                  
                  const techDataLive = getTechnicalData({ apiResult: apiResult, fabricante: apiResult.marca });
                  const segmentValLive = techDataLive.segment || "Ônibus";

                  const camposLive = [
                    { label: "Segmento",          valor: segmentValLive, id: "ob_segmento" },
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
                      newCard.innerHTML = '<div class="label">' + label + '</div><div class="value" id="' + id + '">' + valor + '</div>';
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
            if (verifEl) verifEl.innerHTML = '<span style="color:var(--accent-2)">✔ Veículo identificado</span>';
            if (genSec) genSec.style.display = "block";

            if (el("card_fipe_codigo")) {
              el("card_fipe_codigo").style.display = "block";
              if (el("gen_fipe_codigo")) el("gen_fipe_codigo").textContent = "—";
            }
            if (el("card_fipe_modelo")) {
              el("card_fipe_modelo").style.display = "block";
              if (el("gen_fipe_modelo")) el("gen_fipe_modelo").textContent = "—";
            }

            const techData = getTechnicalData({ apiResult: apiResult, fabricante: apiResult.marca });
            const mfr = techData.brand || "—";
            const modeloCompleto = techData.fullModel || "—";
            const anoCompleto = techData.year || "—";
            const segmentReal = techData.segment || "Outros";

            const chassiReal = apiResult.chassi_completo || apiResult.chassi || apiResult.final_chassi || apiResult.vin || apiResult.CHASSI || apiResult.vin_completo || "—";
            const combustivelReal = apiResult.combustivel || apiResult.fuel || apiResult.texto_combustivel || apiResult.COMBUSTIVEL || apiResult.tipo_combustivel || "—";
            const corReal = apiResult.cor || apiResult.color || apiResult.COR || apiResult.cor_veiculo || "—";
            const cidadeReal = (apiResult.municipio && apiResult.uf) ? (apiResult.municipio + " / " + apiResult.uf) : (apiResult.cidade || apiResult.municipio || apiResult.MUNICIPIO || apiResult.CIDADE || apiResult.nome_cidade || "—");

            const setValWithStyle = (id, cardId, value) => {
              const elVal = el(id);
              const elCard = el(cardId);
              const exists = value && value !== "—" && value !== "undefined";
              if (elVal) elVal.textContent = exists ? value : "Não encontrado na API";
              if (elCard) elCard.style.opacity = exists ? "1" : "0.5";
            };

            setValWithStyle("gen_segmento", "card_gen_segmento", segmentReal);
            setValWithStyle("gen_montadora", "card_gen_montadora", mfr);
            setValWithStyle("gen_modelo", "card_gen_modelo", modeloCompleto);
            setValWithStyle("gen_placa", "card_gen_placa", p);
            setValWithStyle("gen_chassi", "card_gen_chassi", chassiReal);
            setValWithStyle("gen_ano", "card_gen_ano", anoCompleto);
            setValWithStyle("gen_combustivel", "card_gen_combustivel", combustivelReal);
            setValWithStyle("gen_cor", "card_gen_cor", corReal);
            setValWithStyle("gen_cidade", "card_gen_cidade", cidadeReal);

            if (copyPlateBtn) {
              if (p && (p.length === 7 || p.length === 6)) {
                copyPlateBtn.style.display = "block";
                copyPlateBtn.onclick = (e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(p);
                  showToast("Placa copiada para a área de transferência!");
                };
              } else {
                copyPlateBtn.style.display = "none";
              }
            }

            if (copyChassiBtn) {
              if (chassiReal && chassiReal.length === 17) {
                copyChassiBtn.style.display = "block";
                copyChassiBtn.onclick = (e) => {
                  e.stopPropagation();
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
                errorArea.innerHTML = '<div class="error" style="background: rgba(56, 189, 248, 0.1); border: 1px solid var(--accent-2); color: var(--accent-2); padding: 15px; border-radius: 8px; margin-top: 10px; text-align: center;">ℹ️ Algumas informações técnicas não foram retornadas pela API para este veículo.</div>';
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
            errorMsg = "Este chassi (" + chassiDigitado + ") não pertence à placa (" + p + ").";

            // Busca dados da placa sem chassi para explicar o motivo da divergência.
            let apiPlaca = apiResult;
            try {
              const placaOnly = await consultarPlacaPHP(p, "");
              if (placaOnly && placaOnly.status === "ok") apiPlaca = placaOnly;
            } catch (_) {}

            const marcaPlaca = normalizeBrand(
              apiPlaca.marca ||
              apiPlaca.fabricante ||
              apiPlaca.brand ||
              apiPlaca.texto_marca ||
              apiPlaca.MARCA ||
              apiPlaca.FABRICANTE ||
              "Desconhecida"
            );
            const modeloPlaca =
              apiPlaca.modelo ||
              apiPlaca.texto_modelo ||
              apiPlaca.model ||
              apiPlaca.MODELO ||
              apiPlaca.versao ||
              "Não informado";
            const marcaChassi = normalizeBrand(window.currentSingleResult?.result?.manufacturerName || "Não identificado");

            resumoDivergencia = '<div style="margin-top: 10px; text-align: left; display: inline-block; max-width: 760px; font-weight: 500; color: #fecaca;">' +
              '<div><strong>Resumo da divergência:</strong></div>' +
              '<div>• Chassi informado: <strong>' + (chassiDigitado || "—") + '</strong> (' + marcaChassi + ')</div>' +
              '<div>• Veículo da placa ' + p + ': <strong>' + marcaPlaca + ' ' + modeloPlaca + '</strong></div>' +
              '<div>• Motivo: chassi e placa pertencem a veículos diferentes.</div>' +
              '</div>';
          } else {
            errorMsg = "Não foi possível localizar os dígitos do chassi para a placa " + p + " em fontes públicas.";
          }

          if (verifEl) verifEl.innerHTML = '<span style="color:#e74c3c">' + errorMsg + '</span>';
          
          if (obSec) obSec.style.display = "none";
          showReports("single", false);

          el("errors").innerHTML = '<div class="error" style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 20px; border-radius: 8px; margin-top: 15px; font-weight: 600; text-align: center; width: 100%;">' +
            errorMsg +
            '<br><small style="font-weight: normal; opacity: 0.8; margin-top: 5px; display: block;">' + subMsg + '</small>' +
            resumoDivergencia +
            '</div>';
        }
      } catch (e) {
        console.error("Erro no fluxo de validação:", e);
        if (verifEl) verifEl.innerHTML = '<span style="color:#e74c3c">Erro de conexão</span>';
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
      clearUI(false);
    });

    if (vinInputSingle) {
      vinInputSingle.addEventListener('input', () => {
        const val = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
        vinInputSingle.value = val;
        
        const counter = el("vinCounter");
        if (counter) {
          counter.textContent = val.length + "/17";
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
          counter.textContent = val.length + "/7";
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
      clearUI(false);
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

    el("filterPlate")?.addEventListener('input', applyGroupFilters);

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

      ["filterBrand", "filterModel", "filterSubModel", "filterYear"].forEach(id => {
        const s = el(id);
        if (s) s.value = "";
      });
      const fPlateEl = el("filterPlate");
      if (fPlateEl) fPlateEl.value = "";

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
          populateGroupFilters(window.currentGroupResults);
          renderGroupResults();

          // Salva no histórico somente após concluir, para ter todos os metadados
          addGroupHistoryEntry(gInput.value, gPlateInput.value, window.currentGroupResults);

          const fleetNameParaBanco = (el('fleetName')?.value || '').trim(); 
          // Tenta pegar o history_id que foi salvo ao chamar addGroupHistoryEntry 
          // (como addGroupHistoryEntry é async via dvbHistoricoUsuarioPost, usamos um pequeno delay) 
          setTimeout(async () => { 
            let hId = null; 
            // Tenta recuperar o id do último registro do servidor 
            try { 
              const token = localStorage.getItem('dvb_token'); 
              if (token && typeof window.dvbHistoricoUsuarioGet === 'function') { 
                const hist = await window.dvbHistoricoUsuarioGet(); 
                if (hist && hist.ok && Array.isArray(hist.group) && hist.group.length > 0) { 
                  hId = hist.group[0].id || null; 
                } 
              } 
            } catch (_) {} 
           
            await salvarFrotaNoBanco(fleetNameParaBanco, hId, window.currentGroupResults || []); 
          }, 1500); // aguarda o histórico ser salvo primeiro

          if (window.dvbRegistrarPesquisa) {
            const fn = el("fleetName");
            const fleetName = fn ? fn.value.trim() : "";
            window.dvbRegistrarPesquisa({
              tipo: "grupo",
              detalhe: "Lote: " + totalItems + " veículo(s)",
              fleetName: fleetName || undefined
            });
          }
          return;
        }

        const progressPercent = (currentIndex / totalItems) * 100;
        if (progressBar) progressBar.style.width = progressPercent + "%";
        if (groupProgress) groupProgress.textContent = "Processando " + currentIndex + " de " + totalItems + " itens...";

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
          
          if (plate) {
            try {
              const apiResult = await consultarPlacaPHP(plate, vin || "");

              const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              const chassiDigitadoNorm = norm(vin);

              const chassiRetornadoNorm = norm(
                apiResult.chassi_completo || 
                apiResult.chassi || 
                apiResult.chassi_raw_api || 
                ""
              );

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

                if (!confirmouPorFinalParcial && (apiResult.chassi_completo || apiResult.chassi)) {
                  const apiChassi = apiResult.chassi_completo || apiResult.chassi;
                  itemData.vin = apiChassi;
                  if (window.currentDecoder) {
                    itemData.result = window.currentDecoder.decode(apiChassi);
                  }
                }

                // Busca OnibusBrasil ANTES do push
                let obData = null;
                if (window.buscarDadosOnibusBrasil) {
                  try {
                    obData = await window.buscarDadosOnibusBrasil(plate, false);
                  } catch (e) {
                    console.warn("Falha ao buscar OB (grupo):", e);
                  }
                }

                if (obData && !obData.erro) {
                  itemData.ob_data = obData;
                  itemData.apiResult.ob_data = obData;
                  itemData.ob = {
                    ob_carroceria:        obData.carroceria        || "—",
                    ob_encarrocadeira:    obData.encarrocadeira    || obData.encarrocadora || "—",
                    ob_fabricante_chassi: obData.fabricante_chassi || obData.fabricante || apiResult.marca || "—",
                    ob_chassi:            obData.modelo_chassi     || obData.chassi     || apiResult.modelo || "—",
                    // Sem prefixo para exportCSV 
                    carroceria:        obData.carroceria     || "—", 
                    encarrocadeira:    obData.encarrocadeira || obData.encarrocadora || "—", 
                    encarrocadora:     obData.encarrocadeira || obData.encarrocadora || "—", 
                  };
                } else {
                  itemData.ob = {
                    ob_carroceria:        "—",
                    ob_encarrocadeira:    "—",
                    ob_fabricante_chassi: apiResult.marca  || "—",
                    ob_chassi:            apiResult.modelo || "—",
                    carroceria:        "—", 
                    encarrocadeira:    "—", 
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

          // Push SOMENTE após tudo estar populado 
          window.currentGroupResults.push(itemData); 
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

 
 // BLOCO 2 — Modal de Pesquisa de Frota 
 // Cole no final do main.js, dentro da função main(), 
 
  
 (function iniciarPesquisaFrota() { 
  
   // ---- Cria o modal de resultados ---- 
   const modal = document.createElement('div'); 
   modal.id = 'fleetSearchModal'; 
   modal.style.cssText = [ 
     'display:none', 
     'position:fixed', 
     'inset:0', 
     'background:rgba(0,0,0,0.65)', 
     'backdrop-filter:blur(4px)', 
     'z-index:9990', 
     'align-items:center', 
     'justify-content:center', 
     'padding:20px', 
   ].join(';'); 
  
   modal.innerHTML = ` 
     <div style=" 
       width: min(860px, 100%); 
       max-height: 88vh; 
       background: var(--bg-elev); 
       border: 1px solid var(--border); 
       border-radius: 16px; 
       display: flex; 
       flex-direction: column; 
       box-shadow: 0 24px 64px rgba(0,0,0,0.5); 
       overflow: hidden; 
     "> 
       <!-- Cabeçalho --> 
       <div style=" 
         padding: 18px 24px; 
         border-bottom: 1px solid var(--border); 
         display: flex; 
         align-items: center; 
         justify-content: space-between; 
         gap: 12px; 
         flex-shrink: 0; 
       "> 
         <div> 
           <div style="font-weight:700;font-size:16px;color:var(--text)">🔍 Pesquisa de Frota no Banco</div> 
           <div style="font-size:12px;color:var(--muted);margin-top:2px" id="fleetSearchCount">Nenhum filtro aplicado</div> 
         </div> 
         <div style="display:flex; align-items:center; gap:12px;">
           <button id="btnLimparQuickSearch" title="Limpar filtros e busca" style="background:var(--bg); border:1px solid var(--border); color:var(--muted); padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; display:none;">🧹 Limpar</button>
           <input id="quickFleetSearch" type="text" placeholder="Pesquisa rápida..." style="background:var(--bg); border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:8px; font-size:13px; width:200px; outline:none;">
           <button id="closeFleetSearchModal" style=" 
             background:transparent; 
             border:1px solid var(--border); 
             border-radius:8px; 
             color:var(--muted); 
             padding:6px 12px; 
             cursor:pointer; 
             font-size:18px; 
             line-height:1; 
           ">✕</button> 
         </div>
       </div> 
  
       <!-- Área de resultados --> 
       <div id="fleetSearchResults" style=" 
         flex:1; 
         overflow-y:auto; 
         padding:16px 24px; 
       "> 
         <div style="color:var(--muted);text-align:center;padding:40px 0"> 
           Use os filtros no histórico e clique em <strong>Pesquisar Frota</strong>. 
         </div> 
       </div> 
  
       <!-- Rodapé --> 
       <div style=" 
         padding:14px 24px; 
         border-top:1px solid var(--border); 
         display:flex; 
         align-items:center; 
         justify-content:space-between; 
         flex-shrink:0; 
         gap:12px; 
         flex-wrap:wrap; 
       "> 
         <span id="fleetSearchPagInfo" style="font-size:13px;color:var(--muted)"></span> 
         <div style="display:flex;gap:8px"> 
           <button id="fleetSearchPrev" class="btn-page" style="display:none">← Anterior</button> 
           <button id="fleetSearchNext" class="btn-page" style="display:none">Próximo →</button> 
           <button id="btnExportFleetSearch" class="btn-page" style="display:none">📄 Exportar CSV</button> 
         </div> 
       </div> 
     </div> 
   `; 
  
   document.body.appendChild(modal); 
  
   // Fecha ao clicar fora ou no X 
   modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); }); 
   document.getElementById('closeFleetSearchModal').onclick = fecharModal; 
   function fecharModal() { modal.style.display = 'none'; } 
  
   // ---- Estado da pesquisa ---- 
   let filtrosOriginais = {}; // Salva os filtros iniciais (lote/histórico)
   let lastFiltros     = {}; 
   let currentOffset   = 0; 
   let currentTotal    = 0; 
   const PAGE_SIZE     = 50; 
   let allResultsCache = []; 
  
   // ---- Renderiza os resultados no modal ---- 
   function renderResultados(data) { 
     const container = document.getElementById('fleetSearchResults'); 
     const countEl   = document.getElementById('fleetSearchCount'); 
     const pagInfo   = document.getElementById('fleetSearchPagInfo'); 
     const btnPrev   = document.getElementById('fleetSearchPrev'); 
     const btnNext   = document.getElementById('fleetSearchNext'); 
     const btnExport = document.getElementById('btnExportFleetSearch'); 
  
     if (!data || !data.ok) { 
       container.innerHTML = `<div style="color:#e74c3c;text-align:center;padding:40px 0">${data?.mensagem || "Erro ao buscar dados. Tente novamente."}</div>`; 
       if (countEl) countEl.textContent = "Erro na busca";
       return; 
     } 
  
     currentTotal    = data.total || 0; 
     allResultsCache = data.results || []; 
  
     countEl.textContent = currentTotal + ' veículo(s) encontrado(s)'; 
  
     if (allResultsCache.length === 0) { 
       container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px 0">Nenhum veículo encontrado com esses filtros.</div>'; 
       btnPrev.style.display = 'none'; 
       btnNext.style.display = 'none'; 
       btnExport.style.display = 'none'; 
       pagInfo.textContent   = ''; 
       return; 
     } 
  
     // Tabela de resultados 
     const inicio = currentOffset + 1; 
     const fim    = Math.min(currentOffset + allResultsCache.length, currentTotal); 
     pagInfo.textContent    = 'Exibindo ' + inicio + '–' + fim + ' de ' + currentTotal; 
     btnPrev.style.display  = currentOffset > 0 ? 'inline-block' : 'none'; 
     btnNext.style.display  = fim < currentTotal ? 'inline-block' : 'none'; 
     btnExport.style.display = 'inline-block'; 
  
     container.innerHTML = ''; 
  
     // Wrapper com scroll horizontal para telas menores 
     const wrapper = document.createElement('div'); 
     wrapper.style.overflowX = 'auto'; 
  
     const table = document.createElement('table'); 
     table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;'; 
  
     const thead = document.createElement('thead'); 
     thead.innerHTML = ` 
       <tr style="background:var(--bg);border-bottom:2px solid var(--border);"> 
         ${['Frota','VIN','Placa','Montadora','Modelo','Submodelo','Ano','Carroceria','Encarroçadora','Segmento','Cód. FIPE','Modelo FIPE','WMI','Motor','Pos. Motor','Emissões','Combustível','Cor','Cidade/UF'] 
           .map(h => `<th style="padding:10px 12px;text-align:left;color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap">${h}</th>`) 
           .join('')} 
       </tr> 
     `; 
     table.appendChild(thead); 
  
     const tbody = document.createElement('tbody'); 
     allResultsCache.forEach((row, i) => { 
       const tr = document.createElement('tr'); 
       tr.style.cssText = 'border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s'; 
       tr.onmouseenter = () => tr.style.background = 'var(--bg)'; 
       tr.onmouseleave = () => tr.style.background = ''; 
  
       // Normaliza para exibição (ex: Scania R450 -> R / 450)
       const tech = getTechnicalData({ 
         fabricante: row.montadora, 
         apiResult: { 
           modelo: row.modelo, 
           versao: row.submodelo 
         } 
       });
       const displayModel = tech.model || row.modelo || '—';
       const displaySubmodel = tech.submodel || row.submodelo || '—';

       const cols = [ 
         row.fleet_name   || '—', 
         row.vin          || '—', 
         row.placa        || '—', 
         row.montadora    || '—', 
         displayModel, 
         displaySubmodel, 
         row.ano          || '—', 
         row.carroceria   || '—', 
         row.encarrocadora || '—', 
         row.segmento     || '—', 
         row.fipe_codigo  || '—', 
         row.fipe_modelo  || '—', 
         row.wmi          || '—',
         row.motor        || '—',
         row.posicao_motor || '—',
         row.emissoes     || '—',
         row.combustivel  || '—',
         row.cor          || '—',
         row.municipio_uf || '—',
       ]; 
  
       tr.innerHTML = cols.map(val => ` 
         <td style="padding:10px 12px;color:var(--text);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${val}">${val}</td> 
       `).join(''); 
  
       tr.onclick = () => {
         // Fecha o modal de pesquisa
         const modal = document.getElementById('fleetSearchModal');
         if (modal) modal.style.display = 'none';

         // Alterna para a tela de decodificação individual
         const singleDecoder = el("singleDecoder");
         if (typeof window.showScreen === "function" && singleDecoder) {
           window.showScreen(singleDecoder);
         }

         // Popula os campos de placa e VIN
         const pInput = el("plateInputSingle");
         const vInput = el("vinInputSingle");
         const bDecode = el("btnDecodeSingle");
         const bPlate = el("btnPlateSingle");

         if (pInput) {
           pInput.value = (row.placa || "").trim();
           pInput.dispatchEvent(new Event("input"));
         }
         if (vInput) {
           vInput.value = (row.vin || "").trim();
           vInput.dispatchEvent(new Event("input"));
         }

         // Se tiver VIN, prioriza decodificação direta
         if (row.vin && bDecode) {
           console.log("[FleetSearch] Decodificando via VIN:", row.vin);
           setTimeout(() => bDecode.click(), 300);
         } else if (row.placa && bPlate) {
           console.log("[FleetSearch] Decodificando via Placa:", row.placa);
           setTimeout(() => bPlate.click(), 300);
         }
       };

       tbody.appendChild(tr); 
     }); 
  
     table.appendChild(tbody); 
     wrapper.appendChild(table); 
     container.appendChild(wrapper); 
   } 
  
   // ---- Executa a pesquisa ---- 
   async function executarPesquisa(filtros, offset = 0) { 
     const container = document.getElementById('fleetSearchResults'); 
     const countEl   = document.getElementById('fleetSearchCount');
     
     if (countEl) countEl.innerHTML = '⏳ Buscando no servidor...';
     modal.style.display = 'flex'; 
  
     lastFiltros    = filtros; 
     currentOffset  = offset; 
  
     try {
       const data = await buscarFrotaNoBanco({ ...filtros, limit: PAGE_SIZE, offset }); 
       
       if (!data || !data.ok) {
         renderResultados({ ok: false, mensagem: data?.erro || "Falha na conexão" });
         return;
       }

       // Filtro adicional no cliente para garantir correspondência exata de modelo se solicitado 
       if (filtros.modelo && data.ok && Array.isArray(data.results)) { 
         const fModelNorm = filtros.modelo.trim().toUpperCase(); 
         data.results = data.results.filter(row => { 
           const m = String(row.modelo || "").trim().toUpperCase(); 
           return m === fModelNorm || 
                  m.startsWith(fModelNorm + " ") || 
                  m.startsWith(fModelNorm + "-") ||
                  (fModelNorm.length === 1 && m.startsWith(fModelNorm) && /^\d/.test(m.slice(1)));
         }); 
       } 
    
       renderResultados(data); 
     } catch (e) {
       console.error("[Fleet] Erro ao pesquisar:", e);
       renderResultados({ ok: false, mensagem: "Erro inesperado ao buscar dados." });
     }
   } 
  
   // Paginação 
   document.getElementById('fleetSearchPrev').onclick = () => 
     executarPesquisa(lastFiltros, Math.max(0, currentOffset - PAGE_SIZE)); 
   document.getElementById('fleetSearchNext').onclick = () => 
     executarPesquisa(lastFiltros, currentOffset + PAGE_SIZE); 

   const btnLimparQS = document.getElementById('btnLimparQuickSearch');
   const inputQS     = document.getElementById('quickFleetSearch');

   if (btnLimparQS && inputQS) {
     btnLimparQS.onclick = () => {
       inputQS.value = "";
       btnLimparQS.style.display = 'none';
       executarPesquisa(filtrosOriginais, 0); // Volta para o estado original (lote filtrado)
     };

     inputQS.oninput = (e) => {
       const term = e.target.value.trim();
       btnLimparQS.style.display = term ? 'block' : 'none';

       clearTimeout(fleetSearchTimeout);
       fleetSearchTimeout = setTimeout(() => {
         // Mantém os filtros originais (lote/histórico) e adiciona o termo de busca global 'q'
         const novosFiltros = { ...filtrosOriginais, q: term, offset: 0 };
         executarPesquisa(novosFiltros, 0);
       }, 450);
     };
   }
  
   // Exportar Relatórios dos resultados (com opções de FIPE/Sem FIPE)
   document.getElementById('btnExportFleetSearch').onclick = () => { 
     if (!allResultsCache.length) return; 
  
     // Transforma os resultados planos do banco no formato esperado pela função exportCSV
     const reportData = allResultsCache.map(row => {
       const [municipio, uf] = (row.municipio_uf || '').split(' / ');
       return {
         placa: row.placa,
         vin:   row.vin,
         fabricante: row.montadora,
         modelo:     row.modelo, // Adicionado ao top level
         fipe_modelo: row.fipe_modelo, // Adicionado ao top level
         apiResult: {
           marca:       row.montadora,
           modelo:      row.modelo,
           texto_modelo: row.fipe_modelo, // Fallback importante para exportCSV
           versao:      row.submodelo,
           ano:         row.ano,
           fipe_codigo: row.fipe_codigo,
           fipe_modelo: row.fipe_modelo,
           combustivel: row.combustivel,
           cor:         row.cor,
           municipio:   municipio || '',
           uf:          uf || '',
           status:      'ok'
         },
         ob_data: {
           carroceria:     row.carroceria,
           encarrocadeira: row.encarrocadora,
           fabricante_chassi: row.montadora,
           modelo_chassi:     row.modelo
         },
         result: {
           tokens: [
             { label: 'WMI', value: row.wmi },
             { label: 'MOTOR', value: row.motor },
             { label: 'POSIÇÃO DO MOTOR', value: row.posicao_motor },
             { label: 'NORMA DE EMISSÕES', value: row.emissoes },
           ]
         }
       };
     });

     if (typeof openReportOptions === 'function') {
       openReportOptions(reportData, "Pesquisa_Frota_" + Date.now());
     } else {
       // Fallback caso a função não exista por algum motivo
       showToast("Função de relatório não encontrada.", "error");
     }
   }; 
  
   // ---- Expõe globalmente para ser chamado pelo botão no histórico ---- 
   window.abrirPesquisaFrota = function(filtros) { 
     filtrosOriginais = filtros || {}; // Salva o estado original (lote/histórico)
     const qInput = document.getElementById('quickFleetSearch');
     if (qInput) qInput.value = ""; // Limpa campo de busca ao abrir nova frota
     executarPesquisa(filtrosOriginais, 0); 
   }; 
  
 })(); 

    renderHistory();

    if (window.populateGroupFilters && window.currentGroupResults) {
      populateGroupFilters(window.currentGroupResults);
    }

  } catch (err) {
    console.error("Erro fatal na inicialização:", err);
    const errs = el("errors");
    if (errs) errs.innerHTML = '<div class="error">Erro ao carregar sistema: ' + err.message + '</div>';
  }
}

main().catch(console.error);