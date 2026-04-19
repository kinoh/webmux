import express, { type Request, type Response } from "express";

import { createMuxRegistry } from "../mux/registry";
import { renderIndex } from "../web/renderIndex";
import { runCommand } from "./command";

function clampPaneWidth(columns: number): number {
  return Math.max(20, Math.min(2000, columns));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createApp() {
  const app = express();
  const registry = createMuxRegistry(runCommand);

  app.use(express.json({ limit: "64kb" }));

  app.get("/", (_req: Request, res: Response) => {
    res.type("html").send(renderIndex({ clientBackendConfigs: registry.clientBackendConfigs }));
  });

  app.get("/api/panes", async (_req: Request, res: Response) => {
    try {
      const { panes, errors } = await registry.listAllPanes();
      res.json({ panes, errors });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get("/api/capture", async (req: Request, res: Response) => {
    try {
      const backendId = String(req.query.backendId || "");
      const paneId = String(req.query.paneId || "");
      const sessionName = String(req.query.sessionName || "");
      const lines = Math.max(1, Math.min(5000, Number(req.query.lines) || 300));
      const backend = registry.getBackendById(backendId);

      if (!backend) {
        res.status(400).json({ error: "invalid backendId" });
        return;
      }

      if (!backend.isValidPaneId(paneId)) {
        res.status(400).json({ error: "invalid paneId" });
        return;
      }

      res.json({ content: await backend.capturePane(paneId, lines, sessionName) });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post("/api/send", async (req: Request, res: Response) => {
    try {
      const backendId = String(req.body?.backendId || "");
      const paneId = String(req.body?.paneId || "");
      const sessionName = String(req.body?.sessionName || "");
      const text = String(req.body?.text || "");
      const enter = Boolean(req.body?.enter);
      const backend = registry.getBackendById(backendId);

      if (!backend) {
        res.status(400).json({ error: "invalid backendId" });
        return;
      }

      if (!backend.isValidPaneId(paneId)) {
        res.status(400).json({ error: "invalid paneId" });
        return;
      }

      if (text.length > 0) {
        await backend.sendTextToPane(paneId, text, sessionName);
      }

      if (enter) {
        await backend.sendEnterKey(paneId, text.length > 0, sessionName);
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post("/api/send-key", async (req: Request, res: Response) => {
    try {
      const backendId = String(req.body?.backendId || "");
      const paneId = String(req.body?.paneId || "");
      const sessionName = String(req.body?.sessionName || "");
      const key = String(req.body?.key || "");
      const backend = registry.getBackendById(backendId);

      if (!backend) {
        res.status(400).json({ error: "invalid backendId" });
        return;
      }

      if (!backend.isValidPaneId(paneId)) {
        res.status(400).json({ error: "invalid paneId" });
        return;
      }

      if (!backend.isValidKeyName(key)) {
        res.status(400).json({ error: "invalid key" });
        return;
      }

      await backend.sendKeyToPane(paneId, key, sessionName);
      res.json({ ok: true, label: backend.specialKeyLabels[key] || key });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post("/api/resize-pane", async (req: Request, res: Response) => {
    try {
      const backendId = String(req.body?.backendId || "");
      const paneId = String(req.body?.paneId || "");
      const sessionName = String(req.body?.sessionName || "");
      const columns = clampPaneWidth(Math.floor(Number(req.body?.columns)));
      const backend = registry.getBackendById(backendId);

      if (!backend) {
        res.status(400).json({ error: "invalid backendId" });
        return;
      }

      if (!backend.supportsResize) {
        res.status(400).json({ error: "resize-pane is not supported by this backend" });
        return;
      }

      if (!backend.isValidPaneId(paneId)) {
        res.status(400).json({ error: "invalid paneId" });
        return;
      }

      if (!Number.isFinite(columns)) {
        res.status(400).json({ error: "invalid columns" });
        return;
      }

      await backend.resizePane(paneId, columns, sessionName);
      res.json({ ok: true, columns });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  return app;
}
