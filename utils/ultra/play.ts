import { stringToBits } from "./encode";

export async function playUltrasound(session: string) {
  const ctx = new AudioContext();
  const bits = stringToBits(session);

  const startTone = 19500; // 19.5kHz
  const freq0 = 18500; 
  const freq1 = 19000; 
  const stopTone = 17500;

  function playTone(freq: number, duration: number) {
    return new Promise<void>((resolve) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        resolve();
      }, duration);
    });
  }

  // Start marker
  await playTone(startTone, 120);

  // Payload bits
  for (const bit of bits) {
    await playTone(bit === 0 ? freq0 : freq1, 40);
  }

  // Stop marker
  await playTone(stopTone, 120);

  await ctx.close();
}
