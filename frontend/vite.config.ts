/// <reference types="vitest/config" />
import { ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

const FRONTEND_PORT = 4173
const API_PREFIX = '/api/v1'
/** 固定上游后端：仅接受开发机预配置的地址，不接受浏览器传入的上游（DEVELOPMENT/FRONTEND 代理约定）。 */
const BACKEND_ORIGIN = process.env['BACKEND_ORIGIN'] ?? 'http://127.0.0.1:8080'

/** 与契约 X-Request-ID 参数一致的可选请求标识格式。 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function apiProxy(): Record<string, ProxyOptions> {
  return {
    [API_PREFIX]: {
      target: BACKEND_ORIGIN,
      // Origin 由浏览器提供并原样透传，代理不得伪造或改写（DEVELOPMENT 10.2）。
      changeOrigin: false,
      ws: false,
      configure(proxy) {
        // 后端不可用：返回可识别的 503 JSON 信封，不回退 index.html 或模拟数据。
        proxy.on('error', (_error, request, response) => {
          if (!(response instanceof ServerResponse) || response.headersSent) return
          const requestIdHeader = unavailableRequestId(request)
          response.writeHead(503, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Request-ID': requestIdHeader,
          })
          response.end(unavailableBody(requestIdHeader))
        })
      },
    },
  }
}

function unavailableRequestId(request: { headers: Record<string, unknown> }): string {
  const headerValue = request.headers['x-request-id']
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return typeof raw === 'string' && REQUEST_ID_PATTERN.test(raw) ? raw : `proxy-${randomUUID()}`
}

function unavailableBody(requestId: string): string {
  return JSON.stringify({
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: '后端服务不可用，请稍后重试。',
      details: {},
    },
    requestId,
  })
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawMode = env['VITE_API_MODE']
  // 环境开关唯一：省略为 real；非法值在开发启动与构建时立即失败（FRONTEND 1.1）。
  if (rawMode !== undefined && rawMode !== '' && rawMode !== 'real' && rawMode !== 'mock') {
    throw new Error(`VITE_API_MODE 只允许 real 或 mock，当前为 "${rawMode}"；请修正环境配置后重启。`)
  }
  // 生产构建必须强制真实模式：发现 mock 配置即失败（FRONTEND 1.1）。
  if (command === 'build' && (mode === 'mock' || rawMode === 'mock')) {
    throw new Error('生产构建拒绝 mock 模式：npm run build 必须以真实模式产出。')
  }
  return {
    plugins: [vue(), {name:'deny-campus-in-normal-server',configureServer(server){
      server.middlewares.use((req,res,next)=>{
        if(req.url?.split('?')[0]==='/campus.html'||req.url?.startsWith('/src/demo/campus/')){res.statusCode=404;res.end('Not found');return}
        next()
      })
    }}],
    appType: 'spa',
    server: {
      headers: { 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' },
      port: FRONTEND_PORT,
      strictPort: true,
      host: '127.0.0.1',
      proxy: apiProxy(),
    },
    preview: {
      headers: { 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' },
      port: FRONTEND_PORT,
      strictPort: true,
      host: '127.0.0.1',
      proxy: apiProxy(),
    },
    test: {
      environment: 'happy-dom',
      globals: false,
      include: ['tests/**/*.test.ts'],
      // worker 线程池：forks 池依赖子进程管道，在受限沙箱内被拒；
      // threads 池跨平台受支持，本测试集不依赖进程级隔离。
      pool: 'threads',
    },
  }
})
