
 
// Identifica se a célula lida do Excel contém placa ou chassi válido.
function detectarTipo(valor) { 
  if (!valor) return null;
  const v = String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); 

  const regexChassi = /^[A-HJ-NPR-Z0-9]{17}$/;

  const regexPlaca = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

  if (regexChassi.test(v)) return { tipo: 'chassi', valor: v }; 
  if (regexPlaca.test(v)) return { tipo: 'placa', valor: v }; 
  
  return null; 
} 

// Extrai placa e chassi mesmo quando o dado está misturado em frases.
function extrairTiposDaCelula(valor) {
  if (valor === null || valor === undefined) return [];
  const bruto = String(valor).toUpperCase();
  const limpo = bruto.replace(/[^A-Z0-9]/g, "");
  const achados = [];
  const vistos = new Set();

  const add = (tipo, v) => {
    const key = `${tipo}:${v}`;
    if (!vistos.has(key)) {
      vistos.add(key);
      achados.push({ tipo, valor: v });
    }
  };

  const direto = detectarTipo(limpo);
  if (direto) add(direto.tipo, direto.valor);

  const placas = bruto.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/g) || [];
  placas.forEach(p => add("placa", p.replace(/[^A-Z0-9]/g, "")));

  const chassis = bruto.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];
  chassis.forEach(c => add("chassi", c.replace(/[^A-Z0-9]/g, "")));

  return achados;
}

// Calcula o menor range real da aba ignorando células vazias/fantasma.
function getRealRange(ws) {
  let minR = Infinity, maxR = -Infinity;
  let minC = Infinity, maxC = -Infinity;

  Object.keys(ws).forEach((key) => {
    if (key.startsWith("!")) return;
    const cell = ws[key];
    if (!cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === "") return;
    const addr = XLSX.utils.decode_cell(key);
    minR = Math.min(minR, addr.r);
    maxR = Math.max(maxR, addr.r);
    minC = Math.min(minC, addr.c);
    maxC = Math.max(maxC, addr.c);
  });

  if (minR === Infinity) return null;
  return XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC }
  });
}

// Remove pares duplicados e também entradas isoladas repetidas de placa/chassi.
function deduplicarPares(pares) {
  const vistosPar = new Set();
  const vistosPlaca = new Set();
  const vistosChassi = new Set();
  const saida = [];

  for (let i = 0; i < pares.length; i++) {
    const placa = String(pares[i]?.placa || "").trim().toUpperCase();
    const chassi = String(pares[i]?.chassi || "").trim().toUpperCase();
    if (!placa && !chassi) continue;

    if (placa && chassi) {
      const keyPar = `${placa}|${chassi}`;
      if (vistosPar.has(keyPar)) continue;
      vistosPar.add(keyPar);
      vistosPlaca.add(placa);
      vistosChassi.add(chassi);
      saida.push({ placa, chassi });
      continue;
    }

    if (placa) {
      if (vistosPlaca.has(placa)) continue;
      vistosPlaca.add(placa);
      saida.push({ placa, chassi: "" });
      continue;
    }

    if (chassi) {
      if (vistosChassi.has(chassi)) continue;
      vistosChassi.add(chassi);
      saida.push({ placa: "", chassi });
    }
  }

  return saida;
}

