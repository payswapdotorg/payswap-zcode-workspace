/**
 * PaySwap workspace — terminal service (sandbox).
 *
 * Persistent interactive bash sessions exposed over socket.io, mirroring the
 * ZCode terminal service contract (create / write / resize / data / exit) so
 * the original ZCode terminal UI can drive it unchanged. Each session spawns
 * `script -qfc /bin/bash /dev/null` (util-linux) which allocates a real PTY
 * for bash while we speak plain pipes on this side.
 *
 * Sandbox tool: no real multi-user shell, sessions are per-socket and die
 * with the connection.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT) || 3005
const MAX_REPLAY_BYTES = 512 * 1024

interface TermSession {
  id: string
  proc: ChildProcessWithoutNullStreams
  replay: string
  alive: boolean
}

const sessions = new Map<string, TermSession>()

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/z/my-project'
mkdirSync(WORKSPACE_ROOT, { recursive: true })

function killSession(session: TermSession | undefined) {
  if (!session || !session.alive) return
  session.alive = false
  try {
    session.proc.kill('SIGKILL')
  } catch {
    /* already gone */
  }
  sessions.delete(session.id)
}

const io = new Server({
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

io.on('connection', (socket) => {
  const owned: Set<string> = new Set()

  const safeGet = (id: unknown): TermSession | undefined => {
    if (typeof id !== 'string') return undefined
    const s = sessions.get(id)
    if (!s || !owned.has(id)) return undefined
    return s
  }

  socket.on(
    'term:create',
    (
      params: { cols?: number; rows?: number; cwd?: string },
      ack: (result: { id: string; shell: string }) => void,
    ) => {
      const cols = Number.isFinite(params?.cols) ? Math.min(500, Math.max(20, Number(params?.cols))) : 80
      const rows = Number.isFinite(params?.rows) ? Math.min(200, Math.max(5, Number(params?.rows))) : 24
      const cwd = params?.cwd && params.cwd.startsWith(WORKSPACE_ROOT) ? params.cwd : WORKSPACE_ROOT

      const id = randomUUID()
      // script(1) gives bash a real PTY; we keep the pipe side. COLUMNS/LINES
      // seed the first prompt, `stty` refines it once bash is ready.
      const child = spawn(
        '/usr/bin/script',
        ['-qfc', '/bin/bash', '/dev/null'],
        {
          cwd,
          env: {
            ...process.env,
            HOME: process.env.HOME ?? cwd,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            COLUMNS: String(cols),
            LINES: String(rows),
            PS1: '\\[\\e[38;5;79m\\]payswap\\[\\e[0m\\]:\\[\\e[38;5;110m\\]\\w\\[\\e[0m\\]$ ',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      ) as ChildProcessWithoutNullStreams

      const session: TermSession = { id, proc: child, replay: '', alive: true }
      sessions.set(id, session)
      owned.add(id)

      const push = (chunk: string) => {
        if (!session.alive) return
        session.replay = (session.replay + chunk).slice(-MAX_REPLAY_BYTES)
        socket.emit('term:data', { id, data: chunk })
      }
      child.stdout.on('data', (buf: Buffer) => push(buf.toString('utf8')))
      child.stderr.on('data', (buf: Buffer) => push(buf.toString('utf8')))
      child.on('exit', (code) => {
        socket.emit('term:exit', { id, exitCode: code ?? 0 })
        session.alive = false
        sessions.delete(id)
        owned.delete(id)
      })

      // Seed the winsize before the first prompt is drawn.
      child.stdin.write(`stty rows ${rows} cols ${cols} 2>/dev/null\n`)
      ack({ id, shell: 'bash' })
    },
  )

  socket.on('term:write', ({ id, data }: { id: string; data: string }) => {
    const s = safeGet(id)
    if (!s || typeof data !== 'string' || data.length > 64 * 1024) return
    try {
      s.proc.stdin.write(data)
    } catch {
      /* EPIPE — exit event will fire */
    }
  })

  socket.on('term:resize', ({ id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const s = safeGet(id)
    if (!s || !Number.isFinite(cols) || !Number.isFinite(rows)) return
    const c = Math.min(500, Math.max(20, Math.round(cols)))
    const r = Math.min(200, Math.max(5, Math.round(rows)))
    // script(1)'s PTY winsize cannot be set from outside, so propagate through
    // the shell itself; debounced by the client so history pollution is rare.
    try {
      s.proc.stdin.write(`stty rows ${r} cols ${c} 2>/dev/null\n`)
    } catch {
      /* ignore */
    }
  })

  socket.on('term:dispose', ({ id }: { id: string }) => {
    killSession(safeGet(id))
  })

  socket.on('disconnect', () => {
    for (const id of owned) killSession(sessions.get(id))
  })
})

console.log(`[terminal-service] listening on :${PORT}`)
io.listen(PORT)
