<?php 
header('Content-Type: application/json'); 
header('Access-Control-Allow-Origin: *'); 

/**
 * API DE VERIFICAÇÃO DE CHASSI (SCRAPING)
 * Objetivo: Extrair apenas os últimos dígitos do chassi para comparação.
 */

$placa  = strtoupper(trim($_POST['placa']  ?? $_GET['placa']  ?? '')); 
$chassi = strtoupper(trim($_POST['chassi'] ?? $_GET['chassi'] ?? '')); 

if (empty($placa)) { 
    echo json_encode(["status" => "erro", "mensagem" => "Placa não informada"]); 
    exit; 
} 

$final_site = '';
$fonte = '';

// ✅ TENTATIVA 0 — Cloudflare Worker (Prioritário e mais estável)
$worker_url = "https://keplaca-proxy.luismiguelgomesoliveira-014.workers.dev/?placa=" . $placa;
$chw = curl_init();
curl_setopt_array($chw, [
    CURLOPT_URL            => $worker_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERAGENT      => "Mozilla/5.0",
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_SSL_VERIFYPEER => false,
]);
$worker_res = curl_exec($chw);
curl_close($chw);

if ($worker_res) {
    $data = json_decode($worker_res, true);
    // ✅ Corrigido: O Worker retorna 'final_chassi', não 'final'
    if (isset($data['status']) && $data['status'] === 'ok' && !empty($data['final_chassi'])) {
        $final_site = strtoupper($data['final_chassi']);
        $fonte = 'worker_keplaca';
    }
}

// ✅ TENTATIVA 1 — KePlaca Local Scraping (Se o Worker falhar)
if (empty($final_site)) {
    $url_ke = "https://www.keplaca.com/placa/" . $placa; 
    $ch = curl_init(); 
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url_ke,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERAGENT      => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $html_ke = curl_exec($ch); 
    curl_close($ch); 

    if ($html_ke) {
        // Tenta vários padrões comuns de exibição de chassi no KePlaca
        $patterns = [
            '/(?:Chassi|chassi).*?(\*+[A-Z0-9]{4,10})/s',
            '/chassi_mascarado">(\*+[A-Z0-9]{4,10})<\/span>/i',
            '/<td>Chassi:<\/td><td>(\*+[A-Z0-9]{4,10})<\/td>/i',
            '/<td>Chassi:<\/td><td>([A-Z0-9]{10,17})<\/td>/i', // Padrão sem asteriscos
            '/\*+[A-Z0-9]{4,10}/', // Padrão genérico com asteriscos
            '/\b[A-Z0-9]{17}\b/' // Qualquer sequência de 17 caracteres (chassi completo)
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $html_ke, $m)) {
                $extraido = isset($m[1]) ? $m[1] : $m[0];
                
                // Remove asteriscos para pegar apenas a parte útil
                $final_site = preg_replace('/^\*+/', '', $extraido);
                
                // Se for um chassi completo de 17, pegamos os últimos 6 ou 7 para comparar
                if (strlen($final_site) == 17) {
                    $final_site = substr($final_site, -7);
                }

                if (strlen($final_site) >= 4) { 
                    $fonte = 'keplaca_local';
                    break;
                }
            }
        }

        // Fallback agressivo: procurar por qualquer coisa que pareça um chassi final (asteriscos + letras/números)
        if (empty($final_site)) {
            if (preg_match_all('/(\*+[A-Z0-9]{4,10})/', $html_ke, $matches)) {
                foreach ($matches[1] as $m) {
                    $limpo = preg_replace('/^\*+/', '', $m);
                    if (strlen($limpo) >= 6) {
                        $final_site = $limpo;
                        $fonte = 'keplaca_fallback';
                        break;
                    }
                }
            }
        }
    }
}

// ✅ TENTATIVA 2 — Ônibus Brasil (Se KePlaca falhar)
if (empty($final_site)) {
    $url_ob = "https://www.onibus.info/busca.php?s=" . urlencode($placa);
    $ch2 = curl_init();
    curl_setopt_array($ch2, [
        CURLOPT_URL            => $url_ob,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERAGENT      => "Mozilla/5.0",
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $html_ob = curl_exec($ch2);
    curl_close($ch2);

    if ($html_ob) {
        // Tenta achar um chassi completo (17 chars) ou parcial no OB
        if (preg_match('/\b([0-9A-Z]{17})\b/', $html_ob, $m)) {
            $final_site = substr($m[1], -7); // Pegamos os últimos 7 dígitos
            $fonte = 'onibusbrasil_chassi';
        } elseif (preg_match('/Chassi:.*?([A-Z0-9]{6,17})/i', $html_ob, $m)) {
            $final_site = substr($m[1], -7);
            $fonte = 'onibusbrasil_parcial';
        }
    }
}

// ✅ SE NÃO ENCONTROU OS DÍGITOS DO CHASSI
if (empty($final_site)) {
    echo json_encode([ 
        "status"   => "erro", 
        "mensagem" => "Não foi possível localizar os dígitos do chassi para a placa $placa em fontes públicas." 
    ]); 
    exit; 
} 

// ✅ COMPARAÇÃO OBRIGATÓRIA DOS ÚLTIMOS DÍGITOS
if (!empty($chassi)) {
    $chassi_digitado = preg_replace('/[^A-Z0-9]/', '', $chassi);
    $tamanho = strlen($final_site);
    $final_digitado = substr($chassi_digitado, -$tamanho);
    
    if ($final_site === $final_digitado) {
        echo json_encode([
            "status"   => "ok",
            "mensagem" => "✔ Chassi confirmado: final $final_site corresponde à placa $placa",
            "final"    => $final_site,
            "fonte"    => $fonte
        ]);
    } else {
        echo json_encode([
            "status"   => "erro",
            "mensagem" => "⚠ Divergência Crítica: A placa $placa pertence ao chassi final $final_site, mas você digitou final $final_digitado",
            "final_site" => $final_site,
            "final_digitado" => $final_digitado,
            "fonte"    => $fonte
        ]);
    }
} else {
    echo json_encode([
        "status" => "ok",
        "final"  => $final_site,
        "mensagem" => "Chassi final encontrado: $final_site"
    ]);
}
?>
