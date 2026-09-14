import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve } from "node:path";

/* ──────────────────────────────────────────────────────────────
 * `npm run icon` — 앱 아이콘을 생성하고 index.html 파비콘을 갱신한다.
 *   assets/app-icon.ico   (16 · 32 · 48 · 64 · 128 · 256 px, 32-bit) — 배포본 바로가기용
 *   index.html <link rel="icon">  ← 64px PNG data URI 로 교체 (title bar·작업표시줄 창 아이콘)
 *
 * 순수 Node(외부 의존성 없음)로 픽셀을 그려 ICO(BMP) / PNG(zlib) 로 인코딩한다.
 * 디자인: 앱 강조색(#4f46e5) 둥근 사각형 + 흰색 체크 표시 —
 *         Edge/Chrome 아이콘과 헷갈리지 않는 단색 브랜드 마크.
 * ────────────────────────────────────────────────────────────── */

const ACCENT = [0x4f, 0x46, 0xe5]; // #4f46e5  (r,g,b)
const MARK = [0xff, 0xff, 0xff]; // 체크 표시 색
const SIZES = [16, 32, 48, 64, 128, 256];
const SS = 4; // 슈퍼샘플링 (안티에일리어싱)

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 둥근 사각형 signed distance (<0 이면 내부)
function roundedRectSDF(px, py, size, inset, radius) {
  const cx = size / 2;
  const cy = size / 2;
  const halfW = size / 2 - inset - radius;
  const halfH = size / 2 - inset - radius;
  const qx = Math.abs(px - cx) - halfW;
  const qy = Math.abs(py - cy) - halfH;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function renderRGBA(size) {
  const inset = Math.round(size * 0.06);
  const radius = size * 0.24;
  // 체크 표시 꼭짓점 (0~1 정규화)
  const A = [0.27, 0.52];
  const B = [0.43, 0.68];
  const C = [0.75, 0.33];
  const stroke = size * 0.115; // 선 굵기
  const half = stroke / 2;

  const out = Buffer.alloc(size * size * 4); // RGBA, top-down
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const inRect = roundedRectSDF(px, py, size, inset, radius) <= 0;
          if (!inRect) continue;
          const dCheck = Math.min(
            distToSegment(px, py, A[0] * size, A[1] * size, B[0] * size, B[1] * size),
            distToSegment(px, py, B[0] * size, B[1] * size, C[0] * size, C[1] * size)
          );
          const [cr, cg, cb] = dCheck <= half ? MARK : ACCENT;
          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a === 0) {
        out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      } else {
        const cov = a / (255 * n); // 0..1 사각형 커버리지
        out[i] = Math.round(r / (a / 255));
        out[i + 1] = Math.round(g / (a / 255));
        out[i + 2] = Math.round(b / (a / 255));
        out[i + 3] = Math.round(cov * 255);
      }
    }
  }
  return out;
}

// 하나의 아이콘 이미지: BITMAPINFOHEADER + BGRA(bottom-up) + AND 마스크
function bmpForIco(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((size - 1 - y) * size + x) * 4; // bottom-up
      xor[dst] = rgba[src + 2]; // B
      xor[dst + 1] = rgba[src + 1]; // G
      xor[dst + 2] = rgba[src]; // R
      xor[dst + 3] = rgba[src + 3]; // A
    }
  }
  // AND 마스크: 알파로 투명 처리하므로 전부 0 (불투명 취급), 행은 32비트 정렬
  const maskRow = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(maskRow * size); // 0으로 채움

  return Buffer.concat([header, xor, andMask]);
}

function buildIco(images) {
  const count = images.length;
  const dir = Buffer.alloc(6 + 16 * count);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(count, 4);

  let offset = 6 + 16 * count;
  const bodies = [];
  images.forEach((img, k) => {
    const e = 6 + 16 * k;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    dir.writeUInt8(0, e + 2); // palette
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(img.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
    bodies.push(img.data);
  });
  return Buffer.concat([dir, ...bodies]);
}

const images = SIZES.map((size) => ({
  size,
  data: bmpForIco(size, renderRGBA(size)),
}));

const outDir = resolve(process.cwd(), "assets");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "app-icon.ico");
writeFileSync(outFile, buildIco(images));
console.log(`아이콘 생성: ${outFile}  (${SIZES.join(", ")} px)`);

/* ── PNG 인코더 (zlib) — index.html 파비콘용 ──────────────────── */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba /* top-down RGBA */) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── index.html <link rel="icon"> 갱신 ───────────────────────── */
const favPng = encodePng(64, renderRGBA(64));
const dataUri = `data:image/png;base64,${favPng.toString("base64")}`;
const linkTag = `<link rel="icon" type="image/png" href="${dataUri}" />`;
const htmlPath = resolve(process.cwd(), "index.html");
let html = readFileSync(htmlPath, "utf8");
if (/<link rel="icon"[^>]*>/.test(html)) {
  html = html.replace(/<link rel="icon"[^>]*>/, linkTag);
} else {
  html = html.replace(/(\r?\n)(\s*)<title>/, `$1$2${linkTag}$1$2<title>`);
}
writeFileSync(htmlPath, html);
console.log(`파비콘 갱신: index.html  (64px PNG, ${favPng.length}B)`);
