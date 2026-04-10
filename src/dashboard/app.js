// ============================================================
// Dashboard App — Camelot-IDE v2.6.2
// Fix: Added token to WebSocket terminal connection (M18.2)
//      Recursive Tree rendering for Workspace (v2.6.1)
// ============================================================

const API   = ''
const TOKEN = 'dev-token-xyz'

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`
})

// ─── State ──────────────────────────────────────────────────────────
const state = {
  sessionId:    crypto.randomUUID(),
  history:      [],
  sseConnected: false,
  ws:           null,
  provider:     'Caricamento...',
  branch:       '...',
  thinking:     false,
  term:         null,
  totalFiles:   0,
  openFilePath: null,
  attachment:   null, // { name: string, content: string }
}

let monacoEditor = null

// ─── DOM refs ────────────────────────────────────────────────────────
const $           = id => document.getElementById(id)
const messages    = $('shizuku-messages')
const input       = $('shizuku-input')
const btnSend     = $('btn-send')
const fileTree    = $('file-tree')
const statusBranch= $('status-branch')
const statusFiles = $('status-files')
const statusSSE   = $('status-sse')
const statusProv  = $('status-provider')
const statusCosts = $('status-costs')
const provBadge   = $('provider-badge')
const btnAttach   = $('btn-attach')
const fileUpload  = $('file-upload')
const attachmentPreview = $('attachment-preview')
const attachmentName    = $('attachment-name')
const btnRemoveAttachment = $('btn-remove-attachment')

// ─── Remote Tunnel (M19) ──────────────────────────────────────────────
async function loadRemoteStatus() {
    try {
        const res = await fetch(`${API}/api/remote/status`, { headers: headers() })
        const data = await res.json()
        if (data.active) updateRemoteFooter(data.url)
    } catch { }
}

function updateRemoteFooter(url) {
    const el = $('status-remote')
    if (!el) return
    el.textContent = `🌐 ${url}`
    el.style.color = 'var(--blue)'
    el.title = 'Clicca per copiare'
    el.onclick = () => {
        navigator.clipboard.writeText(url)
        const oldText = el.textContent
        el.textContent = '✅ Copiato!'
        setTimeout(() => el.textContent = oldText, 2000)
    }
}

// ─── Buddy State Manager (M20) ──────────────────────────────────────────
async function loadBuddyStatus() {
    try {
        const res = await fetch(`${API}/api/buddy/state`, { headers: headers() })
        const data = await res.json()
        handleBuddyState(data)
    } catch { }
}

function handleBuddyState(state) {
    // 1. Aggiorna indicatore Ollama nel footer
    const ollamaEl = $('ollama-status')
    if (ollamaEl) {
        ollamaEl.textContent = state.ollamaOnline ? '🟣 Ollama' : '⚫ Ollama'
        ollamaEl.title = state.ollamaOnline ? 'Ollama Online' : 'Ollama Offline (Fallback Cloud)'
    }
    
    // 2. Aggiorna Mood visivo nel pannello Shizuku
    const panel = $('shizuku-panel')
    if (panel) {
        panel.classList.remove('ember-thinking', 'ember-error', 'ember-success')
        if (state.mood !== 'idle') {
            panel.classList.add(`ember-${state.mood}`)
        }
        
        // Se è un flash (success/error), resettiamo dopo 3 secondi
        if (state.mood === 'error' || state.mood === 'success') {
            setTimeout(() => {
                panel.classList.remove(`ember-${state.mood}`)
            }, 3000)
        }
    }
}

// ─── Init ─────────────────────────────────────────────────────────────
;(async () => {
  initSSE()
  initTerminal()
  initMonaco()
  initMobileTabs()
  await loadFileTree()
  await loadProvider()
  await loadGitStatus()
  await loadRemoteStatus()
  await loadBuddyStatus()

  // Registrazione Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('[PWA] Service Worker Registrato'))
      .catch(err => console.error('[PWA] Errore SW:', err));
  }

  if (btnSend) btnSend.addEventListener('click', sendMessage)
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    })
  }
  const btnRefresh = $('btn-refresh-tree')
  if (btnRefresh) btnRefresh.addEventListener('click', loadFileTree)
  
  const btnSave = $('btn-save-file')
  if (btnSave) btnSave.addEventListener('click', saveCurrentFile)

  const btnCopy = $('btn-copy-file')
  if (btnCopy) btnCopy.addEventListener('click', () => {
      if (monacoEditor) {
          navigator.clipboard.writeText(monacoEditor.getValue())
          const badge = $('lang-badge')
          const old = badge.textContent
          badge.textContent = 'COPIATO!'
          setTimeout(() => badge.textContent = old, 1500)
      }
  })

  const btnTermClear = $('btn-clear-term') || $('btn-terminal-clear')
  if (btnTermClear) btnTermClear.addEventListener('click', () => { if (state.term) state.term.clear() })
})()

// ─── Mobile Logic (M22) ────────────────────────────────────────────────
function initMobileTabs() {
    const tabs = document.querySelectorAll('.tab-btn')
    if (tabs.length === 0) return

    function switchTab(targetId) {
        $('sidebar')?.classList.remove('mobile-active')
        $('main')?.classList.remove('mobile-active')
        $('shizuku-panel')?.classList.remove('mobile-active')
        
        tabs.forEach(t => t.classList.remove('active'))
        
        if (targetId === 'terminal-container') {
            $('main')?.classList.add('mobile-active')
            if ($('editor-area')) $('editor-area').classList.remove('mobile-active')
            if ($('terminal-container')) $('terminal-container').classList.add('mobile-active')
            if (state.term) setTimeout(() => state.term.fit(), 100)
        } else if (targetId === 'sidebar') {
            $('sidebar')?.classList.add('mobile-active')
            if (targetId === 'sidebar') {
                const tab = document.querySelector('.tab-btn[data-target="sidebar"]')
                if (tab) tab.classList.add('active')
            }
        } else {
            $(targetId)?.classList.add('mobile-active')
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'))
            tab.classList.add('active')
            switchTab(tab.dataset.target)
        })
    })

    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            if (!$('shizuku-panel').classList.contains('mobile-active') && 
                !$('sidebar').classList.contains('mobile-active') && 
                !$('main').classList.contains('mobile-active')) {
                const initial = document.querySelector('.tab-btn[data-target="shizuku-panel"]')
                if (initial) initial.click()
            }
        } else {
            $('sidebar')?.classList.remove('mobile-active')
            $('main')?.classList.remove('mobile-active')
            $('shizuku-panel')?.classList.remove('mobile-active')
            if ($('editor-area')) $('editor-area').classList.remove('mobile-active')
            if ($('terminal-container')) $('terminal-container').classList.remove('mobile-active')
        }
    })
    
    if (window.innerWidth <= 768) {
        const initial = document.querySelector('.tab-btn[data-target="shizuku-panel"]')
        if (initial) initial.click()
    }
}

// ─── SSE ──────────────────────────────────────────────────────────────
function initSSE() {
  if (state.es) state.es.close()
  
  const es = new EventSource(`${API}/api/events`)
  state.es = es

  es.onopen = () => {
    state.sseConnected = true
    const sseStat = $('sse-status') || statusSSE
    if (sseStat) {
        sseStat.textContent = 'SSE: CONNESSO'
        sseStat.className = 'status-dot sse-connected' || 'sse-connected'
    }
    const indicator = $('sse-indicator')
    if (indicator) indicator.className = 'status-dot sse-connected'
  }
  
  es.onerror = () => {
    state.sseConnected = false
    const sseStat = $('sse-status') || statusSSE
    if (sseStat) {
        sseStat.textContent = 'SSE: DISCONNESSO'
        sseStat.className = 'status-dot sse-disconnected' || 'sse-disconnected'
    }
    const indicator = $('sse-indicator')
    if (indicator) indicator.className = 'status-dot sse-disconnected'
    
    // Auto-reconnect Cloudflare Tunnel (Mobile Fix)
    es.close()
    setTimeout(() => {
        initSSE()
        loadProvider()
        loadBuddyStatus()
    }, 2000)
  }
  
  es.onmessage = e => {
    try { handleSSEEvent(JSON.parse(e.data)) } catch { /* non JSON o ping */ }
  }
}

function handleSSEEvent(data) {
  switch (data.type) {
    case 'ai:thinking':   showThinking(data.provider); break
    case 'ai:token':      appendToken(data.token); break
    case 'ai:done':       finalizeMessage(data.response); loadCosts(); break
    case 'ai:error':
      if (thinkingEl) {
        thinkingEl.remove()
        thinkingEl = null
      }
      appendMessage('ember', `⚠️ Errore: ${data.error}`)
      state.thinking = false
      if (btnSend) btnSend.disabled = false
      break
    case 'workspace:changed':
    case 'workspace:tree_changed':
      if (data.tree) { renderTreeNodes(data.tree, fileTree); updateFileCount(data.tree) }
      else loadFileTree()
      break
    case 'git:committed':
    case 'git:pushed':
    case 'git:changed':
      loadGitStatus()
      break
    case 'remote:url':
      updateRemoteFooter(data.url)
      break
    case 'buddy:state':
      handleBuddyState(data.state)
      break
  }
}

// ─── Terminal (xterm.js + WebSocket) ─────────────────────────────────
function initTerminal() {
  if (!$('terminal')) return
  const term = new Terminal({
    theme: { background: '#0a0a0c', foreground: '#e8e8f0', cursor: '#ff6b35' },
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    fontSize: 12,
    cursorBlink: true,
  })
  const fitAddon = new FitAddon.FitAddon()
  term.loadAddon(fitAddon)
  term.open($('terminal'))
  fitAddon.fit()
  state.term = term

  const container = $('terminal-container')
  if (container) {
    new ResizeObserver(() => fitAddon.fit()).observe(container)
  }

  // PATCH M18.2 + Mobile Fix: Supporto dinamico wss:// per HTTPS (Cloudflare Tunnel)
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${wsProto}//${location.host}/api/terminal/ws?session=${state.sessionId}&token=${TOKEN}`)
  state.ws  = ws
  
  const tStat = $('term-status')
  ws.onopen    = () => {
    if (tStat) { tStat.innerText = 'connesso'; tStat.style.color = '#4ade80' }
    term.write('\x1b[32m[Terminale connesso]\x1b[0m\r\n')
  }
  ws.onclose   = () => {
    if (tStat) { tStat.innerText = 'disconnesso'; tStat.style.color = '#f87171' }
    term.write('\r\n\x1b[31m[Terminale disconnesso]\x1b[0m\r\n')
  }
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') term.write(msg.data)
    } catch { term.write(e.data) }
  }
  term.onData(data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
  })
}

