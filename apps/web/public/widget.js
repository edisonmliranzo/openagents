(function () {
  var script = document.currentScript || document.querySelector('script[data-openagents-slug]');
  if (!script) return;
  var slug = script.getAttribute('data-openagents-slug');
  if (!slug) return;
  var baseUrl = (script.getAttribute('data-openagents-url') || new URL(script.src, window.location.href).origin).replace(/\/$/, '');
  var accent = script.getAttribute('data-openagents-color') || '#10b981';

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open OpenAgents Chat');
  btn.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:56px',
    'height:56px',
    'border-radius:9999px',
    'border:none',
    'cursor:pointer',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-shadow:0 12px 32px rgba(0,0,0,0.35)',
    'color:#ffffff',
    'font-size:22px',
    'background:' + accent
  ].join(';');
  btn.textContent = '\uD83D\uDCAC';

  var frameWrap = document.createElement('div');
  frameWrap.style.cssText = [
    'position:fixed',
    'bottom:88px',
    'right:20px',
    'width:min(390px,calc(100vw - 32px))',
    'height:min(600px,calc(100vh - 120px))',
    'border-radius:16px',
    'overflow:hidden',
    'box-shadow:0 24px 64px rgba(0,0,0,0.45)',
    'border:1px solid rgba(255,255,255,0.12)',
    'z-index:2147483646',
    'display:none',
    'background:#0b0f19'
  ].join(';');

  var iframe = document.createElement('iframe');
  iframe.src = baseUrl + '/a/' + encodeURIComponent(slug) + '?embed=1&origin=' + encodeURIComponent(window.location.origin);
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:#0b0f19;';
  iframe.setAttribute('title', 'OpenAgents Assistant');
  frameWrap.appendChild(iframe);

  var open = false;
  btn.addEventListener('click', function () {
    open = !open;
    frameWrap.style.display = open ? 'block' : 'none';
    btn.textContent = open ? '\u2715' : '\uD83D\uDCAC';
  });

  document.body.appendChild(frameWrap);
  document.body.appendChild(btn);
})();
