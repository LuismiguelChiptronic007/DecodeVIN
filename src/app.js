import { createDecoder } from "./decoder.js";



async function loadRules() {
  const res = await fetch("./data/manufacturers.json");
  return await res.json();
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000 } = options; // Aumentado para 30s
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    // Se for erro de timeout (AbortError), tratamos como erro de conexão
    if (error.name === 'AbortError') {
      throw new Error('Timeout na requisição');
    }
    throw error;
  }
}

// Função para consultar API externa do keplaca.com (Simulação de integração REST)
async function consultarKePlaca(placa) {
  try {
    // Agora chama a função do arquivo keplaca-integracao.js
    if (window.consultarKePlaca) {
      return await window.consultarKePlaca(placa);
    }
    return null; 
  } catch (e) {
    console.error("Erro KePlaca (Wrapper):", e);
    return null;
  }
}

// Função para verificar placa e chassi via API direta (Worker Cloudflare) - BYPASS PHP
async function consultarPlacaPHP(placa, chassiDigitado = "") {
  try {
    console.log("Iniciando consulta de placa direta (Worker) para:", placa);

    // ✅ Chamada direta ao Worker do KePlaca (evita problemas de PHP/XAMPP/PNA)
    const workerUrl = `https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev/?placa=${placa}`;
    const resp = await fetch(workerUrl);
    const data = await resp.json();

    console.log("Dados recebidos do Worker:", data);

    if (data && data.status === 'ok') {
      // ✅ Prioriza chassi_completo (17 chars) para validação exata, caso disponível
      const final_site = (data.chassi_completo || data.final_chassi || "").toUpperCase();
      
      if (final_site) {
        // ✅ VALIDAÇÃO: Se o chassi foi fornecido, verifica se coincide com os dados da placa
        if (chassiDigitado && !isChassisMatch(chassiDigitado, final_site)) {
          return {
            status: "erro",
            mensagem: `Divergência: Este chassi (${chassiDigitado}) não pertence à placa (${placa}).`,
            final: final_site
          };
        }

        return {
          status: "ok",
          final: final_site,
          mensagem: `Chassi final encontrado: ${final_site}`,
          fonte: "worker_keplaca"
        };
      }
    }

    throw new Error("Placa não encontrada ou erro no Worker.");

  } catch (e) {
    console.error("Erro na verificação direta:", e);
    return { 
      status: "erro", 
      mensagem: "Não foi possível localizar os dígitos do chassi para esta placa em fontes públicas." 
    };
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

// Função auxiliar para validar se dois nomes de fabricantes são compatíveis
function isMfrMatch(m1, m2) {
  if (!m1 || !m2 || m1 === "—" || m2 === "—") return true; 
  const s1 = m1.toLowerCase();
  const s2 = m2.toLowerCase();
  
  // Normalização básica (remover acentos, espaços extras, etc.)
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const n1 = norm(s1);
  const n2 = norm(s2);

  // Atalhos comuns para marcas de ônibus e caminhões
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
     
     // ✅ NOVA LÓGICA DE DETECÇÃO DE MODELO: 
     // Só ignoramos a validação se a string parecer um nome puramente alfabético (ex: "BUS", "SCANIA").
     // Se contiver NÚMEROS e tiver pelo menos 4 caracteres, deve ser validado.
     const hasNumbers = /[0-9]/.test(p);
     const isLikelySerial = hasNumbers && p.length >= 4;
     
     // Consideramos modelo se não parecer um serial e tiver características de nome
     const isModel = !isLikelySerial && p.length < 17 && (
       p.length < 4 || // Muito curto
       /^[A-Z]+$/.test(p) || // Só letras
       p.includes("-") || p.includes(" ")
     );

     if (isModel) {
       console.log(`[Validando Chassi] Ignorando validação estrita: '${p}' parece ser um NOME DE MODELO.`);
       return true; 
     }
 
     console.log(`[Validando Chassi] Digitado: ${v} | Retornado da API: ${p}`);
 
     // Comparação exata para VIN completo
     if (p.length === 17) {
       const match = v === p;
       console.log(`[Validando Chassi] Comparação 17 chars: ${match ? "OK" : "DIVERGENTE"}`);
       return match;
     }

     // Comparação final para VIS (8 chars)
     if (p.length === 8) {
       const match = v.endsWith(p);
       console.log(`[Validando Chassi] Comparação 8 chars (final): ${match ? "OK" : "DIVERGENTE"}`);
       return match;
     }
     
     // Se for um pedaço menor (ex: 7 dígitos), verifica se está contido no VIN
     const match = v.includes(p);
     console.log(`[Validando Chassi] Comparação parcial (${p.length} chars): ${match ? "OK" : "DIVERGENTE"}`);
     return match;
   }

function card(label, value) {
  const d = document.createElement("div");
  d.className = "card";
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
  v.textContent = value == null ? "—" : String(value);
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
  
  // Estilização via JS para garantir o tema
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

  // Keyframes para animação se não existirem
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
  // Garante que o grid esteja centralizado
  centerGrid(container);
}

/**
 * Centraliza os cartões dentro de um container grid.
 * @param {HTMLElement} container 
 */
function centerGrid(container) {
  if (!container) return;
  container.style.display = "grid";
  // Usamos auto-fit para centralizar melhor quando há poucos cards
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
    if (result.type === "VIN") {
      const parts = [text.slice(0, 3), text.slice(3, 9), text.slice(9)];
      parts.forEach(p => {
        const d = document.createElement("div");
        d.className = "seg";
        d.textContent = p;
        segs.appendChild(d);
      });
    }
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
    // Centraliza os cartões na tela principal
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
  if (!result || result.type === "UNKNOWN") return;

  if (result.input && result.input.replace(/[^A-Z0-9]/g, "").length === 17) {
    const v = result.input.replace(/[^A-Z0-9]/g, "").toUpperCase();
    const wmi = document.createElement("div"); wmi.className = "seg"; wmi.textContent = v.slice(0, 3);
    const vds = document.createElement("div"); vds.className = "seg"; vds.textContent = v.slice(3, 9);
    const vis = document.createElement("div"); vis.className = "seg"; vis.textContent = v.slice(9);
    container.appendChild(wmi); container.appendChild(vds); container.appendChild(vis);
    container.style.display = "flex";
  } else if (result.type === "MODEL") {
    const parts = (result.tokens.find(t => t.key === "modeloChassi")?.value || "").match(/([KFN])|(\d{3})|([AB])|((?:\d)X\d|\d)|([HLN][BIE]?)/g) || [];
    parts.forEach(p => {
      const d = document.createElement("div");
      d.className = "seg";
      d.textContent = p;
      container.appendChild(d);
    });
    if (parts.length) container.style.display = "flex";
  }
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

function addHistoryEntry(input, plateOverride = "") {
  const key = "decodevin.history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const pInput = el("plateInputSingle");
  const plate = plateOverride || (pInput ? pInput.value.trim().toUpperCase() : "");
  if (!input && !plate) return;
  const entry = { input, plate, ts: Date.now() };
  // Aumentado para 100 itens no histórico total
  const newList = [entry, ...list.filter(x => x.input !== input || (input === "" && x.plate !== plate))].slice(0, 100);
  localStorage.setItem(key, JSON.stringify(newList));
  currentHistoryPage = 1; // Volta para a primeira página ao adicionar novo
  renderHistory();
}

function addGroupHistoryEntry(vins, plates) {
  const key = "decodevin.groupHistory";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  if (!vins && !plates) return;
  
  const fInput = el("fleetName");
  const fleetName = fInput ? fInput.value.trim() : "";
  
  const entry = { vins, plates, fleetName, ts: Date.now() };
  // Apenas salva se for diferente do último (simples)
  const lastEntry = list[0];
  if (lastEntry && lastEntry.vins === vins && lastEntry.plates === plates && lastEntry.fleetName === fleetName) return;

  const newList = [entry, ...list].slice(0, 50); // Limite de 50 grupos
  localStorage.setItem(key, JSON.stringify(newList));
  currentGroupHistoryPage = 1;
  renderHistory();
  
  // Limpa o nome da frota após salvar
  if (fInput) fInput.value = "";
}

function renderHistory() {
  renderSingleHistory();
  renderGroupHistory();
}

function renderSingleHistory() {
  const key = "decodevin.history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const h = el("history");
  if (!h) return;
  h.innerHTML = "";

  if (list.length === 0) {
    h.innerHTML = `<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item no histórico.</div>`;
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
    // Removida a hora conforme solicitação: "aqui eu não quero a hora, só na tela de grupo"
    v.textContent = (item.input || "Placa: " + item.plate);
    if (item.input && item.plate) {
      const p = document.createElement("span");
      p.style.fontSize = "12px"; p.style.color = "var(--accent)"; p.style.marginLeft = "8px";
      p.textContent = `[${item.plate}]`;
      v.appendChild(p);
    }
    
    v.onclick = () => {
      const vInput = el("vinInputSingle");
      const pInput = el("plateInputSingle");
      const bSingle = el("btnDecodeSingle");
      const bPlate = el("btnPlateSingle");
      if (item.input && vInput) {
        vInput.value = item.input;
        if (bSingle) { bSingle.disabled = false; bSingle.click(); }
      }
      if (item.plate && pInput) {
        pInput.value = item.plate;
        if (bPlate) { bPlate.disabled = false; bPlate.click(); }
      }
    };

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn-delete-item";
    btnDelete.innerHTML = "&times;";
    btnDelete.title = "Remover este item";
    btnDelete.onclick = (e) => {
      e.stopPropagation();
      const currentList = JSON.parse(localStorage.getItem(key) || "[]");
      currentList.splice(indexInFullList, 1);
      localStorage.setItem(key, JSON.stringify(currentList));
      renderSingleHistory();
    };

    row.appendChild(v);
    row.appendChild(btnDelete);
    h.appendChild(row);
  });

  // Controles de Paginação
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
}

function renderGroupHistory() {
  const key = "decodevin.groupHistory";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const h = el("groupHistory");
  if (!h) return;
  h.innerHTML = "";

  if (list.length === 0) {
    h.innerHTML = `<div style="color:var(--muted); text-align:center; padding: 20px;">Nenhum item no histórico de grupo.</div>`;
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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Título do Lote: Nome ou ID Sequencial
    const title = document.createElement("div");
    title.style.fontWeight = "600";
    title.style.color = "var(--accent)";
    title.textContent = item.fleetName ? `📦 ${item.fleetName}` : `📦 Lote #${list.length - indexInFullList}`;
    
    // Detalhes (Contagem e Data)
    const details = document.createElement("div");
    details.style.fontSize = "13px";
    details.style.color = "var(--text)";
    details.textContent = `${totalCount} itens • ${dataHora}`;

    // Prévia dos dados (primeiros 2 itens)
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
    if (previewText.length > 0) v.appendChild(preview);
    
    v.onclick = () => {
      const gInput = el("groupInput");
      const gPlateInput = el("groupPlateInput");
      const bGroup = el("btnGroupDecode");
      if (gInput) gInput.value = item.vins || "";
      if (gPlateInput) gPlateInput.value = item.plates || "";
      if (bGroup) { bGroup.disabled = false; bGroup.click(); }
    };

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn-delete-item";
    btnDelete.innerHTML = "&times;";
    btnDelete.title = "Remover este lote";
    btnDelete.onclick = (e) => {
      e.stopPropagation();
      const currentList = JSON.parse(localStorage.getItem(key) || "[]");
      currentList.splice(indexInFullList, 1);
      localStorage.setItem(key, JSON.stringify(currentList));
      renderGroupHistory();
    };

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
}

const exportCSV = (data, name) => {
  // Cabeçalhos solicitados anteriormente, organizados conforme o modelo visual
  const columns = [
    "MONTADORA",
    "CHASSI",
    "PLACA",
    "ANO",
    "CARROCERIA",
    "ENCARROÇADEIRA",
    "MOTOR",
    "MODELO CHASSI"
  ];

  // Cabeçalho com BOM para Excel reconhecer acentos
  let csv = "\ufeff" + columns.join(";") + "\n";

  data.forEach(item => {
    const tokens = item.result?.tokens || [];
    const ob = item.ob_data || item.ob || {};
    
    const findToken = (label) => {
      const t = tokens.find(t => t.label === label || t.key === label.toLowerCase().replace(/ /g, "_"));
      return t ? t.value : "—";
    };

    const row = [
      item.fabricante || findToken("Fabricante") || "—",  // MONTADORA
      item.vin || "—",                                   // CHASSI
      item.placa || "—",                                  // PLACA
      findToken("Ano Modelo") || "—",                    // ANO
      ob.carroceria || "—",                              // CARROCERIA
      ob.encarrocadeira || ob.encarrocadora || "—",      // ENCARROÇADEIRA
      findToken("Motor") || "—",                         // MOTOR
      ob.modelo_chassi || ob.chassi || findToken("Modelo") || "—" // MODELO CHASSI
    ];

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
  if (btnExportCSV) {
    btnExportCSV.onclick = () => {
      if (window.currentGroupResults) exportCSV(window.currentGroupResults, "Relatorio_Frota");
    };
  }

let currentGroupPage = 1;
const GROUP_PAGE_SIZE = 10;

function renderGroupResults() {
  const gResults = el("groupResults");
  if (!gResults || !window.currentGroupResults) return;
  gResults.innerHTML = "";

  const totalPages = Math.ceil(window.currentGroupResults.length / GROUP_PAGE_SIZE);
  if (currentGroupPage > totalPages) currentGroupPage = totalPages;
  if (currentGroupPage < 1) currentGroupPage = 1;

  const start = (currentGroupPage - 1) * GROUP_PAGE_SIZE;
  const end = start + GROUP_PAGE_SIZE;
  const pageList = window.currentGroupResults.slice(start, end);

  const fragment = document.createDocumentFragment();

  pageList.forEach(itemData => {
    const item = document.createElement("div");
    item.className = "group-item";
    
    // Configurar o estilo com base no status
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

    item.innerHTML = `${layout}<div class="info"><span>${itemData.fabricante || "—"}</span><span class="status-msg">${statusHtml}</span></div>`;
    
    // Garantir que o modal abre na primeira tentativa usando addEventListener e parando propagação
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(vin ? itemData.result : null, vin || plate, !vin, vin && plate ? plate : null, itemData);
    });

    fragment.appendChild(item);
  });

  gResults.appendChild(fragment);

  // Controles de Paginação do Grupo
  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "group-pagination";
    pagination.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 25px; padding: 20px 0; border-top: 1px solid var(--border); width: 100%; grid-column: 1 / -1;";

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "← Anterior";
    btnPrev.disabled = currentGroupPage === 1;
    btnPrev.className = "btn-page";
    btnPrev.onclick = (e) => { e.stopPropagation(); currentGroupPage--; renderGroupResults(); };

    const pageInfo = document.createElement("span");
    pageInfo.textContent = `Página ${currentGroupPage} de ${totalPages}`;
    pageInfo.style.fontSize = "14px";
    pageInfo.style.color = "var(--muted)";

    const btnNext = document.createElement("button");
    btnNext.textContent = "Próximo →";
    btnNext.disabled = currentGroupPage === totalPages;
    btnNext.className = "btn-page";
    btnNext.onclick = (e) => { e.stopPropagation(); currentGroupPage++; renderGroupResults(); };

    pagination.appendChild(btnPrev);
    pagination.appendChild(pageInfo);
    pagination.appendChild(btnNext);
    gResults.appendChild(pagination);
  }
}

// MODAL LOGIC — corrigido: não substitui document.getElementById
async function openModal(result, code, isPlate = false, linkedPlate = null, itemData = null) {
  const mTitle = el("modalTitle");
  const mSegs = el("modalSegments");
  const mCards = el("modalCards");
  const modal = el("detailModal");

  if (!modal) return;

  // Limpar e mostrar modal IMEDIATAMENTE para feedback visual
  mTitle.textContent = linkedPlate ? `Análise Completa: ${code} + ${linkedPlate}` : (isPlate ? `Dados OB: ${code}` : `Detalhes: ${code}`);
  mSegs.innerHTML = ""; 
  mCards.innerHTML = "";
  mCards.removeAttribute("style"); // Limpa o display: grid do caso anterior
  modal.style.display = "flex";

  // Se houver erro de verificação no itemData, mostramos o erro no modal e bloqueamos os detalhes
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
       errorCard.innerHTML = `Este chassi (${code}) não pertence à placa (${linkedPlate}).<br><small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos foram bloqueados.</small>`;
     } else {
       errorCard.innerHTML = `Não foi possível localizar os dígitos do chassi para a placa ${linkedPlate} em fontes públicas.<br><small style="font-weight:normal; margin-top: 5px; display: block;">Por segurança, os detalhes técnicos não serão exibidos.</small>`;
     }
    
    mCards.appendChild(errorCard);
    return;
  }

  const injectOB = (p, container) => {
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
    
    // Centraliza os cartões da carroceria
    centerGrid(obCards);
    
    showSkeletons(obCards, 4);

    const mediaBox = document.createElement("div");
    mediaBox.style.display = "flex";
    mediaBox.style.flexDirection = "column";
    mediaBox.style.alignItems = "center";
    mediaBox.style.gap = "16px";
    mediaBox.style.marginTop = "20px";
    obWrapper.appendChild(mediaBox);

    let hasLoaded = false;
    const checkClear = () => { if(!hasLoaded) { obCards.innerHTML = ""; hasLoaded = true; } };

    const mockUI = {
      getElementById: (id) => {
        if (id === "secao-onibusbrasil") return obWrapper;
        if (id === "ob_status") return {
          set textContent(v) { 
            statusDiv.textContent = v; 
            // Limpa esqueletos em caso de sucesso (✅) ou erro (⚠️/❌/sem ficha)
            if (v.includes("✅") || v.includes("Aviso") || v.includes("Erro") || v.includes("sem ficha") || v.includes("Não encontrada")) {
              checkClear();
            }
          },
          style: { set color(c) { statusDiv.style.color = c; } }
        };
        if (id === "ob_encarrocadeira") return { set textContent(v) { if(v && v!=="—") { checkClear(); obCards.appendChild(card("Encarroçadora", v)); if (itemData) itemData.ob.ob_encarrocadeira = v; } } };
        if (id === "ob_carroceria") return { set textContent(v) { if(v && v!=="—") { checkClear(); obCards.appendChild(card("Carroceria", v)); if (itemData) itemData.ob.ob_carroceria = v; } } };
        if (id === "ob_fabricante_chassi") return { set textContent(v) { if(v && v!=="—") { checkClear(); obCards.appendChild(card("Fabricante Chassi", v)); if (itemData) itemData.ob.ob_fabricante_chassi = v; } } };
        if (id === "ob_chassi") return { set textContent(v) { if(v && v!=="—") { checkClear(); obCards.appendChild(card("Modelo Chassi", v)); if (itemData) itemData.ob.ob_chassi = v; } } };
        if (id === "ob_foto") return { set src(v) { if(v) { const i=document.createElement("img"); i.src=v; i.loading="lazy"; i.decoding="async"; i.style.width="100%"; i.style.maxWidth="600px"; i.style.borderRadius="12px"; i.style.boxShadow="var(--shadow)"; i.style.border="1px solid var(--border)"; mediaBox.prepend(i); } }, style: { set display(v) {} } };
        if (id === "ob_fonte") return { set href(v) { if(v) { const a=document.createElement("a"); a.href=v; a.target="_blank"; a.textContent="🔗 Ficha Completa no Ônibus Brasil"; a.style.cssText="display:inline-block;padding:12px 24px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px solid var(--accent-2);color:var(--accent-2);font-size:14px;font-weight:600;"; mediaBox.appendChild(a); } }, style: { set display(v) {} } };
        if (id === "singleReportButtons") return { style: { set display(v) {} } };
        return null;
      }
    };
    window.buscarDadosOnibusBrasil(p, true, mockUI);
  };

  if (linkedPlate) {
    mSegs.innerHTML = `<div class="seg">${code}</div><div class="seg" style="background:var(--accent);color:black">${linkedPlate}</div>`;
    
    // Container para os cartões do chassi
    const c1 = document.createElement("div");
    c1.className = "cards";
    centerGrid(c1);
    mCards.appendChild(c1);
    setCards(result, c1);
    
    // Título da seção Ônibus Brasil
    const h = document.createElement("h3"); 
    h.textContent = "🚌 Dados Carroceria"; 
    h.style.cssText = "font-size: 18px; color: var(--accent-2); margin: 24px 0 16px; border-top: 1px solid var(--border); padding-top: 24px; text-align: center; width: 100%;";
    mCards.appendChild(h);
    
    injectOB(linkedPlate, mCards);
  } else if (isPlate) {
    mSegs.innerHTML = `<div class="seg">${code}</div>`;
    injectOB(code, mCards);
  } else {
    setSegments(result, mSegs);
    setCards(result, mCards);
    // Centraliza os cartões principais do modal
    centerGrid(mCards);
  }

  /* Código da API externa removido a pedido do usuário */
}

window.renderGroupResults = renderGroupResults;
window.openModal = openModal;

async function main() {

  // PWA: Registrar Service Worker
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
      
      // Passar true para manter os valores dos inputs ao alternar entre telas de decodificação
      clearUI(true);
      
      if (screen) {
        screen.style.display = screen === selectionScreen ? "flex" : "block";
        // Forçar reflow para reiniciar a animação
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
      if (gPlateInput) setTimeout(() => gPlateInput.focus(), 50);
    };
    el("backFromSingle").onclick = () => {
      showScreen(selectionScreen);
      clearUI(false); // Limpa tudo ao voltar para a home
    };
    el("backFromGroup").onclick = () => {
      showScreen(selectionScreen);
      clearUI(false); // Limpa tudo ao voltar para a home
    };

    const showReports = (mode, show) => {
      const id = mode === "single" ? "singleReportButtons" : "reportButtons";
      // Ocultar sempre no modo individual conforme solicitação
      if (mode === "single") {
        const e = el("singleReportButtons");
        if (e) e.style.display = "none";
        return;
      }
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
      
      // Sempre limpar o valor do input de arquivo para permitir novas importações
      const excelInput = el("excelFileInput");
      if (excelInput) excelInput.value = "";

      if (!keepInputs) {
        const fInput = el("fleetName");
        if (fInput) fInput.value = "";
        [vinInputSingle, plateInputSingle, gInput, gPlateInput].forEach(e => { if (e) e.value = ""; });
      }
    };

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    let isPlateValidated = false;
    let isValidating = false;

    const runVIN = async (force = false) => {
      if (!vinInputSingle || isValidating) return;
      const text = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (text.length === 0) return;

      const plate = plateInputSingle ? plateInputSingle.value.trim().toUpperCase() : "";
      
     
      // dispara a busca da placa automaticamente em vez de mostrar erro.
      if (plate !== "" && !isPlateValidated && !force) {
          console.log("Placa presente mas não validada. Iniciando busca automática...");
          await runPlate();
          return; // runPlate já chama runVIN(true) ao finalizar com sucesso
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

      // Exibir título e seções de resultado
      const rt = el("resultTitle"); if (rt) rt.style.display = "block";
      const segs = el("segments"); if (segs) { segs.innerHTML = ""; segs.style.display = "flex"; }
      
      renderResult(result, text);
      
      //  ATUALIZA O OBJETO GLOBAL AO DECODIFICAR
      window.currentSingleResult = {
        tipo: result.type,
        vin: text,
        placa: plate,
        fabricante: result.manufacturerName || "Desconhecido",
        result: result,
        ob: {}
      };

      addHistoryEntry(text);
    };

    const runPlate = async () => {
      if (!plateInputSingle || isValidating) return;
      const p = plateInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const vin = vinInputSingle ? vinInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
      
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

      isPlateValidated = false; // Resetar estado ao iniciar nova busca
      window.currentSingleResult = { vin: vin, placa: p, ob: {}, result: null };

      // Limpar resultados anteriores ao iniciar nova busca de placa
      ["segments", "cards", "errors"].forEach(id => {
        const e = el(id);
        if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
      });
      const rt = el("resultTitle"); if (rt) rt.style.display = "none";
      const obSec = el("secao-onibusbrasil"); if (obSec) obSec.style.display = "none";
      const verifEl = el("ob_verificacao"); if (verifEl) verifEl.innerHTML = "";
      showReports("single", false);

      el("errors").innerHTML = "";
      
      if (obSec) obSec.style.display = "block";
      el("ob_status").textContent = "Buscando...";
      toggleValueSkeletons(el("ob_container"), true);
      
      const chassiDigitado = vinInputSingle ? vinInputSingle.value.trim().toUpperCase() : "";
      if (verifEl) verifEl.innerHTML = `<span style="color:var(--muted); font-weight:normal">Verificando placa...</span>`;

      try {
        // . Aguarda a validação da placa pelo PHP
        const apiResult = await consultarPlacaPHP(p, chassiDigitado);
        console.log("Resultado da verificação de placa:", apiResult);

        if (apiResult.status === "ok") {
          isPlateValidated = true; //  MARCAR COMO VALIDADO
          if (verifEl) verifEl.innerHTML = `<span style="color:#2ecc71">${apiResult.mensagem || "✔ Chassi confirmado"}</span>`;
          
          //  MOSTRAR RESULTADO AUTOMATICAMENTE
          runVIN(true); 
          showReports("single", true);

          //  Tentar usar os dados do OB que vieram no cache da API de placa
          let obData = apiResult.ob_data;
          
          if (obData && obData.success) {
            console.log("Usando dados do Ônibus Brasil vindos do cache DB");
            // Preencher a UI com os dados do cache
            if (el("ob_container")) {
              el("ob_status").textContent = "Dados carregados do cache local.";
              el("ob_status").style.color = "var(--accent)";
              el("ob_encarrocadeira").textContent = obData.encarrocadeira || obData.encarrocadora || "—";
              el("ob_carroceria").textContent = obData.carroceria || "—";
              el("ob_fabricante_chassi").textContent = obData.fabricante_chassi || obData.fabricante || "—";
              el("ob_chassi").textContent = obData.modelo_chassi || obData.chassi || "—";
              if (obData.foto_url && el("ob_foto")) {
                el("ob_foto").src = obData.foto_url;
                el("ob_foto").style.display = "block";
              }
              const fonte = el("ob_fonte");
              if (fonte) {
                fonte.href = `https://onibusbrasil.com/placa/${p}`;
                fonte.style.display = "inline-block";
              }
              toggleValueSkeletons(el("ob_container"), false, false);
            }
          } else if (window.buscarDadosOnibusBrasil) { 
            obData = await window.buscarDadosOnibusBrasil(p); 
            toggleValueSkeletons(el("ob_container"), false, false); 
          
            //  Se o fallback retornou chassi via KePlaca, preenche manualmente 
            if (obData && obData.final_chassi && !obData.carroceria) { 
              el("ob_chassi").textContent = obData.chassi || obData.final_chassi || "—"; 
              el("ob_status").textContent = "Dados parciais via KePlaca."; 
              el("ob_status").style.color = "#f0a500"; 
            } 
          } 


          addHistoryEntry(vinInputSingle.value, p);
          
          if (!window.currentSingleResult) {
            window.currentSingleResult = { tipo: 'PLATE', placa: p, ob: {}, ob_data: obData || {} };
          } else {
            window.currentSingleResult.placa = p;
            window.currentSingleResult.ob_data = obData || {};
          }
          
          // Atualizar objeto global para relatórios
          if (el("ob_container")) {
            window.currentSingleResult.ob = {
              ob_encarrocadeira: el("ob_encarrocadeira").textContent,
              ob_carroceria: el("ob_carroceria").textContent,
              ob_fabricante_chassi: el("ob_fabricante_chassi").textContent,
              ob_chassi: el("ob_chassi").textContent
            };
          }
        } else {
          //  ERRO DE VALIDAÇÃO
          isPlateValidated = false;
          
          let errorMsg = "";
          let subMsg = "Por segurança, os dados técnicos não serão exibidos.";
          
          if (String(apiResult.mensagem).includes("402")) {
            errorMsg = "🔴 API SEM SALDO";
            subMsg = "As consultas de validação de placa estão suspensas por falta de créditos na WDAPI.";
          } else if (String(apiResult.mensagem).includes("não pertence")) {
            errorMsg = `Este chassi (${chassiDigitado}) não pertence à placa (${p}).`;
          } else {
            errorMsg = `Não foi possível localizar os dígitos do chassi para a placa ${p} in fontes públicas.`;
          }

          if (verifEl) verifEl.innerHTML = `<span style="color:#e74c3c">${errorMsg}</span>`;
          
          if (obSec) obSec.style.display = "none";
          showReports("single", false);

          //  Exibir a mensagem formatada conforme as imagens do usuário
          el("errors").innerHTML = `<div class="error" style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 20px; border-radius: 8px; margin-top: 15px; font-weight: 600; text-align: center; width: 100%;">
            ${errorMsg}
            <br><small style="font-weight: normal; opacity: 0.8; margin-top: 5px; display: block;">${subMsg}</small>
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
    };

    if (btnSingle) btnSingle.addEventListener('click', runVIN);
    if (btnPlateSingle) btnPlateSingle.addEventListener('click', runPlate);
    if (vinInputSingle) vinInputSingle.addEventListener('keydown', e => e.key === "Enter" && runVIN());
    if (plateInputSingle) plateInputSingle.addEventListener('keydown', e => e.key === "Enter" && runPlate());

    // CORRIGIDO: usar addEventListener em vez de oninput para evitar sobrescrita
    if (vinInputSingle) {
      let vinTimeout;
      vinInputSingle.addEventListener('input', () => {
        const pos = vinInputSingle.selectionStart;
        const val = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
        vinInputSingle.value = val;
        vinInputSingle.setSelectionRange(pos, pos);
        
        // Se o campo de chassi tiver algo, libera o botão de decodificar
        // A trava de segurança só agirá dentro da função runVIN se houver placa
        if (btnSingle) btnSingle.disabled = val.length === 0;

        // Se o campo estiver vazio, limpar os resultados exibidos
        if (val.length === 0) {
          ["segments", "cards", "errors"].forEach(id => {
            const e = el(id);
            if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
          });
          showReports("single", false);
          const rt = el("resultTitle"); if (rt) rt.style.display = "none";
          const ob = el("secao-onibusbrasil"); if (ob) ob.style.display = "none";
          const verif = el("ob_verificacao"); if (verif) verif.innerHTML = "";
          window.currentSingleResult = null;
          return;
        }

        // REVALIDAÇÃO AUTOMÁTICA AO ALTERAR O CHASSI
        const plate = plateInputSingle ? plateInputSingle.value.trim() : "";
        if (plate.length >= 6) {
          clearTimeout(vinTimeout);
          const verifEl = el("ob_verificacao");
          if (verifEl) verifEl.innerHTML = `<span style="color:var(--muted); font-weight:normal">Validando alteração...</span>`;
          
          vinTimeout = setTimeout(() => {
            if (val.length === 17) {
              runPlate(); // Re-executa a validação completa se o VIN estiver completo
            } else {
              if (verifEl) verifEl.innerHTML = `<span style="color:#e74c3c">⚠ VIN incompleto para validação</span>`;
              const btnDecode = el("btnDecodeSingle");
              if (btnDecode) btnDecode.disabled = true;
            }
          }, 800); // Pequeno delay para não sobrecarregar enquanto digita
        }
      });
    }

    if (plateInputSingle) {
      let plateTimeout;
      plateInputSingle.addEventListener('input', () => {
        const pos = plateInputSingle.selectionStart;
        const val = plateInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
        plateInputSingle.value = val;
        plateInputSingle.setSelectionRange(pos, pos);
        if (btnPlateSingle) btnPlateSingle.disabled = val.length < 3;
        
        if (val.length === 0) {
          const obSec = el("secao-onibusbrasil");
          if (obSec) obSec.style.display = "none";
          const verif = el("ob_verificacao");
          if (verif) verif.innerHTML = "";
          return;
        }

        //  REVALIDAÇÃO AUTOMÁTICA AO ALTERAR A PLACA
        const vin = vinInputSingle ? vinInputSingle.value.trim() : "";
        if (vin.length === 17 && val.length >= 6) {
          clearTimeout(plateTimeout);
          plateTimeout = setTimeout(() => runPlate(), 800);
        }
      });
    }

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    const btnExportCSVSingle = el("btnExportCSVSingle");
    if (btnExportCSVSingle) {
      btnExportCSVSingle.onclick = () => {
        if (window.currentSingleResult) exportCSV([window.currentSingleResult], "Relatorio_Veiculo_" + window.currentSingleResult.vin);
      };
    }

    // GROUP MODE
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
      const v = gInput.value.trim(); const p = gPlateInput.value.trim();
      if (combined.checked) {
        const vl = v.split("\n").map(x => x.trim()).filter(Boolean);
        const pl = p.split("\n").map(x => x.trim()).filter(Boolean);
        gBtn.disabled = vl.length === 0 || vl.length !== pl.length || !vl.every(x => x.length === 17) || !pl.every(x => x.length >= 6);
      } else {
        gBtn.disabled = !v && !p;
      }
    };

    combined.addEventListener('change', validateGBtn);

    gBtn.onclick = async () => {
      const gResults = el("groupResults");
      if (!gResults) return;
      gResults.innerHTML = "";
      const vLines = gInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      const pLines = gPlateInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      
      // Salva no histórico de grupo
      addGroupHistoryEntry(gInput.value, gPlateInput.value);

      window.currentGroupResults = [];
      currentGroupPage = 1; // Resetar para a primeira página
      
      // Processamento em Lotes para não travar a UI
      const allItems = [];
      const totalItems = Math.max(vLines.length, pLines.length);
      for (let i = 0; i < totalItems; i++) {
        allItems.push({ vin: vLines[i] || "", plate: pLines[i] || "" });
      }

      const BATCH_SIZE = 10;
      let currentIndex = 0;

      // Mostrar mensagem de carregamento inicial
      gResults.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--accent);">⚙️ Processando frotas em lotes...</div>`;

      const processBatch = async () => {
        const batch = allItems.slice(currentIndex, currentIndex + BATCH_SIZE);
        
        if (batch.length === 0) {
          gResults.innerHTML = ""; // Limpa a mensagem de processamento
          showReports("group", true);
          renderGroupResults(); // Renderização final com paginação
          return;
        }

        const batchResults = [];
        const apiCalls = batch.map(pair => (async () => {
          const { vin, plate } = pair;
          const res = vin ? decoder.decode(vin) : { type: "UNKNOWN", tokens: [], manufacturerName: "Desconhecido" };
          
          const itemData = { 
            tipo: vin && plate ? 'COMBINADO' : (vin ? 'VIN' : 'PLATE'), 
            vin, 
            placa: plate, 
            fabricante: res.manufacturerName || "Desconhecido", 
            result: JSON.parse(JSON.stringify(res)), 
            ob: {},
            ob_data: {},
            status: 'pending'
          };
          
          window.currentGroupResults.push(itemData);

          if (vin && plate) {
            try {
              const apiResult = await consultarPlacaPHP(plate, vin);
              if (apiResult.status === "ok") {
                itemData.status = 'ok';
                
                if (plate) {
                   const obData = await window.buscarDadosOnibusBrasil(plate, false);
                   if (obData && !obData.erro) {
                     itemData.ob_data = obData;
                     itemData.ob = {
                        ob_carroceria: obData.carroceria || "—",
                        ob_encarrocadeira: obData.encarrocadeira || obData.encarrocadora || "—",
                        ob_fabricante_chassi: obData.fabricante_chassi || obData.fabricante || "—",
                        ob_chassi: obData.modelo_chassi || obData.chassi || "—"
                     };
                   }
                }
              } else {
                itemData.status = 'error';
                itemData.error_detail = apiResult.mensagem; 
              }
            } catch (e) { 
              itemData.status = 'error';
              console.error("Erro no par do grupo:", e); 
            }
          } else {
            itemData.status = 'orphan';
          }
        })());

        await Promise.all(apiCalls);
        
        currentIndex += BATCH_SIZE;
        
        // Atualiza apenas o contador de progresso, sem re-renderizar a lista toda
        gResults.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--accent);">⚙️ Processando frotas: ${Math.min(currentIndex, totalItems)} de ${totalItems}...</div>`;

        // Pausa curta para manter a UI responsiva
        await new Promise(resolve => setTimeout(resolve, 50)); 
        processBatch(); 
      };

      processBatch(); // Inicia o processamento
    };

    el("closeModal").onclick = () => el("detailModal").style.display = "none";

    const btnExportCSV = el("btnExportCSV");
    if (btnExportCSV) {
      btnExportCSV.onclick = () => {
        if (window.currentGroupResults) exportCSV(window.currentGroupResults, "Relatorio_Frota");
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