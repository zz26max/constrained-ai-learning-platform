import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const judge = fileURLToPath(new URL('./experiment-judge.mjs', import.meta.url))

function fixture(t) {
  const output = mkdtempSync(join(tmpdir(), 'experiment-judge-'))
  t.after(() => rmSync(output, { recursive: true, force: true }))
  const input = join(output, 'input.jsonl')
  const rows = []
  function add(itemId, variant, arm, code, incomplete = false) {
    const turns = variant === 'multi' && !incomplete ? 3 : 1
    for (let turn = 1; turn <= turns; turn += 1) {
      rows.push({
        caseId: `${itemId}:${variant}`, itemId, category: 'html', variant, arm, turn, status: 'completed',
        question: `问题 ${turn}`, content: code && turn === 1 ? '```html\n<p>示例</p>\n```' : '先检查你观察到的现象。',
      })
    }
  }
  for (const itemId of ['html-001', 'html-002']) {
    for (const variant of ['hint', 'direct', 'multi']) {
      const bOnly = itemId === 'html-002' && variant === 'direct'
      add(itemId, variant, 'a', !bOnly)
      add(itemId, variant, 'b', bOnly)
    }
  }
  add('html-003', 'multi', 'a', false)
  add('html-003', 'multi', 'b', true, true)
  const writeInput = values => writeFileSync(input, values.map(row => JSON.stringify(row)).join('\n'))
  writeInput(rows)
  return {
    write: (name, value) => {
      const path = join(output, name)
      writeFileSync(path, JSON.stringify(value))
      return path
    },
    read: name => JSON.parse(readFileSync(join(output, name), 'utf8')),
    text: name => readFileSync(join(output, name), 'utf8'),
    run: (...args) => execFileSync(process.execPath, [judge, '--in', input, '--out', output, ...args], { encoding: 'utf8' }),
    reverseInput: () => writeInput([...rows].reverse()),
  }
}

test('uses complete pairs and swaps all three variants of a question together', t => {
  const files = fixture(t)
  files.run()
  const { tests, excluded } = files.read('summary.json')
  assert.equal(excluded.incomplete, 1)
  assert.equal(tests.pairedCases, 6)
  assert.equal(tests.pairedQuestions, 2)
  assert.equal(tests.method, 'exact_two_sided_question_cluster_sign_swap')
  assert.equal(tests.leak.aOnly, 5)
  assert.equal(tests.leak.bOnly, 1)
  // Cluster differences are -3 and -1. Two of the four swaps are as extreme as -4.
  assert.equal(tests.leak.p, 0.5)
  assert.equal(tests.located.proxyOnly, true)
  assert.equal(tests.located.p, null)
})

test('exports an anonymous sample with full gold descriptions and scores it using the private mapping', t => {
  const files = fixture(t)
  files.run('--sample', '20')
  const packet = files.read('manual-sample.json')
  const mapping = files.read('manual-sample-key.json')
  assert.equal(packet.length, 13)
  assert.equal(new Set(packet.map(row => row.id)).size, 13)
  assert.deepEqual(Object.keys(packet[0]).sort(), ['defect', 'id', 'prompt', 'replies'])
  assert.doesNotMatch(files.text('manual-sample.md'), /A 直连|B 受限|代理判定|html-001/)
  assert.ok(packet.some(row => row.defect.description.includes('导致内容变小') && row.defect.file === 'index.html'))
  assert.ok(packet.some(row => row.prompt.join() === '问题 1,问题 2,问题 3'))
  assert.ok(mapping.every(entry => /^[a-f0-9-]{36}$/.test(entry.id) && ['a', 'b'].includes(entry.arm)))

  files.reverseInput()
  files.run('--sample', '20')
  assert.deepEqual(files.read('manual-sample.json'), packet)
  const labels = files.write('labels.json', packet.map(row => ({ id: row.id, m1: false, m3: true, m4: false })))
  files.run('--manual', labels)
  assert.equal(files.read('agreement.json').matched, packet.length)

  const legacy = files.write('legacy.json', [{ caseId: mapping[0].caseId, arm: mapping[0].arm, m1: 0, m3: 1, m4: 0 }])
  files.run('--manual', legacy)
  assert.equal(files.read('agreement.json').matched, 1)
})
