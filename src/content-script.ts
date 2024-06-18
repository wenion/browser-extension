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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type HighlightProps = {
  // Associated SVG rect drawn to represent this highlight (in PDFs)
  svgHighlight?: SVGRectElement;
};

type HighlightElement = HTMLElement & HighlightProps;
type AnnotationHighlight = HTMLElement & { _annotation?: {$tag: string;} };

function getCustomsContainingNode(node: Node): HighlightElement[] {
  let el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  const highlights = [];

  while (el) {
    if (el.classList.contains('hypothesis-highlight') && el.classList.contains('custom-content')) {
      highlights.push(el);
    }
    el = el.parentElement;
  }

  return highlights as HighlightElement[];
}

function generateRandomString(length: number): string {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
}

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

const destroyables = [] as Destroyable[];
let lastSelectEvent = '';
let _lastScrollEvent: {timeStamp: number, scrollX: number, scrollY: number} | null = null;

let port: MessagePort | null = null;
let _messageQueue: object[] = [];
let enableCapture = false;
let recordingSessionId = '';
let recordingTaskName = '';

function send(port: MessagePort, message: object) {
  const id = generateRandomString(12)
  const _message = Object.assign(message, {source: 'extension', id:id})

  port.postMessage(_message)
}

function navigate() {
  chrome.runtime.sendMessage({
    messageType: 'TraceData',
    type: 'navigate',
    tagName: 'Navigate',
    textContent: '',
    interactionContext: '',
    xpath: '',
    eventSource: 'RESOURCE PAGE',
    width: window.innerWidth,
    height: window.innerHeight,
    enableCapture: enableCapture,
  });
}

async function setup(port: MessagePort) {
  const env = await chrome.storage.sync.get(['mode', 'model', 'token',]);
  send(port, {...env, recording:'request'});
  navigate();
}

function enable() {
  const clickEvent = new UserEvent(document.body, 'pointerdown', async (event) => {
    const _event = event as PointerEvent;
    if (_event.target instanceof HTMLElement) {
      const _target = _event.target as HTMLElement;
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: _target.innerText,
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    }
    else {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
        textContent: (_event.target as Node).textContent ?? '',
        interactionContext: (_event.target as HTMLElement).innerText ?? (_event.target as Node).nodeType ?? '',
        xpath: '',
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    }
  })
  destroyables.push(clickEvent)

  // const mousedownEvent = new UserEvent(document.body, 'mousedown', (event) => {
  // })
  // destroyables.push(mousedownEvent);

  const mouseoverEvent = new UserEvent(document.body, 'mouseover', (event) => {
    const _event = event as MouseEvent;
    const tags = getCustomsContainingNode(_event.target as Element);
    if (tags.length) {
      tags.map(tag => {
        chrome.runtime.sendMessage({
          messageType: 'TraceData',
          type: _event.type,
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: 'ADDTIONAL_KNOWLEDGE',
          textContent: (_event.target as Node).textContent ?? '',
          interactionContext: (_event.target as HTMLElement).innerText ?? (_event.target as Node).nodeType ?? '',
          xpath: getXPath(_event.target as HTMLElement),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          enableCapture: enableCapture,
        });
      })
    }
  })
  destroyables.push(mouseoverEvent);

  const selectEvent = new UserEvent(document.body, 'mouseup', (event) => {
    const selection = document.getSelection();
    const _event = event as PointerEvent;
    const selected = selection && selection.toString().trim() !== '';
    const current = selected ? selection.toString().trim() : ''

    if (selected && (lastSelectEvent != current)) {
      lastSelectEvent = current;
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'select',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
        textContent: selection.toString(),
        interactionContext: '',
        xpath: _event.target? getXPath(_event.target as Element) : '',
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    }
  })
  destroyables.push(selectEvent);

  // const dragEvent = new UserEvent(document.body, 'drag', (event) => {
  //   const _event = event as DragEvent;
  //   chrome.runtime.sendMessage({
  //     messageType: 'TraceData',
  //     type: _event.type,
  //     clientX: _event.clientX,
  //     clientY: _event.clientY,
  //     tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
  //     textContent: (_event.target as Text).data ?? (_event.target as Element).outerHTML ?? '',
  //     xpath: _event.target? getXPath(_event.target as Element) : '',
  //     width: window.innerWidth,
  //     height: window.innerHeight,
  //   });
  // })
  // destroyables.push(dragEvent);

  const dropEvent = new UserEvent(document.body, 'drop', (event) => {
    const _event = event as DragEvent;
    chrome.runtime.sendMessage({
      messageType: 'TraceData',
      type: _event.type,
      clientX: _event.clientX,
      clientY: _event.clientY,
      tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
      textContent: (_event.target as Text).data ?? (_event.target as Element).outerHTML ?? '',
      xpath: _event.target? getXPath(_event.target as Element) : '',
      interactionContext: '',
      eventSource: 'MOUSE',
      width: window.innerWidth,
      height: window.innerHeight,
      enableCapture: enableCapture,
    });
   })
   destroyables.push(dropEvent);

  const scrollEvent = new UserEvent(window, 'scroll', (event) => {
    if (!_lastScrollEvent) {
      _lastScrollEvent = {timeStamp: event.timeStamp, scrollX: window.scrollX, scrollY: window.scrollY}
    }
    if (event.timeStamp - _lastScrollEvent.timeStamp > 20) {
      const _diffX = window.scrollX - _lastScrollEvent.scrollX;
      const _diffY = window.scrollY - _lastScrollEvent.scrollY;
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: event.type,
        diffX: _diffX,
        diffY: _diffY,
        diffTimeStamp: event.timeStamp - _lastScrollEvent.timeStamp,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        tagName: 'Window',
        xpath: '',
        interactionContext: JSON.stringify({diffX: _diffX, diffY: _diffY, diffTimeStamp:event.timeStamp - _lastScrollEvent.timeStamp,}),
        textContent: (
          _diffY < 0? 'SCROLL UP' : _diffY > 0? 'SCROLL DOWN': '') +
          (_diffX < 0? 'SCROLL LEFT' : _diffX > 0? ':SCROLL RIGHT': ''),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
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
      messageType: 'TraceData',
      type: event.type,
      code: _event.code,
      key: _event.key,
      xpath: _event.target? getXPath(_event.target as Element) : '',
      tagName: (_event.target as Node).nodeName ?? '',
      textContent: _event.code,
      interactionContext: JSON.stringify({code: _event.code,key: _event.key,}),
      eventSource: 'KEYBOARD',
      width: window.innerWidth,
      height: window.innerHeight,
      enableCapture: enableCapture,
    });
  })
  destroyables.push(keyupEvent)

  const beforeunloadEvent = new UserEvent(window, 'beforeunload', (event) => {
    chrome.runtime.sendMessage({
      messageType: 'TraceData',
      type: event.type,
      tagName: 'CLOSE',
      textContent: '',
      interactionContext: '',
      xpath: '',
      eventSource: 'RESOURCE PAGE',
      width: window.innerWidth,
      height: window.innerHeight,
      enableCapture: enableCapture,
    });
  })
  destroyables.push(beforeunloadEvent)
}

