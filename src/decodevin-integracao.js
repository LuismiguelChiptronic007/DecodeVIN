/**
 * INTEGRAÇÃO ONIBUSBRASIL → DecodeVIN (v6 - Timeout Forçado)
 * Esta versão inclui uma função fetchWithTimeout para prevenir que a UI congele
 * em caso de APIs lentas ou que não respondem.
 */

const WORKER_URL    = "https://onibusbrasil-proxy.luismiguelgomesoliveira-014.workers.dev";
const KEPLACA_URL   = "https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev";

/**
 * Executa uma requisição fetch com um limite de tempo.
 * Se a requisição demorar mais que o timeout, a Promise é rejeitada.
 * @param {string} resource O URL do recurso a ser buscado.
 * @param {object} options Opções do fetch, incluindo um `timeout` em milissegundos.
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = (resource, options = {}) => {
  const { timeout = 8000 } = options; // 8 segundos de timeout padrão

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timed out'));
    }, timeout);

    fetch(resource, {
      ...options,
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(id);
      resolve(response);
    })
    .catch(err => {
      clearTimeout(id);
      reject(err);
    });
  });
};

async function buscarDadosOnibusBrasil(placa, render = true, docRef) {
  const doc = docRef || document;

  if (!placa || placa.trim().length < 7) return null;

  const secao            = doc.getElementById("secao-onibusbrasil");
  const elCarroceria     = doc.getElementById("ob_carroceria");
  const elEncarrocadeira = doc.getElementById("ob_encarrocadeira");
  const elChassi         = doc.getElementById("ob_chassi");
  const elFabChassi      = doc.getElementById("ob_fabricante_chassi");
  const elFoto           = doc.getElementById("ob_foto");
  const elFonte          = doc.getElementById("ob_fonte");
  const elStatus         = doc.getElementById("ob_status");

  if (render && secao) secao.style.display = "block";

  if (render) {
    if (elCarroceria)     elCarroceria.textContent     = "—";
    if (elEncarrocadeira) elEncarrocadeira.textContent = "—";
    if (elChassi)         elChassi.textContent         = "—";
    if (elFabChassi)      elFabChassi.textContent      = "—";
    if (elFoto)           { elFoto.src = ""; elFoto.style.display = "none"; }
    if (elFonte)          elFonte.style.display        = "none";
  if (elStatus) {
    elStatus.textContent = "🔍 Buscando dados no OnibusBrasil...";
    elStatus.style.color = "#f0a500";
  }
}

const placaUpper = placa.trim().toUpperCase();

try {
  //  T — OnibusBrasil com Timeout
  let dados = {};
  try {
    const response = await fetchWithTimeout(`${WORKER_URL}/?placa=${placaUpper}`);
    dados = await response.json();
  } catch (e) {
    console.error("OB Worker CATCH:", e.message);
    dados = { success: false, erro: "Erro de conexão ou timeout" };
  }

  const naoEncontrado = !dados.success || (dados.erro && dados.erro.length > 0);

  if (!naoEncontrado) { 
    preencherUI({ 
      carroceria:     dados.carroceria    || "—", 
      encarrocadeira: dados.encarrocadora || "—", 
      chassi:         dados.chassi        || "—", 
      fabricante:     dados.fabricante    || "—", 
      foto_url:       dados.foto_url      || null, 
      fonte:          dados.fonte         || null, 
      fonte_cache:    dados.fonte_cache   || false, 
    }, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus); 
    return dados; 
  } 
  
  //  Não achou no OnibusBrasil — tenta o keplaca-proxy com Timeout
  if (elStatus) { 
    elStatus.textContent = "🔄 Buscando via KePlaca..."; 
    elStatus.style.color = "#f0a500"; 
  } 

    try {
      const respKe = await fetchWithTimeout(`${KEPLACA_URL}/?placa=${placaUpper}`);
      const dadosKe = await respKe.json();

      if (dadosKe.status === "ok" && dadosKe.chassi_completo) {
        const dadosFallback = {
          carroceria:     "—",
          encarrocadeira: "—",
          chassi:         dadosKe.chassi_completo || "—",
          fabricante:     "—",
          foto_url:       null,
          fonte:          null,
          fonte_cache:    dadosKe.fonte === "cache",
          final_chassi:   dadosKe.final_chassi,
        };
        preencherUI(dadosFallback, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus, true); 
        return dadosFallback; 
      } 
    } catch (errKe) {
      console.error("KePlaca fallback CATCH:", errKe.message);
    }

    //  Nenhuma fonte encontrou 
    if (elStatus) { 
      elStatus.textContent = `⚠️ Placa ${placaUpper} sem ficha nas fontes disponíveis.`; 
      elStatus.style.color = "#e74c3c"; 
    } 
    return { erro: "Placa não encontrada em nenhuma fonte." };

  } catch (err) {
    if (elStatus) {
      elStatus.textContent = "❌ Erro geral ao conectar com os servidores.";
      elStatus.style.color = "#e74c3c";
    }
    console.error("Erro geral na busca:", err);
    return { erro: "Erro geral ao conectar com os servidores." };
  }
}

// ── Função auxiliar para remover skeletons ────────────────
function removerSkeleton(el) { 
  if (!el || !el.classList) return; 

  el.classList.remove("loading"); 
  el.classList.remove("skeleton"); 
  el.classList.remove("skeleton-value"); 
} 

// ── Função auxiliar para preencher a UI ──────────────────
function preencherUI(dados, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus, isFallback = false) {
  if (elCarroceria) { 
    elCarroceria.textContent = dados.carroceria || "—"; 
    removerSkeleton(elCarroceria); 
  }
  if (elEncarrocadeira) { 
    elEncarrocadeira.textContent = dados.encarrocadeira || "—"; 
    removerSkeleton(elEncarrocadeira); 
  }
  if (elChassi) { 
    elChassi.textContent = dados.chassi || "—"; 
    removerSkeleton(elChassi); 
  }
  if (elFabChassi) { 
    elFabChassi.textContent = dados.fabricante || "—"; 
    removerSkeleton(elFabChassi); 
  }

  if (elFoto && dados.foto_url) {
    elFoto.src = dados.foto_url;
    elFoto.style.display = "block";
  }

  if (elFonte && dados.fonte) {
    elFonte.href = dados.fonte;
    elFonte.textContent = "Ver ficha completa no Ônibus Brasil";
    elFonte.style.display = "inline-block";
  }

  if (elStatus) {
    if (isFallback) {
      elStatus.textContent = `✅ Chassi encontrado: ${dados.final_chassi || dados.chassi}${dados.fonte_cache ? " (cache)" : ""}`;
    } else {
      elStatus.textContent = `✅ Dados encontrados!${dados.fonte_cache ? " (cache)" : ""}`;
    }
    elStatus.style.color = "#2ecc71";
  }
}

window.buscarDadosOnibusBrasil = buscarDadosOnibusBrasil;
