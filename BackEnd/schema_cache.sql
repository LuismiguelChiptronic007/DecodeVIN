-- Tabela para Cache de Consultas de Placas e Dados de Ônibus
-- Execute este SQL no seu PHPMyAdmin ou terminal MySQL

CREATE TABLE IF NOT EXISTS `cache_placas` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `placa` VARCHAR(10) NOT NULL UNIQUE,
    `final_chassi` VARCHAR(20) NOT NULL,
    `fonte_original` VARCHAR(50),
    -- Novos campos para cache do Ônibus Brasil
    `ob_encarrocadeira` VARCHAR(100),
    `ob_carroceria` VARCHAR(100),
    `ob_fabricante_chassi` VARCHAR(100),
    `ob_modelo_chassi` VARCHAR(100),
    `ob_foto_url` TEXT,
    `data_consulta` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (`placa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
