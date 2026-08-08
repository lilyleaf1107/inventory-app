const parser = require('@babel/parser')
const fs = require('fs')

const content = fs.readFileSync('src/pages/desktop/Products.tsx', 'utf8')

// Use Babel's tokens to trace the parsing
const tokens = []
try {
  parser.parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    onToken: (token) => {
      tokens.push({
        type: token.type,
        value: token.value,
        loc: token.loc,
      })
    },
  })
} catch (e) {
  console.log('Parse error at line', e.loc?.line, 'col', e.loc?.column)
}

// Print last 30 tokens before the error
console.log('Last 30 tokens:')
const last30 = tokens.slice(-30)
for (const t of last30) {
  const label = typeof t.type === 'string' ? t.type : (t.type?.label || t.type?.keyword || 'unknown')
  console.log(`  L${t.loc.start.line}:${t.loc.start.column} ${label} "${t.value?.substring(0, 40) || ''}"`)
}
