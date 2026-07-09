"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/**
 * Continuous camera decode via ZXing. Emits every detected code; the parent
 * debounces repeats (the decode loop re-fires while a label stays in view).
 */
export function CameraScanner({
  onDetect,
  onError,
}: {
  onDetect: (code: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Refs keep the effect mount-once while callbacks stay fresh.
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, // most carrier labels
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417, // driver's licenses (ID scan at handover)
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    let controls: IScannerControls | undefined;
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (result) detectRef.current(result.getText());
        }
      )
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : "";
        errorRef.current(
          name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access, or use the hardware scanner / manual entry."
            : "Could not start a camera on this device."
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className="aspect-[3/4] w-full rounded-md bg-black object-cover sm:aspect-video"
      muted
      playsInline
    />
  );
}
