function normalizeInput(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

function isVin(s) {
  const v = s.replace(/[\s-]/g, "").toUpperCase();
  if (v.length !== 17) return false;
  return /^[A-Z0-9]+$/.test(v);
}

function vinCheckDigitValid(vin) {
  const v = vin.toUpperCase();
  const map = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i];
    let val = 0;
    if (/[0-9]/.test(ch)) val = parseInt(ch, 10);
    else val = map[ch] || 0;
    sum += val * weights[i];
  }
  const mod = sum % 11;
  const check = mod === 10 ? "X" : String(mod);
  return v[8] === check;
}

function vinYearFromCode(c) {
  const map = {
    A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
    J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995,
    T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000,
    1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005, 6: 2006, 7: 2007, 8: 2008, 9: 2009,
    A2: 2010, B2: 2011, C2: 2012, D2: 2013, E2: 2014, F2: 2015, G2: 2016, H2: 2017,
    J2: 2018, K2: 2019, L2: 2020, M2: 2021, N2: 2022, P2: 2023, R2: 2024, S2: 2025,
    T2: 2026, V2: 2027, W2: 2028, X2: 2029, Y2: 2030
  };
  if (!c) return null;
  const u = c.toUpperCase();
  if (map[u] != null) return map[u];
  if (map[u + "2"] != null) return map[u + "2"];
  return null;
}

function scaniaYearFromCode(code) {
  const c = (code || "").toUpperCase();
  if (!c) return null;
  if (/[1-9]/.test(c)) return 2000 + parseInt(c, 10); // 2001–2009
  const early = {
    A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987, J: 1988, K: 1989,
    L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995, T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000
  };
  const late = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017, J: 2018, K: 2019,
    L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030
  };
  if (early[c] != null && late[c] != null) return `${early[c]}/${late[c]}`;
  if (early[c] != null) return early[c];
  if (late[c] != null) return late[c];
  return null;
}

const SCANIA_VDS_MAP = {
  "F250HB": "Família F250HB • Urbano/Rodoviário • Piso Alto/Normal • Motor DC 9 109",
  "F310HB": "Família F310HB • Urbano/Rodoviário • Piso Alto • Motor DC 9 110",
  "K400IB": "K400IB • 4x2 Rodoviário • Motor DC 13 113",
  "K440IB": "K440IB • 4x2/6x2 Rodoviário • 3º eixo direcional (opção) • Motor DC 13 112",
  "K6X2": "Motor Traseiro • Tração 6x2",
  "K4X2": "Motor Traseiro • Tração 4x2",
  "F4X2": "Motor Dianteiro • Tração 4x2",
  "N6X2": "Motor Transversal • Tração 6x2"
};

function yearFromCode2001(c) {
  if (!c) return null;
  const u = c.toUpperCase();
  if (/[1-9]/.test(u)) {
    const n = parseInt(u, 10);
    return 2000 + n; // 1..9 => 2001..2009
  }
  const table = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015,
    G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021, N: 2022,
    P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030
  };
  return table[u] != null ? table[u] : null;
}

function emissionStandard(year) {
  if (year == null) return null;
  
  // Tratar anos ambíguos (ex: "1993/2023" da Scania)
  if (typeof year === "string" && year.includes("/")) {
    const parts = year.split("/");
    const standards = parts.map(y => emissionStandard(parseInt(y, 10))).filter(Boolean);
    // Remover duplicatas e juntar
    return [...new Set(standards)].join(" / ");
  }

  const y = typeof year === "string" ? parseInt(year, 10) : year;
  if (isNaN(y)) return null;

  if (y >= 2023) return "CONAMA P-8 (Euro 6)";
  if (y >= 2012) return "CONAMA P-7 (Euro 5)";
  if (y >= 2006) return "CONAMA P-5 (Euro 3)";
  if (y >= 2000) return "CONAMA P-4 (Euro 2)";
  if (y >= 1996) return "CONAMA P-3 (Euro 1)";
  return "Pré-CONAMA";
}

function getBusBodyworkByModel(manufacturerId, modelName) {
  if (!modelName) return null;
  const m = modelName.toUpperCase();
  
  if (manufacturerId === "mercedes-benz") {
    if (m.startsWith("OF")) return "Urbano / Intermunicipal (Motor Dianteiro)";
    if (m.startsWith("OH")) return "Urbano / Rodoviário (Motor Traseiro)";
    if (m.startsWith("LO")) return "Micro-ônibus / Escolar";
    if (m.includes("O-500") || m.includes("O500")) {
      if (m.includes("U") || m.includes("UA") || m.includes("UDA")) return "Urbano (Piso Baixo / Articulado)";
      return "Rodoviário (Motor Traseiro)";
    }
    if (m.startsWith("L-") || m.startsWith("LP")) return "Caminhão / Chassi adaptado";
  }
  
  if (manufacturerId === "scania") {
    if (m.startsWith("K")) return "Rodoviário / Urbano (Motor Traseiro)";
    if (m.startsWith("F")) return "Urbano / Rural (Motor Dianteiro)";
    if (m.startsWith("N")) return "Urbano (Motor Transversal)";
  }
  
  if (manufacturerId === "volvo") {
    if (m.startsWith("B270F")) return "Urbano / Escolar (Motor Dianteiro)";
    if (m.startsWith("B7R") || m.startsWith("B290R") || m.startsWith("B250R")) return "Urbano / Rodoviário";
    if (m.includes("M")) return "Urbano / Rodoviário (Motor Central)"; // B10M, B12M
    if (m.startsWith("B11R") || m.startsWith("B12R") || m.startsWith("B340R") || m.startsWith("B380R") || m.startsWith("B420R") || m.startsWith("B450R")) return "Rodoviário";
  }
  
  if (manufacturerId === "vwco") {
    if (m.includes("OD")) return "Urbano / Escolar (Motor Dianteiro)";
    if (m.includes("OT")) return "Urbano / Rodoviário (Motor Traseiro)";
  }
  
  if (manufacturerId === "agrale") {
    if (m.startsWith("MA")) return "Micro-ônibus / Escolar";
    if (m.startsWith("MT")) return "Urbano (Motor Traseiro)";
  }
  
  if (manufacturerId === "iveco") {
    if (m.includes("DAILY")) return "Micro-ônibus";
    if (m.includes("CC") || m.includes("EUROMIDI") || m.includes("BUS")) return "Urbano / Escolar";
  }

  if (manufacturerId === "volare") {
    return "Micro-ônibus (Chassis Integrado)";
  }

  return null;
}

function getBusModelByVds(wmi, vds) {
  if (!wmi || !vds) return null;
  const w = wmi.toUpperCase();
  const v = vds.toUpperCase();
  let model = null;
  let chassis = null;

  if (w === "936" || w === "93L") { // Marcopolo / Neobus
    const chassisCode = v[0];
    const chassisMap = { "1": "Mercedes-Benz", "2": "Scania", "3": "Volvo", "4": "VWCO", "5": "Agrale", "6": "Iveco" };
    chassis = chassisMap[chassisCode] || null;

    const modelCode = v.slice(1, 3);
    const modelMap = {
      "01": "Torino", "02": "Paradiso", "03": "Viaggio", "04": "Senior",
      "05": "Viale", "06": "Ideale", "07": "Audace", "08": "Volare", "09": "New Torino"
    };
    model = modelMap[modelCode] || null;
  }
  else if (w === "93Y") { // Mascarello
    if (v.includes("GV")) model = "Gran Via";
    else if (v.includes("GR")) model = "Gran Roma";
    else if (v.includes("GM")) model = "Gran Midi";
    else if (v.includes("GT")) model = "Gran Turismo";
    else if (v.includes("EL")) model = "Ello";
    else if (v.startsWith("384") || v.startsWith("9BM")) {
      model = "Gran Via";
      chassis = "Mercedes-Benz";
    }
  }
  else if (w === "93R") { // Comil
    const chassisCode = v[0];
    const chassisMap = { "S": "Mercedes-Benz", "K": "Scania", "V": "Volvo", "W": "VWCO", "A": "Agrale", "I": "Iveco" };
    chassis = chassisMap[chassisCode] || null;

    const modelPrefix = v.slice(1, 3);
    const modelMap = { "SV": "Svelto", "CP": "Campione", "VR": "Versatile", "PI": "Piá", "DO": "Doppio" };
    model = modelMap[modelPrefix] || null;
  }
  else if (w === "93K") { // Caio
    const chassisCode = v[0];
    const chassisMap = { "A": "Mercedes-Benz", "B": "Scania", "C": "Volvo", "D": "VWCO", "E": "Agrale", "F": "Iveco" };
    chassis = chassisMap[chassisCode] || null;

    const modelPrefix = v.slice(1, 3);
    const modelMap = { "AV": "Apache Vip", "MM": "Millennium", "MS": "Mondo", "FO": "Foz", "SO": "Solar", "AT": "Atilis" };
    model = modelMap[modelPrefix] || null;
  }

  if (!model && !chassis) return null;
  return { model, chassis };
}

function detectManufacturerByVin(vin, rules) {
  const wmi = vin.slice(0, 3).toUpperCase();
  for (const m of rules.manufacturers) {
    const wm = (m.identifiers && m.identifiers.wmi) || [];
    if (wm.includes(wmi)) return m;
  }
  return null;
}

function matchModelByPatterns(input, rules) {
  for (const m of (rules.manufacturers || [])) {
    const pats = (m.identifiers && m.identifiers.modelPatterns) || [];
    for (const p of pats) {
      const re = new RegExp(p.regex, "i");
      const mres = input.match(re);
      if (mres) {
        const groups = {};
        (p.groups || []).forEach((g, idx) => {
          groups[g] = mres[idx + 1] || "";
        });
        return { manufacturer: m, pattern: p, groups };
      }
    }
  }
  return null;
}

function guessManufacturerByFirstPosition(input, rules) {
  const s = (input || "").trim().toUpperCase();
  // Agrale A2 pela WMI (inclui variação histórica 9BF)
  if (/^(9BY|9C5|9BF)/.test(s)) return "agrale";
  // Agrale A1 pelo prefixo C
  if (/^C[\s-]?\d{2}/.test(s)) return "agrale";
  // Mercedes por padrões textuais
  if (/^(OF|LO)/.test(s)) return "mercedes-benz";
  if (/^O[\s-]?\d{3}/.test(s)) return "mercedes-benz";
  if (/^(9BM|8AB|8AC|8BP|WDB|WDD|WDF|WEB|NMB|AAV|4JG|WD4|VSA|VF9|LE4)/.test(s)) return "mercedes-benz";
  // VWCO por código 953 de segmentos
  if (/^953[\s-]/.test(s)) return "vwco";
  if (/^[KFL]\d{2,3}/.test(s)) return "scania";
  // Volvo B-series
  if (/^B\d{2,3}/.test(s)) return "volvo";
  // Volare V-series
  if (/^V\d{2,3}/.test(s)) return "volare";
  // Iveco WMIs
  if (/^(93Z|ZC8|ZCF|ZCG|8AI|8AJ|VHI|VF6|LNV|LNY|LZZ|XLR)/.test(s)) return "iveco";
  if (/^(YS2|YS3|YS4|YK1|9BS|8AG|WSD|WSC|VS6|VS7|VF7|5L6|ZCB|SJA|XLR|JXB)/.test(s)) return "scania";
  if (/^[A-Z0-9]{3}/.test(s)) {
    const wmi = s.slice(0, 3);
    for (const m of (rules.manufacturers || [])) {
      const wmis = (m.identifiers && m.identifiers.wmi) || [];
      if (wmis.includes(wmi)) return m.id;
    }
  }
  return null;
}

