import { createDecoder } from "./decoder.js";

async function loadRules() {
  const res = await fetch("./data/manufacturers.json");
  return await res.json();
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
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

function showSkeletons(container, count = 4) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    container.appendChild(cardSkeleton());
  }
}

function toggleValueSkeletons(container, isLoading) {
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
      if (v.dataset.oldValue && v.textContent === "") {
        v.textContent = v.dataset.oldValue;
      }
    }
  });
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
  result.tokens.forEach(t => {
    c.appendChild(card(t.label, t.value));
  });
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

function addHistoryEntry(input, plateOverride = "") {
  const key = "decodevin.history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const pInput = el("plateInputSingle");
  const plate = plateOverride || (pInput ? pInput.value.trim().toUpperCase() : "");
  if (!input && !plate) return;
  const entry = { input, plate, ts: Date.now() };
  const newList = [entry, ...list.filter(x => x.input !== input || (input === "" && x.plate !== plate))].slice(0, 10);
  localStorage.setItem(key, JSON.stringify(newList));
  renderHistory();
}

function renderHistory() {
  const key = "decodevin.history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const h = el("history");
  if (!h) return;
  h.innerHTML = "";
  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item clickable";
    
    const v = document.createElement("div");
    v.style.flex = "1";
    v.textContent = item.input || "Placa: " + item.plate;
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
      currentList.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(currentList));
      renderHistory();
    };

    row.appendChild(v);
    row.appendChild(btnDelete);
    h.appendChild(row);
  });
}

