/**
 * Test whether an iframe fills the viewport of an ancestor frame.
 */
function getFullXPath(node: Element) {
  return xPath(node, false)
}

function getXPath(node: Element) {
  return xPath(node)
}

class Step {
  public value: string;
  public optimized: boolean;
  constructor(value: string, optimized: boolean) {
    this.value = value;
    this.optimized = optimized || false;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this.value;
  }
};

function xPath(node: Element, optimized: boolean = true) {
  if (node.nodeType === Node.DOCUMENT_NODE)
    return '/';

  const steps = [];
  let contextNode = node;
  while (contextNode) {
    const step = _xPathValue(contextNode, optimized);
    if (!step)
      break;  // Error - bail out early.
    steps.push(step);
    if (step.optimized)
      break;
    contextNode = contextNode.parentNode as Element;
  }

  steps.reverse();
  return (steps.length && steps[0].optimized ? '' : '/') + steps.join('/');
};

function _xPathValue(node: Element, optimized: boolean) {
  let ownValue;
  const ownIndex = _xPathIndex(node);
  if (ownIndex === -1)
    return null;  // Error.

  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      if (optimized && node.getAttribute('id'))
        return new Step('//*[@id="' + node.getAttribute('id') + '"]', true);
      ownValue = node.localName;
      break;
    case Node.ATTRIBUTE_NODE:
      ownValue = '@' + node.nodeName;
      break;
    case Node.TEXT_NODE:
    case Node.CDATA_SECTION_NODE:
      ownValue = 'text()';
      break;
    case Node.PROCESSING_INSTRUCTION_NODE:
      ownValue = 'processing-instruction()';
      break;
    case Node.COMMENT_NODE:
      ownValue = 'comment()';
      break;
    case Node.DOCUMENT_NODE:
      ownValue = '';
      break;
    default:
      ownValue = '';
      break;
  }

  if (ownIndex > 0)
    ownValue += '[' + ownIndex + ']';

  return new Step(ownValue, node.nodeType === Node.DOCUMENT_NODE);
};

function _xPathIndex(node: Element) {
  // Returns -1 in case of error, 0 if no siblings matching the same expression, <XPath index among the same expression-matching sibling nodes> otherwise.
  function areNodesSimilar(left: Element, right: Element) {
    if (left === right)
      return true;

    if (left.nodeType === Node.ELEMENT_NODE && right.nodeType === Node.ELEMENT_NODE)
      return left.localName === right.localName;

    if (left.nodeType === right.nodeType)
      return true;

    // XPath treats CDATA as text nodes.
    const leftType = left.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : left.nodeType;
    const rightType = right.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : right.nodeType;
    return leftType === rightType;
  }

  const siblings = node.parentNode ? node.parentNode.children : null;
  if (!siblings)
    return 0;  // Root node - no siblings.
  let hasSameNamedElements;
  for (let i = 0; i < siblings.length; ++i) {
    if (areNodesSimilar(node, siblings[i]) && siblings[i] !== node) {
      hasSameNamedElements = true;
      break;
    }
  }
  if (!hasSameNamedElements)
    return 0;
  let ownIndex = 1;  // XPath indices start with 1.
  for (let i = 0; i < siblings.length; ++i) {
    if (areNodesSimilar(node, siblings[i])) {
      if (siblings[i] === node)
        return ownIndex;
      ++ownIndex;
    }
  }
  return -1;  // An error occurred: |node| not found in parent's children.
};

type Destroyable = {
  destroy(): void;
};

class UserEvent implements Destroyable {
  private _element: HTMLElement | Window;
  private _event: string;
  private _handler: (e: Event) => void;

  constructor(element: HTMLElement | Window, event: string, handler: (e: Event) => void) {
    this._element = element;
    this._event = event;
    this._handler = handler;

    // effect
    this._element.addEventListener(this._event, this._handler);
  }

  destroy(): void {
    this._element.removeEventListener(this._event, this._handler);
  }
}

function onMessageReceived(message: any, sender: chrome.runtime.MessageSender, sendResponse: ()=>void) {
  window.postMessage(message, message.url)
}