const WMI_INFO_MAP = {
  "9BW": { manufacturer: "Volkswagen Caminhões e Ônibus", region: "América do Sul", country: "Brasil", bodybuilder: "VWCO (Ônibus Integral)" },
  "9BG": { manufacturer: "General Motors do Brasil S.A.", region: "América do Sul", country: "Brasil" },
  "9BF": { manufacturer: "Agrale (variação histórica)", region: "América do Sul", country: "Brasil" },
  "9BA": { manufacturer: "Fiat Automóveis S.A.", region: "América do Sul", country: "Brasil" },
  "9BS": { manufacturer: "Scania Vabis do Brasil S.A.", region: "América do Sul", country: "Brasil", bodybuilder: "Scania (Ônibus Integral)" },
  "9BM": { manufacturer: "Mercedes-Benz do Brasil S.A.", region: "América do Sul", country: "Brasil", bodybuilder: "Mercedes-Benz (Ônibus Integral)" },
  "9BV": { manufacturer: "Volvo do Brasil S.A.", region: "América do Sul", country: "Brasil", bodybuilder: "Volvo (Ônibus Integral)" },
  "93B": { manufacturer: "Volvo do Brasil S.A.", region: "América do Sul", country: "Brasil", bodybuilder: "Volvo (Ônibus Integral)" },
  "9BY": { manufacturer: "Agrale S.A. Caminhões", region: "América do Sul", country: "Brasil" },
  "9C5": { manufacturer: "Agrale Caxias do Sul", region: "América do Sul", country: "Brasil" },
  "93P": { manufacturer: "Volare (Marcopolo)", region: "América do Sul", country: "Brasil", bodybuilder: "Volare" },
  "936": { manufacturer: "Marcopolo S.A.", region: "América do Sul", country: "Brasil", bodybuilder: "Marcopolo" },
  "93H": { manufacturer: "Honda Automóveis do Brasil", region: "América do Sul", country: "Brasil" },
  "93K": { manufacturer: "Caio Induscar", region: "América do Sul", country: "Brasil", bodybuilder: "Caio" },
  "93R": { manufacturer: "Comil Carrocerias e Ônibus", region: "América do Sul", country: "Brasil", bodybuilder: "Comil" },
  "93Y": { manufacturer: "Mascarello Carrocerias e Ônibus", region: "América do Sul", country: "Brasil", bodybuilder: "Mascarello" },
  "93L": { manufacturer: "Neobus (Marcopolo S.A.)", region: "América do Sul", country: "Brasil", bodybuilder: "Neobus" },
  "93Z": { manufacturer: "Irizar Brasil", region: "América do Sul", country: "Brasil", bodybuilder: "Irizar" },
  "93X": { manufacturer: "Metalbus (Maxibus)", region: "América do Sul", country: "Brasil", bodybuilder: "Maxibus" },
  "JMA": { manufacturer: "Mitsubishi", region: "Ásia", country: "Japão" },
  "4A3": { manufacturer: "Mitsubishi", region: "América do Norte", country: "EUA" },
  "1C4": { manufacturer: "Chrysler/Jeep", region: "América do Norte", country: "EUA" },
  "93A": { manufacturer: "Chrysler/Jeep", region: "América do Sul", country: "Brasil" },
  "8B7": { manufacturer: "Chrysler/Jeep", region: "América do Sul", country: "Argentina" },
  "937": { manufacturer: "Dodge", region: "América do Sul", country: "Brasil" },
  "1FA": { manufacturer: "Ford", region: "América do Norte", country: "EUA" },
  "3FA": { manufacturer: "Ford", region: "América do Norte", country: "México" },
  "6MP": { manufacturer: "Ford", region: "Oceania", country: "Austrália" },
  "KNJ": { manufacturer: "Ford", region: "Ásia", country: "Coreia do Sul" },
  "1G6": { manufacturer: "GM", region: "América do Norte", country: "EUA" },
  "9BR": { manufacturer: "Toyota do Brasil S.A.", region: "América do Sul", country: "Brasil" },
  "8BR": { manufacturer: "Toyota (Brasil)", region: "América do Sul", country: "Brasil" },
  "SB1": { manufacturer: "Toyota", region: "Europa", country: "Inglaterra" },
  "BAJ": { manufacturer: "Toyota", region: "América do Sul", country: "Argentina" },
  "WDB": { manufacturer: "Mercedes-Benz", region: "Europa", country: "Alemanha" },
  "WBA": { manufacturer: "BMW", region: "Europa", country: "Alemanha" },
  "WBS": { manufacturer: "BMW M", region: "Europa", country: "Alemanha" },
  "4US": { manufacturer: "BMW", region: "América do Norte", country: "EUA" },
  "W0L": { manufacturer: "GM/Adam Opel", region: "Europa", country: "Alemanha" },
  "SAL": { manufacturer: "Land Rover", region: "Europa", country: "Inglaterra" },
  "SAR": { manufacturer: "Land Rover", region: "Europa", country: "Inglaterra" },
  "93G": { manufacturer: "Peugeot", region: "América do Sul", country: "Brasil" },
  "BAD": { manufacturer: "Peugeot", region: "América do Sul", country: "Argentina" },
  "9U7": { manufacturer: "Peugeot/Citroën (Uruguai)", region: "América do Sul", country: "Uruguai" },
  "VF3": { manufacturer: "Peugeot", region: "Europa", country: "França" },
  "93U": { manufacturer: "Audi", region: "América do Sul", country: "Brasil" },
  "WAU": { manufacturer: "Audi", region: "Europa", country: "Alemanha" },
  "VF7": { manufacturer: "Citroën", region: "Europa", country: "França" },
  "93S": { manufacturer: "Citroën", region: "América do Sul", country: "Brasil" },
  "93J": { manufacturer: "Renault", region: "América do Sul", country: "Brasil" },
  "8AY": { manufacturer: "Renault", region: "América do Sul", country: "Argentina" },
  "JF1": { manufacturer: "Subaru", region: "Ásia", country: "Japão" },
  "JSA": { manufacturer: "Suzuki", region: "Ásia", country: "Japão" },
  "JS3": { manufacturer: "Suzuki", region: "Ásia", country: "Japão" }
};

function decodeWMI3(input) {
  const wmi = (input || "").replace(/[\s-]/g, "").toUpperCase().slice(0, 3);
  if (!/^[A-Z0-9]{3}$/.test(wmi)) return null;
  const info = WMI_INFO_MAP[wmi] || null;
  if (!info && wmi[0] !== "9") return null;
  
  const name = info ? info.manufacturer : null;
  const region = info ? info.region : (wmi[0] === "9" ? "América do Sul" : null);
  const country = info ? info.country : (wmi[0] === "9" && wmi[1] === "B" ? "Brasil" : null);
  
  if (!name && !region && !country) return null;

  const tokens = [
    { key: "wmi", label: "WMI", value: wmi },
    { key: "regiao", label: "Região continental", value: region || null },
    { key: "pais", label: "País", value: country || null },
    { key: "fabricante", label: "Fabricante/Montadora", value: name || null }
  ];
  return { type: "WMI", tokens };
}

function pickPeriod(manufacturer, year, sigla) {
  const periods = manufacturer.periods || [];
  if (year != null) {
    for (const p of periods) {
      if (year >= p.range.from && year <= p.range.to) return p;
    }
  }
  if (sigla) {
    for (const p of periods) {
      const sMap = (p.mappings && p.mappings.sigla) || {};
      if (sMap[sigla]) return p;
    }
  }
  return periods[periods.length - 1] || null;
}

function decodeVolksbus(groups, period) {
  const pbt = groups.pbtTons ? parseInt(groups.pbtTons, 10) : null;
  const hp = groups.powerHp ? parseInt(groups.powerHp, 10) : null;
  const sig = (groups.sigla || "").toUpperCase();
  const map = (period && period.mappings && period.mappings.sigla) || {};
  const tipo = map[sig] || null;
  const tokens = [
    { key: "pbt", label: "PBT", value: pbt != null ? pbt + " t" : null },
    { key: "potencia", label: "Potência", value: hp != null ? hp + " cv" : null },
    { key: "tipo", label: "Tipo", value: tipo || sig || null }
  ];
  return { tokens };
}

function defaultTokensFromGroups(groups) {
  const out = [];
  for (const k of Object.keys(groups)) {
    out.push({ key: k, label: k, value: groups[k] || null });
  }
  return out;
}

function decodeVolksbus953(groups) {
  const code953 = groups.code953 || "";
  const carroceria = groups.carroceria || "";
  const tipo = groups.tipoFamilia || "";
  const controle = groups.controle || "";
  const anoCode = (groups.anoCodigo || "").toUpperCase();
  const plantaCode = (groups.planta || "").toUpperCase();
  const seq = groups.sequencia || "";
  const sub = { regiao: code953[0], pais: code953[1], fabricante: code953[2] };
  const regiaoMeaning = sub.regiao === "9" ? "Brasil/Paraguai/Colômbia/Uruguai" : null;
  const paisMeaning = sub.pais === "5" ? "Brasil" : null;
  const fabricanteMeaning = sub.fabricante === "3" ? "MAN Latin America" : null;
  const carroceriaMeaning = carroceria.startsWith("2") ? "Volksbus" : null;
  const ano = yearFromCode2001(anoCode) || null;
  const plantaMeaning = plantaCode === "R" ? "Resende-RJ" : null;
  const tokens = [
    { key: "regiao", label: "Região", value: regiaoMeaning || sub.regiao || null },
    { key: "pais", label: "País", value: paisMeaning || sub.pais || null },
    { key: "fabricante", label: "Fabricante", value: fabricanteMeaning || sub.fabricante || null },
    { key: "carroceria", label: "Carroceria", value: carroceriaMeaning || carroceria || null },
    { key: "familia", label: "Família (motor/freio)", value: tipo || null },
    { key: "controle", label: "Dígito de controle", value: controle || null },
    { key: "ano", label: "Ano Modelo", value: ano || null },
    { key: "planta", label: "Planta", value: plantaMeaning || plantaCode || null },
    { key: "sequencia", label: "Sequência", value: seq || null }
  ];
  return { tokens, year: ano };
}

// Agrale mappings (A1 e A2)
const AGR_A1_TYPE_MAP = {
  "01": "Caminhão Agrale 1600",
  "02": "Caminhão Agrale 1800",
  "03": "Chassi para encarroçamento modelo Agrale 1600",
  "04": "Chassi para encarroçamento modelo Agrale 1800",
  "05": "Chassi para encarroçamento de 7 toneladas",
  "06": "Chassi para encarroçamento de 5,5 toneladas",
  "07": "Caminhão Agrale 5500 diesel",
  "08": "Caminhão Agrale 7000 diesel",
  "09": "Caminhão Agrale 7500 turbo diesel",
  "10": "Caminhão Agrale 4500 diesel",
  "11": "Caminhão Agrale 5000 diesel",
  "12": "Chassi para encarroçamento de 7,5 toneladas",
  "13": "Chassi para encarroçamento de 8,5 toneladas",
  "14": "Chassi para encarroçamento de 7 toneladas",
  "15": "Caminhão Agrale DX – 7 toneladas",
  "16": "Caminhão Agrale DX – 7,5 toneladas",
  "17": "Caminhão Agrale 8000",
  "18": "Caminhão Agrale 8500",
  "19": "Chassi para encarroçamento de 8 toneladas",
  "20": "Chassi para encarroçamento de 6 toneladas (TCA)",
  "21": "Chassi para encarroçamento de 7,5 toneladas (TCA)",
  "22": "Chassi para encarroçamento de 8,5 toneladas (TCA)"
};

