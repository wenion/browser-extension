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
let lastEvent : {
  type: string,
  timeStamp: number,
  scrollX?: number,
  scrollY?: number,
  tagName?: string,
  xpath?: string,
  name?: string,
  value?: string,
  code?: string,
  key?: string,
} = {type: 'initial', timeStamp: 0};
let lastPointerdownEvent = {type: 'pointerdown', timeStamp: 0, clientX: 0, clientY: 0}
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
    const _target = _event.target;
    if (_target instanceof HTMLInputElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({type: _target.type, name: _target.name, value: _target.value, inner_text: _target.innerText}),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLSpanElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({name: _target.textContent, inner_text: _target.innerText}),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLSelectElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({type: _target.type, name: _target.labels[0].innerText, value: _target.options[_target.selectedIndex].innerText, inner_text: _target.innerText}),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLDivElement){
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({title: _target.title, name:_target.role, value: _target.textContent, inner_text: _target.innerText}),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({name: _target.nodeName, value: _target.nodeValue, inner_text: _target.innerText}),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else {
      const element = _target as Element;
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: element.tagName,
        textContent: element.textContent,
        interactionContext: JSON.stringify({type: element.nodeType, name: element.nodeName, value: element.nodeValue}),
        xpath: getXPath(element),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    }
    lastPointerdownEvent = {type: _event.type, timeStamp: _event.timeStamp, clientX: _event.clientX, clientY: _event.clientY};
  })
  destroyables.push(clickEvent)

  // const mousedownEvent = new UserEvent(document.body, 'mousedown', (event) => {
  // })
  // destroyables.push(mousedownEvent);

  const mousedownEvent = new UserEvent(document.body, 'submit', (event) => {
    // event.preventDefault();
    // event.stopPropagation();
    const _event = event as SubmitEvent;
    const submitter = _event.submitter;
    if (submitter instanceof HTMLInputElement ) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'submit',
        tagName: submitter.tagName,
        textContent: submitter.value,
        interactionContext: JSON.stringify({name: submitter.name, value: submitter.value}),
        xpath: getXPath(submitter),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    }
  })
  destroyables.push(mousedownEvent);

  const dblclickEvent = new UserEvent(document.body, 'dblclick', (event) => {
    console.log('dblclick',)
  })
  destroyables.push(dblclickEvent);

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
    lastEvent = {type: _event.type, timeStamp: _event.timeStamp};
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
    lastEvent = {type: event.type, timeStamp: _event.timeStamp};
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
    lastEvent = {type: event.type, timeStamp: _event.timeStamp};
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
    }
    _lastScrollEvent = {
      timeStamp: event.timeStamp,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
    lastEvent = {type: event.type, timeStamp: event.timeStamp, scrollX: window.scrollX, scrollY: window.scrollY};
  })
  destroyables.push(scrollEvent);

  const contextmenuEvent = new UserEvent(window, "contextmenu", (event) => {
    console.log("contextmenuEvent", event)
  });
  destroyables.push(contextmenuEvent)

  const pasteEvent = new UserEvent(window, "paste", (event) => {
    console.log("paste", event)
  });
  destroyables.push(pasteEvent)

  // const selectEvent2 = new UserEvent(window, "select", (event) => {
  //   console.log("select", event)
  // });

  const changeEvent = new UserEvent(window, "change", (event) => {
    const _target = event.target;
    if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels) {
        name = _target.labels[0].innerText;
      }
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: event.type,
        xpath: getXPath(_target),
        tagName: 'INPUT',
        textContent: _target.value,
        interactionContext: JSON.stringify({type: _target.type, name: name, value: _target.value}),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLSelectElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: event.type,
        xpath: getXPath(_target)?? '',
        tagName: 'SELECT',
        textContent: _target.value,
        interactionContext: JSON.stringify({type: _target.type, name: _target.labels[0].innerText, value: _target.options[_target.selectedIndex].innerText}),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLTextAreaElement) {
      let name = _target.name;
      let value = _target.textContent;
      if (_target.labels) {
        name = _target.labels[0].innerText;
      }
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: event.type,
        xpath: getXPath(_target),
        tagName: 'TEXTAREA',
        textContent: value,
        interactionContext: JSON.stringify({type: _target.type, name: name, value: value}),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
        shouldCapture: true,
      });
    }
  });
  destroyables.push(changeEvent)

  const keyupEvent = new UserEvent(document.body, 'keyup', (event) => {
    const _event = event as KeyboardEvent;

    let value = '';
    let name = null;

    if (_event.target instanceof HTMLInputElement) {
      value = _event.target.value;
      name = _event.target.name;
    } else if (_event.target instanceof HTMLTextAreaElement) {
      value = _event.target.innerText;
    } else if (_event.target instanceof HTMLDivElement){
      value = _event.target.innerText;
    } else {
      name = (_event.target as HTMLElement).nodeName;
      value = (_event.target as HTMLElement).innerText;
    }

    chrome.runtime.sendMessage({
      messageType: 'TraceData',
      type: event.type,
      code: _event.code,
      key: _event.key,
      xpath: _event.target? getXPath(_event.target as Element) : '',
      tagName: (_event.target as Node).nodeName ?? '',
      textContent: _event.code,
      interactionContext: JSON.stringify({code: _event.code,key: _event.key, name:name, value:value}),
      eventSource: 'KEYBOARD',
      width: window.innerWidth,
      height: window.innerHeight,
      enableCapture: enableCapture,
    });
    lastEvent = {
      type: event.type,
      timeStamp: event.timeStamp,
      tagName: (_event.target as Node).nodeName ?? '',
      code: _event.code,
      key: _event.key,
      xpath: _event.target? getXPath(_event.target as Element) : '',
      name: name?? undefined,
      value: value,
    };
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
    lastEvent = {type: event.type, timeStamp: event.timeStamp};
  })
  destroyables.push(beforeunloadEvent)
}

function disable() {
  destroyables.forEach(instance => instance.destroy());
  destroyables.splice(0, destroyables.length)
  _lastScrollEvent = null;
}

console.log("init script>>>")

const initContentScript = async() => {
  let contentScriptInjector = document.querySelector('content-scrpit')
  if (!contentScriptInjector) {
    contentScriptInjector = document.createElement('content-scrpit');
    document.body.appendChild(contentScriptInjector);

    let isLoggedIn = false;
    enable();
    const messageEventHandler = async (event: MessageEvent) => {
      const { data } = event;

      if (data.frame1 === 'sidebar' && data.frame2 === 'extension' && data.type === 'request') {
        port = event.ports[0];
        if (port) {
          setup(port);

          port.onmessage = (event) => {
            const _data = event.data;
            // if (_data.loggedIn) {
            //   isLoggedIn = true;
            //   enable();
            // }
            // if (_data.loggedOut) {
            //   isLoggedIn = false;
            //   disable();
            // }

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
      // if (isLoggedIn) {
      //   disable();
      // }
      disable();
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