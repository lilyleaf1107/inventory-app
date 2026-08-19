const fs = require('fs');

const csvPath = 'C:\\Users\\zhen\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\work-mode-projects\\6a7dbccaf95136c584805c27\\商品定位对照表_含编码.csv';
const BASE = 'https://nmydgsnobkxsyjfznwvg.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5teWRnc25vYmt4c3lqZnpud3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTIyMjIwMCwiZXhwIjoyMTAwNzk4MjAwfQ.6HhNSv74B8TNM1o5NrIz9AxK3_zSWTgtLFJMaJVWWAc';

const hdr = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const opts = { method, headers: { ...hdr } };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers.Prefer = 'return=minimal';
  }
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function main() {
  // ===== 1. 读 CSV，按商品名去重（同名合并 barcode/sku） =====
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',').map(s => s.trim());
  const idx = { name: header.indexOf('产品名'), bc: header.indexOf('条码编码'), sku: header.indexOf('SKU') };
  if (idx.name < 0 || idx.bc < 0 || idx.sku < 0) { console.log('表头异常:', header); return; }

  const csvNameMap = new Map(); // name -> { barcode, sku }
  let csvRawCount = 0;
  for (const line of lines) {
    const cells = line.split(',').map(s => s.trim());
    const name = cells[idx.name] || '';
    if (!name) continue;
    csvRawCount++;
    const barcode = cells[idx.bc] || '';
    const sku = cells[idx.sku] || '';
    if (!csvNameMap.has(name)) {
      csvNameMap.set(name, { barcode, sku });
    } else {
      // 同名行：补充缺失字段
      const ex = csvNameMap.get(name);
      if (!ex.barcode && barcode) ex.barcode = barcode;
      if (!ex.sku && sku) ex.sku = sku;
    }
  }
  console.log(`CSV 原始行数: ${csvRawCount}`);
  console.log(`CSV 按名称去重后: ${csvNameMap.size} 个唯一商品名`);
  console.log('');

  // ===== 2. 拉取数据库全部 products =====
  const allProducts = [];
  let offset = 0;
  while (true) {
    const res = await api('GET', `/products?select=id,name,sku,barcode,created_at&order=created_at.asc&limit=1000&offset=${offset}`);
    if (!res.ok) { console.log('拉取 products 失败:', res.status, res.text.slice(0, 300)); return; }
    const data = JSON.parse(res.text);
    if (!Array.isArray(data) || !data.length) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`数据库现有 products: ${allProducts.length} 条`);

  // ===== 3. 按名称分组，找重复 =====
  const dbNameMap = new Map();
  for (const p of allProducts) {
    if (!dbNameMap.has(p.name)) dbNameMap.set(p.name, []);
    dbNameMap.get(p.name).push(p);
  }

  let dupGroups = 0, dupExtras = 0;
  for (const [, prods] of dbNameMap) {
    if (prods.length > 1) { dupGroups++; dupExtras += prods.length - 1; }
  }
  console.log(`数据库中同名重复: ${dupGroups} 组，需清理 ${dupExtras} 条`);
  console.log('');

  // ===== 4. 清理重复：保留最早创建的，删除其余 =====
  let deleted = 0, deleteFailed = 0;
  if (dupExtras > 0) {
    console.log('--- 开始清理重复商品 ---');
    for (const [name, prods] of dbNameMap) {
      if (prods.length <= 1) continue;
      // 按 created_at 排序，最早排第一（保留）
      prods.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const keep = prods[0];

      for (let i = 1; i < prods.length; i++) {
        const dup = prods[i];
        // 转移 inventory 到保留的商品
        await api('PATCH', `/inventory?product_id=eq.${dup.id}`, { product_id: keep.id });
        // 转移 stock_moves
        await api('PATCH', `/stock_moves?product_id=eq.${dup.id}`, { product_id: keep.id });
        // 删除残留关联（表可能不存在，忽略错误）
        await api('DELETE', `/product_suppliers?product_id=eq.${dup.id}`);
        await api('DELETE', `/product_tags?product_id=eq.${dup.id}`);
        // 删除无法转移的 inventory（同库位冲突的情况）
        await api('DELETE', `/inventory?product_id=eq.${dup.id}`);
        // 删除重复商品
        const res = await api('DELETE', `/products?id=eq.${dup.id}`);
        if (res.ok) {
          deleted++;
          console.log(`  删除重复: "${name}" (id=${dup.id})`);
        } else {
          deleteFailed++;
          console.log(`  删除失败: "${name}" (id=${dup.id}) HTTP ${res.status} ${res.text.slice(0, 300)}`);
        }
      }
    }
    console.log(`清理完成: 删除 ${deleted} 条, 失败 ${deleteFailed} 条`);
    console.log('');
  }

  // ===== 5. 处理 CSV：同名更新，新名插入 =====
  console.log('--- 开始按名称合并/导入 ---');
  let updated = 0, inserted = 0, noChange = 0, failed = 0;
  const failedList = [];

  for (const [name, csvData] of csvNameMap) {
    const matches = dbNameMap.get(name);
    if (matches && matches.length > 0) {
      // 同名已存在 → 补充缺失的 barcode/sku
      const target = matches[0]; // 保留的那条
      const patch = {};
      if (csvData.barcode && !target.barcode) patch.barcode = csvData.barcode;
      if (csvData.sku && !target.sku) patch.sku = csvData.sku;

      if (Object.keys(patch).length > 0) {
        const res = await api('PATCH', `/products?id=eq.${target.id}`, patch);
        if (res.ok) {
          updated++;
          console.log(`  更新: "${name}" -> 补充 ${Object.keys(patch).join(', ')}`);
        } else {
          failed++;
          failedList.push(`更新 "${name}": HTTP ${res.status} ${res.text.slice(0, 300)}`);
        }
      } else {
        noChange++;
      }
    } else {
      // 新商品 → 插入
      const obj = { name, on_shelf: true };
      if (csvData.sku) obj.sku = csvData.sku;
      if (csvData.barcode) obj.barcode = csvData.barcode;

      const res = await api('POST', `/products`, obj);
      if (res.ok) {
        inserted++;
      } else {
        failed++;
        failedList.push(`新增 "${name}": HTTP ${res.status} ${res.text.slice(0, 300)}`);
      }
    }
  }

  console.log('');
  console.log('========== 汇总 ==========');
  console.log(`删除重复商品   : ${deleted}`);
  console.log(`更新(补充信息) : ${updated}`);
  console.log(`无需更新       : ${noChange}`);
  console.log(`新增           : ${inserted}`);
  console.log(`失败           : ${failed}`);
  if (failedList.length) {
    console.log('失败明细:');
    failedList.forEach(f => console.log('  - ' + f));
  }
}

main().catch(e => { console.error('UNCAUGHT:', e); process.exit(1); });
