import adminUsersHandler from '../api/admin-users.js'
import orchideaAuthUsersHandler from '../api/orchidea-auth-users.js'
import packagesCatalogHandler from '../api/packages-catalog.js'

const ROUTES = new Map([
  ['/api/admin-users', adminUsersHandler],
  ['/api/orchidea-auth-users', orchideaAuthUsersHandler],
  ['/api/packages-catalog', packagesCatalogHandler],
])

function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
    req.on('error', reject)
  })
}

function decorateResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode
    return res
  }
  res.json = (payload) => {
    if (res.writableEnded) return res
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(payload))
    return res
  }
  return res
}

export function novaDevApiPlugin(env = {}) {
  return {
    name: 'nova-dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined && process.env[key] === undefined) process.env[key] = value
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const handler = ROUTES.get(url.pathname)
        if (!handler) return next()

        try {
          req.query = Object.fromEntries(url.searchParams.entries())
          req.body = await readBody(req)
          decorateResponse(res)
          await handler(req, res)
        } catch (error) {
          console.error(`Dev API ${url.pathname}:`, error)
          if (!res.writableEnded) {
            decorateResponse(res).status(500).json({ error: error?.message || 'Errore API locale' })
          }
        }
      })
    },
  }
}
