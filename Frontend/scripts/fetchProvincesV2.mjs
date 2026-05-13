/**
 * Tải dữ liệu địa danh v2 (sau sáp nhập) — cấu trúc 2 cấp: Tỉnh → Phường/Xã
 *
 * Cách dùng:
 *   node scripts/fetchProvincesV2.mjs
 *
 * Output: src/data/provincesV2.json
 */

import fs   from 'fs';
import path from 'path';

const BASE    = 'https://provinces.open-api.vn/api/v2';
const OUT_DIR = path.resolve('src/data');
const OUT     = path.join(OUT_DIR, 'provincesV2.json');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function main() {
  console.log('⏳  Đang tải dữ liệu v2 (Tỉnh → Phường/Xã sau sáp nhập)...');

  // v2: gọi root với depth=2 → mỗi tỉnh chứa sẵn mảng wards
  const provinces = await get(`${BASE}/?depth=2`);
  console.log(`✅  ${provinces.length} tỉnh/thành\n`);

  const result = provinces.map(p => {
    const wards = (p.wards || []).map(w => ({ code: w.code, name: w.name }));
    console.log(`   ${p.name}: ${wards.length} phường/xã`);
    return { code: p.code, name: p.name, wards };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf-8');

  const total = result.reduce((s, p) => s + p.wards.length, 0);
  console.log(`\n🎉  Đã lưu: ${OUT}`);
  console.log(`    Tổng: ${total} phường/xã`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