const AGR_A1_YEAR_MAP = {
  "1": 1971, "2": 1972, "3": 1973, "4": 1974, "5": 1975, "6": 1976, "7": 1977, "8": 1978, "9": 1979,
  "A": 1980, "B": 1981, "C": 1982, "D": 1983, "E": 1984, "F": 1985, "G": 1986
};

const MONTH_MAP = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
};

const AGR_A2_WMI_MAP = { "9BY": "Agrale S.A. Caminhões", "9C5": "Agrale Caxias do Sul", "9BF": "Agrale (variação histórica)" };
const AGR_A2_TIPO_VEICULO_MAP = { "C": "Caminhão/Chassis" };
const AGR_A2_CARROCERIA_MAP = { "1": "Sem cabina", "2": "Cabina simples", "3": "Cabina dupla", "4": "Nenhuma das anteriores" };
const AGR_A2_PLANTA_MAP = { "C": "Caxias do Sul-RS" };

const AGR_A2_MODEL_ENGINE_MAP = {
  "01": "1600 (GM)",
  "02": "1800 (Perkins)",
  "03": "1600 (MWM)",
  "04": "1800 (MWM)",
  "06C": "MA 5.5 T (88cv)",
  "12H": "MA 7.5 T",
  "13J": "MA 8.5 T",
  "14": "MA 7.0",
  "21K": "MA 7.5 TCA (140cv)",
  "21P": "MA 7.5 TCA (145cv)",
  "22K": "MA 8.5 TCA (140cv)",
  "22P": "MA 8.5 TCA (145cv)",
  "22S": "MA 8.5 Super",
  "22Y": "MA 8.5 TCE",
  "251": "Furgovan 6000 (TCE)",
  "25L": "Furgovan 6000 (TCA)",
  "306": "MA 7.9",
  "32P": "MA 9.2 TCA",
  "32V": "MA 9.2 TCE (Cummins)",
  "32Y": "MA 9.2 TCE (MWM)",
  "346": "Furgovan 8000 (110cv)",
  "34P": "Furgovan 8000 (145cv)",
  "369": "MA 12.0 (4.8H)",
  "36X": "MA 12.0 (ISBe 170cv)",
  "36Z": "MA 12.0 (ISBe 170cv)",
  "37X": "MT 12.0 LE (170cv)",
  "37Z": "MT 12.0 LE (180cv)",
  "414": "MT 12.0 SB (220cv)",
  "41X": "MT 12.0 SB (170cv)",
  "51A": "MA 15.0 (Todas versões)",
  "52A": "MA 10.0 (Todas versões)",
  "53B": "MT 15.0 SB (220cv)",
  "59B": "MT 15.0 LE (220cv)",
  "69A": "MA 17.0 (Todas versões)",
  "73A": "MA 8.7",
  "75A": "MA 9.2 (4.8H)",
  "77B": "MT 12.0 LE (ISF 3.8)"
};

function agraleA2YearFromCode(code) {
  const c = (code || "").toUpperCase();
  if (!c) return null;
  if (/[1-9]  /.test(c)) {
    const n = parseInt(c, 10);
    return 2000 + n;
  }
  const early = {
    G: 1986, H: 1987, J: 1988, K: 1989, L: 1990, M: 1991, N: 1992,
    P: 1993, R: 1994, S: 1995, T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000
  };
  const late = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
    J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
    T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030
  };
  if (early[c] != null && late[c] != null) {
    return `${early[c]}/${late[c]}`;
  }
  if (early[c] != null) return early[c];
  if (late[c] != null) return late[c];
  return null;
}

