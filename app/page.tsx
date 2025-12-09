"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useRef, useState } from "react";
import QrScanner from "@/components/QRScanner";

type Nullable<T> = T | null;

interface ReceivedFile {
  name: string;
  size: number;
  url: string;
}

export default function HomePage() {
  const pcRef = useRef<Nullable<RTCPeerConnection>>(null);
  const dataChannelRef = useRef<Nullable<RTCDataChannel>>(null);

  const [isChannelOpen, setIsChannelOpen] = useState(false);
  const [log, setLog] = useState<string>("");
  const [role, setRole] = useState<"sender" | "receiver" | null>(null);

  const [offerText, setOfferText] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [sending, setSending] = useState(false);
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  const [offerQR, setOfferQR] = useState<string | null>(null);
  const [answerQR, setAnswerQR] = useState<string | null>(null);

  const [scanMode, setScanMode] = useState<"offer" | "answer" | null>(null);

  const appendLog = (msg: string) => {
    setLog((prev) => prev + msg + "\n");
    console.log(msg);
  };

  const ensurePC = () => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.oniceconnectionstatechange = () => {
      appendLog("ICE: " + pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  const waitForIceComplete = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
    });

  // ===============================
  // SENDER FLOW
  // ===============================
  const handleCreateOffer = async () => {
    setRole("sender");
    setOfferText("");
    setAnswerText("");
    setReceivedFile(null);

    const pc = ensurePC();

    const channel = pc.createDataChannel("file");
    dataChannelRef.current = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      setIsChannelOpen(true);
      appendLog("DataChannel opened.");
    };

    channel.onclose = () => {
      setIsChannelOpen(false);
      appendLog("DataChannel closed.");
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceComplete(pc);

    const json = JSON.stringify(pc.localDescription);

    setOfferQR(
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        json
      )}`
    );

    setOfferText(json);
    appendLog("Offer created & QR ready.");
  };

  const handleApplyAnswer = async () => {
    if (!answerText.trim()) return appendLog("Chưa có Answer!");

    const pc = ensurePC();
    await pc.setRemoteDescription(JSON.parse(answerText));

    appendLog("Answer applied, waiting for channel…");
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const channel = dataChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      appendLog("Channel chưa mở");
      return;
    }

    appendLog(`Sending file: ${file.name}`);
    setSending(true);

    const buffer = await file.arrayBuffer();
    channel.send(
      JSON.stringify({ type: "meta", name: file.name, size: file.size })
    );

    const CHUNK = 16 * 1024;
    let offset = 0;

    const sendChunk = () => {
      while (offset < buffer.byteLength) {
        if (channel.bufferedAmount > CHUNK * 10) {
          setTimeout(sendChunk, 30);
          return;
        }
        channel.send(buffer.slice(offset, offset + CHUNK));
        offset += CHUNK;
      }
      channel.send(JSON.stringify({ type: "end" }));
      setSending(false);
      appendLog("File sent.");
    };

    sendChunk();
    e.target.value = "";
  };

  // ===============================
  // RECEIVER FLOW
  // ===============================
  const createAnswerFromOffer = async (offerJson: string) => {
    const pc = ensurePC();

    pc.ondatachannel = (ev) => {
      const channel = ev.channel;
      channel.binaryType = "arraybuffer";

      channel.onopen = () => {
        setIsChannelOpen(true);
        appendLog("Receiver: Channel opened.");
      };

      channel.onclose = () => {
        setIsChannelOpen(false);
        appendLog("Receiver: Channel closed.");
      };

      let meta: any = null;
      const chunks: any[] = [];

      channel.onmessage = (e) => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "meta") meta = msg;
            else if (msg.type === "end") {
              const blob = new Blob(chunks);
              const url = URL.createObjectURL(blob);
              setReceivedFile({
                name: meta.name,
                size: meta.size,
                url,
              });
              appendLog("Receiver: File received!");
            }
          } catch {}
        } else {
          chunks.push(new Uint8Array(e.data));
        }
      };
    };

    await pc.setRemoteDescription(JSON.parse(offerJson));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceComplete(pc);

    const json = JSON.stringify(pc.localDescription);

    setAnswerQR(
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        json
      )}`
    );

    setAnswerText(json);
    appendLog("Answer created & QR ready.");
  };

  // ===============================
  // UI — BEAUTIFUL VERSION
  // ===============================

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}
      <h1
        style={{
          textAlign: "center",
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        🔄 P2P File Share
      </h1>
      <p style={{ textAlign: "center", marginBottom: 28, color: "#666" }}>
        Chia sẻ file bằng WebRTC + QR 2 chiều, không cần Internet
      </p>

      {/* BUTTON ROW */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <button
          onClick={handleCreateOffer}
          style={styles.primaryBtn}
        >
          🚀 Tôi là Sender
        </button>

        <button
          onClick={() => setScanMode("offer")}
          style={styles.secondaryBtn}
        >
          📷 Receiver: Quét Offer QR
        </button>
      </div>

      {/* SENDER CARD */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>📤 Sender</h2>

        {offerQR && (
          <div style={styles.qrBox}>
            <img src={offerQR} width={240} />
            <div style={styles.qrLabel}>Offer QR</div>
          </div>
        )}

        <button
          onClick={() => setScanMode("answer")}
          style={styles.secondaryBtn}
        >
          📷 Quét Answer QR
        </button>

        <textarea
          placeholder="Answer JSON"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          style={styles.textarea}
        />

        <button onClick={handleApplyAnswer} style={styles.primaryBtn}>
          Áp dụng Answer
        </button>

        <label style={{ marginTop: 16, display: "block" }}>
          <strong>Gửi file:</strong>
        </label>

        <input
          type="file"
          disabled={!isChannelOpen}
          onChange={handleSendFile}
          style={styles.fileInput}
        />
      </div>

      {/* RECEIVER CARD */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>📥 Receiver</h2>

        {answerQR && (
          <div style={styles.qrBox}>
            <img src={answerQR} width={240} />
            <div style={styles.qrLabel}>Answer QR</div>
          </div>
        )}

        {receivedFile && (
          <div style={styles.fileCard}>
            <div>
              <strong>{receivedFile.name}</strong> <br />
              {receivedFile.size} bytes
            </div>
            <a href={receivedFile.url} download={receivedFile.name} style={styles.downloadBtn}>
              ⬇️ Tải xuống
            </a>
          </div>
        )}
      </div>

      {/* QR SCANNER */}
      {scanMode && (
        <QrScanner
          onScan={(text) => {
            if (scanMode === "offer") createAnswerFromOffer(text);
            else if (scanMode === "answer") setAnswerText(text);
          }}
          onClose={() => setScanMode(null)}
        />
      )}

      {/* LOG */}
      <div style={styles.logBox}>
        <h3>📄 Log</h3>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{log}</pre>
      </div>
    </main>
  );
}

//
// 🔥 BEAUTIFUL UI STYLES
//
const styles: Record<string, React.CSSProperties> = {
  primaryBtn: {
    background: "#0070f3",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
  },

  secondaryBtn: {
    background: "#eee",
    color: "#333",
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 500,
  },

  card: {
    background: "#fff",
    padding: 20,
    borderRadius: 16,
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    marginBottom: 28,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
  },

  qrBox: {
    textAlign: "center",
    marginBottom: 16,
  },

  qrLabel: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },

  textarea: {
    width: "100%",
    height: 90,
    borderRadius: 10,
    border: "1px solid #ccc",
    padding: 10,
    marginTop: 12,
    fontFamily: "monospace",
  },

  fileInput: {
    marginTop: 10,
  },

  fileCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  downloadBtn: {
    padding: "6px 12px",
    background: "#0284c7",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
  },

  logBox: {
    background: "#111",
    color: "#eee",
    padding: 14,
    borderRadius: 14,
    marginTop: 30,
    maxHeight: 260,
    overflow: "auto",
  },
};
