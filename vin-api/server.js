const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

// Endpoint simples para decodificar VIN usando a base pública da NHTSA.
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

// Endpoint de apoio para simular retorno de dados por placa.
app.get("/keplaca/:placa", async (req, res) => {
  try {
    const placa = req.params.placa.toUpperCase();

    const mockData = {
      success: true,
      placa: placa,
      chassi_parcial: "AB692263",
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