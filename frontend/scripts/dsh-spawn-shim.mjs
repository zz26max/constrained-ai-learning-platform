/**
 * DSH Windows 沙箱兼容垫片（对普通终端与 CI 无影响）。
 *
 * 现象：DSH 沙箱内的 Node 进程以默认管道 stdio 调 child_process.spawn/exec
 * 会同步抛 EPERM（沙箱不允许子进程经命名管道回传输出）。
 * Vite 8 在 Windows 上加载配置时会执行 `exec("net use")` 以识别网络盘映射，
 * 它本身已把异步失败视为可忽略（回调里 error 直接 return），但同步异常
 * 会直接冒泡导致配置加载崩溃。
 *
 * 修法：把 exec / execFile 的同步异常转为回调错误，与既有异步失败语义一致。
 * 仅在 DSH 沙箱会话中通过 NODE_OPTIONS 使用，例如：
 *   $env:NODE_OPTIONS = "--import ./scripts/dsh-spawn-shim.mjs"
 * 普通 Windows / macOS / Linux / CI 环境不需要加载本文件。
 */
import cp from 'node:child_process'

function wrapSyncThrowToCallback(original, name) {
  return function patchedExec(...args) {
    try {
      return original.apply(this, args)
    } catch (error) {
      const callback = args[args.length - 1]
      if (typeof callback === 'function') {
        const stdout = name === 'execFile' ? undefined : ''
        const stderr = name === 'execFile' ? undefined : ''
        process.nextTick(() => callback(error, stdout, stderr))
        return null
      }
      throw error
    }
  }
}

cp.exec = wrapSyncThrowToCallback(cp.exec, 'exec')
cp.execFile = wrapSyncThrowToCallback(cp.execFile, 'execFile')
