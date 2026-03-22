/**
 * Test Image Generator
 *
 * Creates minimal valid PNG and JPEG images at specific dimensions for API testing.
 * Uses raw binary construction — no native dependencies (sharp, canvas, etc.).
 */

import { deflateSync } from 'zlib';

/**
 * Create a minimal valid PNG image at the given dimensions as a base64 data URL.
 * Uses a single solid color to keep the image small.
 */
function createPng(width: number, height: number): string {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width, height, bit depth (8), color type (2=RGB)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createPngChunk('IHDR', ihdrData);

  // IDAT chunk: raw image data (filter byte + RGB pixels per row)
  const rowSize = 1 + width * 3; // 1 filter byte + width * 3 bytes (RGB)
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter: none
    // Fill with gray pixels (128, 128, 128)
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = 128;
      rawData[px + 1] = 128;
      rawData[px + 2] = 128;
    }
  }
  const compressed = deflateSync(rawData);
  const idat = createPngChunk('IDAT', compressed);

  // IEND chunk
  const iend = createPngChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([signature, ihdr, idat, iend]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * Create a PNG chunk with CRC
 */
function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * CRC32 for PNG chunks
 */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a minimal valid JPEG image at the given dimensions as a base64 data URL.
 * Creates a valid JPEG with SOI, SOF0, SOS markers and minimal scan data.
 */
function createJpeg(width: number, height: number): string {
  const parts: Buffer[] = [];

  // SOI (Start of Image)
  parts.push(Buffer.from([0xff, 0xd8]));

  // APP0 (JFIF header)
  const app0 = Buffer.from([
    0xff, 0xe0, // APP0 marker
    0x00, 0x10, // Length: 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // Version 1.1
    0x00, // Aspect ratio units: no units
    0x00, 0x01, // X density: 1
    0x00, 0x01, // Y density: 1
    0x00, 0x00, // No thumbnail
  ]);
  parts.push(app0);

  // DQT (Define Quantization Table) - all 1s for minimal size
  const dqt = Buffer.alloc(69);
  dqt[0] = 0xff;
  dqt[1] = 0xdb;
  dqt[2] = 0x00;
  dqt[3] = 67; // length
  dqt[4] = 0x00; // table 0, 8-bit precision
  for (let i = 5; i < 69; i++) dqt[i] = 1;
  parts.push(dqt);

  // SOF0 (Start of Frame) - this is what the dimension decoder reads
  const sof = Buffer.from([
    0xff, 0xc0, // SOF0 marker
    0x00, 0x0b, // Length: 11
    0x08, // Precision: 8 bits
    (height >> 8) & 0xff, height & 0xff, // Height
    (width >> 8) & 0xff, width & 0xff, // Width
    0x01, // Number of components: 1 (grayscale)
    0x01, 0x11, 0x00, // Component 1: ID=1, sampling=1x1, quant table=0
  ]);
  parts.push(sof);

  // DHT (Huffman table) - minimal DC table
  const dht = Buffer.from([
    0xff, 0xc4, // DHT marker
    0x00, 0x1f, // Length: 31
    0x00, // DC table 0
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, // Bit counts
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, // Symbols
  ]);
  parts.push(dht);

  // SOS (Start of Scan) + minimal scan data
  const sos = Buffer.from([
    0xff, 0xda, // SOS marker
    0x00, 0x08, // Length: 8
    0x01, // Number of components: 1
    0x01, 0x00, // Component 1: DC=0, AC=0
    0x00, 0x3f, 0x00, // Spectral selection
    0x00, // Minimal scan data (all zeros)
  ]);
  parts.push(sos);

  // EOI (End of Image)
  parts.push(Buffer.from([0xff, 0xd9]));

  const jpeg = Buffer.concat(parts);
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/**
 * Create a test image at the specified dimensions.
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param format - Image format ('png' or 'jpeg'), defaults to 'png'
 * @returns Base64 data URL string
 *
 * @example
 * ```typescript
 * // Create a 2000x2000 PNG (4MP — exceeds real-esrgan's 1.5MP limit)
 * const oversized = createCanvas(2000, 2000);
 *
 * // Create a 1224x1224 PNG (just under 1.5MP limit)
 * const justUnder = createCanvas(1224, 1224);
 * ```
 */
export function createCanvas(
  width: number,
  height: number,
  format: 'png' | 'jpeg' = 'png'
): string {
  if (format === 'jpeg') {
    return createJpeg(width, height);
  }
  return createPng(width, height);
}
