# 🏰 Camelot-IDE — Genesis v1.0.0

[![Tests](https://img.shields.io/badge/tests-136%20passing-brightgreen)](https://github.com/tony1/camelot-ide)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Engine: Gemma 4](https://img.shields.io/badge/Engine-Gemma%204-orange)](https://ollama.com/library/gemma4)

**Camelot-IDE** è un ambiente di sviluppo autonomo potenziato dall'intelligenza artificiale locale (**Gemma 4**). Progettato per essere veloce, sicuro e completamente privato, Camelot si integra nel tuo workflow per gestire ricerche web, scaffolding di progetti e automazione dei task tramite un loop agentico ricorsivo.

---

## ✨ Caratteristiche Principali

- **🤖 Loop Agentico Autonomo**: Ember (il nostro shiny 🦊) può ragionare su più passaggi, decidere quali tool usare e correggersi da solo.
- **🌐 Ricerca Web in Tempo Reale**: Integrazione nativa con Playwright per navigare il web e sintetizzare informazioni fresche.
- **🎙️ Controllo Vocale Whisper**: Comanda il tuo IDE a voce con mapping intelligente delle keyword.
- **🧠 SuperMemory**: Una memoria persistente cross-sessione che impara dalle tue ricerche e interazioni passate.
- **🛡️ 100% Locale & Sicuro**: Funziona interamente su Ollama. I tuoi dati non lasciano mai la tua RTX.

---

## 🏗️ Architettura

```mermaid
graph TD
    User((User)) --> Dashboard[Dashboard UI / Buddy Chat]
    Dashboard --> AgentLoop[Agent Loop Engine]
    AgentLoop -- Recursive Reasoning --> Gemma((Gemma 4))
    AgentLoop -- Tool Calls --> ToolRegistry[Tool Registry]
    
    subgraph Tools
        ToolRegistry --> Web[Web Search / Playwright]
        ToolRegistry --> FS[File System / Project Scaffolding]
        ToolRegistry --> CMD[Secure CLI Commands]
        ToolRegistry --> Memory[SuperMemory / Vector Search]
    end
    
    Gemma -- Thought/JSON --> AgentLoop
```

---

## 🚀 Guida Rapida

### 1. Prerequisiti
- **Bun v1.3+**
- **Ollama** con modello `gemma4:latest`
- **Playwright** (`bun x playwright install chromium`)

### 2. Installazione
```bash
git clone https://github.com/tony1/camelot-ide.git
cd camelot-ide
bun install
```

### 3. Configurazione
Copia il file `.env.example` in `.env` e configura il tuo `CAMELOT_AUTH_TOKEN`.
> [!IMPORTANT]
> Non condividere mai il tuo Auth Token. Camelot lo usa per proteggere le comunicazioni tra la dashboard e il server locale.

### 4. Avvio
Scarica il **Camelot Launcher** o avvia manualmente:
```bash
bun run start
```
Naviga su `http://localhost:3001` per accedere alla dashboard.

---

## 🛠️ Stack Tecnologico

- **Runtime**: Bun (Fast JS/TS)
- **AI Engine**: Ollama (Llama.cpp / Gemma 4)
- **Browser**: Playwright (Headless Chromium)
- **Frontend**: Vanilla JS + CSS Glassmorphism
- **Storage**: JSON + File System Local Fallback

---

## 📜 Licenza
Rilasciato sotto licenza MIT. Vedi [LICENSE](LICENSE) per i dettagli.

---

*Creato con ❤️ dal team di Camelot — "Where Code Meets Magic"*
