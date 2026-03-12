const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/decode/:vin", async (req, res) => {
  try {
    const vin = req.params.vin;

    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`
    );

    const data = await response.json();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao decodificar VIN" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando");
});