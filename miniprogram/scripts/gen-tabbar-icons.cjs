// 生成符合微信小程序规范的 PNG tabBar 图标（81x81 RGBA）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'tabbar');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 81; // 微信官方推荐尺寸

// ============ PNG 编码 ============
function makePng(width, height, drawPixelFn) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      const i = y * (stride + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const idat = makeChunk('IDAT', zlib.deflateSync(raw));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ============ 绘制工具（坐标全部相对于 SIZE=81） ============
const MUTED = [100, 117, 106, 255];
const GREEN = [94, 164, 113, 255];
const CLEAR = [0, 0, 0, 0];

function newBuf() { return new Array(SIZE * SIZE).fill(CLEAR); }
function setPx(buf, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) buf[y * SIZE + x] = color;
}
function fillCircle(buf, cx, cy, r, color) {
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      if (i * i + j * j <= r * r) setPx(buf, cx + i, cy + j, color);
    }
  }
}
function fillRect(buf, x, y, w, h, color) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) setPx(buf, x + i, y + j, color);
}
function drawLine(buf, x1, y1, x2, y2, color, thick = 4) {
  x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, x = x1, y = y1;
  const steps = Math.max(dx, dy) + 1000;
  const t2 = Math.floor(thick / 2);
  for (let s = 0; s < steps; s++) {
    for (let tj = -t2; tj <= t2; tj++)
      for (let ti = -t2; ti <= t2; ti++) setPx(buf, x + ti, y + tj, color);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// ============ 图标 ============
// Home：屋顶三角 + 墙体 + 方门（整体居中，有边距）
function drawHome(color) {
  const buf = newBuf();
  drawLine(buf, 14, 37, 40, 13, color, 5);
  drawLine(buf, 40, 13, 66, 37, color, 5);
  drawLine(buf, 14, 37, 66, 37, color, 5);
  drawLine(buf, 20, 37, 20, 68, color, 5);
  drawLine(buf, 60, 37, 60, 68, color, 5);
  drawLine(buf, 20, 68, 60, 68, color, 5);
  fillRect(buf, 34, 48, 12, 20, color);
  return buf;
}

// Inventory：包裹盒子（3D感）
function drawInventory(color) {
  const buf = newBuf();
  drawLine(buf, 10, 27, 40, 10, color, 5);
  drawLine(buf, 40, 10, 70, 27, color, 5);
  drawLine(buf, 10, 54, 40, 71, color, 5);
  drawLine(buf, 40, 71, 70, 54, color, 5);
  drawLine(buf, 10, 27, 10, 54, color, 5);
  drawLine(buf, 70, 27, 70, 54, color, 5);
  drawLine(buf, 40, 38, 40, 71, color, 4);
  drawLine(buf, 10, 40, 70, 40, color, 4);
  drawLine(buf, 40, 10, 40, 38, color, 4);
  return buf;
}

// Profile：头圆 + 肩膀
function drawProfile(color) {
  const buf = newBuf();
  fillCircle(buf, 40, 28, 16, color);
  for (let y = 50; y <= 72; y++) {
    const dx = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((y - 61) / 12, 2))) * 30);
    for (let x = 40 - dx; x <= 40 + dx; x++) setPx(buf, x, y, color);
  }
  fillRect(buf, 33, 43, 14, 12, color);
  return buf;
}

function pixelBufToDraw(pixelBuf) {
  return (x, y) => pixelBuf[y * SIZE + x] || CLEAR;
}

const specs = [
  { name: 'home',              color: MUTED, draw: drawHome },
  { name: 'home-active',       color: GREEN, draw: drawHome },
  { name: 'inventory',         color: MUTED, draw: drawInventory },
  { name: 'inventory-active',  color: GREEN, draw: drawInventory },
  { name: 'profile',           color: MUTED, draw: drawProfile },
  { name: 'profile-active',    color: GREEN, draw: drawProfile },
];

specs.forEach(({ name, color, draw }) => {
  const buf = draw(color);
  const png = makePng(SIZE, SIZE, pixelBufToDraw(buf));
  const outFile = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outFile, png);
  console.log('✓', path.basename(outFile), `${(png.length / 1024).toFixed(1)} KB, ${SIZE}x${SIZE}`);
});

console.log('\n完成！请重新执行 npm run build 并在微信开发者工具清缓存后重新编译。');
