"use client";
import { QRCodeSVG } from "qrcode.react";

export default function QRCodeBox({ value }: { value: string }) {
  if (!value) return null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: 12,
        background: "#fff",
        borderRadius: 12,
        marginBottom: 12,
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      }}
    >
      <QRCodeSVG value={value} size={240} />
    </div>
  );
}