function disable() {
  destroyables.forEach(instance => instance.destroy());
  destroyables.splice(0, destroyables.length)
  _lastScrollEvent = null;
}

const initContentScript = async() => {
  let contentScriptInjector = document.querySelector('content-scrpit')
  if (!contentScriptInjector) {
    contentScriptInjector = document.createElement('content-scrpit');
    document.body.appendChild(contentScriptInjector);

    let isLoggedIn = false;
    const messageEventHandler = async (event: MessageEvent) => {
      const { data } = event;

      if (data.frame1 === 'sidebar' && data.frame2 === 'extension' && data.type === 'request') {
        port = event.ports[0];
        if (port) {
          setup(port);

          port.onmessage = (event) => {
            const _data = event.data;
            if (_data.loggedIn) {
              isLoggedIn = true;
              enable();
            }
            if (_data.loggedOut) {
              isLoggedIn = false;
              disable();
            }

            if (_data.recording) {
              recordingSessionId = _data.recording.recordingSessionId;
              recordingTaskName = _data.recording.recordingTaskName;
              enableCapture = _data.recording.recordingStatus === 'on' ? true : false;
              if (enableCapture) navigate();
            }

            if (_data.mode) {
              chrome.storage.sync.set({mode: _data.mode})
            }
          }
          window.removeEventListener('message', messageEventHandler);
        }
      }
    }
    window.addEventListener('message', messageEventHandler);

    const onMessageReceived = (message: any, sender: chrome.runtime.MessageSender, sendResponse: ()=>void) => {
      if (port){
        send(port, message);
      }
      else {
        console.error("unsend", message)
      }
    }

    chrome.runtime.onMessage.addListener(onMessageReceived)

    const destoryHandler = async() => {
      if (isLoggedIn) {
        disable();
      }
      // destroyables.forEach(instance => instance.destroy());
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