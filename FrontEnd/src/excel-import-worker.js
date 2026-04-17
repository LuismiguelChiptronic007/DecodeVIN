importScripts("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");

const PLACA_EXACT = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const CHASSI_EXACT = /^[A-HJ-NPR-Z0-9]{17}$/;
const PLACA_GLOBAL = /\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/g;
const CHASSI_GLOBAL = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const CLEAN_NON_ALNUM = /[^A-Z0-9]/g;

function detectarTipo(valor) {
  if (!valor) return null;
  const v = String(valor).trim().toUpperCase().replace(CLEAN_NON_ALNUM, "");
  if (CHASSI_EXACT.test(v)) return { tipo: "chassi", valor: v };
  if (PLACA_EXACT.test(v)) return { tipo: "placa", valor: v };
  return null;
}

function extrairTiposDaCelula(valor) {
  if (valor === null || valor === undefined) return [];
  const bruto = String(valor).trim();
  if (!bruto) return [];
  const upper = bruto.toUpperCase();
  const limpo = upper.replace(CLEAN_NON_ALNUM, "");
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

  const placas = upper.match(PLACA_GLOBAL) || [];
  placas.forEach((p) => add("placa", p.replace(CLEAN_NON_ALNUM, "")));

  const chassis = upper.match(CHASSI_GLOBAL) || [];
  chassis.forEach((c) => add("chassi", c.replace(CLEAN_NON_ALNUM, "")));

  return achados;
}

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

self.onmessage = (event) => {
  try {
    const { arrayBuffer } = event.data || {};
    if (!arrayBuffer) throw new Error("Arquivo inválido para importação.");

    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const placas = [];
    const chassis = [];

    for (let sheetIndex = 0; sheetIndex < wb.SheetNames.length; sheetIndex++) {
      const sheetName = wb.SheetNames[sheetIndex];
      const ws = wb.Sheets[sheetName];
      const realRef = getRealRange(ws);
      if (!realRef) continue;

      const keys = Object.keys(ws);
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        if (key[0] === "!") continue;

        const cell = ws[key];
        if (!cell || cell.v === undefined || cell.v === null) continue;

        const detectados = extrairTiposDaCelula(cell.v);
        if (detectados.length === 0) continue;

        const addr = XLSX.utils.decode_cell(key);
        const rowIndex = addr.r;

        for (let i = 0; i < detectados.length; i++) {
          const d = detectados[i];
          const item = { ...d, row: rowIndex, sheet: sheetIndex };
          if (d.tipo === "placa") placas.push(item);
          else chassis.push(item);
        }
      }
    }

    const pares = [];
    const chassisPorLinha = new Map();
    const usadosChassi = new Set();

    for (let idx = 0; idx < chassis.length; idx++) {
      const c = chassis[idx];
      const key = `${c.sheet}:${c.row}`;
      if (!chassisPorLinha.has(key)) chassisPorLinha.set(key, []);
      chassisPorLinha.get(key).push(idx);
    }

    for (let p = 0; p < placas.length; p++) {
      const placaItem = placas[p];
      const linhasPreferencia = [placaItem.row, placaItem.row - 1, placaItem.row + 1];
      let idxEscolhido = -1;

      for (let i = 0; i < linhasPreferencia.length; i++) {
        const key = `${placaItem.sheet}:${linhasPreferencia[i]}`;
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
        pares.push({ placa: placaItem.valor, chassi: chassis[idxEscolhido].valor });
      } else {
        pares.push({ placa: placaItem.valor, chassi: "" });
      }
    }

    for (let idx = 0; idx < chassis.length; idx++) {
      if (!usadosChassi.has(idx)) {
        pares.push({ placa: "", chassi: chassis[idx].valor });
      }
    }

    const paresLimpos = pares.filter((p) => p.placa || p.chassi);
    self.postMessage({ ok: true, paresLimpos });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || "Falha ao importar Excel." });
  }
};
