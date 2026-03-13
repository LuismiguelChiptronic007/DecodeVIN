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

// ✅ TENTATIVA 1 — KePlaca
$url_ke = "https://www.keplaca.com/placa/" . $placa; 
$ch = curl_init(); 
curl_setopt_array($ch, [
    CURLOPT_URL            => $url_ke,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERAGENT      => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 10,
]);
$html_ke = curl_exec($ch); 
curl_close($ch); 

if ($html_ke) {
    // Procura por padrões de chassi mascarado (ex: *********545457)
    // Buscamos qualquer sequência de asteriscos seguida de números/letras
    if (preg_match('/(?:Chassi|chassi).*?(\*+[A-Z0-9]{4,10})/s', $html_ke, $m)) {
        $mascarado = $m[1];
        $final_site = preg_replace('/^\*+/', '', $mascarado);
        $fonte = 'keplaca';
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
