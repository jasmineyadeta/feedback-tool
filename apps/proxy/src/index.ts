export interface Env {
  ENVIRONMENT: string;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/__ping') return new Response('ok');
    return new Response('Open this from your review link.', { status: 403 });
  },
} satisfies ExportedHandler<Env>;
