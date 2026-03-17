<?php 
// ✅ 1. CONFIGURAÇÕES DE CABEÇALHO PARA PERMITIR ACESSO DO GITHUB (CORS + PNA)
header('Content-Type: application/json'); 

/*
// Permitir origens de forma dinâmica
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Access-Control-Request-Private-Network');
header('Access-Control-Allow-Private-Network: true'); 
header('Access-Control-Max-Age: 86400');

// ✅ 2. RESPONDER A REQUISIÇÕES DE TESTE (PREFLIGHT)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    // Para PNA (Private Network Access), o navegador exige que o OPTIONS retorne 200 e os cabeçalhos PNA
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_PRIVATE_NETWORK'])) {
        header('Access-Control-Allow-Private-Network: true');
    }
    http_response_code(200);
    exit;
}

$placa  = strtoupper(trim($_POST['placa']  ?? $_GET['placa']  ?? '')); 
$chassi = strtoupper(trim($_POST['chassi'] ?? $_GET['chassi'] ?? '')); 

if (empty($placa)) { 
    echo json_encode(["status" => "erro", "mensagem" => "Placa não informada"]); 
    exit; 
} 

$final_site = '';
$fonte = '';

// ✅ CONSULTA A API (SCRAPING)
if (empty($final_site)) {
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
            CURLOPT_USERAGENT      => "Mozilla/5.0",
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $html_ke = curl_exec($ch); 
        curl_close($ch); 

        if ($html_ke) {
            $patterns = [
                '/(?:Chassi|chassi).*?(\*+[A-Z0-9]{4,10})/s',
                '/chassi_mascarado">(\*+[A-Z0-9]{4,10})<\/span>/i',
                '/<td>Chassi:<\/td><td>(\*+[A-Z0-9]{4,10})<\/td>/i',
                '/<td>Chassi:<\/td><td>([A-Z0-9]{10,17})<\/td>/i',
                '/\*+[A-Z0-9]{4,10}/',
                '/\b[A-Z0-9]{17}\b/'
            ];

            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $html_ke, $m)) {
                    $extraido = isset($m[1]) ? $m[1] : $m[0];
                    $final_site = preg_replace('/^\*+/', '', $extraido);
                    if (strlen($final_site) == 17) {
                        $final_site = substr($final_site, -7);
                    }
                    if (strlen($final_site) >= 4) { 
                        $fonte = 'keplaca_local';
                        break;
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
            if (preg_match('/\b([0-9A-Z]{17})\b/', $html_ob, $m)) {
                $final_site = substr($m[1], -7);
                $fonte = 'onibusbrasil_chassi';
            } elseif (preg_match('/Chassi:.*?([A-Z0-9]{6,17})/i', $html_ob, $m)) {
                $final_site = substr($m[1], -7);
                $fonte = 'onibusbrasil_parcial';
            }
        }
    }
}

// ✅ SE ENCONTROU A PLACA MAS NÃO TEM DADOS DO OB, BUSCA NO WORKER DO OB
if (!empty($final_site) && !isset($ob_cache)) {
    $ob_url = "https://onibusbrasil-proxy.luismiguelgomesoliveira-014.workers.dev/?placa=" . $placa;
    $ch_ob = curl_init();
    curl_setopt_array($ch_ob, [
        CURLOPT_URL => $ob_url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $ob_res = curl_exec($ch_ob);
    curl_close($ch_ob);
    
    if ($ob_res) {
        $ob_data = json_decode($ob_res, true);
        if ($ob_data && isset($ob_data['success']) && $ob_data['success']) {
            $ob_cache = $ob_data;
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
            "fonte"    => $fonte,
            "ob_data"  => $ob_cache ?? null
        ]);
    } else {
        echo json_encode([
            "status"   => "erro",
            "mensagem" => "⚠ Divergência Crítica: A placa $placa pertence ao chassi final $final_site, mas você digitou final $final_digitado",
            "final_site" => $final_site,
            "final_digitado" => $final_digitado,
            "fonte"    => $fonte,
            "ob_data"  => $ob_cache ?? null
        ]);
    }
} else {
    echo json_encode([
        "status" => "ok",
        "final"  => $final_site,
        "mensagem" => "Chassi final encontrado: $final_site",
        "ob_data" => $ob_cache ?? null
    ]);
}
*/

echo json_encode(["status" => "desativado", "mensagem" => "O backend PHP foi desativado temporariamente."]);
?>