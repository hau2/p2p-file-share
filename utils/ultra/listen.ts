/* eslint-disable @typescript-eslint/no-explicit-any */
// utils/ultra/listen.ts

export class UltrasoundReceiver {
  private ctx!: AudioContext;
  private analyser!: AnalyserNode;
  private data!: Float32Array | any;
  private running = false;

  // Callback trả về session string sau khi decode
  constructor(private onSessionDetected: (session: string) => void) {}

  async start() {
    this.ctx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();

    // FFT độ phân giải cao
    this.analyser.fftSize = 32768;

    this.data = new Float32Array(this.analyser.frequencyBinCount);

    source.connect(this.analyser);

    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.ctx) {
      this.ctx.close();
    }
  }

  private loop = () => {
    if (!this.running) return;

    // Đọc dữ liệu FFT vào Float32Array
    this.analyser.getFloatFrequencyData(this.data);

    // Phân tích peak tần số
    const freq = this.detectPeakFrequency();

    // TODO: tại đây bạn sẽ thêm detector start-marker + bit decode
    // console.log("Peak:", freq);

    requestAnimationFrame(this.loop);
  };

  private detectPeakFrequency(): number {
    if (!this.ctx) return 0;

    let maxVal = -Infinity;
    let maxIndex = 0;

    // Tìm bin có biên độ cao nhất (peak)
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > maxVal) {
        maxVal = this.data[i];
        maxIndex = i;
      }
    }

    // Chuyển bin → tần số (Hz)
    const freq =
      (maxIndex * this.ctx.sampleRate) / 2 / this.data.length;

    return freq;
  }
}
