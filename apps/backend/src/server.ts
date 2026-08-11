import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok"
  });
});

const PORT = 3333;

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
