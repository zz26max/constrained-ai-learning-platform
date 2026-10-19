import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const frontend=fileURLToPath(new URL('../',import.meta.url))
const checks=[]
for(const [url,status] of [
 ['http://127.0.0.1:4174/api/v1/me',503],
 ['http://127.0.0.1:4173/campus.html',404],
 ['http://127.0.0.1:4173/src/demo/campus/main.ts',404],
]){const response=await fetch(url);assert.equal(response.status,status);checks.push({url,status})}
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.campus.config.ts','--mode','campus'],{cwd:frontend,encoding:'utf8'})
assert.equal(build.status,1)
assert.match(build.stderr,/禁止构建/)
checks.push({scenario:'campus production build rejected',exitCode:build.status})
mkdirSync(new URL('../.cache/student-v33/',import.meta.url),{recursive:true})
writeFileSync(new URL('../.cache/student-v33/isolation.json',import.meta.url),JSON.stringify(checks,null,2))
console.log('PASS: preview API blocked; normal entry/module blocked; demo build rejected')
