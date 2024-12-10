import { chromeAPI } from './chrome-api';
import { Extension } from './extension';
import type { ExternalMessage } from './messages';
import type {
  TraceMeta,
  ClickTraceMeta,
  KeyTraceMeta,
  ScrollTraceMeta,
  ChangeTraceMetaMeta,
} from '../content-script/types/basic';

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
  });

  chrome.runtime.onMessage.addListener(
    async (
      message: (TraceMeta | ClickTraceMeta | KeyTraceMeta | ScrollTraceMeta | ChangeTraceMetaMeta) & {screenCapture: boolean},
      sender,
      sendResponse
    ) => {
      if (!sender.tab?.id || !sender.tab?.url) {
        return
      }

      const tabId = sender.tab.id;
      const windowId = sender.tab.windowId;
      let image = '';

      if (
        message.screenCapture &&
        (
          message.custom === 'click' ||
          message.custom === 'submit' ||
          message.custom === 'select' ||
          message.custom === 'drag' ||
          message.custom === 'drop' ||
          message.custom === 'navigate'
        )
      ) {
        const screenshotUrl = await chrome.tabs.captureVisibleTab();
        image = screenshotUrl;
      }

      const _message = {
        ...message,
        messageType: 'TraceData',
        url: sender.tab.url,
        tabId: tabId,
        windowId: windowId,
        timestamp: Date.now(),
        image: image,
      };

      chrome.tabs.sendMessage(sender.tab.id, _message);
    }
  );

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
