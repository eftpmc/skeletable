import { unzipSync } from "fflate";

/**
 * Just enough of NumPy's .npz format to read the lab's photo vectors: a zip of .npy arrays,
 * here a fixed-width unicode array of keys ("<U20") and a float16 or float32 matrix of vectors.
 */
export type NpyArray = { descr: string; shape: number[]; data: Uint8Array };

export function readNpz(bytes: Uint8Array): Record<string, NpyArray> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name.replace(/\.npy$/, ""), readNpy(data)]));
}

export function readNpy(bytes: Uint8Array): NpyArray {
  if (bytes[0] !== 0x93 || String.fromCharCode(...bytes.subarray(1, 6)) !== "NUMPY") throw new Error("not an .npy array");
  const major = bytes[6]!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const start = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(bytes.subarray(start, start + headerLength));
  const descr = header.match(/'descr':\s*'([^']+)'/)?.[1];
  const shape = header.match(/'shape':\s*\(([^)]*)\)/)?.[1];
  if (!descr || shape === undefined || /'fortran_order':\s*True/.test(header)) throw new Error("unsupported .npy header");
  return {
    descr,
    shape: shape.split(",").map((s) => s.trim()).filter(Boolean).map(Number),
    data: bytes.subarray(start + headerLength),
  };
}

/** A "<Un" array as strings (UTF-32, little-endian, padded with zeros). */
export function npyStrings(array: NpyArray): string[] {
  const width = Number(array.descr.match(/^<U(\d+)$/)?.[1]);
  if (!width) throw new Error(`not a unicode array: ${array.descr}`);
  const view = new DataView(array.data.buffer, array.data.byteOffset, array.data.byteLength);
  return Array.from({ length: array.shape[0]! }, (_, i) => {
    let s = "";
    for (let j = 0; j < width; j++) {
      const code = view.getUint32((i * width + j) * 4, true);
      if (code === 0) break;
      s += String.fromCodePoint(code);
    }
    return s;
  });
}

/** Row `i` of a 2-D "<f2" or "<f4" matrix. */
export function npyRow(array: NpyArray, i: number): number[] {
  const columns = array.shape[1]!;
  const view = new DataView(array.data.buffer, array.data.byteOffset, array.data.byteLength);
  if (array.descr === "<f4") return Array.from({ length: columns }, (_, j) => view.getFloat32((i * columns + j) * 4, true));
  if (array.descr === "<f2") return Array.from({ length: columns }, (_, j) => half(view.getUint16((i * columns + j) * 2, true)));
  throw new Error(`unsupported vector type: ${array.descr}`);
}

function half(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
