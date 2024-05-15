import { chromeAPI } from './chrome-api';
import { Extension } from './extension';
import type { ExternalMessage } from './messages';

/**
 * Initialize the extension's Service Worker / background page.
 *
 * This is exported for use in tests.
 */
export async function init() {
  const extension = new Extension();
  const initialized = extension.init();

  // Tokens indicating which features the current extension supports.
  const allFeatures = [
    // "activate" message to activate extension on current tab and
    // optionally first navigate to a different URL.
    'activate',
  ];

  chromeAPI.runtime.onInstalled.addListener(async installDetails => {
    // Check whether this is the inital installation or an update of an existing
    // installation.
    if (installDetails.reason === 'install') {
      const extensionInfo = await chromeAPI.management.getSelf();
      extension.firstRun(extensionInfo);
    }

    const { alwaysOn = false } = await chrome.storage.sync.get('alwaysOn');
    chrome.contextMenus.create({
      title: alwaysOn ? 'Disable Always On': 'Always On',
      type: 'normal',
      id: alwaysOn ? 'Disable Always On': 'Always On',
      contexts: ['all']
    });

    const mode = await chrome.storage.sync.get('mode');
    if (!mode.mode) {
      await chrome.storage.sync.set({mode: 'Baseline'});
    }
    let mode_item = chrome.contextMenus.create({
      title: 'Select Mode',
      id: 'parent',
      contexts: ['action']
    })
    chrome.contextMenus.create({
      title: 'Baseline',
      parentId: mode_item,
      checked: mode.mode === 'Baseline',
      id: 'Baseline',
      type: 'radio',
      contexts: ['action']
    })
    chrome.contextMenus.create({
      title: 'GoldMind',
      parentId: mode_item,
      checked: mode.mode === 'GoldMind',
      id: 'GoldMind',
      type: 'radio',
      contexts: ['action']
    })
    chrome.contextMenus.update('parent', {
      title: mode.mode,
    })
  });

  chrome.runtime.onMessage.addListener(async(message, sender, sendResponse) => {
    if (!sender.tab?.id || !sender.tab?.url) {
      return
    }

    let _message = message;
    _message.url = sender.tab?.url;
    _message.source = 'extension';

    if (message.messageType === 'UserEvent' && message.type === 'click') {
      const screenshotUrl = await chrome.tabs.captureVisibleTab();
      _message.image = screenshotUrl;
    }

    chrome.tabs.sendMessage(sender.tab.id, _message);
  });

  // Respond to messages sent by the JavaScript from https://hyp.is.
  // This is how it knows whether the user has this Chrome extension installed.
  chromeAPI.runtime.onMessageExternal.addListener(
    (request: ExternalMessage, sender, sendResponse) => {
      switch (request.type) {
        case 'ping':
          {
            const queryFeatures = request.queryFeatures ?? [];
            const features = allFeatures.filter(f => queryFeatures.includes(f));
            sendResponse({ type: 'pong', features });
          }
          break;
        case 'activate':
          {
            if (typeof sender.tab?.id !== 'number') {
              return;
            }

            const { url, query } = request;
            if (url) {
              chromeAPI.tabs.update(sender.tab.id, { url });
            }
            extension.activate(sender.tab.id, {
              afterNavigationTo: url,
              query,
            });

            sendResponse({ active: true });
          }
          break;
      }
    },
  );

  chromeAPI.runtime.requestUpdateCheck?.().then(() => {
    chromeAPI.runtime.onUpdateAvailable.addListener(() =>
      chromeAPI.runtime.reload(),
    );
  });

  await initialized;
}

// nb. We use `globalThis` for the global object because it is `window` in Karma
// tests but `self` in the real extension's Service Worker.
const inTests = '__karma__' in globalThis;
if (!inTests) {
  init();
}
