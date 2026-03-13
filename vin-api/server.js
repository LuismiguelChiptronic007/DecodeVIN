const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/decode/:vin", async (req, res) => {
  try {
    const vin = req.params.vin;
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao decodificar VIN" });
  }
});

app.get("/keplaca/:placa", async (req, res) => {
  try {
    const placa = req.params.placa.toUpperCase();
    // Simulação de busca no KePlaca (Em um cenário real, você faria scraping ou usaria uma API de terceiros que consulta o KePlaca)
    // Para fins deste projeto, vamos simular o retorno dos últimos 6 dígitos do chassi que o site KePlaca forneceria.
    
    // NOTA: Como não podemos fazer scraping direto do site sem um headless browser no Render, 
    // simulamos a estrutura que o frontend espera.
    
    // Em um cenário real, você usaria bibliotecas como 'cheerio' ou 'puppeteer' (se o ambiente permitir).
    const mockData = {
      success: true,
      placa: placa,
      chassi_parcial: "AB692263", // Exemplo de retorno (6 ou mais caracteres)
      marca: "MERCEDES-BENZ",
      modelo: "OF-1722",
      ano: "2010",
      cor: "BRANCO",
      municipio: "SAO BERNARDO DO CAMPO",
      uf: "SP"
    };

    res.json(mockData);
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar KePlaca" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando");
});