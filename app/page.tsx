/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useRef, useState } from "react";

type Nullable<T> = T | null;

// Kiểu cho dữ liệu file nhận được
interface ReceivedFile {
  name: string;
  size: number;
  url: string;
}

export default function HomePage() {
  // WebRTC refs
  const pcRef = useRef<Nullable<RTCPeerConnection>>(null);
  const dataChannelRef = useRef<Nullable<RTCDataChannel>>(null);

  // STATE chung
  const [log, setLog] = useState<string>("");
  const [role, setRole] = useState<"sender" | "receiver" | null>(null);

  // STATE cho signaling
  const [offerText, setOfferText] = useState("");
  const [answerText, setAnswerText] = useState("");

  // STATE gửi/nhận file
  const [sending, setSending] = useState(false);
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  const appendLog = (msg: string) => {
    setLog((prev) => prev + msg + "\n");
    console.log(msg);
  };

  const ensurePC = () => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      // LAN-only, không STUN → không đi Internet
      iceServers: [],
    });

    pc.oniceconnectionstatechange = () => {
      appendLog("ICE state: " + pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  // Helper: chờ ICE gathering complete
  const waitForIceComplete = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
      }
    });

  // ========= SENDER FLOW =========

  const handleCreateOffer = async () => {
    try {
      setRole("sender");
      setOfferText("");
      setAnswerText("");
      setReceivedFile(null);

      const pc = ensurePC();

      // Sender tạo DataChannel
      const channel = pc.createDataChannel("file");
      dataChannelRef.current = channel;

      channel.binaryType = "arraybuffer";

      channel.onopen = () => {
        appendLog("DataChannel opened (sender). Có thể gửi file.");
      };

      channel.onclose = () => {
        appendLog("DataChannel closed.");
      };

      channel.onerror = (e) => {
        appendLog("DataChannel error: " + JSON.stringify(e));
      };

      // Sender không cần ondatachannel (Receiver sẽ dùng)

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      appendLog("Đã tạo offer, chờ ICE…");

      await waitForIceComplete(pc);

      const finalOffer = pc.localDescription;
      if (!finalOffer) throw new Error("No localDescription after ICE");

      const offerJson = JSON.stringify(finalOffer);
      setOfferText(offerJson);
      appendLog("Offer đã sẵn sàng. Copy gửi cho bên nhận.");
    } catch (err: any) {
      appendLog("Lỗi tạo offer: " + err?.message);
    }
  };

  const handleApplyAnswer = async () => {
    try {
      if (!answerText.trim()) {
        appendLog("Chưa có answer để áp dụng.");
        return;
      }
      const pc = ensurePC();
      const answer = JSON.parse(answerText);
      await pc.setRemoteDescription(answer);
      appendLog("Sender đã setRemoteDescription(answer). Kết nối sắp sẵn sàng.");
    } catch (err: any) {
      appendLog("Lỗi apply answer: " + err?.message);
    }
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") {
        appendLog("DataChannel chưa sẵn sàng để gửi file.");
        return;
      }

      appendLog(`Bắt đầu gửi file: ${file.name} (${file.size} bytes)`);
      setSending(true);

      const buffer = await file.arrayBuffer();
      channel.send(
        JSON.stringify({
          type: "meta",
          name: file.name,
          size: file.size,
        }),
      );

      const CHUNK_SIZE = 16 * 1024; // 16KB
      let offset = 0;

      const sendChunk = () => {
        while (offset < buffer.byteLength) {
          if (channel.bufferedAmount > CHUNK_SIZE * 8) {
            setTimeout(sendChunk, 10);
            return;
          }
          const slice = buffer.slice(offset, offset + CHUNK_SIZE);
          channel.send(slice);
          offset += CHUNK_SIZE;
        }
        channel.send(JSON.stringify({ type: "end" }));
        appendLog("Gửi file xong.");
        setSending(false);
      };

      sendChunk();
    } catch (err: any) {
      appendLog("Lỗi khi gửi file: " + err?.message);
      setSending(false);
    } finally {
      // reset input cho phép gửi lại file khác
      e.target.value = "";
    }
  };

  // ========= RECEIVER FLOW =========

  const handleUseAsReceiver = () => {
    setRole("receiver");
    setOfferText("");
    setAnswerText("");
    setReceivedFile(null);
  };

  const handleCreateAnswer = async () => {
    try {
      if (!offerText.trim()) {
        appendLog("Chưa có offer để tạo answer.");
        return;
      }
      const pc = ensurePC();

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannelRef.current = channel;
        appendLog("Receiver: nhận được DataChannel.");

        let fileMeta: { name: string; size: number } | null = null;
        const chunks: any[] = [];

        channel.binaryType = "arraybuffer";

        channel.onmessage = (e) => {
          if (typeof e.data === "string") {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === "meta") {
                fileMeta = { name: msg.name, size: msg.size };
                appendLog(
                  `Receiver: nhận metadata file: ${msg.name} (${msg.size} bytes)`,
                );
              } else if (msg.type === "end") {
                appendLog("Receiver: nhận xong file, ghép lại…");
                if (fileMeta) {
                  const blob = new Blob(chunks);
                  const url = URL.createObjectURL(blob);
                  setReceivedFile({
                    name: fileMeta.name,
                    size: fileMeta.size,
                    url,
                  });
                  appendLog("Receiver: file đã sẵn sàng để tải.");
                }
              }
            } catch {
              appendLog("Receiver: nhận text không parse được JSON.");
            }
          } else {
            // binary chunk
            chunks.push(new Uint8Array(e.data));
          }
        };

        channel.onopen = () => {
          appendLog("Receiver: DataChannel opened.");
        };
        channel.onclose = () => {
          appendLog("Receiver: DataChannel closed.");
        };
      };

      const remoteOffer = JSON.parse(offerText);
      await pc.setRemoteDescription(remoteOffer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await waitForIceComplete(pc);

      const finalAnswer = pc.localDescription;
      if (!finalAnswer) throw new Error("No localDescription after ICE");

      const answerJson = JSON.stringify(finalAnswer);
      setAnswerText(answerJson);
      appendLog("Answer đã sẵn sàng. Copy gửi lại cho Sender.");
    } catch (err: any) {
      appendLog("Lỗi tạo answer: " + err?.message);
    }
  };

  const handleDownloadReceived = () => {
    if (!receivedFile) return;
    const a = document.createElement("a");
    a.href = receivedFile.url;
    a.download = receivedFile.name;
    a.click();
  };

  // ========= UI =========

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f5f5f5",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        P2P File Share (LAN / Hotspot, không backend)
      </h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          onClick={handleCreateOffer}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: role === "sender" ? "#0070f3" : "#e0e0e0",
            color: role === "sender" ? "#fff" : "#000",
            cursor: "pointer",
          }}
        >
          Tôi là SENDER (Gửi file)
        </button>
        <button
          onClick={handleUseAsReceiver}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: role === "receiver" ? "#0070f3" : "#e0e0e0",
            color: role === "receiver" ? "#fff" : "#000",
            cursor: "pointer",
          }}
        >
          Tôi là RECEIVER (Nhận file)
        </button>
      </div>

      {/* Sender panel */}
      <section
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginBottom: 8 }}>Sender</h2>
        <ol style={{ fontSize: 14, marginBottom: 8, paddingLeft: 20 }}>
          <li>Bấm nút &quot;Tôi là SENDER&quot; để tạo offer.</li>
          <li>Copy nội dung Offer gửi cho Receiver (Zalo, Messenger…).</li>
          <li>Nhận Answer từ Receiver, dán vào ô Answer bên dưới rồi bấm &quot;Apply Answer&quot;.</li>
          <li>Sau khi kết nối xong, chọn file để gửi.</li>
        </ol>

        <label style={{ fontWeight: 600 }}>Offer (Sender → Receiver):</label>
        <textarea
          style={{
            width: "100%",
            minHeight: 80,
            marginTop: 4,
            marginBottom: 8,
            fontSize: 12,
            fontFamily: "monospace",
          }}
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
        />

        <label style={{ fontWeight: 600 }}>Answer (Receiver → Sender):</label>
        <textarea
          style={{
            width: "100%",
            minHeight: 80,
            marginTop: 4,
            marginBottom: 8,
            fontSize: 12,
            fontFamily: "monospace",
          }}
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
        />

        <button
          onClick={handleApplyAnswer}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "#0070f3",
            color: "#fff",
            cursor: "pointer",
            marginRight: 8,
          }}
        >
          Apply Answer
        </button>

        <label
          style={{
            display: "inline-block",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #0070f3",
            background: sending ? "#e0e0e0" : "#fff",
            color: "#0070f3",
            cursor: sending ? "default" : "pointer",
            marginTop: 8,
          }}
        >
          {sending ? "Đang gửi..." : "Chọn file để gửi"}
          <input
            type="file"
            style={{ display: "none" }}
            onChange={handleSendFile}
            disabled={sending}
          />
        </label>
      </section>

      {/* Receiver panel */}
      <section
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginBottom: 8 }}>Receiver</h2>
        <ol style={{ fontSize: 14, marginBottom: 8, paddingLeft: 20 }}>
          <li>Nhận Offer từ Sender, dán vào ô Offer.</li>
          <li>Bấm &quot;Tạo Answer&quot; rồi copy Answer gửi lại cho Sender.</li>
          <li>Chờ Sender gửi file – khi xong sẽ có nút tải xuống.</li>
        </ol>

        <label style={{ fontWeight: 600 }}>Offer (Sender → Receiver):</label>
        <textarea
          style={{
            width: "100%",
            minHeight: 80,
            marginTop: 4,
            marginBottom: 8,
            fontSize: 12,
            fontFamily: "monospace",
          }}
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
        />

        <button
          onClick={handleCreateAnswer}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "#0070f3",
            color: "#fff",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          Tạo Answer
        </button>

        <label style={{ fontWeight: 600 }}>
          Answer (Receiver → Sender – gửi lại cho Sender):
        </label>
        <textarea
          style={{
            width: "100%",
            minHeight: 80,
            marginTop: 4,
            marginBottom: 8,
            fontSize: 12,
            fontFamily: "monospace",
          }}
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
        />

        {receivedFile && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 8,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              Đã nhận file: <strong>{receivedFile.name}</strong> (
              {receivedFile.size} bytes)
            </div>
            <button
              onClick={handleDownloadReceived}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                background: "#0284c7",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Tải xuống
            </button>
          </div>
        )}
      </section>

      {/* Log */}
      <section
        style={{
          background: "#111827",
          color: "#e5e7eb",
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          fontFamily: "monospace",
          maxHeight: 200,
          overflow: "auto",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Log</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{log}</pre>
      </section>
    </main>
  );
}
