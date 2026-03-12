
// URL do Worker Cloudflare 
const ONIBUSBRASIL_WORKER_URL = "https://onibusbrasil-proxy.luismiguelgomesoliveira-014.workers.dev";

async function buscarDadosOnibusBrasil(placaOuChassi, isChassis = false) {
    const secao = document.getElementById("secao-onibusbrasil");
    const status = document.getElementById("ob_status");
    const encarrocadeira = document.getElementById("ob_encarrocadeira");
    const carroceria = document.getElementById("ob_carroceria");
    const fabricanteChassi = document.getElementById("ob_fabricante_chassi");
    const chassi = document.getElementById("ob_chassi");
    const fonte = document.getElementById("ob_fonte");
    const foto = document.getElementById("ob_foto");

    if (!secao) return;

    //  Impedir busca automática por códigos inválidos (VIN tem 17, Placa tem 6 ou 7)
    // Relaxamos para permitir placas que possam vir com hífens ou espaços (limpamos depois)
    const sanitized = placaOuChassi.replace(/[^A-Z0-9]/g, "");
    const len = sanitized.length;
    
    if (len !== 6 && len !== 7 && len !== 17) {
        if (len > 8) secao.style.display = "none";
        return;
    }

    const placaFinal = sanitized.toUpperCase();

    // Resetar campos
    secao.style.display = "grid";
    status.textContent = "Buscando dados no Ônibus Brasil...";
    status.style.color = "var(--muted)";
    encarrocadeira.textContent = "—";
    carroceria.textContent = "—";
    fabricanteChassi.textContent = "—";
    chassi.textContent = "—";
    fonte.style.display = "none";
    if (foto) {
        foto.style.display = "none";
        foto.src = "";
    }

    try {
        //  Chama diretamente o Worker Cloudflare (sem proxy.php)
        const url = `${ONIBUSBRASIL_WORKER_URL}/?placa=${placaFinal}`;
        console.log("Chamando Worker:", url);

        const response = await fetch(url);
        const data = await response.json();

        console.log("Dados recebidos do Worker:", data);

        // Verificar se houve erro
        if (!data.success) {
            status.textContent = `Aviso: Placa ${placaFinal} não encontrada no Ônibus Brasil.`;
            status.style.color = "var(--muted)";
            return;
        }

        //  Preencher Encarrocadeira
        encarrocadeira.textContent = data.encarrocadeira || data.encarrocadora || "—";

        //  Preencher Carroceria
        carroceria.textContent = data.carroceria || "—";

        //  Preencher Fabricante do Chassi
        fabricanteChassi.textContent = data.fabricante_chassi || data.fabricante || "—";

        // Preencher Modelo do Chassi
        chassi.textContent = data.modelo_chassi || data.chassi || "—";

        // Exibir foto se disponível
        if (data.foto_url && foto) {
            foto.src = data.foto_url;
            foto.style.display = "block";
        }

        // Status de sucesso
        const temDados = (data.encarrocadeira || data.encarrocadora) || data.carroceria || (data.modelo_chassi || data.chassi);
        if (temDados) {
            status.textContent = "Dados encontrados com sucesso!";
            status.style.color = "var(--accent)";
            // Mostrar botões de relatório se estiver na tela individual
            const sButtons = document.getElementById("singleReportButtons");
            if (sButtons) {
                sButtons.style.display = "flex";
                console.log("Botões de relatório habilitados via Integração OB");
            }
        } else {
            status.textContent = "Veículo encontrado, mas sem ficha técnica cadastrada.";
            status.style.color = "var(--muted)";
        }

        //configurar link da fonte
        const typePath = isChassis ? "chassis" : "placa";
        fonte.href = `https://onibusbrasil.com/${typePath}/${placaFinal}`;
        fonte.style.display = "inline-block";
        fonte.textContent = "Ver ficha completa no Ônibus Brasil";

    } catch (err) {
        console.error("Erro na integração OB:", err);
        status.textContent = "Erro ao conectar com o serviço de busca.";
        status.style.color = "var(--danger)";
    }
}

//expor a função globalmente para ser chamada pelo app.js
window.buscarDadosOnibusBrasil = buscarDadosOnibusBrasil;