// ─── File Tree ────────────────────────────────────────────────────────
async function loadFileTree() {
  try {
    const res  = await fetch(`${API}/api/workspace/tree`, { headers: headers() })
    const data = await res.json()
    const nodes = Array.isArray(data.tree) ? data.tree : []
    renderTreeNodes(nodes, fileTree)
    updateFileCount(nodes)
  } catch {
    if (fileTree) fileTree.textContent = 'Errore caricamento albero'
  }
}

function renderTreeNodes(nodes, container, depth = 0) {
  if (!container) return
  if (depth === 0) container.innerHTML = ''
  if (!Array.isArray(nodes)) return
  for (const node of nodes) {
    const div = document.createElement('div')
    div.className = 'tree-node'
    
    const el = document.createElement('div')
    el.className   = `tree-item ${node.type}`
    el.title       = node.path
    el.style.paddingLeft = `${depth * 12 + 12}px`
    
    const icon = node.type === 'dir' ? '📁' : '📄'
    el.innerHTML = `<span>${icon} ${node.name}</span>`
    
    if (node.type === 'file') {
      el.addEventListener('click', () => {
          document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'))
          el.classList.add('active')
          openFile(node.path)
      })
    } else if (node.type === 'dir') {
      let expanded = depth < 1 // Primo livello aperto di default
      const childrenContainer = document.createElement('div')
      childrenContainer.style.display = expanded ? 'block' : 'none'
      el.innerHTML = `<span>${expanded ? '📂' : '📁'} ${node.name}</span>`
      
      el.addEventListener('click', e => {
        e.stopPropagation()
        expanded = !expanded
        childrenContainer.style.display = expanded ? 'block' : 'none'
        el.innerHTML = `<span>${expanded ? '📂' : '📁'} ${node.name}</span>`
      })
      
      div.appendChild(el)
      div.appendChild(childrenContainer)
      container.appendChild(div)
      if (Array.isArray(node.children)) {
        renderTreeNodes(node.children, childrenContainer, depth + 1)
      }
      continue
    }
    div.appendChild(el)
    container.appendChild(div)
  }
}