// Iveco WMIs
WMI_INFO_MAP["93Z"] = { manufacturer: "Iveco Brasil", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["ZC8"] = { manufacturer: "Iveco S.p.A.", region: "Europa", country: "Itália" };
WMI_INFO_MAP["ZCF"] = { manufacturer: "Iveco S.p.A.", region: "Europa", country: "Itália" };
WMI_INFO_MAP["ZCG"] = { manufacturer: "Iveco S.p.A.", region: "Europa", country: "Itália" };
WMI_INFO_MAP["8AI"] = { manufacturer: "Iveco Argentina", region: "América do Sul", country: "Argentina" };
WMI_INFO_MAP["8AJ"] = { manufacturer: "Iveco Argentina", region: "América do Sul", country: "Argentina" };
WMI_INFO_MAP["VHI"] = { manufacturer: "Iveco España", region: "Europa", country: "Espanha" };
WMI_INFO_MAP["VF6"] = { manufacturer: "Iveco France", region: "Europa", country: "França" };
WMI_INFO_MAP["LNV"] = { manufacturer: "Iveco China (joint venture)", region: "Ásia", country: "China" };
WMI_INFO_MAP["LNY"] = { manufacturer: "Iveco China (joint venture)", region: "Ásia", country: "China" };
WMI_INFO_MAP["LZZ"] = { manufacturer: "Iveco China (joint venture)", region: "Ásia", country: "China" };
WMI_INFO_MAP["XLR"] = { manufacturer: "Iveco Rússia", region: "Europa/Ásia", country: "Rússia" };

WMI_INFO_MAP["9BS"] = { manufacturer: "Scania Brasil", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["8AG"] = { manufacturer: "Scania Argentina", region: "América do Sul", country: "Argentina" };
WMI_INFO_MAP["WSD"] = { manufacturer: "Scania Alemanha", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["WSC"] = { manufacturer: "Scania Alemanha", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["VS6"] = { manufacturer: "Scania Espanha", region: "Europa", country: "Espanha" };
WMI_INFO_MAP["VS7"] = { manufacturer: "Scania Espanha", region: "Europa", country: "Espanha" };
WMI_INFO_MAP["VF7"] = { manufacturer: "Scania França", region: "Europa", country: "França" };
WMI_INFO_MAP["5L6"] = { manufacturer: "Scania EUA", region: "América do Norte", country: "EUA" };
WMI_INFO_MAP["ZCB"] = { manufacturer: "Scania Itália", region: "Europa", country: "Itália" };
WMI_INFO_MAP["SJA"] = { manufacturer: "Scania Polônia", region: "Europa", country: "Polônia" };
WMI_INFO_MAP["JXB"] = { manufacturer: "Scania Japão", region: "Ásia", country: "Japão" };
WMI_INFO_MAP["YS2"] = { manufacturer: "Scania Suécia", region: "Europa", country: "Suécia" };
WMI_INFO_MAP["YS3"] = { manufacturer: "Scania Suécia", region: "Europa", country: "Suécia" };
WMI_INFO_MAP["YS4"] = { manufacturer: "Scania Suécia", region: "Europa", country: "Suécia" };
WMI_INFO_MAP["YK1"] = { manufacturer: "Scania Suécia", region: "Europa", country: "Suécia" };
// Volare Brasil
WMI_INFO_MAP["93P"] = { manufacturer: "Volare (Marcopolo)", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["9EJ"] = { manufacturer: "Volare (Marcopolo)", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["9EL"] = { manufacturer: "Volare (Marcopolo)", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["9ES"] = { manufacturer: "Volare (Marcopolo)", region: "América do Sul", country: "Brasil" };
// Volkswagen (global e regionais)
WMI_INFO_MAP["WVW"] = { manufacturer: "Volkswagen AG", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["WVG"] = { manufacturer: "Volkswagen AG (SUV/MPV)", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["WV1"] = { manufacturer: "Volkswagen Veículos Comerciais", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["WV2"] = { manufacturer: "Volkswagen Veículos Comerciais (ônibus/furgões)", region: "Europa", country: "Alemanha" };
WMI_INFO_MAP["8AW"] = { manufacturer: "Volkswagen Argentina", region: "América do Sul", country: "Argentina" };
WMI_INFO_MAP["9BW"] = { manufacturer: "Volkswagen do Brasil", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["AAV"] = { manufacturer: "Volkswagen South Africa", region: "África", country: "África do Sul" };
WMI_INFO_MAP["3VW"] = { manufacturer: "Volkswagen México", region: "América do Norte", country: "México" };
WMI_INFO_MAP["3VV"] = { manufacturer: "Volkswagen México (variante)", region: "América do Norte", country: "México" };
WMI_INFO_MAP["1VW"] = { manufacturer: "Volkswagen Group of America", region: "América do Norte", country: "EUA" };
WMI_INFO_MAP["1V2"] = { manufacturer: "Volkswagen Group of America (variante)", region: "América do Norte", country: "EUA" };
WMI_INFO_MAP["XW8"] = { manufacturer: "Volkswagen Group Rus", region: "Europa", country: "Rússia" };
WMI_INFO_MAP["LSV"] = { manufacturer: "SAIC Volkswagen", region: "Ásia", country: "China" };
WMI_INFO_MAP["LFV"] = { manufacturer: "FAW-Volkswagen", region: "Ásia", country: "China" };
WMI_INFO_MAP["953"] = { manufacturer: "Volkswagen Caminhões e Ônibus (ônibus/chassi)", region: "América do Sul", country: "Brasil" };

const VWCO_VDS_FAMILY_MAP_2012 = {
  "582": "17.280 OT",
  "58S": "18.280 OT",
  "E82": "15.190 OD/ODR",
  "G82": "17.230 OD/ODS",
  "K82": "17.260 OD/ODS",
  "M32": "5.150 OD",
  "M52": "8.160 OD/ODR",
  "M62": "9.160 OD",
  "Y82": "18.330 OT",
  "Y8Z": "26.330 OTA",
  "252": "9.150 EOD",
  "2RF": "8.140 OD",
  "2TB": "17.240 OT",
  "2TJ": "16.210 CO",
  "2VE": "8.150 OD",
  "452": "8.120 OD",
  "682": "15.180 EOD",
  "8B2": "15.190 EOD",
  "932": "15.190 EOD",
  "952": "8.150 EOD",
  "A52": "9.150 CO",
  "AD5": "17.230 OD/ODS",
  "AE5": "17.260 OD",
  "AF5": "18.280 OT",
  "AG5": "18.320 OT",
  "AH5": "18.330 OT",
  "AJ5": "18.360 OT",
  "AK5": "22.280 OT",
  "AL5": "23.230 OD",
  "AM5": "23.360 OT",
  "A62": "9.150 EOD",
  "B82": "17.260 EOT",
  "D82": "8.150 OD",
  "F82": "17.210 OD",
  "FY2": "16.210 OD",
  "J82": "18.320 EOT",
  "L82": "17.210 EOD",
  "P82": "17.210 EOD",
  "R82": "18.310 OT",
  "AA4": "8.120 OD",
  "AB4": "8.140 OD",
  "AC4": "9.150 OD",
  "AD4": "9.160 OD",
  "AE4": "10.160 OD",
  "AF4": "11.180 OD",
  "TAV": "8.140 OT",
  "TH7": "7.90 S",
  "TJ7": "7.90 CO",
  "TM7": "7.110 CO",
  "A8T": "17.230 OD/ODS"
};

const VWCO_MODEL_ENGINE_MAP = {
  "17.280 OT": "MAN D08 6.9",
  "18.280 OT": "MAN D08 6.9",
  "15.190 OD": "Cummins ISB 4.5",
  "15.190 ODR": "Cummins ISB 4.5",
  "17.230 OD": "Cummins ISB 4.5",
  "17.230 ODS": "Cummins ISB 4.5",
  "17.260 OD": "MAN D08 6.9",
  "17.260 ODS": "MAN D08 6.9",
  "5.150 OD": "Cummins ISF 2.8",
  "8.160 OD": "Cummins ISF 3.8",
  "8.160 ODR": "Cummins ISF 3.8",
  "9.160 OD": "Cummins ISF 3.8",
  "18.330 OT": "MAN D08 6.9",
  "26.330 OTA": "MAN D08 6.9",
  "9.150 EOD": "Cummins ISF 3.8",
  "8.140 OD": "Cummins ISF 3.8",
  "17.240 OT": "MAN D08 6.9",
  "16.210 CO": "Cummins ISB 4.5",
  "8.150 OD": "Cummins ISF 3.8",
  "8.120 OD": "Cummins ISF 3.8",
  "15.180 EOD": "Cummins ISB 4.5",
  "15.190 EOD": "Cummins ISB 4.5",
  "8.150 EOD": "Cummins ISF 3.8",
  "9.150 CO": "Cummins ISF 3.8",
  "18.320 OT": "MAN D08 6.9",
  "22.280 OT": "MAN D08 6.9",
  "23.230 OD": "Cummins ISB 4.5",
  "23.360 OT": "MAN D08 6.9",
  "17.260 EOT": "MAN D08 6.9",
  "17.210 OD": "Cummins ISB 4.5",
  "16.210 OD": "Cummins ISB 4.5",
  "18.320 EOT": "MAN D08 6.9",
  "17.210 EOD": "Cummins ISB 4.5",
  "18.310 OT": "MAN D08 6.9",
  "17.260 OD": "MAN D08",
  "18.280 OT": "MAN D08",
  "18.320 OT": "MAN D08",
  "18.330 OT": "MAN D08",
  "18.360 OT": "MAN D08",
  "22.280 OT": "MAN D08",
  "23.230 OD": "Cummins ISB 4.5",
  "23.360 OT": "MAN D08",
  "8.120 OD": "Cummins ISF 3.8",
  "8.140 OD": "Cummins ISF 3.8",
  "9.150 OD": "Cummins ISF 3.8",
  "9.160 OD": "Cummins ISF 3.8",
  "10.160 OD": "Cummins ISF 3.8",
  "11.180 OD": "Cummins ISF 3.8",
  "15.190 OD/ODR": "MAN D0836",
  "17.230 OD/ODS": "Cummins ISF 4.5",
  "17.260 OD/ODS": "MAN D0836",
  "8.160 OD/ODR": "MAN D0834",
  "8.140 OT": "MAN D0834",
  "7.90 S": "MAN D0834",
  "7.90 CO": "MAN D0834",
  "7.110 CO": "MAN D0834"
};

// Volvo WMIs
WMI_INFO_MAP["9BV"] = { manufacturer: "Volvo do Brasil", region: "América do Sul", country: "Brasil" };
WMI_INFO_MAP["YV3"] = { manufacturer: "Volvo Bus Corporation", region: "Europa", country: "Suécia" };
WMI_INFO_MAP["3CE"] = { manufacturer: "Volvo Buses México", region: "América do Norte", country: "México" };
WMI_INFO_MAP["SCV"] = { manufacturer: "Volvo Truck & Bus UK", region: "Europa", country: "Reino Unido" };
const VOLVO_VDS_MAP = {
  // Primeira fase
  "1M2F": "B10M ECO",
  "1MA5": "B10M 245",
  "1MA6": "B10M 285",
  "1MD4": "B10M 340",
  "1MKC": "B10M 310",
  "1MKF": "B10M",
  "582F": "B58 ECO",
  "58EB": "B58 217",
  "58GB": "B58 230",
  "58GC": "B58 253",
  "58SP": "B58 BIART",
  "58KF": "B58 ECO 4x2",
  "58KJ": "B58 4x2",
  // Segunda fase
  "1ME9": "B10R 360",
  "R2FH": "B12 360",
  "R2FL": "B12 400",
  "R2JL": "B12B 400",
  "R2J5": "B12R 340",
  "R2J6": "B12R 380",
  "R2J7": "B12R 420",
  "R6B4": "B7R 230",
  "R6B5": "B7R 260",
  "R6B6": "B7R 285",
  "R6C4": "B7R 285",
  "R6K7": "B7R 290",
  "R9F8": "B12M 340",
  "S3E9": "B10R 360",
  "SS5L5": "B9R 340",
  "S6S5": "B9R 380",
  "S6M2": "B9SALF",
  // Terceira fase
  "T8R9": "B215LH/B215RH",
  "T7V6": "B250R",
  "T5T5": "B270F",
  "T5T7": "B270F",
  "R6K7": "B290R",
  "R6R6": "B290R",
  "T2T8": "B310R",
  "R9F8": "B340M",
  "R9R3": "B340M",
  "SS5L5": "B340R",
  "SS5L58": "B340R",
  "S6M2": "B360S",
  "S6S5": "B360S",
  "SS5L6": "B380R",
  "R2R6": "B380R",
  "T2S8": "B380R",
  "R2J7": "B420R",
  "TS2S9": "B420R",
  "T2T1": "B450R"
};

const VOLVO_MODEL_ENGINE_MAP = {
  "B10M 245": "DH10A245",
  "B10M 285": "DH10A285",
  "B10M 310": "THD101KC",
  "B10M 340": "DH10A340",
  "B10M": "THD101KC",
  "B10M ECO": "THD102KF",
  "B10R 360": "D10A360",
  "B12 360": "TD 122FH",
  "B12 400": "TD 122FL",
  "B12B 360": "TD 122FH",
  "B12B 400": "TD 122FL",
  "B12M 340": "DH12D340",
  "B12R 340": "D12D340",
  "B12R 380": "D12D380",
  "B12R 420": "D12D420",
  "B215LH/B215RH": "D5F215",
  "B240R": "D7E240 EUV",
  "B270F": "MWM7B270",
  "B290R": "D7E290",
  "B340M": "DH12E340",
  "B340R": "D11C330",
  "B360S": "D9B360",
  "B380R": "D11C370",
  "B420R": "D11C410",
  "B450R": "D11C450",
  "B58 4x2": "THD101GC",
  "B58 ARTIC": "THD101GD",
  "B58 BIART": "THD101KB",
  "B58 ECO 4x2": "THD102KF",
  "B58 ECO ARTIC": "THD102KF",
  "B7R 230": "D7B230",
  "B7R 260": "D7B260",
  "B7R 285": "D7A285",
  "B7R 290": "D7E290",
  "B9 SALF 360": "D9B360",
  "B9R 340": "D9B340",
  "B9R 380": "D9B380",
  "B250R": "D8C250 EUV",
  "B310R": "D11C300 EUV BUS",
  "B330R": "D8C330 EUV MESTRE",
  "B460R": "D13K 460 CP8 BUS",
  "B510R": "D13K 500 CP8 BUS",
  "B320R": "D8K 320 CP8 BUS",
  "B360R": "D8K 350 CP8 BUS"
};

function decodeAgrale(groups, patternName) {
  if (patternName === "AgraleA1") {
    const tipo = AGR_A1_TYPE_MAP[groups.tipoVeiculo] || null;
    const ano = AGR_A1_YEAR_MAP[(groups.anoCodigo || "").toUpperCase()] || null;
    const mes = MONTH_MAP[groups.mesCodigo] || null;
    const tokens = [
      { key: "planta", label: "Planta", value: "Caxias do Sul-RS" },
      { key: "tipo", label: "Tipo de veículo", value: tipo || groups.tipoVeiculo || null },
      { key: "sequencia", label: "Sequência de produção", value: groups.sequencia || null },
      { key: "ano", label: "Ano Modelo", value: ano || null },
      { key: "mes", label: "Mês", value: mes || groups.mesCodigo || null }
    ];
    return { tokens, year: ano || null };
  }
  if (patternName === "AgraleA2") {
    const wmiName = AGR_A2_WMI_MAP[groups.wmi] || groups.wmi || null;
    const tipo = AGR_A2_TIPO_VEICULO_MAP[groups.tipoVeiculo] || groups.tipoVeiculo || null;
    const comboKey = (groups.modeloCod || "") + (groups.motorCod || "");
    const modeloMotor = AGR_A2_MODEL_ENGINE_MAP[comboKey] || AGR_A2_MODEL_ENGINE_MAP[groups.modeloCod] || null;
    const carroceria = AGR_A2_CARROCERIA_MAP[groups.carroceriaCod] || groups.carroceriaCod || null;
    const bodyworkInferred = getBusBodyworkByModel("agrale", modeloMotor || groups.modeloCod);
    const anoCalc = agraleA2YearFromCode(groups.anoCodigo);
    const planta = AGR_A2_PLANTA_MAP[groups.plantaCod] || groups.plantaCod || null;
    const tokens = [
      { key: "fabricante", label: "Fabricante (WMI)", value: wmiName },
      { key: "tipo", label: "Tipo de veículo", value: tipo },
      { key: "modeloCod", label: "Código do modelo", value: groups.modeloCod || null },
      { key: "motorCod", label: "Código do motor", value: groups.motorCod || null },
      { key: "modeloMotor", label: "Modelo/Motor", value: modeloMotor || null },
      { key: "carroceria", label: "Tipo de carroceria", value: bodyworkInferred || carroceria },
      { key: "rodadoDE", label: "Rodado/entre-eixos (código)", value: groups.rodadoDECod || null },
      { key: "ano", label: "Ano Modelo", value: anoCalc || null },
      { key: "planta", label: "Planta", value: planta },
      { key: "sequencia", label: "Sequência de produção", value: groups.sequencia || null }
    ];
    return { tokens, year: typeof anoCalc === "number" ? anoCalc : null };
  }
  return { tokens: defaultTokensFromGroups(groups), year: null };
}

function decodeMercedes(groups, patternName) {
  const MB_WHEELBASE_MAP = { "48": 4830, "51": 5170, "59": 5950, "60": 6050, "30": 3000 };
  const MB_LO_POWER_MAP = { "08": 85, "12": 115, "14": 136, "15": 150, "16": 160 };
  const MB_OF_POWER_MAP = { "17": 170, "18": 177, "21": 211, "22": 218, "30": 305 };
  const MB_OF_FEATURE_MAP = { E: "Motor eletrônico", G: "Motor a gás", L: "Suspensão pneumática", M: "Multiuso", R: "Eixo alto/reforçado" };
  const classifyFamily = (name) => {
    if (!name) return null;
    const u = name.toUpperCase();
    if (u.includes("ACTROS")) return "Actros";
    if (u.includes("AXOR")) return "Axor";
    if (u.includes("ATEGO")) return "Atego";
    if (u.includes("ACCELO")) return "Accelo";
    if (u.includes("ATRON")) return "Atron";
    if (u.includes("O-") || u.includes(" OF-") || u.startsWith("OF-") || u.includes(" OH-") || u.startsWith("OH-") || u.startsWith("LO-"))
      return "Ônibus";
    return null;
  };
  if (patternName === "MB_ABR1986") {
    const wmi = (groups.wmi || "").toUpperCase();
    const modelCode = groups.modelCode || null;
    const map = groups.__baumusterMap || {};
    const modelInfo = modelCode && map[modelCode] ? map[modelCode] : null;
    const modelName = (modelInfo && typeof modelInfo === "object") ? modelInfo.chassi : (modelInfo || null);
    const engineName = (modelInfo && typeof modelInfo === "object") ? modelInfo.motor : (modelCode ? MERCEDES_BAUMUSTER_ENGINE_MAP[modelCode] || null : null);
    const family = classifyFamily(modelName);
    const bodywork = getBusBodyworkByModel("mercedes-benz", modelName);
    const yearCode = groups.yearCode || null;
    const plantCode = (groups.plantCode || "").toUpperCase();
    const seq = groups.sequence || null;
    const wmiMap = {
      "9BM": "Mercedes-Benz do Brasil",
      "8AB": "Mercedes-Benz da Argentina",
      "8AC": "Mercedes-Benz da Argentina",
      "8BP": "Mercedes-Benz da Argentina",
      "WDB": "Mercedes-Benz da Alemanha",
      "WDD": "Mercedes-Benz da Alemanha (veículos comerciais)",
      "WDF": "Mercedes-Benz Vans (Sprinter) – Alemanha",
      "WEB": "EvoBus (ônibus completos) – Alemanha",
      "NMB": "Mercedes-Benz Turquia (ônibus)",
      "AAV": "Mercedes-Benz África do Sul",
      "4JG": "Mercedes-Benz EUA (SUVs/comerciais)",
      "WD4": "Mercedes-Benz Vans (Sprinter) – EUA",
      "VSA": "EvoBus/MB – Espanha",
      "VF9": "EvoBus – França",
      "LE4": "Mercedes-Benz China (joint venture)"
    };
    const plantMap = { A: "Unidade Juiz de Fora", B: "Unidade São Bernardo do Campo", C: "Unidade Campinas" };
    const year = yearFromCode2001(yearCode) || vinYearFromCode(yearCode);
    
    // Filtragem por ano para modelos com múltiplas opções de chassi
    const filteredModelName = filterModelByYear("mercedes", modelCode, modelName, year);

    const tokens = [
      { key: "fabricante", label: "Fabricante (WMI)", value: wmiMap[wmi] || wmi || null },
      { key: "baumuster", label: "Baumuster", value: modelCode || null },
      { key: "modeloChassi", label: "Modelo do chassi", value: filteredModelName || null },
      ...(bodywork ? [{ key: "carroceria", label: "Tipo de carroceria", value: bodywork }] : []),
      ...(engineName ? [{ key: "motor", label: "Motor", value: engineName }] : []),
      ...(family ? [{ key: "linha", label: "Linha", value: family }] : []),
      { key: "ano", label: "Ano Modelo", value: year || null },
      { key: "planta", label: "Unidade de fabricação", value: plantMap[plantCode] || plantCode || null },
      { key: "sequencia", label: "Série", value: seq || null }
    ];
    return { tokens, year };
  }
  if (patternName === "MB_OF") {
    const pbt = groups.pbt ? parseInt(groups.pbt, 10) : (groups.pbtTons ? parseInt(groups.pbtTons, 10) : null);
    const powerCode = groups.powerCode || groups.powerTens || null;
    const hp = powerCode ? (MB_OF_POWER_MAP[powerCode] || parseInt(powerCode, 10) * 10) : null;
    const feat = (groups.feature || groups.suffix || "").toUpperCase();
    const featMeaning = MB_OF_FEATURE_MAP[feat] || (feat || null);
    const wbCode = groups.wheelbase || null;
    const wb = wbCode ? (MB_WHEELBASE_MAP[wbCode] || parseInt(wbCode, 10) * 100) : null;
    const bodywork = getBusBodyworkByModel("mercedes-benz", "OF");
    const tokens = [
      { key: "familia", label: "Família", value: "OF (motor dianteiro)" },
      { key: "carroceria", label: "Tipo de carroceria", value: bodywork },
      { key: "pbt", label: "PBT", value: pbt != null ? pbt + " t" : null },
      { key: "potencia", label: "Potência", value: hp != null ? hp + " cv" : null },
      { key: "caracteristica", label: "Caracterização", value: featMeaning },
      { key: "entreEixos", label: "Entre-eixos", value: wb != null ? wb + " mm" : null }
    ];
    return { tokens };
  }
  if (patternName === "MB_LO") {
    const pbt = groups.pbt ? parseInt(groups.pbt, 10) : null;
    const powerCode = groups.powerCode || null;
    const hp = powerCode ? (MB_LO_POWER_MAP[powerCode] || parseInt(powerCode, 10) * 10) : null;
    const eng = (groups.engineType || "").toUpperCase();
    const engMeaning = eng === "D" ? "Motor Diesel" : (eng || null);
    const wbCode = groups.wheelbase || null;
    const wb = wbCode ? (MB_WHEELBASE_MAP[wbCode] || parseInt(wbCode, 10) * 100) : null;
    const bodywork = getBusBodyworkByModel("mercedes-benz", "LO");
    const tokens = [
      { key: "familia", label: "Família", value: "LO (micro/mini)" },
      { key: "carroceria", label: "Tipo de carroceria", value: bodywork },
      { key: "pbt", label: "PBT", value: pbt != null ? pbt + " t" : null },
      { key: "potencia", label: "Potência", value: hp != null ? hp + " cv" : null },
      { key: "motor", label: "Tipo de motor", value: engMeaning },
      { key: "entreEixos", label: "Entre-eixos", value: wb != null ? wb + " mm" : null }
    ];
    return { tokens };
  }
  if (patternName === "MB_OXXX" || patternName === "MB_O500") {
    const model = groups.model || "500";
    const variant = (groups.variant || groups.variant1 || "").toUpperCase();
    const pbtPower = groups.pbtPower || null;
    let pbt = null, hp = null;
    if (pbtPower && pbtPower.length === 4) {
      pbt = parseInt(pbtPower.slice(0, 2), 10);
      hp = parseInt(pbtPower.slice(2), 10) * 10;
    }
    const wbCode = groups.wheelbase || groups.variant2 || null;
    const MB_O_VARIANT_MAP = {
      U: "Urbano", UA: "Urbano articulado", UDA: "Urbano biarticulado",
      R: "Rodoviário", RS: "Rodoviário 2 eixos", RSD: "Rodoviário 3 eixos (6x2)",
      M: "Midi urbano", MA: "Midi articulado", A: "Articulado", D: "Eixo adicional",
      E: "Aumento de PBT", G: "Motor a gás", L: "Suspensão pneumática urbana",
      P: "Padron", PL: "Plataforma", S: "Suspensão pneumática rodoviária",
      ST: "Plataforma urbana", TR: "Trólebus"
    };
    const varMeaning = MB_O_VARIANT_MAP[variant] || (variant || null);
    const wb = wbCode ? (MB_WHEELBASE_MAP[wbCode] || parseInt(wbCode, 10) * 100) : null;
    const bodywork = getBusBodyworkByModel("mercedes-benz", "O-" + model + (variant ? " " + variant : ""));
    const tokens = [
      { key: "familia", label: "Família", value: "O-" + model },
      { key: "carroceria", label: "Tipo de carroceria", value: bodywork },
      { key: "variante", label: "Variante", value: varMeaning },
      { key: "pbt", label: "PBT", value: pbt != null ? pbt + " t" : null },
      { key: "potencia", label: "Potência", value: hp != null ? hp + " cv" : null },
      { key: "entreEixos", label: "Entre-eixos", value: wb != null ? wb + " mm" : null }
    ];
    return { tokens };
  }
  return { tokens: defaultTokensFromGroups(groups) };
}

function decodeScania(groups) {
  const serie = (groups.serie || "").toUpperCase();
  const cap = groups.capacidade ? parseInt(groups.capacidade, 10) : null;
  const suf = (groups.sufixo || "").toUpperCase();
  const eixos = groups.eixos || null;
  const serieMap = { K: "Motor traseiro", F: "Motor dianteiro", L: "Low-Entry (piso baixo)" };
  const sufMap = { LE: "Low-Entry (piso baixo)", H: "Híbrido", U: "Urbano", R: "Rodoviário" };
  const tokens = [
    { key: "serie", label: "Série", value: serieMap[serie] || serie || null },
    { key: "modelo", label: "Modelo", value: cap != null ? serie + cap : null },
    { key: "variante", label: "Variante", value: sufMap[suf] || (suf || null) },
    { key: "eixos", label: "Configuração de eixos", value: eixos || null }
  ];
  return { tokens };
}

function decodeVolvo(groups) {
  const serie = groups.serie ? parseInt(groups.serie, 10) : null;
  const pos = (groups.motorPos || "").toUpperCase();
  const extra = (groups.extra || "").toUpperCase();
  const posMap = { F: "Motor dianteiro", R: "Motor traseiro", M: "Motor central" };
  const extraMap = { LE: "Low-Entry (piso baixo)", L: "Piso baixo", H: "Híbrido" };
  const tokens = [
    { key: "familia", label: "Família", value: "B" },
    { key: "modelo", label: "Modelo", value: serie != null ? "B" + serie : null },
    { key: "motorPos", label: "Posição do motor", value: posMap[pos] || pos || null },
    { key: "extra", label: "Variante", value: extraMap[extra] || (extra || null) }
  ];
  return { tokens };
}

function decodeIveco(groups) {
  const pbt = groups.pbtTonsApprox ? parseInt(groups.pbtTonsApprox, 10) : null;
  const hp = groups.potenciaApprox ? parseInt(groups.potenciaApprox, 10) : null;
  const suf = (groups.sufixo || "").toUpperCase();
  const tokens = [
    { key: "pbt", label: "PBT (aprox.)", value: pbt != null ? pbt + " t" : null },
    { key: "potencia", label: "Potência (aprox.)", value: hp != null ? hp + " cv" : null },
    { key: "variante", label: "Variante", value: suf || null }
  ];
  return { tokens };
}

function ivecoYearFromCode(code) {
  const c = (code || "").toUpperCase();
  if (!c) return null;
  if (c === "0") return 2000;
  if (/[1-9]/.test(c)) return 2000 + parseInt(c, 10);
  const early = { G: 1986, H: 1987, J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995, T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000 };
  const late = { A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030 };
  if (early[c] != null && late[c] != null) return `${early[c]}/${late[c]}`;
  if (early[c] != null) return early[c];
  if (late[c] != null) return late[c];
  return null;
}

const IVECO_BUS_MODEL_MAP = {
  "A1PF0": "CC170E22",
  "A1PFH": "CC170E22",
  "A01LF": "150S21 / 15-210",
  "K1RMH": "170S28 / 17-280",
  "K01BD": "10-190",
  "K50C0": "Daily 50C17",
  "04570": "Daily 45-10 bus",
  "04580": "Daily 45-12 bus",
  "04610": "Daily 46-10",
  "04612": "Daily 46-12",
  "04614": "Daily 46-14",
  "04710": "Daily 47-10",
  "04712": "Daily 47-12",
  "04714": "Daily 47-14",
  "C3571": "Daily 35S11",
  "C3572": "Daily 35S12",
  "C3584": "Daily 35C12",
  "C3585": "Daily 35C13",
  "C3591": "Daily 35C15",
  "C3651": "Daily 65C13",
  "C3652": "Daily 65C15",
  "C3653": "Daily 65C17",
  "C3701": "Daily 70C15",
  "C3702": "Daily 70C17",
  "C3703": "Daily 70C18",
  "C3721": "Daily 72C18",
  "C3722": "Daily 72C21"
};

const IVECO_MODEL_ENGINE_MAP = {
  "CC170E22": "NEF / Tector 6 – 6.7 L",
  "150S21 / 15-210": "Tector 4 – 4.5 L",
  "170S28 / 17-280": "Tector 6 – 6.7 L",
  "10-190": "Tector 4 – 4.5 L",
  "Daily 50C17": "F1C 3.0 L",
  "Daily 45-10 bus": "Sofim 8140 / 2.8 L",
  "Daily 45-12 bus": "Sofim 8140 / 2.8 L",
  "Daily 46-10": "Sofim 8140 / 2.8 L",
  "Daily 46-12": "Sofim 8140 / 2.8 L",
  "Daily 46-14": "Sofim 8140 / 2.8 L",
  "Daily 47-10": "Sofim 8140 / 2.8 L",
  "Daily 47-12": "Sofim 8140 / 2.8 L",
  "Daily 47-14": "Sofim 8140 / 2.8 L",
  "Daily 35S11": "F1C 3.0 L",
  "Daily 35S12": "F1C 3.0 L",
  "Daily 35C12": "F1C 3.0 L",
  "Daily 35C13": "F1C 3.0 L",
  "Daily 35C15": "F1C 3.0 L",
  "Daily 65C13": "F1C 3.0 L",
  "Daily 65C15": "F1C 3.0 L",
  "Daily 65C17": "F1C 3.0 L",
  "Daily 70C15": "F1C 3.0 L",
  "Daily 70C17": "F1C 3.0 L",
  "Daily 70C18": "F1C 3.0 L",
  "Daily 72C18": "F1C 3.0 L",
  "Daily 72C21": "F1C 3.0 L"
};

const MERCEDES_BAUMUSTER_ENGINE_MAP = {
  "308300": "OM314", "308302": "OM314", "308304": "OM314", "308315": "OM314", "308325": "OM314",
  "312070": "OM312", "312076": "OM312", "312080": "OM312",
  "321050": "OM321", "321052": "OM321", "321054": "OM321", "321057": "OM321", "321058": "OM321", "321059": "OM321", "321061": "OM321",
  "321210": "OM321", "321212": "OM321", "321220": "OM321", "321222": "OM321",
  "321407": "OM321", "321408": "OM321", "321409": "OM321",
  "321412": "OM352", "321413": "OM352", "321414": "OM352", "321415": "OM352", "321416": "OM352", "321417": "OM352", "321418": "OM352", "321419": "OM352", "321420": "OM352", "321421": "OM352",
  "321423": "OM352", "321424": "OM352", "321426": "OM352", "321427": "OM352",
  "331304": "OM326", "331313": "OM326", "331314": "OM326", "331371": "OM326", "331373": "OM326",
  "344006": "OM352", "344007": "OM352", "344050": "OM321",
  "344052": "OM352", "344055": "OM352", "384055": "OM366", "344057": "OM352", "344058": "OM352",
  "344200": "OM326", "344201": "OM326", "344210": "OM326", "344211": "OM326", "344212": "OM326", "344213": "OM326",
  "344230": "OM352", "344231": "OM352",
  "344310": "OM352", "345050": "OM352",
  "345200": "OM352", "345210": "OM366", "345211": "OM366", "345220": "OM366", "345230": "OM352",
  "364101": "OM366", "364111": "OM366", "364152": "OM366", "364162": "OM366", "364173": "OM366",
  "364198": "OM447LA", "364207": "OM447", "364209": "OM447", "364272": "OM447", "364287": "OM447",
  "364298": "OM447LA", "364301": "OM447", "364302": "OM447", "364304": "OM447", "364305": "OM447",
  "364311": "OM447", "364355": "OM447", "364359": "OM447", "364400": "OM447",
  "368002": "OM366", "368004": "OM366", "368052": "OM366", "368054": "OM366LA", "368064": "OM366LA", "368074": "OM366LA",
  "368100": "OM447LA", "368104": "OM366LA", "368106": "OM366LA", "368112": "OM904LA", "368115": "OM366LA",
  "382000": "OM352", "382001": "OM352", "382002": "OM352", "382003": "OM352", "382004": "OM352", "382005": "OM352",
  "382010": "OM352", "382012": "OM352", "382020": "OM352", "382021": "OM352", "382022": "OM352",
  "382033": "OM366", "382035": "OM366", "382058": "OM366LA", "382068": "OM366LA", "382069": "OM366LA",
  "382070": "OM447", "382073": "OM447", "382075": "OM447", "382081": "OM447LA", "382083": "OM447LA", "382085": "OM447LA",
  "382111": "OM366", "382123": "OM366LA", "382143": "OM457LA",
  "382154": "OM906LA", "382155": "OM906LA", "382157": "OM457LA", "382158": "OM457LA",
  "382171": "OM457LA", "382175": "OM906LA", "382176": "OM457LA", "382177": "OM457LA", "382178": "OM457LA", "382180": "OM906LA", "382181": "OM906LA", "382182": "OM906LA", "382184": "OM906LA", "382185": "OM906LA", "382186": "OM906LA",
  "382187": "OM906LA", "382188": "OM906LA", "382189": "OM906LA",
  "384062": "OM924LA", "384063": "OM926LA", "384065": "OM924LA / OM926LA", "384067": "OM366 / OM904LA", "384069": "OM924LA",
  "384072": "OM924LA", "384073": "OM924LA", "384076": "OM926LA", "384078": "OM924LA", "384079": "OM366LA",
  "384081": "OM904LA", "384084": "OM904LA", "384087": "OM366LA", "384088": "OM904LA", "384089": "OM904LA",
  "384091": "OM366", "384098": "OM352", "384223": "OM904LA / OM924LA", "384373": "OM924LA", "384375": "OM924LA",
  "385085": "OM904LA",
  "634001": "OM457LA", "634011": "OM457LA", "634012": "OM457LA", "634014": "OM457LA", "634061": "OM457LA", "634071": "OM457LA", "634081": "OM457LA",
  "664002": "OM447", "664022": "OM447", "664025": "OM447", "664102": "OM447", "664105": "OM447",
  "664126": "OM447LA", "664188": "OM447LA", "664196": "OM447LA", "664198": "OM447LA", "664206": "OM447",
  "664231": "OM447LA", "664238": "OM447LA", "664239": "OM447LA", "664290": "OM447",
  "685202": "OM906LA", "685585": "OM457LA", "685595": "OM457LA", "685596": "OM906LA", "685597": "OM906LA",
  "688101": "OM364", "688156": "OM364", "688176": "OM364LA", "688177": "OM364", "688187": "OM364",
  "688270": "OM364", "688272": "OM364", "688276": "OM904LA", "688277": "OM904LA",
  "979272": "OM904LA", "979277": "OM924LA"
};

const MERCEDES_TRANSITION_MAP = {
  "308304": { year: 1987, before: "LO-608D", after: "LO-708D" },
  "344058": { year: 1987, before: "OF-1113", after: "OF-1114" },
  "345050": { year: 1987, before: "OF-1313", after: "OF-1314" },
  "345200": { year: 1987, before: "OH-1313", after: "OH-1316" },
  "384078": { year: 2004, before: "OF-1721", after: "OF-1722" },
  "384065": { year: 2004, before: "OF-1721L", after: "OF-1724L" },
  "384223": { year: 2004, before: "OF-1218", after: "OF-1219" },
  "688276": { year: 2004, before: "LO-914", after: "LO-915" },
  "688156": { year: 2002, before: "LO-610", after: "LO-712" },
  "382069": { year: 1998, before: "OH-1621L", after: "OH-1621LE" },
  "345211": { year: 1989, before: "OH-1419", after: "OH-1520" },
  "345220": { year: 1989, before: "OH-1517", after: "OH-1520" },
  "368002": { year: 1989, before: "OH-1518", after: "OH-1519" },
  "368004": { year: 1993, before: "OH-1518", after: "OH-1526" },
  "368054": { year: 1993, before: "OH-1519", after: "OH-1523" },
  "382070": { year: 1996, before: "OH-1625L", after: "OH-1628L" },
  "384067": { year: 2003, before: "OF-1417", after: "OF-1418" },
  "664105": { year: 1993, before: "O-371R", after: "O-400R" },
  "664126": { year: 1993, before: "O-371RS", after: "O-400RS" },
  "664188": { year: 1993, before: "O-371RSL", after: "O-400RSL" },
  "664198": { year: 1993, before: "O-371RSD", after: "O-400RSD" }
};

const VOLARE_TRANSITION_MAP = {
  "08": { year: 2011, before: "A5 ESMO", after: "A5HD EM" },
  "09": { year: 2011, before: "A5 ON", after: "A5HD ON" },
  "10": { year: 2011, before: "A5 MO", after: "A5HD MO" },
  "92": { year: 2011, before: "ACCESS ON", after: "ACCESS MO" }
};

const IVECO_TRANSITION_MAP = {
  "A01LF": { year: 2011, before: "150S21", after: "15-210" },
  "K1RMH": { year: 2011, before: "170S28", after: "17-280" }
};

function filterModelByYear(manufacturerId, code, currentName, year) {
  if (!year || !code) return currentName;
  let transMap = null;
  if (manufacturerId === "mercedes-benz" || manufacturerId === "mercedes") transMap = MERCEDES_TRANSITION_MAP;
  if (manufacturerId === "volare") transMap = VOLARE_TRANSITION_MAP;
  if (manufacturerId === "iveco") transMap = IVECO_TRANSITION_MAP;

  if (transMap && transMap[code]) {
    const trans = transMap[code];
    return year <= trans.year ? trans.before : trans.after;
  }
  return currentName;
}

const VOLARE_MODEL_MAP = {
  "01": "MP/Volare Escolar",
  "02": "MP/Volare Lotação",
  "03": "MP/Volare",
  "04": "A8 ESC",
  "05": "A8 ON",
  "06": "A8 MO",
  "07": "A5 ESON",
  "08": "A5 ESMO / A5HD EM",
  "09": "A5 ON / A5HD ON",
  "10": "A5 MO / A5HD MO",
  "11": "W8 ESC",
  "12": "W8 ON",
  "13": "W8 MO",
  "22": "A6 ESC",
  "23": "A6 ON",
  "24": "A6 MO",
  "25": "V8 ESC",
  "26": "V8 ON",
  "27": "V8 MO",
  "28": "V5 EO",
  "31": "V5HD MO",
  "32": "V5HD EO",
  "33": "V5HD EM",
  "34": "V5HD ON",
  "35": "V5HD MO",
  "36": "V6 ESC",
  "37": "V6 ON",
  "38": "V6 MO",
  "39": "W9 ESC",
  "40": "W9 ON",
  "41": "W9 MO",
  "42": "V8L ESC",
  "43": "V8L ON",
  "44": "V8L MO",
  "46": "W12 ON",
  "49": "DW9 ON",
  "50": "DW9 MO",
  "51": "V8L ESC",
  "54": "V8L EM",
  "55": "DW9 EO",
  "58": "V8L 4x4 EO",
  "59": "V8L 4x4 EM",
  "60": "V8L ON 4x4",
  "61": "V8L MO 4x4",
  "62": "W6 EO",
  "63": "W6 ON",
  "65": "W6 MO",
  "66": "WL EO",
  "68": "WL ON",
  "69": "WL MO",
  "70": "W7 EO",
  "71": "W7 EM",
  "72": "W7 ON",
  "73": "W7 MO",
  "74": "V6L EO",
  "75": "V6L EM",
  "77": "V6L MO",
  "78": "W8C EO",
  "80": "W8C ON",
  "82": "W-L EO",
  "84": "W-L ON",
  "85": "W-L MO",
  "86": "W9C EO",
  "88": "W9C ON",
  "89": "W9C MO",
  "90": "ACCESS EO",
  "91": "ACCESS EM",
  "92": "ACCESS ON/MO",
  "96": "V9L EO",
  "98": "V9L ON",
  "F8": "V10L",
  "A1": "CINCO EXM",
  "A2": "CINCO FRM",
  "A3": "CINCO ESM",
  "A5": "ELETRICO LE",
  "A7": "ACCESS E ON",
  "C1": "DV9L R",
  "C3": "DV9L U",
  "C5": "DV9L EO"
};

const VOLARE_MODEL_ENGINE_MAP = {
  "V6L EM": "Cummins ISF 3.8 152cv",
  "V8L ESC": "Cummins ISF 3.8 182cv",
  "V8L ON": "Cummins ISF 3.8 182cv",
  "V8L MO": "Cummins ISF 3.8 182cv",
  "V8L 4x4 EO": "Cummins ISF 3.8 182cv",
  "V8L 4x4 EM": "Cummins ISF 3.8 182cv",
  "V9L ON": "Cummins ISF 3.8 162cv",
  "V9L MO": "Cummins ISF 3.8 162cv",
  "V9L EM": "Cummins ISF 3.8 162cv",
  "V9L EO": "Cummins ISF 3.8 162cv",
  "V10L": "Cummins ISL - Euro 6"
};

function volareCarroceriaFromModelName(name) {
  const s = (name || "").toUpperCase();
  if (s.endsWith(" ESC")) return "Escolar";
  if (s.endsWith(" EM")) return "Escolar (Micro)";
  if (s.endsWith(" EO")) return "Escolar (Ônibus)";
  if (s.endsWith(" ON")) return "Ônibus";
  if (s.endsWith(" MO")) return "Micro-ônibus";
  if (s.includes("W-L")) return "Plataforma WL (MaxxForce)";
  return null;
}

function volareEngineFromModelName(name) {
  const s = (name || "").toUpperCase();
  if (!s) return null;
  if (s.startsWith("V3")) return "Cummins ISF 3.8 152cv";
  if (s.startsWith("V5")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("MP/VOLARE")) return "MWM 4.07 Sprint 140cv";
  if (s.startsWith("A5")) return "MWM 4.07 Sprint 140cv";
  if (s.startsWith("A6")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("A8")) return "MWM 4.07 Sprint 140cv";
  if (s.startsWith("V5HD")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("W5")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("V6L")) return "Cummins ISF 3.8 152cv";
  if (s.startsWith("V6 ")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("V8L")) return "Cummins ISF 3.8 182cv";
  if (s.startsWith("V8 ")) return "MWM 4.07 TCE 140cv";
  if (s.startsWith("V9L")) return "Cummins ISF 3.8 162cv";
  if (s.startsWith("W9C")) return "Cummins ISF 3.8 152cv";
  if (s.startsWith("W9")) return "MWM MaxxForce 4.8 165cv";
  if (s.startsWith("W7")) return "Cummins ISF 3.8 152cv";
  if (s.startsWith("WL") || s.startsWith("W-L")) return "MWM MaxxForce 4.8 165cv";
  if (s.startsWith("ACCESS")) return "Cummins ISF 3.8 162cv";
  if (s.startsWith("W8C")) return "MWM 4.12 TCE 130cv";
  if (s.startsWith("W12")) return "MWM 4.12 TCE 130cv";
  if (s.startsWith("DW9S")) return "Mercedes OM 904 LA";
  if (s.startsWith("DW9")) return "Mercedes OM 924 LA";
  return null;
}

function decodeIvecoA2(groups) {
  const wmi = (groups.wmi || "").toUpperCase();
  const tipo = (groups.tipo || "").toUpperCase();
  const ano = ivecoYearFromCode(groups.anoCodigo);
  const plantaMap = { "8": "Sete Lagoas – Brasil", "5": "Suzzana – Itália", "2": "Bréscia – Itália", "D": "Valladolid – Espanha", "X": "Córdoba – Argentina", "C": "Madri – Espanha" };
  const planta = plantaMap[(groups.planta || "").toUpperCase()] || groups.planta || null;
  const tokens = [
    { key: "fabricante", label: "Fabricante (WMI)", value: (WMI_INFO_MAP[wmi] && WMI_INFO_MAP[wmi].manufacturer) || wmi || null },
    { key: "tipo", label: "Tipo de veículo (código)", value: tipo || null },
    { key: "ano", label: "Ano Modelo", value: ano || null },
    { key: "planta", label: "Local de fabricação", value: planta },
    { key: "sequencia", label: "Sequência de produção", value: groups.sequencia || null }
  ];
  return { tokens, year: typeof ano === "number" ? ano : null };
}

function decodeIvecoA2Bus(groups) {
  const wmi = (groups.wmi || "").toUpperCase();
  const model5 = (groups.modelo5 || "").toUpperCase();
  const ano = ivecoYearFromCode(groups.anoCodigo);
  const plantaMap = { "8": "Sete Lagoas – Brasil", "5": "Suzzana – Itália", "2": "Bréscia – Itália", "D": "Valladolid – Espanha", "X": "Córdoba – Argentina", "C": "Madri – Espanha" };
  const planta = plantaMap[(groups.planta || "").toUpperCase()] || groups.planta || null;
  const modelMeaning = IVECO_BUS_MODEL_MAP[model5] || null;
  const filteredModelName = filterModelByYear("iveco", model5, modelMeaning, ano);
  const engineMeaning = filteredModelName ? IVECO_MODEL_ENGINE_MAP[filteredModelName] || null : null;
  const tokens = [
    { key: "fabricante", label: "Fabricante (WMI)", value: (WMI_INFO_MAP[wmi] && WMI_INFO_MAP[wmi].manufacturer) || wmi || null },
    { key: "modelo", label: "Modelo de chassi", value: filteredModelName || model5 || null },
    ...(engineMeaning ? [{ key: "motor", label: "Motor", value: engineMeaning }] : []),
    { key: "ano", label: "Ano Modelo", value: ano || null },
      { key: "planta", label: "Local de fabricação", value: planta },
      { key: "sequencia", label: "Sequência de produção", value: groups.sequencia6 || null }
    ];
  return { tokens, year: typeof ano === "number" ? ano : null };
}

function decodeVolare(groups) {
  const serie = groups.serie ? parseInt(groups.serie, 10) : null;
  const suf = (groups.sufixo || "").toUpperCase();
  const tokens = [
    { key: "familia", label: "Família", value: "Volare" },
    { key: "serie", label: "Série", value: serie != null ? "V" + serie : null },
    { key: "variante", label: "Variante", value: suf || null }
  ];
  return { tokens };
}

function volareYearFromCode(code) {
  const c = (code || "").toUpperCase();
  if (!c) return null;
  const early = { "W": 1998, "X": 1999, "Y": 2000 };
  if (early[c] != null) return early[c];
  if (/^[1-9]$/.test(c)) return 2000 + parseInt(c, 10);
  const late = { "A": 2010, "B": 2011, "C": 2012, "D": 2013, "E": 2014, "F": 2015, "G": 2016, "H": 2017, "J": 2018, "K": 2019, "L": 2020, "M": 2021, "N": 2022, "P": 2023, "R": 2024, "S": 2025, "T": 2026, "V": 2027, "W": 2028, "X": 2029, "Y": 2030 };
  if (late[c] != null) return late[c];
  return null;
}

function decodeVolareA2(groups) {
  const wmi = (groups.wmi || "").toUpperCase();
  const tipo = (groups.tipoVeiculo || "").toUpperCase();
  const modelo = (groups.modeloCod || "").toUpperCase();
  const motor = (groups.motorCod || "").toUpperCase();
  const carroceria = (groups.carroceriaCod || "").toUpperCase();
  const rodado = (groups.rodadoDECod || "").toUpperCase();
  const ano = volareYearFromCode(groups.anoCodigo);
  const plantaMap = { "C": "Caxias do Sul-RS", "S": "São Mateus-ES" };
  const planta = plantaMap[(groups.plantaCod || "").toUpperCase()] || groups.plantaCod || null;
  const tipoMap = { "B": "Chassis para ônibus/micro-ônibus" };
  const modeloMeaning = VOLARE_MODEL_MAP[modelo] || null;
  const filteredModelName = filterModelByYear("volare", modelo, modeloMeaning, ano);
  const engineFromModel = VOLARE_MODEL_ENGINE_MAP[filteredModelName] || null;
  const carroceriaFromModel = volareCarroceriaFromModelName(filteredModelName);
  const tokens = [
    { key: "fabricante", label: "Fabricante (WMI)", value: (WMI_INFO_MAP[wmi] && WMI_INFO_MAP[wmi].manufacturer) || "Volare (Marcopolo)" },
    { key: "tipo", label: "Tipo de veículo", value: tipoMap[tipo] || tipo || null },
    { key: "modelo", label: "Modelo do chassi", value: filteredModelName || modelo || null },
    { key: "motor", label: "Motor", value: engineFromModel || motor || null },
    { key: "carroceria", label: "Tipo de carroceria", value: carroceriaFromModel || carroceria || null },
    { key: "rodadoEE", label: "Rodado/Entre-eixos (código)", value: rodado || null },
    { key: "ano", label: "Ano Modelo", value: ano || null },
    { key: "planta", label: "Local de fabricação", value: planta },
    { key: "sequencia", label: "Sequência de produção", value: groups.sequencia || null }
  ];
  return { tokens, year: typeof ano === "number" ? ano : null };
}
export function createDecoder(rules, options) {
  const opts = options || {};
  return {
    decode(input) {
      const raw = normalizeInput(input);
      if (!raw) {
        return { input, type: "UNKNOWN", tokens: [], errors: ["entrada vazia"] };
      }
      const simple = raw.replace(/[\s]+/g, " ");
      const compact = raw.replace(/[\s-]/g, "");
      // Priorizar padrões específicos de montadora antes de VIN,
      // para evitar classificar códigos (ex.: MB ABR-1986) como VIN quando tiverem 17 chars.
      const hintId = guessManufacturerByFirstPosition(simple, rules);
      const filteredRules = hintId
        ? { ...rules, manufacturers: (rules.manufacturers || []).filter(m => m.id === hintId) }
        : rules;
      const model = matchModelByPatterns(simple, filteredRules);
      if (model) {
        const man = model.manufacturer;
        let yearForPeriod = null;
        let tokens = [];
        if (man.id === "vwco" && model.pattern.name === "VolksbusNomenclature") {
          const periodTmp = pickPeriod(man, null, (model.groups.sigla || "").toUpperCase());
          const vw = decodeVolksbus(model.groups, periodTmp);
          tokens = vw.tokens;
        } else if (man.id === "vwco" && model.pattern.name === "Volksbus953") {
          const vw953 = decodeVolksbus953(model.groups);
          tokens = vw953.tokens;
          yearForPeriod = vw953.year || null;
        } else if (man.id === "agrale" && (model.pattern.name === "AgraleA1" || model.pattern.name === "AgraleA2")) {
          const ag = decodeAgrale(model.groups, model.pattern.name);
          tokens = ag.tokens;
          yearForPeriod = ag.year;
        } else if (man.id === "mercedes-benz" && (model.pattern.name === "MB_ABR1986" || model.pattern.name === "MB_OF" || model.pattern.name === "MB_LO" || model.pattern.name === "MB_O500" || model.pattern.name === "MB_OXXX")) {
          const mb = decodeMercedes({ ...model.groups, __baumusterMap: opts.mercedesBaumusterMap || {} }, model.pattern.name);
          tokens = mb.tokens;
          if (mb.year != null) yearForPeriod = mb.year;
        } else if (man.id === "scania" && model.pattern.name === "ScaniaSeries") {
          const sc = decodeScania(model.groups);
          tokens = sc.tokens;
        } else if (man.id === "volvo" && model.pattern.name === "VolvoB") {
          const vo = decodeVolvo(model.groups);
          tokens = vo.tokens;
        } else if (man.id === "iveco" && model.pattern.name === "IvecoGeneric") {
          const iv = decodeIveco(model.groups);
          tokens = iv.tokens;
        } else if (man.id === "iveco" && model.pattern.name === "IvecoA2") {
          const iv2 = decodeIvecoA2(model.groups);
          tokens = iv2.tokens;
          if (iv2.year != null) yearForPeriod = iv2.year;
        } else if (man.id === "iveco" && model.pattern.name === "IvecoA2Bus") {
          const ivb = decodeIvecoA2Bus(model.groups);
          tokens = ivb.tokens;
          if (ivb.year != null) yearForPeriod = ivb.year;
        } else if (man.id === "volare" && model.pattern.name === "VolareGeneric") {
          const vo2 = decodeVolare(model.groups);
          tokens = vo2.tokens;
        } else if (man.id === "volare" && model.pattern.name === "VolareA2") {
          // Passar mapa de motores por modelo via options
          const vo3 = decodeVolareA2({ ...model.groups, __engineMap: opts.volareEngineMap || {} });
          tokens = vo3.tokens;
          if (vo3.year != null) yearForPeriod = vo3.year;
          
          // Adicionar Norma de Emissões para o padrão VolareA2
          const emV = emissionStandard(yearForPeriod);
          if (emV) {
            tokens.push({ key: "emissoes", label: "Norma de emissões", value: emV });
          }
        } else {
          tokens = defaultTokensFromGroups(model.groups);
        }
        const period = pickPeriod(man, yearForPeriod, null);
        const em = emissionStandard(yearForPeriod);
        if (em) {
          tokens.push({ key: "emissoes", label: "Norma de emissões", value: em });
        }
        const extraRaw = {};
        if (man.id === "mercedes-benz") {
          extraRaw.ruleDoc = "data/rules/mercedes.json";
        } else if (man.id === "agrale") {
          extraRaw.ruleDoc = "data/rules/agrale.json";
        } else if (man.id === "iveco") {
          extraRaw.ruleDoc = "data/rules/iveco.json";
        } else if (man.id === "scania") {
          extraRaw.ruleDoc = "data/rules/scania.json";
        } else if (man.id === "vwco") {
          extraRaw.ruleDoc = "data/rules/vwco.json";
        } else if (man.id === "volvo") {
          extraRaw.ruleDoc = "data/rules/volvo.json";
        } else if (man.id === "volare") {
          extraRaw.ruleDoc = "data/rules/volare.json";
        }
        return {
          input,
          type: "MODEL",
          manufacturerId: man.id,
          manufacturerName: man.name,
          period: period ? period.range : null,
          year: yearForPeriod || null,
          tokens,
          raw: { groups: model.groups, pattern: model.pattern.name, ...extraRaw }
        };
      }
      // WMI apenas (3 primeiros caracteres)
      if (/^[A-Z0-9]{3}$/.test(compact)) {
        const w = decodeWMI3(compact);
        if (w) {
          return { input, type: w.type, tokens: w.tokens, errors: [] };
        }
        return { input, type: "UNKNOWN", tokens: [], errors: ["WMI não encontrado"] };
      }
      if (isVin(simple)) {
        const v = compact.toUpperCase();
        const m = detectManufacturerByVin(v, rules);
        const wmi3 = v.slice(0, 3);
        const wmiInfo = WMI_INFO_MAP[wmi3] || null;

        if (!m && !wmiInfo) {
          return { input, type: "UNKNOWN", tokens: [], errors: ["WMI não encontrado"] };
        }

        const checkOk = vinCheckDigitValid(v);
        const yearCode = v[9];
        let year = yearFromCode2001(yearCode) || vinYearFromCode(yearCode);
        if (m && m.id === "scania") year = scaniaYearFromCode(yearCode);
        if (m && m.id === "volare") year = volareYearFromCode(yearCode) || year;
        const period = m ? pickPeriod(m, year, null) : null;
        const emission = emissionStandard(year);
        const plantCode = v[10];
        let plantMeaning = null;
        if (m && m.id === "iveco") {
          const ivecoPlantMap = { "8": "Sete Lagoas – Brasil", "5": "Suzzana – Itália", "2": "Bréscia – Itália", "D": "Valladolid – Espanha", "X": "Córdoba – Argentina", "C": "Madri – Espanha" };
          plantMeaning = ivecoPlantMap[(plantCode || "").toUpperCase()] || null;
        } else if (m && m.id === "scania") {
          const scaniaPlantMap = { "2": "Planta 2 (Brasil)", "3": "Planta 3 (Brasil)" };
          plantMeaning = scaniaPlantMap[(plantCode || "").toUpperCase()] || null;
        } else if (m && m.id === "volare") {
          const volarePlantMap = { "C": "Caxias do Sul-RS", "S": "São Mateus-ES" };
          plantMeaning = volarePlantMap[(plantCode || "").toUpperCase()] || null;
        } else if (m && m.id === "vwco") {
          const vwcoPlantMap = { "R": "Resende-RJ" };
          plantMeaning = vwcoPlantMap[(plantCode || "").toUpperCase()] || null;
        } else if (m && m.id === "volvo") {
          const volvoPlantMap = { "A": "Bus Corporation", "E": "Brasil", "G": "Peru", "L": "Colômbia" };
          plantMeaning = volvoPlantMap[(plantCode || "").toUpperCase()] || null;
        }
        
        const vdsCode = v.slice(3, 9).toUpperCase();
        let vdsMeaning = null;
        let volvoModelName = null;
        let vwcoFamiliaName = null;
        let vwcoCarroceriaName = null;
        
        if (m && m.id === "scania") {
          vdsMeaning = SCANIA_VDS_MAP[vdsCode] || 
                       SCANIA_VDS_MAP[vdsCode.slice(0, 4)] || 
                       SCANIA_VDS_MAP[vdsCode.slice(0, 2)] || null;
        } else if (m && m.id === "vwco") {
          const carroceria = v[3] === "2" ? "Volksbus" : null;
          const familiaKey1 = v.slice(3, 6).toUpperCase();
          const familiaKey2 = v.slice(4, 7).toUpperCase();
          const familia = VWCO_VDS_FAMILY_MAP_2012[familiaKey1] || VWCO_VDS_FAMILY_MAP_2012[familiaKey2] || null;
          vwcoCarroceriaName = carroceria || null;
          vwcoFamiliaName = familia || null;
        } else if (m && m.id === "volvo") {
          const code4 = v.slice(3, 7).toUpperCase();
          const code5 = v.slice(3, 8).toUpperCase();
          const code6 = v.slice(3, 9).toUpperCase();
          const modelo = VOLVO_VDS_MAP[code6] || VOLVO_VDS_MAP[code5] || VOLVO_VDS_MAP[code4] || null;
          volvoModelName = modelo || null;
        }

        const commonBodywork = getBusBodyworkByModel(m ? m.id : null, volvoModelName || vwcoFamiliaName || vdsMeaning || vdsCode);
        const bodybuilderName = wmiInfo ? wmiInfo.bodybuilder : null;
        const bodybuilderModel = getBusModelByVds(v.slice(0, 3), v.slice(3, 9));

        if (m && m.id === "volare") {
          const tipoMap = { "B": "Chassis para ônibus/micro-ônibus" };
          const modeloCode = v.slice(4, 6);
          const modeloMeaning = VOLARE_MODEL_MAP[modeloCode] || null;
          const engineMap = opts.volareEngineMap || {};
          const engineFromModel = engineMap[modeloMeaning] || VOLARE_MODEL_ENGINE_MAP[modeloMeaning] || volareEngineFromModelName(modeloMeaning) || null;
          const carroceriaFromModel = volareCarroceriaFromModelName(modeloMeaning);
          
          return {
            input,
            type: "VIN",
            manufacturerId: m.id,
            manufacturerName: m.name,
            year: year || null,
            period: period ? period.range : null,
            tokens: [
              { key: "wmi", label: "WMI", value: v.slice(0, 3) },
              { key: "fabricante", label: "Fabricante", value: m.name },
              ...(bodybuilderName ? [{ key: "encarrocadora", label: "Encarroçadora", value: bodybuilderName }] : []),
              { key: "modelo", label: "Modelo do chassi", value: modeloMeaning || modeloCode },
              { key: "motor", label: "Motor", value: engineFromModel || null },
              { key: "carroceria", label: "Tipo de carroceria", value: carroceriaFromModel || null },
              { key: "vis", label: "VIS", value: v.slice(9) },
              { key: "ano", label: "Ano Modelo", value: year || null },
              { key: "emissoes", label: "Norma de emissões", value: emission }
            ],
            raw: {},
            errors: []
          };
        } else {
          return {
            input,
            type: "VIN",
            manufacturerId: m ? m.id : null,
            manufacturerName: m ? m.name : null,
            year: year || null,
            period: period ? period.range : null,
            tokens: [
              { key: "wmi", label: "WMI", value: v.slice(0, 3) },
              { key: "fabricante", label: "Fabricante", value: m ? m.name : (wmiInfo ? wmiInfo.manufacturer : null) },
              ...(bodybuilderName ? [{ key: "encarrocadora", label: "Encarroçadora", value: bodybuilderName }] : []),
              ...(bodybuilderModel && bodybuilderModel.model ? [{ key: "modeloCarroceria", label: "Modelo da Carroceria", value: bodybuilderModel.model }] : []),
              ...(bodybuilderModel && bodybuilderModel.chassis ? [{ key: "chassiBase", label: "Chassi (Base)", value: bodybuilderModel.chassis }] : []),
              ...(m && m.id === "volvo" && volvoModelName ? [{ key: "modelo", label: "Chassi/Motor", value: volvoModelName }] : []),
              ...(m && m.id === "volvo" && volvoModelName && VOLVO_MODEL_ENGINE_MAP[volvoModelName] ? [{ key: "motor", label: "Motor", value: VOLVO_MODEL_ENGINE_MAP[volvoModelName] }] : []),
              ...(m && m.id === "vwco" && vwcoFamiliaName ? [{ key: "modelo", label: "Modelo do chassi", value: vwcoFamiliaName }] : []),
              ...(commonBodywork ? [{ key: "carroceria", label: "Tipo de carroceria", value: commonBodywork }] : []),
              ...(m && m.id === "vwco" && vwcoCarroceriaName && !commonBodywork ? [{ key: "carroceria", label: "Carroceria", value: vwcoCarroceriaName }] : []),
              ...(m && m.id === "vwco" && vwcoFamiliaName ? [{
                key: "motorPos",
                label: "Posição do motor",
                value: /OT/.test(vwcoFamiliaName) ? "Traseiro" : (/OD/.test(vwcoFamiliaName) ? "Dianteiro" : null)
              }] : []),
              ...(m && m.id === "vwco" && vwcoFamiliaName && VWCO_MODEL_ENGINE_MAP[vwcoFamiliaName] ? [{
                key: "motor",
                label: "Motor",
                value: VWCO_MODEL_ENGINE_MAP[vwcoFamiliaName]
              }] : []),
              { key: "vds", label: "VDS", value: v.slice(3, 9) },
              { key: "vis", label: "VIS", value: v.slice(9) },
              { key: "ano", label: "Ano Modelo", value: year || null },
              { key: "dv", label: "Dígito verificador", value: v[8] },
              { key: "emissoes", label: "Norma de emissões", value: emission }
            ],
            raw: { checkDigitValid: checkOk },
            errors: checkOk ? [] : ["dígito verificador inválido"]
          };
        }
      }
      return { input, type: "UNKNOWN", tokens: [], errors: ["formato não reconhecido"] };
    }
  };
}
