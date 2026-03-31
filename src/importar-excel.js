
 
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

// Lê a planilha, monta pares placa/chassi e preenche a área de consulta em grupo.
function lerExcelEPopularGrupo(file) { 
  const reader = new FileReader(); 
  reader.onload = function(e) { 
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' }); 
      const ws = wb.Sheets[wb.SheetNames[0]]; 
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); 
  
      const itens = []; 
  
      rows.forEach((row, rowIndex) => { 
        if (Array.isArray(row)) {
          row.forEach(cell => { 
            const detectado = detectarTipo(cell); 
            if (detectado) itens.push({ ...detectado, row: rowIndex }); 
          }); 
        }
      }); 
  
      const placas  = itens.filter(i => i.tipo === 'placa'); 
      const chassis = itens.filter(i => i.tipo === 'chassi'); 
      const pares   = []; 

      placas.forEach(p => { 
        const idx = chassis.findIndex(c => Math.abs(c.row - p.row) <= 1); 
        if (idx !== -1) { 
          pares.push({ placa: p.valor, chassi: chassis[idx].valor }); 
          chassis.splice(idx, 1); 
        } else { 
          pares.push({ placa: p.valor, chassi: '' }); 
        } 
      }); 
      chassis.forEach(c => pares.push({ placa: '', chassi: c.valor })); 

      const paresLimpos = pares.filter(p => p.placa || p.chassi);

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
} 

window.lerExcelEPopularGrupo = lerExcelEPopularGrupo; 
