"use client";

import { useEffect, useRef } from "react";

// Keyboard-wedge scanners burst at 1–15ms per character; sustained human
// typing rarely gets under ~60ms. Tune after testing with real hardware.
const SCANNER_MAX_INTERKEY_MS = 40;
const SCANNER_MIN_LENGTH = 6;

/**
 * Invisible always-focused input that captures USB/Bluetooth keyboard-wedge
 * scanner bursts. Fires onDetect only when the buffer terminated by Enter/Tab
 * was typed at scanner speed — a human typing here (or anywhere else) never
 * triggers a scan.
 */
export function HardwareScannerInput({ onDetect }: { onDetect: (code: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const likelyScannerRef = useRef(true);
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;

  // Keep focus here so the clerk can fire the scanner without clicking first,
  // but yield to any other field the user is actually typing in.
  useEffect(() => {
    const refocus = () => {
      const active = document.activeElement;
      const typingElsewhere =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable) &&
        active !== inputRef.current;
      if (!typingElsewhere) inputRef.current?.focus();
    };
    refocus();
    document.addEventListener("click", refocus);
    const interval = setInterval(refocus, 1500);
    return () => {
      document.removeEventListener("click", refocus);
      clearInterval(interval);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = performance.now();
    const gap = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const code = bufferRef.current;
      bufferRef.current = "";
      const wasLikelyScanner = likelyScannerRef.current;
      likelyScannerRef.current = true;
      if (code.length >= SCANNER_MIN_LENGTH && wasLikelyScanner) {
        detectRef.current(code);
      }
      return;
    }
    if (bufferRef.current.length > 0 && gap > SCANNER_MAX_INTERKEY_MS) {
      // Slow keystroke mid-sequence: human typing, not a scanner burst.
      likelyScannerRef.current = false;
    }
    if (e.key.length === 1) bufferRef.current += e.key;
  }

  return (
    <input
      ref={inputRef}
      onKeyDown={handleKeyDown}
      onChange={() => {}}
      value=""
      // sr-only (not display:none) so the input stays focusable and receives
      // key events in all browsers/scanner HID configurations.
      className="sr-only"
      aria-label="Hardware barcode scanner input"
      autoFocus
    />
  );
}
