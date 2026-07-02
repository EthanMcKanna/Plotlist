import type { IncomingMessage, ServerResponse } from "node:http";

// Minimal IncomingMessage/ServerResponse stand-ins so the existing api/
// handlers (written for Vercel's Node runtime) run unchanged on Workers.
// Only the surface those handlers actually touch is implemented: headers,
// method, url, socket.remoteAddress, async body iteration, setHeader,
// statusCode, and end().

export class WorkerRequestShim {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  query: Record<string, string>;

  private bodyPromise: Promise<Uint8Array>;

  constructor(request: Request) {
    const url = new URL(request.url);
    this.method = request.method;
    this.url = `${url.pathname}${url.search}`;
    this.headers = {};
    request.headers.forEach((value, key) => {
      this.headers[key.toLowerCase()] = value;
    });
    this.socket = {
      remoteAddress: request.headers.get("cf-connecting-ip") ?? undefined,
    };
    this.query = Object.fromEntries(url.searchParams.entries());
    this.bodyPromise =
      request.method === "GET" || request.method === "HEAD"
        ? Promise.resolve(new Uint8Array())
        : request.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }

  async *[Symbol.asyncIterator]() {
    const body = await this.bodyPromise;
    if (body.byteLength > 0) {
      yield Buffer.from(body);
    }
  }
}

export class WorkerResponseShim {
  statusCode = 200;
  private headers = new Headers();
  private body: string | Uint8Array | null = null;
  private finishedResolve!: () => void;
  finished: Promise<void>;

  constructor() {
    this.finished = new Promise((resolve) => {
      this.finishedResolve = resolve;
    });
  }

  setHeader(name: string, value: string | number | string[]) {
    const key = name.toLowerCase();
    this.headers.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      this.headers.append(key, String(item));
    }
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase()) ?? undefined;
  }

  end(body?: string | Uint8Array) {
    if (body !== undefined) {
      this.body = body;
    }
    this.finishedResolve();
  }

  toResponse() {
    return new Response(this.body as BodyInit | null, {
      status: this.statusCode,
      headers: this.headers,
    });
  }
}

export type NodeStyleHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

export async function runNodeRoute(handler: NodeStyleHandler, request: Request) {
  const req = new WorkerRequestShim(request);
  const res = new WorkerResponseShim();

  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
  await res.finished;
  return res.toResponse();
}
