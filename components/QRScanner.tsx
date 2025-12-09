/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

const QrScanner = dynamic(() => import("react-qr-scanner"), { ssr: false });

export default function QRScanner({ onScan }: { onScan: (value: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(
    (data: string | null) => {
      if (data) {
        onScan(data);
      }
    },
    [onScan]
  );

  const handleError = (err: any) => {
    console.error("QR Scan error:", err);
    setError(String(err));
  };

  return (
    <div style={{ marginTop: 20 }}>
      <QrScanner
        delay={200}
        onError={handleError}
        onScan={handleScan}
        style={{ width: "100%", borderRadius: 12 }}
      />
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
