import { getCustomsContainingNode } from './highlighter';
import type { Destroyable } from './types/annotator';
import { ListenerCollection } from './shared/listener-collection';
import { PortRPC } from './shared/messaging/port-rpc';
import { isMessage } from './shared/messaging/port-util';
import type {
  ExtensionToSidebarEvent,
  SidebarToExtensionEvent,
} from './types/extension-port-rpc-events';
import { getXPath } from './xpath';


class UserEvent implements Destroyable {
  private _element: HTMLElement | Window;
  private _event: string;
  private _handler: (e: Event) => void;

  constructor(
    element: HTMLElement | Window,
    event: string,
    handler: (e: Event) => void
  ) {
    this._element = element;
    this._event = event;
    this._handler = handler;

    this._element.addEventListener(this._event, this._handler);
  }

  destroy() {
    this._element.removeEventListener(this._event, this._handler);
  }
}

const destroyables = [] as Destroyable[];

var lastEvent : {
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

let lastSelectEvent = '';
let _lastScrollEvent: {timeStamp: number, scrollX: number, scrollY: number} | null = null;
let enableCapture = false;

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
    enableCapture: true,
  });
}

function getParentDiv(element: HTMLElement | null): HTMLElement | null {
  while (element && element.nodeName.toLowerCase() !== 'div') {
    element = element.parentElement;
  }
  return element; // This will return null if no <div> is found
}

