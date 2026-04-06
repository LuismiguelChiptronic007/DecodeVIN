<?php 

header('Content-Type: application/json'); 

echo json_encode(["status" => "desativado", "mensagem" => "O backend PHP foi desativado temporariamente."]);
?>