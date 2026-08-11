import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRoutes);

const PORT = 3333;

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});