function enable() {
  const clickEvent = new UserEvent(document.body, 'pointerdown', async (event) => {
    console.log("clickEvent >>>>", clickEvent)
    const _event = event as PointerEvent;
    const _target = _event.target;
    let parent_target: HTMLDivElement | null = null;
    let orgin_tag = '';

    if (_target instanceof HTMLInputElement) {
      let name = _target.innerText;
      if (_target.labels && _target.labels.length) {
        console.log("_target.labels", _target.labels)
        name = _target.labels[0].innerText;
      }
      if ((!name || name === '') && _target.textContent){
        name = _target.textContent;
      }
      console.log("finial name", name)
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({
          type: _target.type,
          name: name,
          value: _target.value,
          inner_text: _target.innerText,
          placeholder: _target.placeholder,
        }),
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
      console.log('click HTMLSelectElement', _event)
      if (_target.labels && _target.labels.length) {
        chrome.runtime.sendMessage({
          messageType: 'TraceData',
          type: 'click',
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: _target.tagName,
          textContent: _target.textContent,
          interactionContext: JSON.stringify({
            type: _target.type,
            name: _target.labels[0].innerText,
            value: _target.options[_target.selectedIndex].innerText,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          enableCapture: enableCapture,
        });
      } else if (_target.options && _target.options.length) {
        chrome.runtime.sendMessage({
          messageType: 'TraceData',
          type: 'click',
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: _target.tagName,
          textContent: _target.textContent,
          interactionContext: JSON.stringify({
            type: _target.type,
            name: _target.options[0].innerText,
            value: _target.options[_target.selectedIndex].innerText,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          enableCapture: enableCapture,
        });
      }
    } else if (_target instanceof HTMLAnchorElement) {
      console.log("HTMLAnchorElement", "innerText", _target.innerText, "_target.textContent", _target.textContent)
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.innerText,
        interactionContext: JSON.stringify({
          type: _target.type,
          name: _target.innerText,
          value: _target.href,
          inner_text: _target.innerText,
          text_content: _target.textContent
        }),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLButtonElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({
          type: _target.type,
          name: _target.textContent,
          value: _target.innerText,
          inner_text: _target.innerText
        }),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof SVGElement) {
      orgin_tag = 'svg';
      parent_target = _target.parentElement as HTMLDivElement;
      while (parent_target && parent_target.nodeName.toLowerCase() !== 'div') {
        parent_target = parent_target.parentElement as HTMLDivElement;
      }
      if (!parent_target.innerText || parent_target.innerText === '') {
        let whatWeWant = null;
        let nextSibling = parent_target.nextElementSibling;
        while (nextSibling) {
          if (nextSibling instanceof HTMLDivElement && nextSibling.innerText && nextSibling.innerText !== '') {
            whatWeWant = nextSibling;
            break;
          }
          nextSibling = nextSibling.nextElementSibling;
        }

        let previousSibling = whatWeWant? null : parent_target.previousElementSibling; // no need to find
        while (previousSibling) {
          if (previousSibling instanceof HTMLDivElement && previousSibling.innerText && previousSibling.innerText !== '') {
            whatWeWant = previousSibling;
            break;
          }
          previousSibling = previousSibling.nextElementSibling;
        }

        if (whatWeWant) {
          console.log("whatWeWant", whatWeWant)
          parent_target = whatWeWant;
        }
      }
      console.log("svg parent_target", parent_target)

    } else if (_target instanceof HTMLElement) {
      if (_target.innerText || _target.textContent) {
        chrome.runtime.sendMessage({
          messageType: 'TraceData',
          type: 'click',
          clientX: _event.clientX,
          clientY: _event.clientY,
          tagName: _target.tagName,
          textContent: _target.textContent,
          interactionContext: JSON.stringify({
            name: _target.textContent,
            value: _target.innerText,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          enableCapture: enableCapture,
        });
      }
      else {
        orgin_tag = _target.tagName;
        parent_target = getParentDiv(_target) as HTMLDivElement;
        console.log("HTMLElement parent_target", parent_target)
      }
    }

    if (parent_target && parent_target instanceof HTMLDivElement) {
      console.log("here", parent_target, parent_target.textContent, parent_target.innerText)
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: parent_target.tagName,
        textContent: parent_target.textContent,
        interactionContext: JSON.stringify({
          title: parent_target.title,
          name:parent_target.role,
          value: parent_target.textContent,
          inner_text: parent_target.innerText,
          origin: orgin_tag,
        }),
        xpath: getXPath(parent_target),
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
    const _target = event.target;
    console.log("drop", _event)


    if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: event.type,
        xpath: getXPath(_target),
        tagName: 'INPUT',
        textContent: _target.value,
        interactionContext: JSON.stringify({type: _target.type, name: name, value: _target.value, inner_text: _target.innerText}),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else if (_target instanceof HTMLDivElement) {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: 'click',
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: _target.tagName,
        textContent: _target.textContent,
        interactionContext: JSON.stringify({
          title: _target.title,
          name:_target.role,
          value: _target.textContent,
          inner_text: _target.innerText,
        }),
        xpath: getXPath(_target),
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        enableCapture: enableCapture,
      });
    } else {
      chrome.runtime.sendMessage({
        messageType: 'TraceData',
        type: _event.type,
        clientX: _event.clientX,
        clientY: _event.clientY,
        tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
        textContent: (_event.target as Text).data ?? (_event.target as Element).outerHTML ?? '',
        xpath: _event.target? getXPath(_event.target as Element) : '',
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
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
    const _event = event as ClipboardEvent;
    const _target = _event.target;
    if (_target instanceof HTMLTextAreaElement) {
      let name = 'Textarea';
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      let value = _target.value;
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
      });
    } else if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels && _target.labels[0]) {
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
    }
  });
  destroyables.push(pasteEvent)

  // const selectEvent2 = new UserEvent(window, "select", (event) => {
  //   console.log("select", event)
  // });

  const changeEvent = new UserEvent(window, "change", (event) => {
    const _target = event.target;
    console.log('change', event, _target)
    if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      if (_target.type == "checkbox") {
        chrome.runtime.sendMessage({
          messageType: 'TraceData',
          type: event.type,
          xpath: getXPath(_target),
          tagName: 'INPUT',
          textContent: _target.checked,
          interactionContext: JSON.stringify({type: _target.type, name: name, value: _target.checked}),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          enableCapture: enableCapture,
        });
      }
      else {
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
      }
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
      let name = 'Textarea';
      let value = _target.value;
      console.log('change HTMLTextAreaElement', event, _target)
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      console.log('change HTMLTextAreaElement name', name, value)
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
    console.log("keyup event")
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
    console.log("before >>>>", beforeunloadEvent)
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
    // sleep(1000);
  })
  destroyables.push(beforeunloadEvent)
}

function disable() {
  // clear register events
  destroyables.forEach(instance => instance.destroy());
  destroyables.splice(0, destroyables.length)
  _lastScrollEvent = null;
}

class ContentService {
  _sidebarRPC : PortRPC<SidebarToExtensionEvent, ExtensionToSidebarEvent>;
  private _listeners: ListenerCollection;

  constructor() {
    this._sidebarRPC = new PortRPC();
    this._listeners = new ListenerCollection();
    this._setupExtensionEvent();
  }

  private _setupExtensionEvent() {
    this._sidebarRPC.on("connect", (data) => {
      const status = JSON.parse(data);
      enableCapture = status.recordingStatus === 'on' ? true : false;
    });
    this._sidebarRPC.on('recording', (data) => {
      enableCapture = data.recordingStatus === 'on' ? true : false;
    });
    this._sidebarRPC.on('close', () => {
      console.log('sidebar close')
    });
  }

  async connect() {
    const listenerId = this._listeners.add(window, 'message', event => {
      const { data, ports } = event;

      if (
        !isMessage(data) ||
        data.frame2 !== 'extension' ||
        data.type === 'request' 
      ) {
        return;
      }

      this._sidebarRPC.connect(ports[0]);
      this._listeners.remove(listenerId);
    })
  }

  forwardMessage(message: any) {
    this._sidebarRPC.call("traceData", message);
  }

  destroy() {
    this._sidebarRPC.destroy();
    this._listeners.removeAll();
  }
}


console.log("init script>>>", new Date())

const initContentScript = async() => {
  let contentScriptInjector = document.querySelector('content-scrpit')
  if (!contentScriptInjector) {
    contentScriptInjector = document.createElement('content-scrpit');
    document.body.appendChild(contentScriptInjector);

    let content = new ContentService();
    content.connect();
    enable();

    const onMessageReceived = async (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => {
      if (!message.url || message.url != '') {
        message.url = window.location.href
      }

      console.log("on receive!!!!!!", message.messageType, message.type)
      switch (message.messageType) {
        case 'TraceData':
          content.forwardMessage(message); 
          break;
        case 'CmdData':
          break;
      }

      return true;
    }

    chrome.runtime.onMessage.addListener(onMessageReceived)
    // TODO
    navigate();

    const destoryHandler = () => {
      const contentScriptInjector = document.querySelector('content-scrpit');
      if (contentScriptInjector) {
        contentScriptInjector.removeEventListener('destroy', destoryHandler)
        contentScriptInjector.remove();
      }
      disable();
      content.destroy();
      chrome.runtime.onMessage.removeListener(onMessageReceived);
    }
    contentScriptInjector.addEventListener('destroy', destoryHandler)
  }
}

initContentScript();
