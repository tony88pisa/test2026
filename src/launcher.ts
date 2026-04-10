import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/**
 * CAMELOT LAUNCHER v2.5
 * Gestisce l'avvio del server Dashboard e dei processi core.
 */

const LOG_DIR = path.join(process.cwd(), "logs");
const CONFIG_FILE = path.join(process.cwd(), ".camelot-launcher.json");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function log(msg: string) {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}] 🚀 ${msg}`);
  fs.appendFileSync(path.join(LOG_DIR, "launcher.log"), `[${t}] ${msg}\n`);
}

async function startDashboard() {
  log("Avvio Dashboard Server (Modular v2.5)...");
  
  // Utilizza il nuovo entry point modulare
  const dashboard = spawn("bun", ["run", "src/server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3001", WORKSPACE_PATH: process.cwd() }
  });

  dashboard.on("error", (err) => log(`ERRORE Dashboard: ${err.message}`));
  dashboard.on("exit", (code) => log(`Dashboard uscito con codice ${code}`));
}

async function startCore() {
  log("Avvio Camelot Core (REPL)...");
  
  const core = spawn("bun", ["run", "src/index.ts"], {
    stdio: "inherit"
  });

  core.on("exit", (code) => {
    log(`Core uscito con codice ${code}. Riavvio tra 3s...`);
    setTimeout(startCore, 3000);
  });
}

async function main() {
  console.log(`
   🏰 CAMELOT-IDE LAUNCHER
   ───────────────────────
  `);

  await startDashboard();
  
  // Attendi che il server sia pronto prima di avviare il core
  setTimeout(startCore, 2000);
}

main().catch(err => log(`ERRORE FATALE: ${err}`));
