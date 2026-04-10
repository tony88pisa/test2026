// EmberPrompt.tsx - Componente prompt completo per Camelot-IDE / Ember Buddy Chat
// Features: animazione live, sync testuale, toggle audio TTS (Web Speech API)

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface EmberPromptProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  audioEnabled?: boolean;
  onAudioToggle?: (enabled: boolean) => void;
  lastBotResponse?: string; // testo da leggere ad alta voce quando arriva
}

// ─── Hook: TTS via Web Speech API ────────────────────────────────────────────
function useTTS(enabled: boolean) {
  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' ? window.speechSynthesis : null
  );
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !synthRef.current) return;
      // Ferma eventuale voce in corso
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'it-IT';
      utt.rate = 1.05;
      utt.pitch = 1.1;
      // Preferisce una voce femminile italiana se disponibile
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(
        (v) => v.lang === 'it-IT' && v.name.toLowerCase().includes('alice')
      ) || voices.find((v) => v.lang === 'it-IT') || voices[0];
      if (preferred) utt.voice = preferred;
      utteranceRef.current = utt;
      synthRef.current.speak(utt);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  return { speak, stop };
}

// ─── Animated Dots (thinking indicator) ─────────────────────────────────────
function ThinkingDots() {
  return (
    <span className="ember-thinking-dots" aria-label="Ember sta pensando">
      <span>●</span><span>●</span><span>●</span>
    </span>
  );
}

