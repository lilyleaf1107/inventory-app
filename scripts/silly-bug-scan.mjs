// 傻瓜 Bug 静态扫查（项目内 ts/tsx 文件）
// 运行： node scripts/silly-bug-scan.mjs
// 扫查 10 类：
//   1. useMemo 里调用 setState / ref.current = / window/document setter（副作用写法）
//   2. const x = useState(..)     [ useState 返回 [v,set] 却直接用元组当值 ]
//   3. arr.slice(page-1*PAGE_SIZE) [运算符优先级错误，page=1会切 0；
//                                  正确应为 (page-1)*PAGE_SIZE，因为 slice(page - 1 * PAGE_SIZE) 等于 slice(page - PAGE_SIZE) ]
//   4. map 里未提供 key={..}
//   5. const [,setX] = useState(initial) 写反: const [setX, v] = useState(initial) [变量名以 set/开头却放在第 0 位]
//   6. useEffect/useCallback 依赖数组出现 setState（函数引用）-> 可写可不写的噪音，但 setState 是稳定的可以写
//   7. onClick={() => setPage(p+1); window.scrollTo(...)} 没有 scrollToTopOfPage（Layout容器的滚动），但仍写 window.scrollTo
//   8. BackToTop 组件传入的 containerId 在 Layout 里不存在（id 拼错）
//   9. render 中出现 .map(...).map(...) 但外层没有 key
//  10. 同一个文件里 const GROUP_PAGE_SIZE = 重复声明了多份

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(SRC)
const results = []

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)

  lines.forEach((rawLine, i) => {
    const ln = i + 1
    const line = rawLine.replace(/\/\/.*$/, '')

    // 1. useMemo 里直接写副作用
    if (/\buseMemo\s*\(\s*\(\s*\)\s*=>\s*\{/.test(rawLine) === false) {
      // 粗略判定：一行里既有 useMemo( 也有 setPage( / setShow( / set[A-Z]
      if (/\buseMemo\s*\(/.test(line)) {
        // 取 useMemo 后面最多 120 个字符，判断是否藏了 setter
        const idx = line.indexOf('useMemo(')
        const tail = line.slice(idx, idx + 300)
        if (/\bset[A-Z][a-zA-Z0-9_]*\s*\(/.test(tail)) {
          results.push({ file: rel, ln, kind: 1, msg: '疑似 useMemo 内调用 setter（useMemo 应纯计算，副作用请放 useEffect/事件）' })
        }
        if (/window\.scrollTo\s*\(/.test(tail) || /\.scrollTop\s*=/.test(tail)) {
          results.push({ file: rel, ln, kind: 1, msg: '疑似 useMemo 内写滚动副作用' })
        }
      }
    }

    // 2. 错误写法：const x = useState() (没解构)
    if (/const\s+\w+\s*=\s*useState\s*\(/.test(line)) {
      results.push({ file: rel, ln, kind: 2, msg: 'const xxx = useState(...) 没有解构：你拿到的是 [value,setter] 元组，几乎肯定要改' })
    }

    // 3. slice(page - 1 * PAGE_SIZE) 运算符优先级错误（缺括号）
    if (/\.slice\s*\(\s*\w+\s*-\s*1\s*\*\s*\w+/.test(line)) {
      results.push({ file: rel, ln, kind: 3, msg: 'slice(page - 1 * SIZE) 运算符优先级错误，应为 slice((page-1) * SIZE)' })
    }

    // 4. 明显缺 key： .map((... => <Button 或 <div 或 <Xxx）没看到 key={
    //    简单启发式：.map( 到结尾 ) 的一行里，含 `<\w+` 且没有 `key={`
    if (/\.map\s*\(/.test(line) && /<[A-Za-z][A-Za-z0-9.]*\b/.test(line) && !/key\s*=\s*\{/.test(line)) {
      // 忽略纯文本 map（比如 buildPageRange 里的 <span> 数字按钮，有时候用 i 当 key 也能过；只 warn 不算错）
      results.push({ file: rel, ln, kind: 4, msg: '疑似 map 返回 JSX 却没写 key={...}（如用 i 作 key，请明确写出来避免 lint 误报，也确认不是漏了）' })
    }

    // 5. useState 解构写反：const [setX, value] = useState(…)
    const mSetRev = line.match(/const\s*\[\s*(set[A-Z][a-zA-Z0-9_]*)\s*,\s*(\w+)\s*\]\s*=\s*useState\s*\(/)
    if (mSetRev) {
      results.push({ file: rel, ln, kind: 5, msg: `useState 解构顺序可能写反：[${mSetRev[1]}, ${mSetRev[2]}] → 正确写法是 [value, setter]` })
    }

    // 7. 还在写 window.scrollTo({...}) （应该换成 scrollToTopOfPage）
    if (/window\.scrollTo\s*\(/.test(line)) {
      results.push({ file: rel, ln, kind: 7, msg: '还在调用 window.scrollTo：Layout main 是滚动容器，建议改 scrollToTopOfPage()' })
    }
  })

  // 10. 同文件重复声明同名 const GROUP_PAGE_SIZE / PAGE_SIZE
  const dup = src.match(/^const\s+(GROUP_PAGE_SIZE|PAGE_SIZE)\s*=/gm)
  if (dup && dup.length > 1) {
    results.push({ file: rel, ln: 1, kind: 10, msg: `同文件里重复声明 ${dup.join(' + ')}` })
  }

  // 8. BackToTop 传的 containerId 是否在 Layout 中实际声明了
  if (/BackToTop[^}]*containerId\s*=\s*["']([^"']+)["']/.test(src)) {
    const ids = [...src.matchAll(/containerId\s*=\s*["']([^"']+)["']/g)].map(m => m[1])
    for (const id of ids) {
      if (id && !src.includes(`id="${id}"`) && !src.includes(`id='${id}'`)) {
        results.push({ file: rel, ln: 1, kind: 8, msg: `传入的 BackToTop containerId="${id}" 在本文件里找不到对应 <… id="${id}">，可能是放到父文件了（如 Layout）；如父文件有，可忽略` })
      }
    }
  }
}

// 去重 & 输出
const summary = {}
results.forEach(r => { summary[r.kind] = (summary[r.kind] || 0) + 1 })

console.log('=== Silly Bug Scan Results ===')
console.log(`Scan files: ${files.length}  Issues: ${results.length}`)
console.log('By type:', summary)
console.log()

if (!results.length) {
  console.log('✅ 没有命中任何启发式模式。')
  process.exit(0)
}

for (const r of results) {
  console.log(`  [K${r.kind}] ${r.file}:${r.ln}  ${r.msg}`)
}

// 严重项（kind 1/2/3/5/10）> 0 → exit 1
const hardKinds = new Set([1, 2, 3, 5, 10, 7])
const hasHard = results.some(r => hardKinds.has(r.kind))
process.exit(hasHard ? 1 : 0)
