// Encode session (e.g. "AB12CD34") into bits
export function stringToBits(str: string): number[] {
  const bits: number[] = [];
  for (const char of str) {
    const code = char.charCodeAt(0);
    for (let i = 7; i >= 0; i--) {
      bits.push((code >> i) & 1);
    }
  }
  return bits;
}
