import http from "node:http";
import type { AddressInfo } from "node:net";

export type Route = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** A tiny local web server that plays the part of a store website. */
export async function startFixtureServer(routes: Record<string, Route>) {
  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const route = routes[path];
    if (route) return route(req, res);
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const html = (body: string): Route => (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
};

export const json = (body: unknown): Route => (_req, res) => {
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
};

export const bytes = (body: Buffer, contentType: string): Route => (_req, res) => {
  res.writeHead(200, { "content-type": contentType, "content-length": body.length }).end(body);
};

export const redirect = (location: string): Route => (_req, res) => {
  res.writeHead(302, { location }).end();
};
