"use client";

import { Html5Qrcode } from "html5-qrcode";
import React, { useEffect, useRef, useState } from "react";

export default function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const id = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [ready, setReady] = useState(false);
  const runningRef = useRef(false);

  const safeStop = async () => {
    try {
      if (scannerRef.current && runningRef.current) {
        runningRef.current = false;
        await scannerRef.current.stop();
      }
    } catch (_) {}
    onClose();
  };

  useEffect(() => {
    let cancelled = false;

    const startScanner = async () => {
      const scanner = new Html5Qrcode(id);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 260 },
          (decodedText) => {
            if (!runningRef.current) return;
            runningRef.current = false;
            safeStop();
            onScan(decodedText);
          },
          () => {}
        );

        if (!cancelled) {
          runningRef.current = true;
          setReady(true);
        }
      } catch (err) {
        console.error("Camera error:", err);
        safeStop();
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      safeStop();
    };
  }, []);

  return (
    <div style={styles.overlay}>
      {/* Close Button */}
      <button style={styles.closeBtn} onClick={safeStop}>
        ✕
      </button>

      {/* Title */}
      <div style={styles.title}>Quét mã QR</div>

      {/* Video Container */}
      <div style={styles.scanFrame}>
        <div id={id} style={styles.cameraBox}></div>

        {/* Scan animation line */}
        <div style={styles.scanLine}></div>
      </div>

      {/* Footer Text */}
      <p style={styles.tip}>
        Đưa mã QR vào trong khung để quét tự động
      </p>

      {!ready && <p style={styles.loading}>Đang khởi động camera…</p>}
    </div>
  );
}

//
// Styles
//
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 40,
    animation: "fadeIn .2s ease",
  },

  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    fontSize: 26,
    width: 40,
    height: 40,
    borderRadius: "50%",
    cursor: "pointer",
  },

  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
  },

  scanFrame: {
    position: "relative",
    width: 280,
    height: 280,
    borderRadius: 20,
    overflow: "hidden",
    border: "3px solid #00FFAA",
    boxShadow: "0 0 20px rgba(0,255,170,0.3)",
  },

  cameraBox: {
    width: "100%",
    height: "100%",
  },

  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 2,
    background: "rgba(0,255,170,0.8)",
    animation: "scan-move 2s linear infinite",
  },

  tip: {
    color: "#ddd",
    marginTop: 20,
    fontSize: 14,
  },

  loading: {
    color: "#bbb",
    marginTop: 8,
  },
};
