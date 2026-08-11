import express from "express";
import cors from "cors";

import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import serviceOrderRoutes from "./routes/service-order.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/users", userRoutes);
app.use("/auth", authRoutes);
app.use("/customers", customerRoutes);
app.use("/service-orders", serviceOrderRoutes);

export default app;