const initContentScript = async() => {
  const destroyables = [] as Destroyable[];
  let _lastScrollEvent: {timeStamp: number, scrollX: number, scrollY: number} | null = null;

  let contentScriptInjector = document.querySelector('content-scrpit')
  if (!contentScriptInjector) {
    contentScriptInjector = document.createElement('content-scrpit');
    document.body.appendChild(contentScriptInjector);

    const clickEvent = new UserEvent(document.body, 'click', (event) => {
      const _event = event as PointerEvent;
      if (_event.target instanceof HTMLElement) {
        const _target = _event.target as HTMLElement;
        chrome.runtime.sendMessage({
          messageType: 'UserEvent',
          type: _event.type,
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: _target.tagName,
          textContent: _target.textContent,
          innerText: _target.innerText,
          xpath: getXPath(_target),
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
      else {
        chrome.runtime.sendMessage({
          messageType: 'UserEvent',
          type: _event.type,
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
          textContent: (_event.target as Node).textContent ?? '',
          innerText: (_event.target as HTMLElement).innerText ?? (_event.target as Node).nodeType ?? '',
          xpath: '',
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    })
    destroyables.push(clickEvent)

    // const mouseUpEvent = new UserEvent(document.body, 'mouseup', (event) => {
    //   const selection = document.getSelection();
    //   if (selection && selection.rangeCount !== 0 && selection.toString().length) {
    //     let range = selection.getRangeAt(0);
    //     for (let i = 1; i < selection.rangeCount; i++) {
    //       range = unionRanges(range, selection.getRangeAt(i));
    //     }
    //     // console.log("selection", selection, 'selection conunt', selection.rangeCount, selection.toString(), selection.toString().length)
    //     console.log('range', range)
    //   }
    // })
    // destroyables.push(mouseUpEvent);

    const scrollEvent = new UserEvent(window, 'scroll', (event) => {
      if (!_lastScrollEvent) {
        _lastScrollEvent = {timeStamp: event.timeStamp, scrollX: window.scrollX, scrollY: window.scrollY}
      }
      if (event.timeStamp - _lastScrollEvent.timeStamp > 20) {
        chrome.runtime.sendMessage({
          messageType: 'UserEvent',
          type: event.type,
          diffX: window.scrollX - _lastScrollEvent.scrollX,
          diffY: window.scrollY - _lastScrollEvent.scrollY,
          diffTimeStamp: event.timeStamp - _lastScrollEvent.timeStamp,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          width: window.innerWidth,
          height: window.innerHeight,
        });
        _lastScrollEvent = {
          timeStamp: event.timeStamp,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }
      }
    })
    destroyables.push(scrollEvent);

    const keyupEvent = new UserEvent(document.body, 'keyup', (event) => {
      const _event = event as KeyboardEvent;

      chrome.runtime.sendMessage({
        messageType: 'UserEvent',
        type: event.type,
        code: _event.code,
        key: _event.key,
        // keyCode: _event.keyCode,
        xpath: _event.target? getXPath(_event.target as Element) : '',
        tagName: (_event.target as Node).nodeName ?? '',
        innerText: (_event.target as Node).nodeType ?? '',
        width: window.innerWidth,
        height: window.innerHeight,
      });
    })
    destroyables.push(keyupEvent)

    const beforeunloadEvent = new UserEvent(window, 'beforeunload', (event) => {
      chrome.runtime.sendMessage({
        messageType: 'UserEvent',
        type: event.type,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    })
    destroyables.push(beforeunloadEvent)

    chrome.runtime.onMessage.addListener(onMessageReceived)

    const destoryHandler = async() => {
      destroyables.forEach(instance => instance.destroy());
      const contentScriptInjector = document.querySelector('content-scrpit');
      if (contentScriptInjector) {
        contentScriptInjector.removeEventListener('destroy', destoryHandler)
        contentScriptInjector.remove();
      }

      chrome.runtime.onMessage.removeListener(onMessageReceived)
    }
    contentScriptInjector.addEventListener('destroy', destoryHandler)
  }
}

initContentScript();