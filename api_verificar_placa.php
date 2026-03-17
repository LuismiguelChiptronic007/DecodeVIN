<?php 
header('Content-Type: application/json'); 
header('Access-Control-Allow-Origin: *'); 

/**
 * API DE VERIFICAÇÃO DE CHASSI (SCRAPING)
 * Objetivo: Extrair apenas os últimos dígitos do chassi para comparação.
 */

// ✅ CONFIGURAÇÃO DO BANCO DE DATAS (AJUSTE CONFORME SEU XAMPP)
$db_host = 'localhost';
$db_user = 'root';
$db_pass = '';
$db_name = 'decodevin'; // ✅ Certifique-se de criar este banco de dados no PHPMyAdmin

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);

// Se houver erro na conexão, continua sem banco (para não travar o sistema)
if ($conn->connect_error) {
    error_log("Erro de conexão DB: " . $conn->connect_error);
    $conn = null;
}

$placa  = strtoupper(trim($_POST['placa']  ?? $_GET['placa']  ?? '')); 
$chassi = strtoupper(trim($_POST['chassi'] ?? $_GET['chassi'] ?? '')); 

if (empty($placa)) { 
    echo json_encode(["status" => "erro", "mensagem" => "Placa não informada"]); 
    exit; 
} 

$final_site = '';
$fonte = '';

// ✅ 1. VERIFICAR NO BANCO DE DADOS (CACHE)
if ($conn) {
    $stmt = $conn->prepare("SELECT * FROM cache_placas WHERE placa = ?");
    $stmt->bind_param("s", $placa);
    $stmt->execute();
    $result_db = $stmt->get_result();
    
    if ($row = $result_db->fetch_assoc()) {
        $final_site = $row['final_chassi'];
        $fonte = $row['fonte_original'] . ' (DB_CACHE)';
        
        // Dados extras do Ônibus Brasil se existirem no cache
        $ob_cache = [
            "success" => true,
            "encarrocadeira" => $row['ob_encarrocadeira'],
            "carroceria" => $row['ob_carroceria'],
            "fabricante_chassi" => $row['ob_fabricante_chassi'],
            "modelo_chassi" => $row['ob_modelo_chassi'],
            "foto_url" => $row['ob_foto_url'],
            "is_cache" => true
        ];
    }
    $stmt->close();
}

// ✅ 2. SE NÃO ESTÁ NO BANCO, CONSULTA A API (SCRAPING)
if (empty($final_site)) {
    // ... lógica de consulta de placa mantida ...
    // [CÓDIGO DE SCRAPING DE PLACA]
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
            // Salvar no banco (Cache completo)
            if ($conn) {
                $stmt_up = $conn->prepare("INSERT INTO cache_placas (placa, final_chassi, fonte_original, ob_encarrocadeira, ob_carroceria, ob_fabricante_chassi, ob_modelo_chassi, ob_foto_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ob_encarrocadeira=VALUES(ob_encarrocadeira), ob_carroceria=VALUES(ob_carroceria), ob_fabricante_chassi=VALUES(ob_fabricante_chassi), ob_modelo_chassi=VALUES(ob_modelo_chassi), ob_foto_url=VALUES(ob_foto_url)");
                $enc = $ob_data['encarrocadeira'] ?? $ob_data['encarrocadora'] ?? null;
                $car = $ob_data['carroceria'] ?? null;
                $fab = $ob_data['fabricante_chassi'] ?? $ob_data['fabricante'] ?? null;
                $mod = $ob_data['modelo_chassi'] ?? $ob_data['chassi'] ?? null;
                $fot = $ob_data['foto_url'] ?? null;
                $stmt_up->bind_param("ssssssss", $placa, $final_site, $fonte, $enc, $car, $fab, $mod, $fot);
                $stmt_up->execute();
                $stmt_up->close();
            }
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

if ($conn) $conn->close();
?>
