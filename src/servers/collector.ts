// TimorousShadow
import { GAME_PLACE_ID } from "../config.js";
import { missingDetails, recordGame, recordSnapshot } from "./history.js";
import { gameStats, publicServers, serverDetails, type ServerDetails } from "./sources.js";

const MINUTE = 60_000;
let running = false;
let lastGame = 0;
let lastError: string | null = null;

export const collectorError = (): string | null => lastError;

const poll = async (): Promise<void> => {
  if (running) return;
  running = true;
  const at = Math.floor(Date.now() / MINUTE) * MINUTE;
  try {
    const servers = await publicServers(GAME_PLACE_ID);
    let details = new Map<string, ServerDetails>();
    const missing = missingDetails(servers.map((server) => server.id));
    if (missing.length) details = await serverDetails(GAME_PLACE_ID, missing).catch(() => details);
    recordSnapshot(at, servers, details);
    if (at - lastGame >= 10 * MINUTE) {
      recordGame(at, await gameStats(GAME_PLACE_ID));
      lastGame = at;
    }
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("Server stats poll failed", lastError);
  } finally {
    running = false;
  }
};

export const startCollector = (): void => {
  void poll();
  setInterval(() => void poll(), MINUTE).unref();
};
