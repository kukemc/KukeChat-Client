/** 预览页假接口的处理函数：认得这个请求就返回响应，不认得返回 undefined 让下一个处理。 */
export type MockHandler = (request: { path: string; url: URL; method: string; body: unknown }) => Response | undefined | Promise<Response | undefined>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