// ─── Audio Toggle Button ─────────────────────────────────────────────────────
function AudioToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ember-audio-btn ${enabled ? 'active' : 'muted'}`}
      onClick={onToggle}
      aria-label={enabled ? 'Disattiva audio Ember' : 'Attiva audio Ember'}
      title={enabled ? 'Audio ON — clicca per silenziare' : 'Audio OFF — clicca per attivare'}
    >
      {enabled ? (
        // Speaker with waves
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      ) : (
        // Speaker muted
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      )}
    </button>
  );
}

// ─── Live Text Visualizer (caratteri animati) ────────────────────────────────
function LiveTextVisualizer({ text, isActive }: { text: string; isActive: boolean }) {
  if (!text && !isActive) return null;
  const chars = text.split('');
  return (
    <div className="ember-live-text" aria-live="polite" aria-label="Testo in composizione">
      {chars.map((ch, i) => (
        <span
          key={i}
          className="ember-char"
          style={{ animationDelay: `${Math.min(i * 10, 300)}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
      {isActive && <span className="ember-cursor" aria-hidden="true">|</span>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function EmberPrompt({
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = 'Chiedi a Ember…',
  audioEnabled: audioEnabledProp = false,
  onAudioToggle,
  lastBotResponse,
}: EmberPromptProps) {
  const [value, setValue] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(audioEnabledProp);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { speak, stop } = useTTS(audioEnabled);

  // Leggi ad alta voce le risposte di Ember quando arrivano
  useEffect(() => {
    if (lastBotResponse && audioEnabled) {
      speak(lastBotResponse);
    }
  }, [lastBotResponse, audioEnabled, speak]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const handleToggleAudio = useCallback(() => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    if (!next) stop();
    onAudioToggle?.(next);
  }, [audioEnabled, stop, onAudioToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isLoading && !disabled) {
          onSend(value.trim());
          setValue('');
        }
      }
    },
    [value, isLoading, disabled, onSend]
  );

  const handleSend = useCallback(() => {
    if (value.trim() && !isLoading && !disabled) {
      onSend(value.trim());
      setValue('');
    }
  }, [value, isLoading, disabled, onSend]);

  const isDisabled = disabled || isLoading;

  return (
    <>
      {/* ── CSS inline per portabilità ── */}
      <style>{STYLES}</style>

      <div className={`ember-prompt-wrapper ${isFocused ? 'focused' : ''} ${isLoading ? 'loading' : ''}`}>
        {/* Live text visualizer sopra l'input */}
        <LiveTextVisualizer text={value} isActive={isFocused && !isLoading} />

        {/* Barra principale */}
        <div className="ember-prompt-bar">
          {/* Indicatore stato */}
          <div className="ember-status-dot" aria-hidden="true">
            {isLoading ? <ThinkingDots /> : <span className="ember-dot-live" />}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="ember-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isLoading ? 'Ember sta elaborando…' : placeholder}
            disabled={isDisabled}
            rows={1}
            aria-label="Messaggio per Ember"
            aria-multiline="true"
          />

          {/* Controlli destra */}
          <div className="ember-controls">
            <AudioToggle enabled={audioEnabled} onToggle={handleToggleAudio} />
            <button
              type="button"
              className="ember-send-btn"
              onClick={handleSend}
              disabled={!value.trim() || isDisabled}
              aria-label="Invia messaggio"
              title="Invia (Invio)"
            >
              {isLoading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ember-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <div className="ember-hint">
          <kbd>Invio</kbd> per inviare &nbsp;·&nbsp; <kbd>Shift+Invio</kbd> per andare a capo
          {audioEnabled && <span className="ember-audio-hint"> · 🔊 Audio attivo</span>}
        </div>
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const STYLES = `
/* === Ember Prompt === */
.ember-prompt-wrapper {
  position: relative;
  padding: 6px 0 0;
  transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Live text visualizer */
.ember-live-text {
  min-height: 20px;
  padding: 0 14px 4px;
  font-size: 11px;
  color: #7a9ea8;
  letter-spacing: 0.02em;
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  pointer-events: none;
  overflow: hidden;
  max-height: 40px;
}

.ember-char {
  display: inline-block;
  animation: charPop 120ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transform-origin: center bottom;
}

@keyframes charPop {
  0% { opacity: 0; transform: translateY(4px) scale(0.85); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.ember-cursor {
  display: inline-block;
  width: 1px;
  color: #4f98a3;
  animation: blink 900ms step-start infinite;
  font-weight: 100;
  margin-left: 1px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Main bar */
.ember-prompt-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #1c1b19;
  border: 1px solid #393836;
  border-radius: 12px;
  padding: 8px 10px;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.ember-prompt-wrapper.focused .ember-prompt-bar {
  border-color: #4f98a3;
  box-shadow: 0 0 0 2px rgba(79, 152, 163, 0.15);
}

.ember-prompt-wrapper.loading .ember-prompt-bar {
  border-color: #56444f;
  animation: pulseLoading 1.8s ease-in-out infinite;
}

@keyframes pulseLoading {
  0%, 100% { box-shadow: 0 0 0 0 rgba(209, 99, 167, 0); }
  50%       { box-shadow: 0 0 0 4px rgba(209, 99, 167, 0.12); }
}

/* Status dot */
.ember-status-dot {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 3px;
}

.ember-dot-live {
  display: block;
  width: 7px;
  height: 7px;
  background: #4f98a3;
  border-radius: 50%;
  animation: pulseDot 2s ease-in-out infinite;
}

@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.75); }
}

/* Thinking dots */
.ember-thinking-dots {
  display: flex;
  gap: 3px;
  align-items: center;
}

.ember-thinking-dots span {
  display: block;
  font-size: 6px;
  color: #d163a7;
  animation: dotBounce 1.1s ease-in-out infinite;
}

.ember-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.ember-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
}

/* Textarea */
.ember-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.55;
  color: #cdccca;
  min-height: 24px;
  max-height: 140px;
  padding: 2px 0;
  overflow-y: auto;
}

.ember-textarea::placeholder {
  color: #5a5957;
  font-style: italic;
}

.ember-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Controls */
.ember-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* Audio toggle */
.ember-audio-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5a5957;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease;
}

.ember-audio-btn:hover {
  color: #cdccca;
  background: rgba(255,255,255,0.05);
}

.ember-audio-btn.active {
  color: #4f98a3;
}

.ember-audio-btn.active:hover {
  color: #8ec4cc;
  background: rgba(79, 152, 163, 0.1);
}

/* Send button */
.ember-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4f98a3;
  border: none;
  cursor: pointer;
  color: #171614;
  transition: background 180ms ease, transform 80ms ease;
  flex-shrink: 0;
}

.ember-send-btn:hover:not(:disabled) {
  background: #227f8b;
}

.ember-send-btn:active:not(:disabled) {
  transform: scale(0.93);
}

.ember-send-btn:disabled {
  background: #2d2c2a;
  color: #5a5957;
  cursor: not-allowed;
}

.ember-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Hint footer */
.ember-hint {
  padding: 4px 14px 0;
  font-size: 11px;
  color: #5a5957;
  display: flex;
  align-items: center;
  gap: 2px;
}

.ember-hint kbd {
  background: #262523;
  border: 1px solid #393836;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: inherit;
  font-size: 10px;
  color: #797876;
}

.ember-audio-hint {
  color: #4f98a3;
  margin-left: 4px;
}
`;
