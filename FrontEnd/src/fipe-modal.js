
// FIPE MODAL + CRUZAMENTO

window.FipeComparador = (function () {
  // Mapa interno: codigoFipe -> [ { codigo, estudo, telc, ano } ]
  let _fipeMap = new Map();
  let _usarFipe = false;

  //Normaliza string para comparação
  function normalize(str) {
    return String(str).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // Expõe se a planilha foi carregada
  function ativo() { return _usarFipe && _fipeMap.size > 0; }

  //Carrega planilha FIPE (XLSX ou CSV) e monta o Map
  function carregarPlanilha(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const sheetName = wb.SheetNames.find(name =>
            normalize(name) === 'montadoras'
          ) || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          _fipeMap.clear();

          if (rows.length === 0) {
            reject('Planilha vazia'); return;
          }

          const findHeaderRow = () => {
            return rows.findIndex(row => {
              if (!Array.isArray(row)) return false;
              const normalized = row.map(cell => normalize(cell));
              return normalized.some(cell => ['codigofipe', 'fipe', 'codigo'].includes(cell));
            });
          };

          const headerRowIndex = findHeaderRow();
          if (headerRowIndex === -1) {
            reject('Cabeçalho de FIPE não encontrado. Verifique a primeira linha da planilha.'); return;
          }

          const headerRow = rows[headerRowIndex].map(cell => String(cell || ''));

          const findColIdx = (names) => headerRow.findIndex(cell =>
            names.some(n => normalize(cell) === normalize(n))
          );

          const limpar = (val) => {
            const s = String(val || '').trim();
            return (s === '\\N' || s === '' || s === 'NULL' || s === 'null') ? '—' : s;
          };

          const idxFipe   = findColIdx(['codigo fipe', 'codigofipe', 'fipe', 'cod fipe', 'codfipe', 'codigo_fipe', 'fipe_codigo']);
          const idxAno    = findColIdx(['ano', 'ano modelo', 'ano_modelo', 'modelo ano', 'year']);
          const idxCodigo = findColIdx(['codigo', 'código', 'cod']);
          const idxEstudo = findColIdx(['estudo']);
          const idxTelc   = findColIdx(['telc', 'telc_telemetria', 'telctelemetria', 'telemetria']);

          if (idxFipe === -1) {
            reject(`Coluna de Código FIPE não encontrada na planilha. Verifique os cabeçalhos: ${headerRow.join(', ')}`); return;
          }

          const dataRows = rows.slice(headerRowIndex + 1);
          dataRows.forEach(row => {
            const chave = String(row[idxFipe] || '').trim();
            if (!chave) return;
            const ano = idxAno >= 0 ? limpar(row[idxAno]) : '';
            const entry = {
              codigo: idxCodigo >= 0 ? limpar(row[idxCodigo]) : '—',
              estudo: idxEstudo >= 0 ? limpar(row[idxEstudo]) : '—',
              telc:   idxTelc   >= 0 ? limpar(row[idxTelc])   : '—',
              ano:    ano,
            };

            if (!_fipeMap.has(chave)) {
              _fipeMap.set(chave, []);
            }
            _fipeMap.get(chave).push(entry);
          });

          resolve(_fipeMap.size);
        } catch (err) {
          reject('Erro ao ler planilha: ' + err.message);
        }
      };
      reader.onerror = () => reject('Erro ao ler arquivo');
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Busca dados FIPE para um código, preferindo ano quando fornecido
  function buscar(codigoFipe, anoVeiculo = '') {
    if (!codigoFipe) return null;
    const chave = String(codigoFipe).trim();
    const rows = _fipeMap.get(chave);
    if (!rows || rows.length === 0) return null;

    if (anoVeiculo) {
      const anoBase = String(anoVeiculo).trim().split('/')[0];
      const match = rows.find(row => String(row.ano || '').includes(anoBase));
      if (match) return match;
    }

    return rows[0] || null;
  }

  //Seta se o usuario optou por usar FIPE
  function setAtivo(val) { _usarFipe = val; }

  return { ativo, carregarPlanilha, buscar, setAtivo, normalize };
})();


// CONTROLE DO MODAL

(function () {
  const overlay     = document.getElementById('modal-fipe-overlay');
  const btnNao      = document.getElementById('btn-fipe-nao');
  const btnSim      = document.getElementById('btn-fipe-sim');
  const uploadArea  = document.getElementById('fipe-upload-area');
  const fileInput   = document.getElementById('fipe-file-input');
  const fileInfo    = document.getElementById('fipe-file-info');
  const uploadText  = document.getElementById('fipe-upload-text');
  const btnConfirmar = document.getElementById('btn-fipe-confirmar');

  let _callbackDecodificar = null;
  let _planilhaCarregada = false;

  // ── Abre o modal e guarda o callback para quando confirmar
  window.abrirModalFipe = function (callbackDecodificar) {
    _callbackDecodificar = callbackDecodificar;
    _planilhaCarregada = false;
    uploadArea.style.display = 'none';
    fileInfo.style.display = 'none';
    fileInfo.style.color = '';
    btnConfirmar.style.display = 'none';
    uploadText.textContent = '📂 Clique para selecionar a planilha FIPE (.xlsx ou .csv)';
    fileInput.value = '';
    overlay.style.display = 'flex';
  };

  function atualizarColunasFipe() {
    ['th-fipe-codigo', 'th-fipe-estudo', 'th-fipe-telc'].forEach(id => {
      const th = document.getElementById(id);
      if (th) th.style.display = FipeComparador.ativo() ? '' : 'none';
    });
  }

  function fecharModal() {
    overlay.style.display = 'none';
  }

  // ── Não usar FIPE — decodifica direto
  btnNao.addEventListener('click', () => {
    FipeComparador.setAtivo(false);
    atualizarColunasFipe();
    fecharModal();
    if (_callbackDecodificar) _callbackDecodificar();
  });

  // Sim — mostra upload
  btnSim.addEventListener('click', () => {
    FipeComparador.setAtivo(true);
    atualizarColunasFipe();
    uploadArea.style.display = 'flex';
  });

  // Arquivo selecionado
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadText.textContent = '⏳ Carregando planilha...';
    fileInfo.style.display = 'none';
    fileInfo.style.color = '';
    try {
      const total = await FipeComparador.carregarPlanilha(file);
      fileInfo.style.display = 'block';
      fileInfo.innerHTML = `✅ <strong>${file.name}</strong> — ${total} registros FIPE carregados`;
      btnConfirmar.style.display = 'block';
      uploadText.textContent = '📂 ' + file.name;
      _planilhaCarregada = true;
    } catch (err) {
      fileInfo.style.display = 'block';
      fileInfo.style.color = '#ef4444';
      fileInfo.textContent = '❌ ' + err;
      uploadText.textContent = '📂 Clique para selecionar a planilha FIPE (.xlsx ou .csv)';
      _planilhaCarregada = false;
    } finally {
      fileInput.value = '';
    }
  });

  // Confirmar e decodificar com FIPE
  btnConfirmar.addEventListener('click', () => {
    if (!_planilhaCarregada) return;
    atualizarColunasFipe();
    fecharModal();
    if (_callbackDecodificar) _callbackDecodificar();
  });

  // Fecha clicando fora
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      FipeComparador.setAtivo(false);
      fecharModal();
      if (_callbackDecodificar) _callbackDecodificar();
    }
  });
})();