function updateFileCount(nodes, count = { n: 0 }) {
  if (!Array.isArray(nodes)) return count.n
  for (const n of nodes) {
    if (n.type === 'file') count.n++
    if (n.children) updateFileCount(n.children, count)
  }
  state.totalFiles = count.n
  const fStat = $('status-files') || $('file-count')
  if (fStat) fStat.textContent = `files: ${count.n}`
  return count.n
}

async function openFile(path) {
  try {
    const res  = await fetch(`${API}/api/workspace/file?path=${encodeURIComponent(path)}`, { headers: headers() })
    const data = await res.json()
    
    state.openFilePath = path
    
    // Su mobile apre automaticamente l'editor
    if (window.innerWidth <= 768) {
        $('sidebar')?.classList.remove('mobile-active')
        $('main')?.classList.add('mobile-active')
        if ($('editor-area')) $('editor-area').style.display = 'flex'
        if ($('terminal-container')) $('terminal-container').style.display = 'none'
    }

    // UI Handling
    const placeholder = $('editor-placeholder')
    if (placeholder) placeholder.style.display = 'none'
    
    const toolbar = $('editor-toolbar')
    if (toolbar) toolbar.style.display = 'flex'
    
    const filenameEl = $('current-filename')
    if (filenameEl) filenameEl.textContent = path
    
    // Language Detection
    const ext = path.split('.').pop().toLowerCase()
    const langMap = {
        'ts': 'typescript', 'tsx': 'typescript',
        'js': 'javascript', 'jsx': 'javascript',
        'json': 'json', 'md': 'markdown',
        'css': 'css', 'html': 'html', 'py': 'python'
    }
    const lang = langMap[ext] || 'plaintext'
    const badge = $('lang-badge')
    if (badge) badge.textContent = lang.toUpperCase()

    if (monacoEditor) {
        monacoEditor.setValue(data.content ?? '')
        monaco.editor.setModelLanguage(monacoEditor.getModel(), lang)
    }
  } catch (err) {
    console.error('[Editor] Errore caricamento file:', err)
  }
}

