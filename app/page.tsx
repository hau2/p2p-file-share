"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useRef, useState } from "react";
import QrScanner from "@/components/QRScanner";

function encodeSDP(obj: any) {
  const json = JSON.stringify(obj);
  const utf8 = new TextEncoder().encode(json);
  const base64 = btoa(String.fromCharCode(...utf8));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSDP(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

// tạo broadcast channel
const channel = new BroadcastChannel("p2p-signaling");

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
    setOfferQR(null);
    setAnswerQR(null);
    setReceivedFile(null);

    const pc = ensurePC();

    const dc = pc.createDataChannel("file");
    dataChannelRef.current = dc;
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setIsChannelOpen(true);
    dc.onclose = () => setIsChannelOpen(false);

    // tạo offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await waitForIceComplete(pc);

    const encoded = encodeSDP(pc.localDescription);
    const res = await fetch("/api/save-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer: encoded }),
    });

    const { offerId } = await res.json();

    setOfferText(offerId);
    setOfferQR(
      `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${offerId}`
    );

    appendLog("Sender: Offer đã upload MongoDB → ID = " + offerId);
  };

  const handleApplyAnswer = async () => {
    if (!answerText.trim()) {
      appendLog("Sender: chưa có Answer để Apply!");
      return;
    }

    const pc = ensurePC();
    const answerObj = decodeSDP(answerText.trim());

    await pc.setRemoteDescription(answerObj);
    appendLog("Sender: Answer applied, đang kết nối WebRTC…");
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
  async function processOffer(key: string, offerSDP: string) {
    appendLog("Receiver: xử lý Offer…");

    const pc = ensurePC();

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      dataChannelRef.current = ch;
      ch.binaryType = "arraybuffer";

      ch.onopen = () => setIsChannelOpen(true);
      ch.onclose = () => setIsChannelOpen(false);

      let meta: any = null;
      const chunks: any[] = [];

      ch.onmessage = (e) => {
        if (typeof e.data === "string") {
          const msg = JSON.parse(e.data);
          if (msg.type === "meta") meta = msg;
          else if (msg.type === "end") {
            const blob = new Blob(chunks);
            const url = URL.createObjectURL(blob);
            setReceivedFile({ name: meta.name, size: meta.size, url });
          }
        } else {
          chunks.push(new Uint8Array(e.data));
        }
      };
    };

    // apply remote
    await pc.setRemoteDescription(JSON.parse(offerSDP));

    // create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceComplete(pc);

    const answerJson = JSON.stringify(pc.localDescription);
    const answerKey = key + "-ans";

    channel.postMessage({
      type: "answer",
      key: answerKey,
      sdp: answerJson,
    });

    setAnswerText(answerKey);
    const encodedAnswer = encodeSDP(pc.localDescription);

    setAnswerQR(
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedAnswer}`
    );

    setAnswerText(encodedAnswer);

    appendLog("Receiver: Answer đã sẵn sàng → key = " + answerKey);
  }

  const createAnswerFromOffer = async (offerId: string) => {
    appendLog("Receiver: đang tải Offer từ server…");

    // 1) Lấy OFFER từ MongoDB
    const res = await fetch(`/api/get-offer?id=${offerId}`);
    const { offer } = await res.json();
    const offerObj = decodeSDP(offer);

    const pc = ensurePC();

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      dataChannelRef.current = ch;
      ch.binaryType = "arraybuffer";

      ch.onopen = () => setIsChannelOpen(true);
      ch.onclose = () => setIsChannelOpen(false);

      let meta: any = null;
      const chunks: any[] = [];

      ch.onmessage = (e) => {
        if (typeof e.data === "string") {
          const msg = JSON.parse(e.data);
          if (msg.type === "meta") meta = msg;

          if (msg.type === "end") {
            const blob = new Blob(chunks);
            const url = URL.createObjectURL(blob);
            setReceivedFile({ name: meta.name, size: meta.size, url });
            appendLog("Receiver: File đã nhận xong!");
          }
        } else {
          chunks.push(new Uint8Array(e.data));
        }
      };
    };

    await pc.setRemoteDescription(offerObj);

    // tạo answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceComplete(pc);

    const encodedAnswer = encodeSDP(pc.localDescription);

    // lưu Answer lên MongoDB
    await fetch("/api/save-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: offerId, answer: encodedAnswer }),
    });

    // tạo QR
    setAnswerQR(
      `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${offerId}`
    );

    setAnswerText(encodedAnswer);
    appendLog("Receiver: Answer QR đã sẵn sàng!");
  };

  async function fetchAndApplyAnswer(answerId: string) {
    appendLog("Sender: đang tải Answer từ server…");

    const res = await fetch(`/api/get-answer?id=${answerId}`);
    const { answer } = await res.json();
    const answerObj = decodeSDP(answer);

    const pc = ensurePC();
    await pc.setRemoteDescription(answerObj);

    appendLog("Sender: Đã apply Answer → WebRTC đang kết nối…");
  }

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
        <button onClick={handleCreateOffer} style={styles.primaryBtn}>
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
            <a
              href={receivedFile.url}
              download={receivedFile.name}
              style={styles.downloadBtn}
            >
              ⬇️ Tải xuống
            </a>
          </div>
        )}
      </div>

      {/* QR SCANNER */}
      {scanMode && (
        <QrScanner
          onScan={(text) => {
            const s = text.trim();
            if (scanMode === "offer") createAnswerFromOffer(s);
            else if (scanMode === "answer") fetchAndApplyAnswer(s);
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
