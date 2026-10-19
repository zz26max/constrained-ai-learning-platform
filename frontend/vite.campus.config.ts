import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
export default defineConfig(({command,mode})=>{
  if(command!=='serve'||mode!=='campus')throw new Error('高校演示只允许以campus开发模式启动，禁止构建或使用真实接口。')
  return {define:{'import.meta.env.VITE_API_MODE':JSON.stringify('mock')},plugins:[vue(),{name:'campus-network-boundary',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      if(req.url==='/'||req.url==='/index.html'){res.writeHead(302,{Location:'/campus.html#/student/home'});res.end();return}
      if(req.url?.split('?')[0]==='/src/main.ts'){res.writeHead(404);res.end('Standalone campus entry only');return}
      if(req.url?.startsWith('/api/')){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('CAMPUS_DEMO_ONLY: 演示环境拒绝真实API请求');return}
      next()
    })
  }}],server:{host:'127.0.0.1',port:4174,strictPort:true,open:false,headers:{'Content-Security-Policy':"frame-ancestors 'none'",'X-Frame-Options':'DENY'}}}
})