async function saveCurrentFile() {
    if (!state.openFilePath || !monacoEditor) return
    
    const path = state.openFilePath
    const content = monacoEditor.getValue()
    const title = $('current-filename')
    
    try {
        const res = await fetch(`${API}/api/workspace/file`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ path, content })
        })
        
        if (!res.ok) throw new Error('Cancellato o Errore')
        
        // Feedback Successo
        const originalName = title.textContent
        title.textContent = '✅ SALVATO!'
        title.classList.add('save-success')
        setTimeout(() => {
            title.textContent = originalName
            title.classList.remove('save-success')
        }, 1200)
        
    } catch (err) {
        const originalName = title.textContent
        title.textContent = '❌ ERRORE!'
        title.classList.add('save-error')
        setTimeout(() => {
            title.textContent = originalName
            title.classList.remove('save-error')
        }, 1200)
    }
}

function initMonaco() {
    if (!$('monaco-editor')) return
    
    // Configura Monaco Loader
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs' } });
    
    require(['vs/editor/editor.main'], function () {
        monacoEditor = monaco.editor.create($('monaco-editor'), {
            value: '',
            language: 'plaintext',
            theme: 'vs-dark',
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            padding: { top: 10, bottom: 10 }
        });

        // Command Ctrl+S per salvataggio
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);
        
        console.log('[Monaco] Editor pronto.');
    });
}

