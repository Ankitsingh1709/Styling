import express from "express";
import cors from "cors";
import "./db.js"; // initialize schema on boot
import { PORT, STORAGE_DIR } from "./config.js";
import { garmentsRouter } from "./routes/garments.js";
import { outfitsRouter } from "./routes/outfits.js";
import { wearsRouter } from "./routes/wears.js";
import { stylistRouter } from "./routes/stylist.js";
import { aiRouter } from "./routes/ai.js";
import { getActiveProviderId, getProvider, isAnyProviderConfigured } from "./ai/index.js";
import { backfillMissing } from "./garmentAnalysis.js";

const app = express();

app.use(cors());
app.use(express.json());

// Serve stored garment images.
app.use("/storage", express.static(STORAGE_DIR));

// This is the API server, not the UI. If someone opens :3001 in a browser,
// point them at the Vite dev server instead of a bare "Cannot GET /".
app.get("/", (_req, res) => {
  res
    .status(200)
    .type("html")
    .send(
      `<h2>Wardrobe API server</h2>
       <p>This is the backend (port ${PORT}). The app UI runs at
       <a href="http://localhost:5173">http://localhost:5173</a>.</p>`,
    );
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/garments", garmentsRouter);
app.use("/api/outfits", outfitsRouter);
app.use("/api/wears", wearsRouter);
app.use("/api/stylist", stylistRouter);
app.use("/api/ai", aiRouter);

// Central error handler (e.g. multer file-size errors).
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  },
);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);

  // Describe any garment the stylist hasn't seen yet, so the first question
  // doesn't pay for the whole wardrobe's vision pass.
  if (isAnyProviderConfigured()) {
    const active = getProvider();
    console.log(`[stylist] provider: ${active.label} (${active.describeModel()})`);
    backfillMissing()
      .then((n) => n > 0 && console.log(`[stylist] described ${n} garment(s)`))
      .catch((err) => console.error("[stylist] backfill failed:", err));
  } else {
    console.log(`[stylist] no provider configured (default: ${getActiveProviderId()})`);
  }
});
