// ============================================================
// MODULO: BunRouter v1.0
// REGOLA: Router modulare compatibile con Bun.serve().
//         NON usa Express. Mantiene WebSocket nativo Bun intatto.
//         Aggiungere route con .get() .post() .ws()
// DIPENDENZE: nessuna
// DEPRECA: Express (mai introdotto, prevenzione)
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

export type RouteHandler = (req: Request, params: Record<string, string>) => Response | Promise<Response>
export type WSHandler = {
  open?: (ws: import('bun').ServerWebSocket<unknown>) => void
  message?: (ws: import('bun').ServerWebSocket<unknown>, msg: string | Buffer) => void
  close?: (ws: import('bun').ServerWebSocket<unknown>) => void
  drain?: (ws: import('bun').ServerWebSocket<unknown>) => void
}

interface Route {
  method: string
  pattern: URLPattern
  handler: RouteHandler
}

export class BunRouter {
  private routes: Route[] = []
  private wsHandler: WSHandler = {}
  private notFoundHandler: RouteHandler = () =>
    new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })

  get(path: string, handler: RouteHandler): this {
    return this.addRoute('GET', path, handler)
  }

  post(path: string, handler: RouteHandler): this {
    return this.addRoute('POST', path, handler)
  }

  put(path: string, handler: RouteHandler): this {
    return this.addRoute('PUT', path, handler)
  }

  delete(path: string, handler: RouteHandler): this {
    return this.addRoute('DELETE', path, handler)
  }

  ws(handler: WSHandler): this {
    this.wsHandler = handler
    return this
  }

  notFound(handler: RouteHandler): this {
    this.notFoundHandler = handler
    return this
  }

  /** Registra un sotto-router con prefisso */
  mount(prefix: string, router: BunRouter): this {
    for (const route of router.routes) {
      const newPath = prefix + route.pattern.pathname
      this.routes.push({
        method: route.method,
        pattern: new URLPattern({ pathname: newPath }),
        handler: route.handler
      })
    }
    return this
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    for (const route of this.routes) {
      if (route.method !== req.method && route.method !== '*') continue
      const match = route.pattern.exec({ pathname: url.pathname })
      if (match) {
        const params = match.pathname.groups as Record<string, string>
        try {
          return await route.handler(req, params)
        } catch (err) {
          console.error(`[BunRouter] Error in ${req.method} ${url.pathname}:`, err)
          return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    }
    return this.notFoundHandler(req, {})
  }

  getWSHandler(): WSHandler { return this.wsHandler }

  private addRoute(method: string, pathname: string, handler: RouteHandler): this {
    this.routes.push({
      method,
      pattern: new URLPattern({ pathname }),
      handler
    })
    return this
  }
}
