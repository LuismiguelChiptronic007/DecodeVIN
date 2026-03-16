/**
 * INTEGRAÇÃO ONIBUSBRASIL → DecodeVIN (v3 - corrigido)
 */

const WORKER_URL = "https://onibusbrasil-proxy.luismiguelgomesoliveira-014.workers.dev";

async function buscarDadosOnibusBrasil(placa, render = true) {
  if (!placa || placa.trim().length < 7) return null;

  const secao            = document.getElementById("secao-onibusbrasil");
  const elCarroceria     = document.getElementById("ob_carroceria");
  const elEncarrocadeira = document.getElementById("ob_encarrocadeira");
  const elChassi         = document.getElementById("ob_chassi");
  const elFabChassi      = document.getElementById("ob_fabricante_chassi");
  const elFoto           = document.getElementById("ob_foto");
  const elFonte          = document.getElementById("ob_fonte");
  const elStatus         = document.getElementById("ob_status");

  // ✅ Mostra a seção apenas se render for true
  if (render && secao) secao.style.display = "block";
 
  // Reset campos apenas se render for true
  if (render) {
    if (elCarroceria)     elCarroceria.textContent     = "—";
    if (elEncarrocadeira) elEncarrocadeira.textContent = "—";
    if (elChassi)         elChassi.textContent         = "—";
    if (elFabChassi)      elFabChassi.textContent      = "—";
    if (elFoto)           { elFoto.src = ""; elFoto.style.display = "none"; }
    if (elFonte)          elFonte.style.display        = "none";

    // Loading
    if (elStatus) {
      elStatus.textContent = "🔍 Buscando dados no OnibusBrasil...";
      elStatus.style.color = "#f0a500";
    }
  }

  try {
    const response = await fetch(`${WORKER_URL}/?placa=${placa.trim().toUpperCase()}`);
    const dados = await response.json();

    if (dados.erro) {
      if (render && elStatus) {
        elStatus.textContent = "⚠️ " + dados.erro;
        elStatus.style.color = "#e74c3c";
      }
      return dados;
    }

    // Preenche campos apenas se render for true
    if (render) {
      if (elCarroceria)     elCarroceria.textContent     = dados.carroceria        || "—";
      if (elEncarrocadeira) elEncarrocadeira.textContent = dados.encarrocadeira    || "—";
      if (elChassi)         elChassi.textContent         = dados.modelo_chassi     || "—";
      if (elFabChassi)      elFabChassi.textContent      = dados.fabricante_chassi || "—";

      // Foto
      if (elFoto && dados.foto_url) {
        elFoto.src = dados.foto_url;
        elFoto.style.display = "block";
      }

      // Link fonte
      if (elFonte && dados.fonte) {
        elFonte.href = dados.fonte;
        elFonte.textContent = "Ver ficha completa no Ônibus Brasil";
        elFonte.style.display = "inline-block";
      }

      if (elStatus) {
        elStatus.textContent = "✅ Dados encontrados com sucesso!";
        elStatus.style.color = "#2ecc71";
      }
    }

    return dados;

  } catch (err) {
    if (render && elStatus) {
      elStatus.textContent = "❌ Erro ao conectar com o servidor proxy.";
      elStatus.style.color = "#e74c3c";
    }
    console.error("Erro OnibusBrasil:", err);
    return { erro: "Erro ao conectar com o servidor proxy." };
  }
}

// ✅ ESSENCIAL: expõe a função no escopo global para o app.js conseguir chamar
window.buscarDadosOnibusBrasil = buscarDadosOnibusBrasil;