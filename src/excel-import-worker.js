importScripts("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");

function detectarTipo(valor) {
  if (!valor) return null;
  const v = String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const regexChassi = /^[A-HJ-NPR-Z0-9]{17}$/;
  const regexPlaca = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  if (regexChassi.test(v)) return { tipo: "chassi", valor: v };
  if (regexPlaca.test(v)) return { tipo: "placa", valor: v };
  return null;
}

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
  placas.forEach((p) => add("placa", p.replace(/[^A-Z0-9]/g, "")));

  const chassis = bruto.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];
  chassis.forEach((c) => add("chassi", c.replace(/[^A-Z0-9]/g, "")));

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
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", range: realRef });

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

    placas.forEach((p) => {
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
        pares.push({ placa: p.valor, chassi: "" });
      }
    });

    chassis.forEach((c, idx) => {
      if (!usadosChassi.has(idx)) pares.push({ placa: "", chassi: c.valor });
    });

    const paresLimpos = pares.filter((p) => p.placa || p.chassi);
    self.postMessage({ ok: true, paresLimpos });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || "Falha ao importar Excel." });
  }
};
