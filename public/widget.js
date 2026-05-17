// Cypher Net Widget Loader Script
// Embed on any website with:
// <div id="cypher-net-widget" data-category="overall" data-limit="5" data-theme="light"></div>
// <script src="https://cypher-net.vercel.app/widget.js" async></script>

(function() {
  'use strict';

  const WIDGET_BASE_URL = 'https://cypher-net.vercel.app';

  function initCypherNetWidget() {
    const container = document.getElementById('cypher-net-widget');
    if (!container) return;

    const category = container.dataset.category || 'overall';
    const limit = container.dataset.limit || '5';
    const theme = container.dataset.theme || 'light';

    const iframe = document.createElement('iframe');
    iframe.src = `${WIDGET_BASE_URL}/embed?category=${category}&limit=${limit}&theme=${theme}`;
    iframe.width = '380';
    iframe.height = String(parseInt(limit) * 60 + 140);
    iframe.frameBorder = '0';
    iframe.style.border = 'none';
    iframe.style.maxWidth = '100%';
    iframe.title = 'Cypher Net Leaderboard';

    container.appendChild(iframe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCypherNetWidget);
  } else {
    initCypherNetWidget();
  }
})();