// Lê a planilha e aplica os dados no modo grupo ou no modo único.
function lerExcelEPopularGrupo(file, targetMode = "group") { 
  const processarResultado = (paresLimpos) => {
    paresLimpos = deduplicarPares(paresLimpos);

    if (paresLimpos.length === 0) {
      if (window.showToast) {
        window.showToast("Não encontrei placa/chassi na planilha. Verifique se os dados estão no formato esperado.", "error");
      } else {
        alert("Não encontrei placa/chassi na planilha. Verifique se os dados estão no formato esperado.");
      }
      return;
    }

    if (targetMode === "single") {
      const vinInput = document.getElementById("vinInputSingle");
      const plateInput = document.getElementById("plateInputSingle");
      if (!vinInput || !plateInput) {
        if (window.showToast) window.showToast("Navegue para a tela de Consulta Única antes de importar.", "error");
        else alert("Navegue para a tela de Consulta Única antes de importar.");
        return;
      }

      const melhorPar = paresLimpos.find(p => p.placa && p.chassi) || paresLimpos[0];
      vinInput.value = (melhorPar?.chassi || "").trim();
      plateInput.value = (melhorPar?.placa || "").trim();
      vinInput.dispatchEvent(new Event("input"));
      plateInput.dispatchEvent(new Event("input"));

      if (window.showToast) {
        window.showToast("Excel importado na consulta única. Clique em Buscar Placa ou Decodificar.");
      } else {
        alert("Excel importado na consulta única. Clique em Buscar Placa ou Decodificar.");
      }
      return;
    }

    const gInput      = document.getElementById('groupInput'); 
    const gPlateInput = document.getElementById('groupPlateInput'); 
    const combined    = document.getElementById('combinedMode'); 
    const gBtn        = document.getElementById('btnGroupDecode'); 

    if (!gInput || !gPlateInput) { 
      if (window.showToast) {
        window.showToast('Navegue para a tela de Consulta em Grupo antes de importar.', 'error');
      } else {
        alert('Navegue para a tela de Consulta em Grupo antes de importar.'); 
      }
      return; 
    } 

    gInput.value      = paresLimpos.map(p => p.chassi).join('\n').trim(); 
    gPlateInput.value = paresLimpos.map(p => p.placa).join('\n').trim(); 

    if (combined) {
      combined.checked = paresLimpos.some(p => p.placa && p.chassi); 
      combined.dispatchEvent(new Event('change'));
    }

    gInput.dispatchEvent(new Event('input')); 
    gPlateInput.dispatchEvent(new Event('input')); 

    if (window.showToast) {
      window.showToast(`Excel importado! ${paresLimpos.length} par(es) carregado(s). Clique em "Decodificar Grupo".`); 
    } else {
      alert(`Excel importado! ${paresLimpos.length} par(es) carregado(s). Clique em "Decodificar Grupo".`); 
    }

    if (gBtn) {
      gBtn.disabled = false;
      gBtn.scrollIntoView({ behavior: 'smooth' }); 
    }
  };

  const importarNoMainThread = () => {
    const reader = new FileReader(); 
    reader.onload = function(e) { 
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' }); 
        const placas = [];
        const chassis = [];

        for (let sheetIndex = 0; sheetIndex < wb.SheetNames.length; sheetIndex++) {
          const sheetName = wb.SheetNames[sheetIndex];
          const ws = wb.Sheets[sheetName];
          const realRef = getRealRange(ws);
          if (!realRef) continue;
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: realRef });

          for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            if (!Array.isArray(row)) continue;

            for (let colIndex = 0; colIndex < row.length; colIndex++) {
              const cell = row[colIndex];
              const detectados = extrairTiposDaCelula(cell);
              for (let i = 0; i < detectados.length; i++) {
                const d = detectados[i];
                const item = { ...d, row: rowIndex, sheet: sheetIndex };
                if (d.tipo === "placa") placas.push(item);
                else chassis.push(item);
              }
            }
          }
        }

        const pares = []; 
        const chassisPorLinha = new Map();
        const usadosChassi = new Set();

        chassis.forEach((c, idx) => {
          const key = `${c.sheet}:${c.row}`;
          if (!chassisPorLinha.has(key)) chassisPorLinha.set(key, []);
          chassisPorLinha.get(key).push(idx);
        });

        placas.forEach(p => { 
          const linhasPreferencia = [p.row, p.row - 1, p.row + 1];
          let idxEscolhido = -1;

          for (let i = 0; i < linhasPreferencia.length; i++) {
            const key = `${p.sheet}:${linhasPreferencia[i]}`;
            const candidatos = chassisPorLinha.get(key);
            if (!candidatos || candidatos.length === 0) continue;

            while (candidatos.length > 0) {
              const idx = candidatos.shift();
              if (!usadosChassi.has(idx)) {
                idxEscolhido = idx;
                break;
              }
            }
            if (idxEscolhido !== -1) break;
          }

          if (idxEscolhido !== -1) { 
            usadosChassi.add(idxEscolhido);
            pares.push({ placa: p.valor, chassi: chassis[idxEscolhido].valor }); 
          } else { 
            pares.push({ placa: p.valor, chassi: '' }); 
          } 
        }); 

        chassis.forEach((c, idx) => {
          if (!usadosChassi.has(idx)) pares.push({ placa: '', chassi: c.valor });
        });

        processarResultado(pares.filter(p => p.placa || p.chassi));
      } catch (err) {
        console.error("Erro ao ler Excel:", err);
        if (window.showToast) {
          window.showToast("Erro ao ler o arquivo Excel. Verifique se o formato é válido.", "error");
        } else {
          alert("Erro ao ler o arquivo Excel. Verifique se o formato é válido.");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  (async () => {
    try {
      if (window.showToast) {
        window.showToast("Importando Excel... isso pode levar alguns segundos.");
      }
      if (!window.Worker) {
        importarNoMainThread();
        return;
      }

      const worker = new Worker("./src/excel-import-worker.js");
      let respondeuWorker = false;
      const finalizarWorker = () => {
        try { worker.terminate(); } catch (_) {}
      };

      const fallbackWorkerTimeout = setTimeout(() => {
        if (respondeuWorker) return;
        finalizarWorker();
        importarNoMainThread();
      }, 5000);

      worker.onmessage = (ev) => {
        respondeuWorker = true;
        clearTimeout(fallbackWorkerTimeout);
        const data = ev.data || {};
        finalizarWorker();
        if (!data.ok) {
          importarNoMainThread();
          return;
        }
        processarResultado(Array.isArray(data.paresLimpos) ? data.paresLimpos : []);
      };

      worker.onerror = () => {
        respondeuWorker = true;
        clearTimeout(fallbackWorkerTimeout);
        finalizarWorker();
        importarNoMainThread();
      };

      const arrayBuffer = await file.arrayBuffer();
      worker.postMessage({ arrayBuffer }, [arrayBuffer]);
    } catch (err) {
      console.error("Erro ao ler Excel:", err);
      if (window.showToast) {
        window.showToast("Erro ao ler o arquivo Excel. Verifique se o formato é válido.", "error");
      } else {
        alert("Erro ao ler o arquivo Excel. Verifique se o formato é válido.");
      }
    }
  })();
} 

window.lerExcelEPopularGrupo = lerExcelEPopularGrupo; 
