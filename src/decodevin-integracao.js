/**
 * INTEGRAÇÃO ONIBUSBRASIL → DecodeVIN (v4 - com fallback keplaca)
 */

const WORKER_URL    = "https://onibusbrasil-proxy.luismiguelgomesoliveira-014.workers.dev";
const KEPLACA_URL   = "https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev";

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
    // ✅ TENTATIVA 1 — OnibusBrasil
    const response = await fetch(`${WORKER_URL}/?placa=${placaUpper}`);
    const dados = await response.json();

    const naoEncontrado = !dados.success || dados.erro ||
      (typeof dados.erro === "string" && dados.erro.length > 0);

    if (!naoEncontrado) {
      // ✅ Achou no OnibusBrasil — preenche e retorna
      if (render) preencherUI({ 
        carroceria:     dados.carroceria     || dados.modelo_chassi || "—",
        encarrocadeira: dados.encarrocadora  || "—",
        chassi:         dados.chassi        || "—",
        fabricante:     dados.fabricante     || "—",
        foto_url:       dados.foto_url       || null,
        fonte:          dados.fonte          || null,
        fonte_cache:    dados.fonte_cache    || false,
      }, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus);
      return dados;
    }

    //  Não achou no OnibusBrasil — tenta o keplaca-proxy
    if (render && elStatus) {
      elStatus.textContent = "🔄 Buscando via KePlaca...";
      elStatus.style.color = "#f0a500";
    }

    const respKe = await fetch(`${KEPLACA_URL}/?placa=${placaUpper}`);
    const dadosKe = await respKe.json();

    if (dadosKe.status === "ok" && dadosKe.chassi_completo) {
      const dadosFallback = {
        carroceria:     "—",
        encarrocadeira: "—",
        chassi:         dadosKe.chassi_completo  || "—",
        fabricante:     "—",
        foto_url:       null,
        fonte:          null,
        fonte_cache:    dadosKe.fonte === "cache",
        final_chassi:   dadosKe.final_chassi,
      };

      if (render) preencherUI(dadosFallback, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus, true);
      return dadosFallback;
    }

    //  Nenhuma fonte encontrou
    if (render && elStatus) {
      elStatus.textContent = `⚠️ Placa ${placaUpper} sem ficha nas fontes disponíveis.`;
      elStatus.style.color = "#e74c3c";
    }
    return { erro: "Placa não encontrada em nenhuma fonte." };

  } catch (err) {
    if (render && elStatus) {
      elStatus.textContent = "❌ Erro ao conectar com o servidor proxy.";
      elStatus.style.color = "#e74c3c";
    }
    console.error("Erro OnibusBrasil:", err);
    return { erro: "Erro ao conectar com o servidor proxy." };
  }
}

// ── Função auxiliar para preencher a UI ──────────────────
function preencherUI(dados, elCarroceria, elEncarrocadeira, elChassi, elFabChassi, elFoto, elFonte, elStatus, isFallback = false) {
  if (elCarroceria)     elCarroceria.textContent     = dados.carroceria     || "—";
  if (elEncarrocadeira) elEncarrocadeira.textContent = dados.encarrocadeira || "—";
  if (elChassi)         elChassi.textContent         = dados.chassi         || "—";
  if (elFabChassi)      elFabChassi.textContent      = dados.fabricante     || "—";

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
