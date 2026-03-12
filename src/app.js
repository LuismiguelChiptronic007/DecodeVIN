import { createDecoder } from "./decoder.js";

async function loadRules() {
  const res = await fetch("./data/manufacturers.json");
  return await res.json();
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
  "CARROCERIA": "Modelo da estrutura montada sobre o chassi.",
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

function setSegments(result) {
  const container = el("segments");
  if (!container) return;
  container.innerHTML = "";
  container.style.display = "none";
  if (result.type === "UNKNOWN") return;
  
  // Se for VIN (17 caracteres), sempre mostramos WMI, VDS, VIS
  if (result.input && result.input.replace(/[^A-Z0-9]/g, "").length === 17) {
    const v = result.input.replace(/[^A-Z0-9]/g, "").toUpperCase();
    const wmi = document.createElement("div"); wmi.className = "seg"; wmi.textContent = v.slice(0, 3);
    const vds = document.createElement("div"); vds.className = "seg"; vds.textContent = v.slice(3, 9);
    const vis = document.createElement("div"); vis.className = "seg"; vis.textContent = v.slice(9);
    container.appendChild(wmi); container.appendChild(vds); container.appendChild(vis);
    container.style.display = "flex";
  } 
  // Caso contrário, se for MODEL (código comercial curto), mostramos os segmentos do modelo
  else if (result.type === "MODEL") {
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

function setCards(result, targetContainer = null) {
  const c = targetContainer || el("cards");
  if (!c) return;
  c.innerHTML = "";
  if (result.type === "UNKNOWN") return;
  
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
  const plate = plateOverride || (el("plateInput") ? el("plateInput").value.trim().toUpperCase() : "");
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
  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "item clickable";
    const v = document.createElement("div");
    v.textContent = item.input || "Placa: " + item.plate;
    if (item.input && item.plate) {
      const p = document.createElement("span");
      p.style.fontSize = "12px"; p.style.color = "var(--accent)"; p.style.marginLeft = "8px";
      p.textContent = `[${item.plate}]`;
      v.appendChild(p);
    }
    row.onclick = () => {
      if (item.input) {
        el("input").value = item.input;
        el("btn").disabled = false;
        el("btn").click();
      }
      if (item.plate) {
        el("plateInput").value = item.plate;
        el("btnPlate").disabled = false;
        el("btnPlate").click();
      }
    };
    row.appendChild(v);
    h.appendChild(row);
  });
}

const exportCSV = (data, name) => {
  // Coletar todas as chaves possíveis para as colunas
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
      
      // Buscar nos tokens do decoder
      const token = item.result?.tokens?.find(t => t.label === col);
      if (token) return String(token.value).replace(/;/g, ",");

      // Buscar nos dados do Ônibus Brasil
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
    // Adicionar nova página se não for o primeiro item
    if (index > 0) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(34, 197, 94); // Cor verde acento
    doc.text(`Veículo ${index + 1}: ${item.vin || item.placa || "N/A"}`, 14, startY);
    doc.setTextColor(0, 0, 0);
    
    const tableData = [
      ["Tipo", item.tipo || "—"],
      ["Chassi/VIN", item.vin || "—"],
      ["Placa", item.placa || "—"],
      ["Fabricante", item.fabricante || "—"]
    ];

    // Adicionar tokens do decodificador
    if (item.result?.tokens) {
      item.result.tokens.forEach(t => {
        tableData.push([t.label, String(t.value)]);
      });
    }

    // Adicionar dados do Ônibus Brasil
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
  try {
    console.log("Iniciando DecodeVIN...");
    const rules = await loadRules();
    console.log("Regras carregadas:", rules ? "Sim" : "Não");
    const decoder = createDecoder(rules);
    
    // ... restante do código do main será preservado ...

  const selectionScreen = el("selectionScreen");
  const singleDecoder = el("singleDecoder");
  const groupDecoder = el("groupDecoder");
  
  const showScreen = (screen) => {
    [selectionScreen, singleDecoder, groupDecoder].forEach(s => s.style.display = "none");
    clearUI();
    screen.style.display = screen === selectionScreen ? "flex" : "block";
  };

  el("optSingle").onclick = () => showScreen(singleDecoder);
  el("optGroup").onclick = () => showScreen(groupDecoder);
  el("backFromSingle").onclick = () => showScreen(selectionScreen);
  el("backFromGroup").onclick = () => showScreen(selectionScreen);

  const showReports = (mode, show) => {
    const id = mode === "single" ? "singleReportButtons" : "reportButtons";
    const e = el(id);
    if (e) {
      e.style.display = show ? "flex" : "none";
      console.log(`Reports ${mode}: ${show ? "SHOW" : "HIDE"}`);
    }
  };

  const clearUI = () => {
    ["segments", "cards", "errors", "groupResults"].forEach(id => {
      const e = el(id); if (e) { e.innerHTML = ""; if (id === "segments") e.style.display = "none"; }
    });
    showReports("single", false);
    showReports("group", false);
    const rt = el("resultTitle"); if (rt) rt.style.display = "none";
    const ob = el("secao-onibusbrasil"); if (ob) ob.style.display = "none";
    ["input", "plateInput", "groupInput", "groupPlateInput"].forEach(id => { const e = el(id); if (e) e.value = ""; });
  };

  // SINGLE MODE
  const input = el("input");
  const btn = el("btn");
  const plateInput = el("plateInput");
  const btnPlate = el("btnPlate");
  
  btn.disabled = true;
  btnPlate.disabled = true;

  const runVIN = async () => {
    const text = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (text.length !== 17) {
      el("errors").innerHTML = `<div class="error">O Chassi deve ter exatamente 17 caracteres.</div>`;
      return;
    }
    const result = decoder.decode(text);
    
    // Forçar exibição de segmentos para VINs de 17 caracteres mesmo que desconhecidos
    if (result.type === "UNKNOWN" && text.length === 17) {
      result.type = "VIN";
      result.input = text;
      // Adicionar WMI se possível
      const wmi = text.slice(0, 3);
      result.tokens = [{ key: "wmi", label: "WMI", value: wmi }];
    }

    setSegments(result);
    setCards(result);
    setErrors(result);
    
    const rt = el("resultTitle");
    if (rt) rt.style.display = result.type === "UNKNOWN" ? "none" : "block";
    showReports("single", true);
    
    if (result.type !== "UNKNOWN") {
      addHistoryEntry(text);
      window.currentSingleResult = {
        tipo: result.type,
        vin: text,
        fabricante: result.manufacturerName,
        result: result,
        ob: {} // Será preenchido se houver busca de placa
      };
    }

    // Chamada para a API externa (Render) para dados estendidos
    try {
      console.log("Chamando API Render para VIN:", text);
      const apiRes = await fetch(`https://decodevin-1.onrender.com/decode/${text}`);
      const apiData = await apiRes.json();
      
      if (apiData && apiData.Results && apiData.Results.length > 0) {
        const ext = apiData.Results[0];
        console.log("Dados da API Render recebidos:", ext);
        
        // Mapear campos relevantes da NHTSA para cards
        const extFields = [
          { label: "Fabricante (API)", value: ext.Manufacturer },
          { label: "Modelo (API)", value: ext.Model },
          { label: "Ano Modelo (API)", value: ext.ModelYear },
          { label: "Tipo de Veículo", value: ext.VehicleType },
          { label: "País de Origem", value: ext.PlantCountry },
          { label: "Série", value: ext.Series }
        ];

        // Adicionar apenas campos que tenham valor
        const cardsContainer = el("cards");
        extFields.forEach(f => {
          if (f.value && f.value !== "Not Applicable" && f.value !== "") {
            cardsContainer.appendChild(card(f.label, f.value));
            // Também adicionar ao currentSingleResult para relatórios
            if (window.currentSingleResult && window.currentSingleResult.result) {
              window.currentSingleResult.result.tokens.push({ key: f.label.toLowerCase().replace(/ /g, "_"), label: f.label, value: f.value });
            }
          }
        });
      }
    } catch (err) {
      console.error("Erro ao chamar API Render:", err);
    }
  };

  const runPlate = () => {
    const p = plateInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (p.length < 6 || p.length > 7) {
      el("errors").innerHTML = `<div class="error">A placa deve ter 6 ou 7 caracteres.</div>`;
      return;
    }
    if (window.buscarDadosOnibusBrasil) {
      el("secao-onibusbrasil").style.display = "block";
      el("ob_status").textContent = "Buscando...";
      showReports("single", true);
      window.buscarDadosOnibusBrasil(p).then(() => {
        addHistoryEntry(input.value, p);
        
        // Atualizar os dados do Ônibus Brasil no resultado atual para o relatório
        if (!window.currentSingleResult) {
          window.currentSingleResult = { tipo: 'PLATE', placa: p, ob: {} };
        }
        window.currentSingleResult.placa = p;
        window.currentSingleResult.ob = {
          ob_encarrocadeira: el("ob_encarrocadeira").textContent,
          ob_carroceria: el("ob_carroceria").textContent,
          ob_fabricante_chassi: el("ob_fabricante_chassi").textContent,
          ob_chassi: el("ob_chassi").textContent
        };
      });
    }
  };

  btn.onclick = runVIN;
  btnPlate.onclick = runPlate;
  input.onkeydown = e => e.key === "Enter" && runVIN();
  plateInput.onkeydown = e => e.key === "Enter" && runPlate();
  
  input.oninput = () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    btn.disabled = input.value.length !== 17;
    console.log("Input changed:", input.value.length);
  };
  
  plateInput.oninput = () => {
    plateInput.value = plateInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    btnPlate.disabled = plateInput.value.length < 6;
    if (plateInput.value.length === 0) el("secao-onibusbrasil").style.display = "none";
    console.log("Plate changed:", plateInput.value.length);
  };

  // Forçar estado inicial
  input.oninput();
  plateInput.oninput();

  // Botão Limpar (Single Mode)
  const btnClear = el("btnClearHistory");
  if (btnClear) {
    btnClear.textContent = "Limpar";
    btnClear.onclick = () => {
      input.value = "";
      plateInput.value = "";
      btn.disabled = true;
      btnPlate.disabled = true;
      ["segments", "cards", "errors"].forEach(id => {
        const e = el(id); if (e) { e.innerHTML = ""; e.style.display = "none"; }
      });
      showReports("single", false);
      const rt = el("resultTitle"); if (rt) rt.style.display = "none";
      const ob = el("secao-onibusbrasil"); if (ob) ob.style.display = "none";
    };
  }

  // EXPORT SINGLE
  el("btnExportCSVSingle").onclick = () => {
    if (!window.currentSingleResult) return;
    // Atualizar dados OB antes de exportar
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
    // Atualizar dados OB antes de exportar
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
  const gInput = el("groupInput");
  const gPlateInput = el("groupPlateInput");
  const combined = el("combinedMode");
  const gBtn = el("btnGroupDecode");
  const gResults = el("groupResults");

  // Auto-quebra de linha no Modo Grupo
  gInput.oninput = () => {
    const lines = gInput.value.split("\n");
    const lastLine = lines[lines.length - 1];
    if (lastLine.length >= 17) {
      gInput.value += "\n";
    }
    validateGBtn();
  };

  gPlateInput.oninput = () => {
    const lines = gPlateInput.value.split("\n");
    const lastLine = lines[lines.length - 1];
    if (lastLine.length >= 7) {
      gPlateInput.value += "\n";
    }
    validateGBtn();
  };

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

  combined.onchange = validateGBtn;

  // Botão Limpar (Group Mode)
  const btnClearGroup = el("btnClearHistoryGroup");
  if (btnClearGroup) {
    btnClearGroup.textContent = "Limpar";
    btnClearGroup.onclick = () => {
      gInput.value = "";
      gPlateInput.value = "";
      gResults.innerHTML = "";
      showReports("group", false);
      validateGBtn();
    };
  }

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
        
        const itemData = { tipo: 'COMBINADO', vin, placa: plate, fabricante: res.manufacturerName, result: res };
        currentGroupResults.push(itemData);
        
        const item = document.createElement("div"); item.className = "group-item";
        item.innerHTML = `<div class="code"><span style="color:var(--accent);font-size:10px;display:block">COMBINADO</span>${vin} / ${plate}</div>
                          <div class="info"><span>${res.manufacturerName || "Desconhecido"}</span><span style="color:var(--accent)">+ Placa</span></div>`;
        item.onclick = () => openModal(res, vin, false, plate);
        gResults.appendChild(item);
        addHistoryEntry(vin, plate);

        // Preparar chamada API
        if (vin.length === 17) {
          apiCalls.push((async () => {
            try {
              const apiRes = await fetch(`https://decodevin-1.onrender.com/decode/${vin}`);
              const apiData = await apiRes.json();
              if (apiData && apiData.Results && apiData.Results.length > 0) {
                const ext = apiData.Results[0];
                const extFields = [
                  { label: "Fabricante (API)", value: ext.Manufacturer },
                  { label: "Modelo (API)", value: ext.Model },
                  { label: "Ano Modelo (API)", value: ext.ModelYear }
                ];
                extFields.forEach(f => {
                  if (f.value && f.value !== "Not Applicable" && f.value !== "") {
                    itemData.result.tokens.push({ key: f.label.toLowerCase().replace(/ /g, "_"), label: f.label, value: f.value });
                  }
                });
              }
            } catch (e) { console.error("Erro API Grupo:", e); }
          })());
        }
      }
    } else {
      vLines.forEach(rawVin => {
        const vin = rawVin.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const res = decoder.decode(vin);
        const itemData = { tipo: 'VIN', vin, fabricante: res.manufacturerName, result: res };
        currentGroupResults.push(itemData);

        const item = document.createElement("div"); item.className = "group-item";
        item.innerHTML = `<div class="code"><span style="color:var(--muted);font-size:10px;display:block">CHASSI</span>${vin}</div>
                          <div class="info"><span>${res.manufacturerName || "Desconhecido"}</span></div>`;
        item.onclick = () => openModal(res, vin);
        gResults.appendChild(item);
        addHistoryEntry(vin);

        if (vin.length === 17) {
          apiCalls.push((async () => {
            try {
              const apiRes = await fetch(`https://decodevin-1.onrender.com/decode/${vin}`);
              const apiData = await apiRes.json();
              if (apiData && apiData.Results && apiData.Results.length > 0) {
                const ext = apiData.Results[0];
                const extFields = [
                  { label: "Fabricante (API)", value: ext.Manufacturer },
                  { label: "Modelo (API)", value: ext.Model },
                  { label: "Ano Modelo (API)", value: ext.ModelYear }
                ];
                extFields.forEach(f => {
                  if (f.value && f.value !== "Not Applicable" && f.value !== "") {
                    itemData.result.tokens.push({ key: f.label.toLowerCase().replace(/ /g, "_"), label: f.label, value: f.value });
                  }
                });
              }
            } catch (e) { console.error("Erro API Grupo:", e); }
          })());
        }
      });
      pLines.forEach(rawPlate => {
        const plate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const item = document.createElement("div"); item.className = "group-item";
        item.innerHTML = `<div class="code"><span style="color:var(--accent);font-size:10px;display:block">PLACA</span>${plate}</div>
                          <div class="info"><span style="color:var(--accent)">Placa Detectada</span></div>`;
        item.onclick = () => openModal(null, plate, true);
        gResults.appendChild(item);
        addHistoryEntry("", plate);
        currentGroupResults.push({ tipo: 'PLATE', placa: plate });
      });
    }
    
    // Aguardar todas as chamadas de API antes de liberar relatórios (opcional, mas bom para os dados)
    if (apiCalls.length > 0) await Promise.all(apiCalls);
    
    showReports("group", true);
    window.currentGroupResults = currentGroupResults;
  };

  // MODAL LOGIC
  const openModal = async (result, code, isPlate = false, linkedPlate = null) => {
    const mTitle = el("modalTitle"); const mSegs = el("modalSegments"); const mCards = el("modalCards");
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
      obCards.className = "cards"; // Usa o grid padrão do sistema
      obWrapper.appendChild(obCards);

      const mediaBox = document.createElement("div");
      mediaBox.style.display = "flex";
      mediaBox.style.flexDirection = "column";
      mediaBox.style.alignItems = "center";
      mediaBox.style.gap = "16px";
      mediaBox.style.marginTop = "20px";
      obWrapper.appendChild(mediaBox);
      
      const oldGet = document.getElementById;
      const fake = {
        "secao-onibusbrasil": { style: { display: "block" } },
        "ob_status": { 
          get textContent() { return statusDiv.textContent; },
          set textContent(v) { statusDiv.textContent = v; }, 
          style: { set color(c) { statusDiv.style.color = c; } } 
        },
        "ob_encarrocadeira": { 
          set textContent(v) { if(v && v!=="—") obCards.appendChild(card("Encarroçadora", v)); } 
        },
        "ob_carroceria": { 
          set textContent(v) { if(v && v!=="—") obCards.appendChild(card("Carroceria", v)); } 
        },
        "ob_fabricante_chassi": { 
          set textContent(v) { if(v && v!=="—") obCards.appendChild(card("Fabricante Chassi", v)); } 
        },
        "ob_chassi": { 
          set textContent(v) { if(v && v!=="—") obCards.appendChild(card("Modelo Chassi", v)); } 
        },
        "ob_foto": { 
          set src(v) { 
            if(v) { 
              const i=document.createElement("img"); i.src=v; 
              i.style.width="100%"; i.style.maxWidth="600px";
              i.style.borderRadius="12px"; i.style.boxShadow="var(--shadow)";
              i.style.border="1px solid var(--border)";
              mediaBox.prepend(i);
            } 
          }, 
          style: { set display(v) {} } 
        },
        "ob_fonte": { 
          set href(v) { 
            if(v) { 
              const a=document.createElement("a"); a.href=v; a.target="_blank"; 
              a.textContent="🔗 Ficha Completa no Ônibus Brasil"; 
              a.style.display="inline-block"; a.style.padding="12px 24px";
              a.style.borderRadius="8px"; a.style.background="rgba(56,189,248,0.1)";
              a.style.border="1px solid var(--accent-2)"; a.style.color="var(--accent-2)";
              a.style.fontSize="14px"; a.style.fontWeight="600"; a.style.transition="all 0.2s";
              a.onmouseover = () => { a.style.background="var(--accent-2)"; a.style.color="var(--bg)"; };
              a.onmouseout = () => { a.style.background="rgba(56,189,248,0.1)"; a.style.color="var(--accent-2)"; };
              mediaBox.appendChild(a); 
            } 
          }, 
          style: { set display(v) {} } 
        },
        "singleReportButtons": { style: { set display(v) {} } }
      };

      document.getElementById = (id) => fake[id] || oldGet.call(document, id);
      window.buscarDadosOnibusBrasil(p).then(() => { document.getElementById = oldGet; });
    };

    if (linkedPlate) {
      mSegs.innerHTML = `<div class="seg">${code}</div><div class="seg" style="background:var(--accent);color:black">${linkedPlate}</div>`;
      const c1 = document.createElement("div"); c1.className="cards"; c1.style.display="grid"; c1.style.gridTemplateColumns="repeat(auto-fill,minmax(200px,1fr))"; c1.style.gap="15px";
      mCards.appendChild(c1);
      setCards(result, c1);
      const h = document.createElement("h3"); h.textContent="🚌 Dados Carroceria"; h.style.gridColumn="1/-1"; mCards.appendChild(h);
      injectOB(linkedPlate, mCards);
    } else if (isPlate) {
      mSegs.innerHTML = `<div class="seg">${code}</div>`;
      injectOB(code, mCards);
    } else {
      const oldGet = document.getElementById;
      document.getElementById = (id) => id==="segments"?mSegs : (id==="cards"?mCards : oldGet.call(document,id));
      setSegments(result); setCards(result);
      document.getElementById = oldGet;
    }

    // Chamada para a API externa (Render) para o Modal
    if (!isPlate && code.length === 17) {
      try {
        const apiRes = await fetch(`https://decodevin-1.onrender.com/decode/${code}`);
        const apiData = await apiRes.json();
        if (apiData && apiData.Results && apiData.Results.length > 0) {
          const ext = apiData.Results[0];
          const extFields = [
            { label: "Fabricante (API)", value: ext.Manufacturer },
            { label: "Modelo (API)", value: ext.Model },
            { label: "Ano Modelo (API)", value: ext.ModelYear },
            { label: "Tipo de Veículo", value: ext.VehicleType },
            { label: "País de Origem", value: ext.PlantCountry }
          ];
          extFields.forEach(f => {
            if (f.value && f.value !== "Not Applicable" && f.value !== "") {
              mCards.appendChild(card(f.label, f.value));
            }
          });
        }
      } catch (err) {
        console.error("Erro ao chamar API Render no Modal:", err);
      }
    }

    el("detailModal").style.display = "flex";
  };

  el("closeModal").onclick = () => el("detailModal").style.display = "none";

  // Eventos de Exportação Grupo
  el("btnExportCSV").onclick = () => exportCSV(window.currentGroupResults || [], "Relatorio_Grupo");
  el("btnExportPDF").onclick = () => {
    if (!window.currentGroupResults) return;
    generatePDF(window.currentGroupResults, "Relatório DecodeVIN - Grupo", "Relatorio_Grupo");
  };

  renderHistory();
  } catch (err) {
    console.error("Erro fatal na inicialização:", err);
    const errs = el("errors");
    if (errs) errs.innerHTML = `<div class="error">Erro ao carregar sistema: ${err.message}</div>`;
  }
}

main().catch(console.error);