// ─── Utils / Stats ────────────────────────────────────────────────────
async function loadProvider() {
  try {
    const res  = await fetch(`${API}/api/agent/provider`, { headers: headers() })
    const data = await res.json()
    const badge = $('provider-badge')
    if (badge) badge.textContent = data.mode === 'openrouter' ? 'Cloud' : 'Local'
    const mDisplay = $('model-name')
    if (mDisplay) mDisplay.textContent = data.model
  } catch { }
}

async function loadGitStatus() {
  try {
    const res  = await fetch(`${API}/api/git/status`, { headers: headers() })
    const data = await res.json()
    const gStat = $('status-branch')
    if (gStat) gStat.textContent = `${data.branch}${data.clean ? '' : ' ●'}`
  } catch { }
}

async function loadCosts() {
  try {
    const res  = await fetch(`${API}/api/costs`, { headers: headers() })
    const data = await res.json()
    const cDisplay = $('total-cost') || $('status-costs')
    if (cDisplay) cDisplay.textContent = `$${(data.totalCostUsd || 0).toFixed(4)}`
  } catch { }
}

// ─── Chat ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = input.value.trim()
  if ((!text && !state.attachment) || state.thinking) return

  input.value = ''
  
  let finalInput = text
  let uiText = text
  if (state.attachment) {
      finalInput = text ? `${text}\n\n[File allegato: ${state.attachment.name}]\n<file>\n${state.attachment.content}\n</file>` : `[File allegato dall'utente: ${state.attachment.name}]\n<file>\n${state.attachment.content}\n</file>\n\nAnalizza questo file.`
      uiText = text ? `${text}\n(📄 ${state.attachment.name} allegato)` : `(📄 ${state.attachment.name} allegato)`
      
      state.attachment = null
      attachmentPreview.style.display = 'none'
      if (fileUpload) fileUpload.value = ''
  }

  appendMessage('user', uiText)
  state.history.push({ role: 'user', content: uiText })
  state.thinking = true
  if (btnSend) btnSend.disabled = true

  try {
    await fetch(`${API}/api/agent/query`, {
      method:  'POST',
      headers: headers(),
      body: JSON.stringify({
        input:     finalInput,
        sessionId: state.sessionId,
        history:   state.history.slice(-10),
        stream:    true
      })
    })
  } catch (err) {
    finalizeMessage(`⚠️ Errore: ${err.message}`)
  }
}

let thinkingEl = null
function showThinking(provider) {
    thinkingEl = appendMessage('ember', `Shizuku sta pensando (via ${provider})...`, 'thinking')
}

function appendToken(token) {
    if (!thinkingEl) return
    const bubble = thinkingEl.querySelector('.bubble')
    if (bubble.classList.contains('thinking')) {
        bubble.classList.remove('thinking')
        bubble.textContent = ''
    }
    bubble.textContent += token
    messages.scrollTop = messages.scrollHeight
}

function finalizeMessage(response) {
    if (thinkingEl) {
        thinkingEl.querySelector('.bubble').textContent = response
        thinkingEl.querySelector('.bubble').classList.remove('thinking')
        thinkingEl = null
    } else {
        appendMessage('ember', response)
    }
    state.history.push({ role: 'assistant', content: response })
    state.thinking = false
    if (btnSend) btnSend.disabled = false
    messages.scrollTop = messages.scrollHeight
}

function appendMessage(role, text, extraClass = '') {
  if (!messages) return
  const div  = document.createElement('div')
  div.className = `message ${role}`
  div.innerHTML = `
    <div class="bubble ${extraClass}">${escapeHtml(text)}</div>
    <div class="meta">${role === 'user' ? 'Tu' : 'Ember 🔥'} • ${new Date().toLocaleTimeString()}</div>
  `
  messages.appendChild(div)
  messages.scrollTop = messages.scrollHeight
  return div
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

setInterval(() => {
    const clock = $('clock')
    if (clock) clock.innerText = new Date().toLocaleTimeString()
}, 1000)
