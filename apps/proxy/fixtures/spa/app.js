const routes = {
  '/': '<h1>Grace builds data products</h1><img src="/logo.svg" alt="Grace logo"><section><h2>Highlights</h2><p>Led a team shipping an analytics dashboard used by thousands of nurses.</p></section>',
  '/work': '<h1>Work</h1><section><h2>Hospital dashboard</h2><p>Designed alerting that cut response times in half.</p></section><section><h2>Ride share pricing</h2><p>Explained surge pricing to riders with a simple chart.</p></section>',
  '/about': '<h1>About Grace</h1><p>I like turning messy data into clear decisions.</p>',
};
function render() {
  document.getElementById('app').innerHTML = routes[location.pathname] ?? '<h1>Not found</h1>';
  document.title = 'SPA ' + location.pathname;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', new URL(a.getAttribute('href'), location.href).pathname);
  render();
});
document.getElementById('menu').addEventListener('click', () => { const d = document.getElementById('drawer'); d.hidden = !d.hidden; });
window.addEventListener('popstate', render);
render();