const exportCSV = (data, name) => {
  const allKeys = new Set(["Tipo", "Chassi/VIN", "Placa", "Fabricante"]);
  data.forEach(item => {
    if (item.result && item.result.tokens) {
      item.result.tokens.forEach(t => allKeys.add(t.label));
    }
    if (item.ob) {
      Object.keys(item.ob).forEach(k => {
        const label = k.replace("ob_", "").replace(/_/g, " ").toUpperCase();
        allKeys.add(label);
      });
    }
  });
  const columns = Array.from(allKeys);
  let csv = "\ufeff" + columns.join(";") + "\n";
  data.forEach(item => {
    const row = columns.map(col => {
      if (col === "Tipo") return item.tipo || "";
      if (col === "Chassi/VIN") return item.vin || "";
      if (col === "Placa") return item.placa || "";
      if (col === "Fabricante") return item.fabricante || "";
      const token = item.result?.tokens?.find(t => t.label === col);
      if (token) return String(token.value).replace(/;/g, ",");
      if (item.ob) {
        const obKey = "ob_" + col.toLowerCase().replace(/ /g, "_");
        if (item.ob[obKey]) return String(item.ob[obKey]).replace(/;/g, ",");
      }
      return "";
    });
    csv += row.join(";") + "\n";
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name + ".csv"; link.click();
};

const generatePDF = (data, title, filename) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  doc.setFontSize(18);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 22);
  let startY = 30;
  data.forEach((item, index) => {
    if (index > 0) { doc.addPage(); startY = 20; }
    doc.setFontSize(14);
    doc.setTextColor(34, 197, 94);
    doc.text(`Veículo ${index + 1}: ${item.vin || item.placa || "N/A"}`, 14, startY);
    doc.setTextColor(0, 0, 0);
    const tableData = [
      ["Tipo", item.tipo || "—"],
      ["Chassi/VIN", item.vin || "—"],
      ["Placa", item.placa || "—"],
      ["Fabricante", item.fabricante || "—"]
    ];
    if (item.result?.tokens) {
      item.result.tokens.forEach(t => { tableData.push([t.label, String(t.value)]); });
    }
    if (item.ob) {
      Object.entries(item.ob).forEach(([k, v]) => {
        if (v && v !== "—") {
          const label = k.replace("ob_", "").replace(/_/g, " ").toUpperCase();
          tableData.push([label + " (OB)", String(v)]);
        }
      });
    }
    doc.autoTable({
      startY: startY + 5,
      head: [['Campo', 'Informação']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 14, right: 14 }
    });
    startY = doc.lastAutoTable.finalY + 10;
  });
  doc.save(filename + ".pdf");
};

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
      
      clearUI();
      
      if (screen) {
        screen.style.display = screen === selectionScreen ? "flex" : "block";
        // Forçar reflow para reiniciar a animação
        void screen.offsetWidth;
        screen.classList.add("screen-fade-in");
      }
    };

    el("optSingle").onclick = () => {
      showScreen(singleDecoder);
      if (vinInputSingle) setTimeout(() => vinInputSingle.focus(), 50);
    };
    el("optGroup").onclick = () => {
      showScreen(groupDecoder);
      if (gInput) setTimeout(() => gInput.focus(), 50);
    };
    el("backFromSingle").onclick = () => showScreen(selectionScreen);
    el("backFromGroup").onclick = () => showScreen(selectionScreen);

    const showReports = (mode, show) => {
      const id = mode === "single" ? "singleReportButtons" : "reportButtons";
      const e = el(id);
      if (e) e.style.display = show ? "flex" : "none";
    };

    const clearUI = () => {
      ["segments", "cards", "errors", "groupResults"].forEach(id => {
        const e = el(id);
        if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
      });
      showReports("single", false);
      showReports("group", false);
      const rt = el("resultTitle"); if (rt) rt.style.display = "none";
      const ob = el("secao-onibusbrasil"); if (ob) ob.style.display = "none";
      [vinInputSingle, plateInputSingle, gInput, gPlateInput].forEach(e => { if (e) e.value = ""; });
    };

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    const runVIN = async () => {
      if (!vinInputSingle) return;
      const text = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (text.length === 0) return;
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
      setSegments(result);
      setCards(result);
      setErrors(result);
      const rt = el("resultTitle");
      if (rt) rt.style.display = "block";
      showReports("single", true);
      window.currentSingleResult = {
        tipo: result.type,
        vin: text,
        placa: plateInputSingle ? plateInputSingle.value.trim().toUpperCase() : "",
        fabricante: result.manufacturerName || "Desconhecido",
        result: result,
        ob: {}
      };
      addHistoryEntry(text);

      if (text.length === 17) {
        try {
          const apiRes = await fetchWithTimeout(`https://decodevin-1.onrender.com/decode/${text}`);
          const apiData = await apiRes.json();
          if (apiData?.Results?.length > 0) {
            const ext = apiData.Results[0];
            const extFields = [
              { label: "Fabricante (API)", value: ext.Manufacturer },
              { label: "Modelo (API)", value: ext.Model },
              { label: "Ano Modelo (API)", value: ext.ModelYear },
              { label: "Tipo de Veículo", value: ext.VehicleType },
              { label: "País de Origem", value: ext.PlantCountry }
            ];
            extFields.forEach(f => {
              if (f.value && f.value !== "Not Applicable" && f.value !== "" && f.value !== "None") {
                el("cards").appendChild(card(f.label, f.value));
              }
            });
          }
        } catch (err) {
          console.error("Erro API Render:", err);
          const errorsDiv = el("errors");
          if (errorsDiv) {
            const warning = document.createElement("div");
            warning.className = "note";
            warning.style.color = "var(--muted)";
            warning.style.marginTop = "10px";
            warning.textContent = "Os dados extras da API externa estão indisponíveis no momento, mas a decodificação local funcionou.";
            errorsDiv.appendChild(warning);
          }
        }
      }
    };

    const runPlate = () => {
      if (!plateInputSingle) return;
      const p = plateInputSingle.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (p.length < 6 || p.length > 7) {
        el("errors").innerHTML = `<div class="error">A placa deve ter 6 ou 7 caracteres.</div>`;
        return;
      }
      el("errors").innerHTML = "";
      if (window.buscarDadosOnibusBrasil) {
        el("secao-onibusbrasil").style.display = "block";
        el("ob_status").textContent = "Buscando...";
        toggleValueSkeletons(el("ob_container"), true);
        showReports("single", true);
        window.buscarDadosOnibusBrasil(p).then(() => {
          toggleValueSkeletons(el("ob_container"), false);
          addHistoryEntry(vinInputSingle.value, p);
          if (!window.currentSingleResult) {
            window.currentSingleResult = { tipo: 'PLATE', placa: p, ob: {} };
          } else {
            window.currentSingleResult.placa = p;
          }
          window.currentSingleResult.ob = {
            ob_encarrocadeira: el("ob_encarrocadeira").textContent,
            ob_carroceria: el("ob_carroceria").textContent,
            ob_fabricante_chassi: el("ob_fabricante_chassi").textContent,
            ob_chassi: el("ob_chassi").textContent
          };
        });
      }
    };

    if (btnSingle) btnSingle.addEventListener('click', runVIN);
    if (btnPlateSingle) btnPlateSingle.addEventListener('click', runPlate);
    if (vinInputSingle) vinInputSingle.addEventListener('keydown', e => e.key === "Enter" && runVIN());
    if (plateInputSingle) plateInputSingle.addEventListener('keydown', e => e.key === "Enter" && runPlate());

    // CORRIGIDO: usar addEventListener em vez de oninput para evitar sobrescrita
    if (vinInputSingle) {
      vinInputSingle.addEventListener('input', () => {
        const pos = vinInputSingle.selectionStart;
        const val = vinInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
        vinInputSingle.value = val;
        vinInputSingle.setSelectionRange(pos, pos);
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
          window.currentSingleResult = null;
        }
      });
    }

    if (plateInputSingle) {
      plateInputSingle.addEventListener('input', () => {
        const pos = plateInputSingle.selectionStart;
        const val = plateInputSingle.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
        plateInputSingle.value = val;
        plateInputSingle.setSelectionRange(pos, pos);
        if (btnPlateSingle) btnPlateSingle.disabled = val.length < 3;
        if (val.length === 0) {
          const obSec = el("secao-onibusbrasil");
          if (obSec) obSec.style.display = "none";
        }
      });
    }

    if (btnSingle) btnSingle.disabled = true;
    if (btnPlateSingle) btnPlateSingle.disabled = true;

    el("btnExportCSVSingle").onclick = () => {
      if (!window.currentSingleResult) return;
      if (el("secao-onibusbrasil").style.display !== "none") {
        window.currentSingleResult.ob = {
          ob_encarrocadeira: el("ob_encarrocadeira").textContent,
          ob_carroceria: el("ob_carroceria").textContent,
          ob_fabricante_chassi: el("ob_fabricante_chassi").textContent,
          ob_chassi: el("ob_chassi").textContent
        };
      }
      exportCSV([window.currentSingleResult], "Relatorio_Individual_" + (window.currentSingleResult.vin || window.currentSingleResult.placa));
    };

    el("btnExportPDFSingle").onclick = () => {
      if (!window.currentSingleResult) return;
      if (el("secao-onibusbrasil").style.display !== "none") {
        window.currentSingleResult.ob = {
          ob_encarrocadeira: el("ob_encarrocadeira").textContent,
          ob_carroceria: el("ob_carroceria").textContent,
          ob_fabricante_chassi: el("ob_fabricante_chassi").textContent,
          ob_chassi: el("ob_chassi").textContent
        };
      }
      generatePDF([window.currentSingleResult], "Relatório DecodeVIN - Individual", "Relatorio_Individual_" + (window.currentSingleResult.vin || window.currentSingleResult.placa));
    };

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
      gResults.innerHTML = "";
      const isCombined = combined.checked;
      const vLines = gInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      const pLines = gPlateInput.value.split("\n").map(l => l.trim()).filter(Boolean);
      const currentGroupResults = [];
      const apiCalls = [];

      if (isCombined) {
        for (let i = 0; i < vLines.length; i++) {
          const vin = vLines[i].toUpperCase().replace(/[^A-Z0-9]/g, "");
          const plate = pLines[i].toUpperCase().replace(/[^A-Z0-9]/g, "");
          const res = decoder.decode(vin);
          const itemData = { tipo: 'COMBINADO', vin, placa: plate, fabricante: res.manufacturerName || "Desconhecido", result: JSON.parse(JSON.stringify(res)), ob: {} };
          currentGroupResults.push(itemData);
          const item = document.createElement("div"); item.className = "group-item";
          item.innerHTML = `<div class="code"><span style="color:var(--accent);font-size:10px;display:block">COMBINADO</span>${vin} / ${plate}</div>
                            <div class="info"><span>${res.manufacturerName || "Desconhecido"}</span><span style="color:var(--accent)">+ Placa</span></div>`;
          item.onclick = () => openModal(itemData.result, vin, false, plate, itemData);
          gResults.appendChild(item);
          addHistoryEntry(vin, plate);

          if (vin.length === 17) {
            apiCalls.push((async () => {
              try {
                const apiRes = await fetchWithTimeout(`https://decodevin-1.onrender.com/decode/${vin}`);
                const apiData = await apiRes.json();
                if (apiData?.Results?.length > 0) {
                  const ext = apiData.Results[0];
                  [{l:"Fabricante (API)",v:ext.Manufacturer},{l:"Modelo (API)",v:ext.Model},{l:"Ano Modelo (API)",v:ext.ModelYear}].forEach(f => {
                    if (f.v && f.v!=="Not Applicable" && f.v!=="" && f.v!=="None") {
                      if (!itemData.result.tokens.find(t => t.label === f.l)) {
                        itemData.result.tokens.push({ key: f.l.toLowerCase().replace(/ /g, "_"), label: f.l, value: f.v });
                      }
                    }
                  });
                }
              } catch (e) { console.error("Erro API Grupo (Combinado):", e); }
            })());
          }
        }
      } else {
        vLines.forEach(rawVin => {
          const vin = rawVin.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const res = decoder.decode(vin);
          const itemData = { tipo: 'VIN', vin, fabricante: res.manufacturerName || "Desconhecido", result: JSON.parse(JSON.stringify(res)), ob: {} };
          currentGroupResults.push(itemData);
          const item = document.createElement("div"); item.className = "group-item";
          item.innerHTML = `<div class="code"><span style="color:var(--muted);font-size:10px;display:block">CHASSI</span>${vin}</div>
                            <div class="info"><span>${res.manufacturerName || "Desconhecido"}</span></div>`;
          item.onclick = () => openModal(itemData.result, vin, false, null, itemData);
          gResults.appendChild(item);
          addHistoryEntry(vin);

          if (vin.length === 17) {
            apiCalls.push((async () => {
              try {
                const apiRes = await fetchWithTimeout(`https://decodevin-1.onrender.com/decode/${vin}`);
                const apiData = await apiRes.json();
                if (apiData?.Results?.length > 0) {
                  const ext = apiData.Results[0];
                  [{l:"Fabricante (API)",v:ext.Manufacturer},{l:"Modelo (API)",v:ext.Model},{l:"Ano Modelo (API)",v:ext.ModelYear}].forEach(f => {
                    if (f.v && f.v!=="Not Applicable" && f.v!=="" && f.v!=="None") {
                      if (!itemData.result.tokens.find(t => t.label === f.l)) {
                        itemData.result.tokens.push({ key: f.l.toLowerCase().replace(/ /g, "_"), label: f.l, value: f.v });
                      }
                    }
                  });
                }
              } catch (e) { console.error("Erro API Grupo (VIN):", e); }
            })());
          }
        });
        pLines.forEach(rawPlate => {
          const plate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const itemData = { tipo: 'PLATE', placa: plate, ob: {} };
          currentGroupResults.push(itemData);
          const item = document.createElement("div"); item.className = "group-item";
          item.innerHTML = `<div class="code"><span style="color:var(--accent);font-size:10px;display:block">PLACA</span>${plate}</div>
                            <div class="info"><span style="color:var(--accent)">Placa Detectada</span></div>`;
          item.onclick = () => openModal(null, plate, true, null, itemData);
          gResults.appendChild(item);
          addHistoryEntry("", plate);
        });
      }
      if (apiCalls.length > 0) await Promise.all(apiCalls);
      showReports("group", true);
      window.currentGroupResults = currentGroupResults;
    };

    // MODAL LOGIC — corrigido: não substitui document.getElementById
    const openModal = async (result, code, isPlate = false, linkedPlate = null, itemData = null) => {
      const mTitle = el("modalTitle");
      const mSegs = el("modalSegments");
      const mCards = el("modalCards");
      mTitle.textContent = linkedPlate ? `Análise Completa: ${code} + ${linkedPlate}` : (isPlate ? `Dados OB: ${code}` : `Detalhes: ${code}`);
      mSegs.innerHTML = ""; mCards.innerHTML = "";

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
        
        // Mostrar skeletons no modal
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
                // Se avisar que não encontrou ou erro, limpar skeletons
                if (v.includes("Aviso") || v.includes("Erro") || v.includes("sem ficha")) {
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
        window.buscarDadosOnibusBrasil(p, false, mockUI);
      };

      if (linkedPlate) {
        mSegs.innerHTML = `<div class="seg">${code}</div><div class="seg" style="background:var(--accent);color:black">${linkedPlate}</div>`;
        const c1 = document.createElement("div");
        c1.className = "cards";
        c1.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;";
        mCards.appendChild(c1);
        setCards(result, c1);
        const h = document.createElement("h3"); h.textContent = "🚌 Dados Carroceria"; h.style.gridColumn = "1/-1"; mCards.appendChild(h);
        injectOB(linkedPlate, mCards);
      } else if (isPlate) {
        mSegs.innerHTML = `<div class="seg">${code}</div>`;
        injectOB(code, mCards);
      } else {
        setSegments(result, mSegs);
        setCards(result, mCards);
      }

      if (!isPlate && code.length === 17) {
        try {
          const apiRes = await fetchWithTimeout(`https://decodevin-1.onrender.com/decode/${code}`);
          const apiData = await apiRes.json();
          if (apiData?.Results?.length > 0) {
            const ext = apiData.Results[0];
            [{l:"Fabricante (API)",v:ext.Manufacturer},{l:"Modelo (API)",v:ext.Model},{l:"Ano Modelo (API)",v:ext.ModelYear},{l:"Tipo de Veículo",v:ext.VehicleType},{l:"País de Origem",v:ext.PlantCountry}].forEach(f => {
              if (f.v && f.v!=="Not Applicable" && f.v!=="") mCards.appendChild(card(f.l, f.v));
            });
          }
        } catch (e) {
          console.error("Erro API Modal:", e);
          const warn = document.createElement("div");
          warn.className = "note";
          warn.style.color = "var(--muted)";
          warn.style.marginTop = "10px";
          warn.style.textAlign = "center";
          warn.style.gridColumn = "1/-1";
          warn.textContent = "Os dados extras da API externa estão indisponíveis no momento, mas a decodificação local funcionou.";
          mCards.appendChild(warn);
        }
      }

      el("detailModal").style.display = "flex";
    };

    el("closeModal").onclick = () => el("detailModal").style.display = "none";

    el("btnExportCSV").onclick = () => exportCSV(window.currentGroupResults || [], "Relatorio_Grupo");
    el("btnExportPDF").onclick = () => {
      if (!window.currentGroupResults) return;
      generatePDF(window.currentGroupResults, "Relatório DecodeVIN - Grupo", "Relatorio_Grupo");
    };

    renderHistory();

    // TOUR GUIDED LOGIC
    let tourStep = 0;
    const tourSteps = [
      {
        id: "optSingle",
        title: "Consulta Individual",
        text: "Aqui você pode decodificar um único chassi ou buscar informações por placa.",
        pos: "bottom"
      },
      {
        id: "optGroup",
        title: "Consulta em Grupo",
        text: "Processa múltiplos chassis ou placas de uma vez. Ideal para frotas!",
        pos: "bottom"
      },
      {
        id: "history",
        title: "Histórico Local",
        text: "Suas últimas consultas ficam salvas aqui para acesso rápido.",
        pos: "top"
      },
      {
        id: "helpFab",
        title: "Dúvidas?",
        text: "Sempre que precisar, clique aqui para rever este tour de ajuda.",
        pos: "left"
      }
    ];

    const showTourStep = () => {
      const step = tourSteps[tourStep];
      const target = el(step.id);
      const tourCard = el("tourCard");
      const tourOverlay = el("tourOverlay");

      // Limpar destaques anteriores
      document.querySelectorAll(".tour-highlight").forEach(e => e.classList.remove("tour-highlight"));

      if (!step || !target) {
        endTour();
        return;
      }

      tourOverlay.style.display = "block";
      tourCard.style.display = "block";
      target.classList.add("tour-highlight");

      el("tourTitle").textContent = step.title;
      el("tourText").textContent = step.text;
      el("tourNext").textContent = tourStep === tourSteps.length - 1 ? "Finalizar" : "Próximo";

      const rect = target.getBoundingClientRect();
      const cardRect = tourCard.getBoundingClientRect();

      let top, left;
      if (step.pos === "bottom") {
        top = rect.bottom + 15;
        left = rect.left + (rect.width / 2) - (cardRect.width / 2);
      } else if (step.pos === "top") {
        top = rect.top - cardRect.height - 15;
        left = rect.left + (rect.width / 2) - (cardRect.width / 2);
      } else if (step.pos === "left") {
        top = rect.top + (rect.height / 2) - (cardRect.height / 2);
        left = rect.left - cardRect.width - 15;
      }

      // Ajustes de borda da tela
      left = Math.max(10, Math.min(left, window.innerWidth - cardRect.width - 10));
      top = Math.max(10, Math.min(top, window.innerHeight - cardRect.height - 10));

      tourCard.style.top = `${top}px`;
      tourCard.style.left = `${left}px`;
    };

    const endTour = () => {
      el("tourOverlay").style.display = "none";
      el("tourCard").style.display = "none";
      document.querySelectorAll(".tour-highlight").forEach(e => e.classList.remove("tour-highlight"));
      localStorage.setItem("decodevin_tour_seen", "true");
    };

    el("tourNext").onclick = () => {
      tourStep++;
      if (tourStep < tourSteps.length) {
        showTourStep();
      } else {
        endTour();
      }
    };

    el("tourSkip").onclick = endTour;
    el("helpFab").onclick = () => {
      tourStep = 0;
      showTourStep();
    };

    // Auto-start tour for new users
    if (!localStorage.getItem("decodevin_tour_seen")) {
      setTimeout(showTourStep, 1000);
    }

    // SCANNER LOGIC
    let html5QrCode = null;

    const startScanner = async () => {
      const scannerModal = el("scannerModal");
      scannerModal.style.display = "flex";
      
      html5QrCode = new Html5Qrcode("reader");
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      try {
        await html5QrCode.start(
          { facingMode: "environment" }, 
          config,
          (decodedText) => {
            // Sucesso na leitura
            if (vinInputSingle) {
              const cleaned = decodedText.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
              vinInputSingle.value = cleaned;
              // Disparar evento input para atualizar botão
              vinInputSingle.dispatchEvent(new Event('input'));
              stopScanner();
            }
          },
          (errorMessage) => {
            // Erro de leitura (ignorar logs constantes)
          }
        );
      } catch (err) {
        console.error("Erro ao iniciar câmera:", err);
        alert("Não foi possível acessar a câmera. Verifique as permissões.");
        stopScanner();
      }
    };

    const stopScanner = async () => {
      if (html5QrCode) {
        try {
          await html5QrCode.stop();
          html5QrCode = null;
        } catch (err) {
          console.error("Erro ao parar scanner:", err);
        }
      }
      el("scannerModal").style.display = "none";
    };

    el("btnScanVIN").onclick = startScanner;
    el("closeScanner").onclick = stopScanner;

  } catch (err) {
    console.error("Erro fatal na inicialização:", err);
    const errs = el("errors");
    if (errs) errs.innerHTML = `<div class="error">Erro ao carregar sistema: ${err.message}</div>`;
  }
}

main().catch(console.error);