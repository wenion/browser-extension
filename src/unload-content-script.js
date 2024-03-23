'use strict';

function unloadContentScript() {
  const contentScriptInjector = document.querySelector(
    'content-scrpit',
  );

  if (contentScriptInjector) {
    // Dispatch a 'destroy' event which is handled by the code in
    // annotator/main.js to remove the client.
    const destroyEvent = new Event('destroy');
    contentScriptInjector.dispatchEvent(destroyEvent);
  }
}

unloadContentScript();