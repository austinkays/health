import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

const MAX_DURATION_MS = 120_000; // 2 minutes total
const SILENCE_TIMEOUT_MS = 30_000; // 30 seconds of silence

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const silenceTimer = useRef(null);
  const maxTimer = useRef(null);

  const isSupported = !!SpeechRecognition;

  const clearTimers = useCallback(() => {
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }
    if (maxTimer.current) { clearTimeout(maxTimer.current); maxTimer.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    if (recRef.current) {
      try { recRef.current.stop(); } catch (_) { /* already stopped */ }
    }
    setIsListening(false);
  }, [clearTimers]);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => stop(), SILENCE_TIMEOUT_MS);
  }, [stop]);

  const start = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    setTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalText = '';

    recognition.onstart = () => {
      setIsListening(true);
      resetSilenceTimer();
      maxTimer.current = setTimeout(() => stop(), MAX_DURATION_MS);
    };

    recognition.onresult = (e) => {
      resetSilenceTimer();
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript + ' ';
        } else {
          interim += r[0].transcript;
        }
      }
      setTranscript((finalText + interim).trim());
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return; // silence, not a real error
      if (e.error === 'aborted') return; // user stopped
      const messages = {
        'not-allowed': 'Microphone permission denied. Enable it in browser settings.',
        'network': 'Network error, speech recognition needs an internet connection.',
        'audio-capture': 'No microphone detected.',
        'service-not-allowed': 'Speech service not available in this browser.',
      };
      setError(messages[e.error] || `Speech error: ${e.error}`);
      stop();
    };

    recognition.onend = () => {
      clearTimers();
      setIsListening(false);
      recRef.current = null;
    };

    recRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setError('Could not start speech recognition.');
      setIsListening(false);
    }
  }, [isSupported, resetSilenceTimer, stop, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (recRef.current) {
        try { recRef.current.stop(); } catch (_) { /* noop */ }
      }
    };
  }, [clearTimers]);

  return { isListening, transcript, error, start, stop, isSupported };
}
