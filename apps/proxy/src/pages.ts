/** Friendly error page that also tells the app shell what happened (postMessage, app origin only). */
export function errorPage(
  status: number,
  message: string,
  appOrigin: string,
  code: string,
): Response {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const msg = JSON.stringify({ ft: 1, type: 'error', code, message }).replace(/</g, '\\u003c');
  const target = JSON.stringify(appOrigin).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Preview unavailable</title>
<style>body{font:16px system-ui,-apple-system,sans-serif;color:#1c1f23;background:#fafbfc;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}</style></head>
<body><p>${esc(message)}</p><script>try{if(window.parent!==window)window.parent.postMessage(${msg},${target})}catch(e){}</script></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
    },
  });
}
