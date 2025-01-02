import { getCustomsContainingNode } from './highlighter';
import { ListenerCollection } from './shared/listener-collection';
import { PortRPC } from './shared/messaging/port-rpc';
import { isMessage } from './shared/messaging/port-util';
import type {
  ExtensionToSidebarEvent,
  SidebarToExtensionEvent,
} from './types/extension-port-rpc-events';
import { getXPath } from './xpath';
import { throttle } from './shared/utils';
import type {
  TraceMeta,
  ClickTraceMeta,
  KeyTraceMeta,
  ScrollTraceMeta,
  ChangeTraceMetaMeta,
} from './types/basic';


function sendToServiceWork(
  message: TraceMeta | ClickTraceMeta | KeyTraceMeta | ScrollTraceMeta | ChangeTraceMetaMeta,
  screenCapture: boolean
) {
  chrome.runtime.sendMessage({
    ...message,
    screenCapture: screenCapture,
  });
};

function getSpreadSheetNameBox() {
  const positionInputBox = document.getElementById('t-name-box') as HTMLInputElement;

};

let enableCapture = false;
let dragStatus :'start' | 'ongoing' | 'finish' = 'finish';
let dragStartEvent: ClickTraceMeta = {
  type: '',
  custom: '',
  tagName: '',
  label: '',
  textContent: '',
  interactionContext: '',
  xpath: '',
  eventSource: 'MOUSE',
  width: 0,
  height: 0,
  clientX: 0,
  clientY: 0,
};

function navigate() {
  sendToServiceWork(
    {
      type: '',
      custom: 'go to',
      tagName: 'Navigate',
      label: '',
      textContent: '',
      interactionContext: '',
      xpath: '',
      eventSource: 'RESOURCE PAGE',
      width: window.innerWidth,
      height: window.innerHeight,
    },
    enableCapture
  );
}

function getParentDiv(element: Element | null): HTMLDivElement | null {
  while (element && !(element instanceof HTMLDivElement)) {
    element = element.parentElement;
  }
  return element; // This will return null if no <div> is found
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
    this._sidebarRPC.on('connect', (data) => {
      const status = JSON.parse(data);
      enableCapture = status.recording;
    });
    this._sidebarRPC.on('recording', (data) => {
      enableCapture = data.recording;
    });
    this._sidebarRPC.on('customEvent', (data) => {
      if (data.custom === 'record' && data.textContent === 'start') {
        navigate();
      }
      sendToServiceWork(
        {
          type: data.eventType,
          custom: data.custom,
          tagName: data.tagName,
          label: data.textContent,
          textContent: data.textContent,
          interactionContext: '',
          xpath: '',
          eventSource: 'CLIENT',
          width: window.innerWidth,
          height: window.innerHeight,
        },
        false
      );
    })
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

function isSpreadsheet() {
  return window.location.href.startsWith('https://docs.google.com/spreadsheets/');
}

function isGoogleDoc(trace: any) {
  return window.location.href.startsWith('https://docs.google.com/document/') && trace.xpath === '/html/body/div[1]';
}

function isMural() {
  return window.location.href.startsWith('https://app.mural.co/');
}

// Utility function to add event listeners to a document
function addEventListeners(doc: Document): void {
  doc.addEventListener("pointerdown", async (event: MouseEvent) => {
    const _event = event;
    const _target = event.target;

    if (isSpreadsheet() && (
      _target instanceof HTMLDivElement &&
      _target.classList.contains('goog-inline-block') &&
      _target.classList.contains('grid4-inner-container')
    )) {
      setTimeout(() => {
        const positionInputBox = document.getElementById('t-name-box') as HTMLInputElement;
        const contentDivList = document.getElementsByClassName('cell-input');

        if (contentDivList && contentDivList[0]) {
          const innerText = (contentDivList[0] as HTMLDivElement).innerText;
          // const textContent = innerText.trim() == '' ?
          //   'Go to cell ' + positionInputBox.value :
          //   'Go to cell ' + positionInputBox.value + ', where the content reads '+ innerText.trim();
          const textContent = 'cell ' + positionInputBox.value;
          sendToServiceWork(
            {
              type: _event.type,
              custom: 'click',
              tagName: _target.tagName,
              label: textContent,
              textContent: innerText,
              interactionContext: JSON.stringify({
                title: _target.title,
                name:_target.role,
                position: positionInputBox.value,
                value: textContent,
                inner_text: _target.innerText,
                origin: _target.tagName,
              }),
              xpath: getXPath(_target),
              eventSource: 'GOOGLESPREADSHEET',
              width: window.innerWidth,
              height: window.innerHeight,
              clientX: _event.clientX,
              clientY: _event.clientY,
            },
            enableCapture
          );
        }
      }, 100)
      return;
    }

    if (_target instanceof HTMLInputElement) {
      let label = _target.getAttribute('aria-label') ?? '';

      if (_target.labels && _target.labels.length && label === '') {
        label = _target.labels[0].innerText;
      }

      if (label.trim() === '') {
        label = _target.placeholder.trim();
      }
      let name = label;

      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: label,
          textContent: name,
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
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLSpanElement) {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: _target.innerText,
          textContent: _target.textContent ?? _target.innerText,
          interactionContext: JSON.stringify({
            name: _target.textContent,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLSelectElement) {
      if (_target.labels && _target.labels.length) {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: _target.tagName,
            label: _target.labels[0].innerText,
            textContent: _target.textContent ?? _target.options[_target.selectedIndex].innerText,
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
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
      } else if (_target.options && _target.options.length) {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: _target.tagName,
            label: _target.options[0].innerText,
            textContent: _target.textContent ?? _target.options[_target.selectedIndex].innerText,
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
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
      }
      else {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: _target.tagName,
            label: 'selection',
            textContent: _target.textContent ?? _target.innerText,
            interactionContext: JSON.stringify({
              type: _target.type,
              inner_text: _target.innerText
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
      }
    } else if (_target instanceof HTMLAnchorElement) {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: _target.innerText,
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
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLButtonElement) {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: _target.innerText,
          textContent: _target.textContent ?? _target.innerText,
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
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof SVGElement) {
      const parent = getParentDiv(_target);

      if (parent && parent.innerText.length > 0) {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: 'SVG',
            label: parent.innerText,
            textContent: parent.textContent ?? parent.innerText,
            interactionContext: JSON.stringify({
              type: _target.tagName,
              source: 'parent',
              name: parent.textContent,
              value: parent.innerText,
              inner_text: parent.innerText
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
        return;
      } else if (parent) {
        let nextSibling = parent.nextElementSibling;
        while (nextSibling) {
          if (nextSibling instanceof HTMLDivElement && nextSibling.innerText.length > 0) {
            break;
          }
          nextSibling = nextSibling.nextElementSibling;
        }

        if (nextSibling) {
          sendToServiceWork(
            {
              type: _event.type,
              custom: 'click',
              tagName: 'SVG',
              label: nextSibling.innerText === '' ? 'icon' : nextSibling.innerText ,
              textContent: nextSibling.textContent ?? nextSibling.innerText,
              interactionContext: JSON.stringify({
                type: _target.tagName,
                source: 'sibling',
                name: nextSibling.textContent,
                value: nextSibling.innerText,
                inner_text: nextSibling.innerText
              }),
              xpath: getXPath(_target),
              eventSource: 'MOUSE',
              width: window.innerWidth,
              height: window.innerHeight,
              clientX: _event.clientX,
              clientY: _event.clientY,
            },
            enableCapture,
          );
          return;
        } else {
          sendToServiceWork(
            {
              type: _event.type,
              custom: 'click',
              tagName: 'SVG',
              label: parent.textContent?? 'icon',
              textContent: parent.textContent ?? parent.innerText,
              interactionContext: JSON.stringify({
                type: _target.tagName,
                source: 'parent0',
                name: parent.textContent,
                value: parent.innerText,
                inner_text: parent.innerText
              }),
              xpath: getXPath(_target),
              eventSource: 'MOUSE',
              width: window.innerWidth,
              height: window.innerHeight,
              clientX: _event.clientX,
              clientY: _event.clientY,
            },
            enableCapture,
          );
        }
      } else {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: 'SVG',
            label: 'icon',
            textContent: '',
            interactionContext: JSON.stringify({
              type: _target.tagName,
              source: 'none',
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
      }

    } else if (_target instanceof HTMLDivElement) {
      let label = _target.textContent ? _target.textContent.trim() : 'here';
      if (label.length > 150) {
        label = label.slice(0, 150) + '...';
      }
      if (label === '') {
        label = 'here';
      }
      if (_target.innerText.length > 0 || _target.textContent) {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'click',
            tagName: _target.tagName,
            label: label,
            textContent: _target.textContent?? _target.innerText,
            interactionContext: JSON.stringify({
              name: _target.textContent,
              inner_text: _target.innerText
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
        return;
      }
      else {
        const parent = getParentDiv(_target);

        if (parent && parent.innerText.length > 0) {
          sendToServiceWork(
            {
              type: _event.type,
              custom: 'click',
              tagName: _target.tagName,
              label: label,
              textContent: _target.innerText,
              interactionContext: JSON.stringify({
                source: 'parent',
                name: parent.textContent,
                value: parent.innerText,
                inner_text: parent.innerText
              }),
              xpath: getXPath(_target),
              eventSource: 'MOUSE',
              width: window.innerWidth,
              height: window.innerHeight,
              clientX: _event.clientX,
              clientY: _event.clientY,
            },
            enableCapture
          );
          return;
        }
      }
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: label,
          textContent: label,
          interactionContext: JSON.stringify({
            source: 'origin',
            name: _target.textContent,
            value: _target.innerText,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLElement) {
      let label = _target.textContent ? _target.textContent.trim() : 'here';
      if (label.length > 150) {
        label = label.slice(0, 150) + '...';
      }
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'click',
          tagName: _target.tagName,
          label: label,
          textContent: _target.textContent?? _target.innerText,
          interactionContext: JSON.stringify({
            name: _target.textContent,
            value: _target.innerText,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    }
  });

  doc.addEventListener("submit", (event: SubmitEvent) => {
    const _event = event as SubmitEvent;
    const submitter = _event.submitter;
    if (submitter instanceof HTMLInputElement ) {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'submit',
          tagName: submitter.tagName,
          label: submitter.value,
          textContent: submitter.value,
          interactionContext: JSON.stringify({
            name: submitter.name,
            value: submitter.value,
          }),
          xpath: getXPath(submitter),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
        },
        enableCapture
      );
    }
  });

  doc.addEventListener("mouseover", (event: MouseEvent) => {
    const tags = getCustomsContainingNode(event.target as Element);
    if (tags.length) {
      tags.map(tag => {
        sendToServiceWork(
          {
            type: event.type,
            custom: 'hover',
            tagName: 'ADDTIONAL_KNOWLEDGE',
            label: 'addtional knowledge',
            textContent: (event.target as Node).textContent ?? '',
            interactionContext: (event.target as HTMLElement).innerText ?? (event.target as Node).nodeType ?? '',
            xpath: getXPath(event.target as HTMLElement),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: event.clientX,
            clientY: event.clientY,
          },
          enableCapture
        );
      })
    }
  });

  addEventListener("mousedown", (event) => {
    if (isMural()) {
      dragStartEvent = {
        type: event.type,
        custom: event.type,
        label: '',
        tagName: '',
        textContent: '',
        interactionContext: '',
        xpath: '',
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      dragStatus = 'start';
    }
  });

  addEventListener("mousemove", (event) => {
    if (isMural() && dragStatus === 'start') {
      dragStatus = 'ongoing';
    }
  });

  // addEventListener("mouseleave", (event) => {
  //   if (isMural() && dragStatus == 'ongoing') {
  //     if (
  //       Math.abs(event.clientX - dragStartEvent.clientX) > 10 ||
  //       Math.abs(event.clientY - dragStartEvent.clientY) > 10
  //     ) {
  //       sendToServiceWork(
  //         {
  //           type: event.type,
  //           custom: 'drop',
  //           label: '',
  //           tagName: '',
  //           textContent: '',
  //           interactionContext: '',
  //           xpath: '',
  //           eventSource: 'MOUSE',
  //           width: window.innerWidth,
  //           height: window.innerHeight,
  //           clientX: event.clientX,
  //           clientY: event.clientY,
  //         },
  //         enableCapture
  //       );
  //     }
  //     dragStatus = 'finish';
  //   }
  // });

  doc.addEventListener("mouseup", (event: MouseEvent) => {
    let tagName = '';
    let name = '';
    let xpath = '';
    if (event.target instanceof HTMLDivElement) {
      tagName = event.target.tagName;
      name = event.target.getAttribute('aria-label') ?? 'here';
      xpath = getXPath(event.target);
    }

    if (isMural() && dragStatus == 'ongoing') {
      if (
        Math.abs(event.clientX - dragStartEvent.clientX) > 10 ||
        Math.abs(event.clientY - dragStartEvent.clientY) > 10
      ) {
        sendToServiceWork(
          {
            type: event.type,
            custom: 'drop',
            label: name,
            tagName: tagName,
            textContent: '',
            interactionContext: '',
            xpath: xpath,
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: event.clientX,
            clientY: event.clientY,
          },
          enableCapture
        );
      }
      dragStatus = 'finish';
    }
    setTimeout(() => {
      const selection = document.getSelection();
      const _event = event as PointerEvent;

      if (selection && selection.toString().trim() !== '') {
        sendToServiceWork(
          {
            type: _event.type,
            custom: 'select',
            tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
            label: selection.toString(),
            textContent: selection.toString().trim(),
            interactionContext: JSON.stringify({
              value: selection.toString(),
            }),
            xpath: _event.target? getXPath(_event.target as Element) : '',
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            clientX: _event.clientX,
            clientY: _event.clientY,
          },
          enableCapture
        );
      }
    }, 10)

    // if (isSpreadsheet()) {
    //   setTimeout(() => {
    //     const _event = event;
    //     const positionInputBox = document.getElementById('t-name-box') as HTMLInputElement;
    //     const contentDivList = document.getElementsByClassName('cell-input');
    //     if (contentDivList && contentDivList[0]) {
    //       const innerText = (contentDivList[0] as HTMLDivElement).innerText;
    //       console.log("event<<<", positionInputBox.value, innerText.trim())

    //       chrome.runtime.sendMessage({
    //         messageType: 'TraceData',
    //         type: 'select',
    //         clientX: _event.clientX,
    //         clientY: _event.clientY,
    //         tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
    //         textContent: innerText,
    //         interactionContext: JSON.stringify({
    //           value: innerText,
    //         }),
    //         xpath: _event.target? getXPath(_event.target as Element) : '',
    //         eventSource: 'MOUSE',
    //         width: window.innerWidth,
    //         height: window.innerHeight,
    //         enableCapture: enableCapture,
    //       });
    //     }
    //   }, 100)
    // }
  });

  doc.addEventListener("contextmenu", (event: MouseEvent) => {
    const _event = event;
    const _target = _event.target as Element;
    sendToServiceWork(
      {
        type: _event.type,
        custom: 'right click',
        tagName: _target.tagName,
        label: 'the page',
        textContent: _target.tagName,
        interactionContext: '',
        xpath: _target ? getXPath(_target): '',
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        clientX: _event.clientX,
        clientY: _event.clientY,
      },
      enableCapture
    )
  })

  // addEventListener("drag", (event: DragEvent) => {
  //   console.log("drag", event)
  // });

  doc.addEventListener("drop", (event: DragEvent) => {
    const _event = event;
    const _target = event.target;
    if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'drop',
          label: '',
          tagName: 'INPUT',
          textContent: _target.value,
          interactionContext: JSON.stringify({
            type: _target.type,
            name: name,
            value: _target.value,
            inner_text: _target.innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLDivElement) {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'drop',
          label: '',
          tagName: _target.tagName,
          textContent: _target.textContent ?? _target.innerText,
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
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    } else {
      sendToServiceWork(
        {
          type: _event.type,
          custom: 'drop',
          label: '',
          tagName: (_event.target as Element).tagName ?? (_event.target as Node).nodeName ?? '',
          textContent: (_event.target as Text).data ?? (_event.target as Element).outerHTML ?? '',
          interactionContext: '',
          xpath: _event.target? getXPath(_event.target as Element) : '',
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          clientX: _event.clientX,
          clientY: _event.clientY,
        },
        enableCapture
      );
    }
  });

  doc.addEventListener("scroll", throttle((event: Event) => {
    sendToServiceWork(
      {
        type: event.type,
        custom: 'scroll',
        tagName: 'Window',
        xpath: '',
        interactionContext: JSON.stringify({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          timeStamp:event.timeStamp,
        }),
        label: '',
        textContent: '',
        eventSource: 'MOUSE',
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      enableCapture,
    );
  }, 500)
);

  doc.addEventListener('change', (event) => {
    const _target = event.target;
    if (_target instanceof HTMLInputElement) {
      let name = _target.name;
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      if (_target.type == 'checkbox') {
        sendToServiceWork(
          {
            type: event.type,
            custom: 'type',
            tagName: 'INPUT',
            label: name,
            textContent: name,
            interactionContext: JSON.stringify({
              type: _target.type,
              name: name,
              value: _target.checked
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            display: true,
          },
          enableCapture
        );
      }
      else {
        sendToServiceWork(
          {
            type: event.type,
            custom: 'type',
            tagName: 'INPUT',
            label: _target.value,
            textContent: _target.value,
            interactionContext: JSON.stringify({
              type: _target.type,
              name: name,
              value: _target.value
            }),
            xpath: getXPath(_target),
            eventSource: 'MOUSE',
            width: window.innerWidth,
            height: window.innerHeight,
            display: true,
          },
          enableCapture
        );
      }
    } else if (_target instanceof HTMLSelectElement) {
      sendToServiceWork(
        {
          type: event.type,
          custom: 'type',
          tagName: 'SELECT',
          label: _target.options[_target.selectedIndex].innerText,
          textContent: _target.value,
          interactionContext: JSON.stringify({
            type: _target.type,
            name: _target.labels[0].innerText,
            value: _target.options[_target.selectedIndex].innerText
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          display: true,
        },
        enableCapture
      );
    } else if (_target instanceof HTMLTextAreaElement) {
      let name = 'Textarea';
      let value = _target.value;
      if (_target.labels && _target.labels[0]) {
        name = _target.labels[0].innerText;
      }
      sendToServiceWork(
        {
          type: event.type,
          custom: 'type',
          tagName: 'TEXTAREA',
          label: value,
          textContent: value,
          interactionContext: JSON.stringify({
            type: _target.type,
            name: name,
            value: value
          }),
          xpath: getXPath(_target),
          eventSource: 'MOUSE',
          width: window.innerWidth,
          height: window.innerHeight,
          display: true,
        },
        enableCapture
      );
    }
  });

  doc.addEventListener("keydown", (event: KeyboardEvent) => {
    const _event = event;
    let value = '';
    let name = '';
    let tagName = '';

    if (_event.target instanceof HTMLInputElement) {
      value = _event.target.value;
      name = _event.target.name;
      tagName = _event.target.tagName;
    } else if (_event.target instanceof HTMLTextAreaElement) {
      value = _event.target.innerText;
      tagName = _event.target.tagName;
    } else if (_event.target instanceof HTMLDivElement){
      value = _event.target.innerText;
      tagName = _event.target.tagName;
    } else {
      name = (_event.target as HTMLElement).nodeName;
      value = (_event.target as HTMLElement).innerText;
      tagName = name;
    }

    const keyTrace = {
      type: event.type,
      custom: 'undefined',
      tagName: tagName,
      label: _event.key,
      textContent: _event.key,
      interactionContext: JSON.stringify({
        code: _event.code,
        key: _event.key,
        name: name,
        value: value,
        ctrlKey: _event.ctrlKey,
        altKey: _event.altKey,
        metaKey: _event.metaKey,
        shiftKey: _event.shiftKey,
      }),
      xpath: _event.target ? getXPath(_event.target as Element) : '',
      eventSource: 'KEYBOARD',
      width: window.innerWidth,
      height: window.innerHeight,
      code: _event.code,
      key: _event.key,
      ctrlKey: _event.ctrlKey,
      altKey: _event.altKey,
      metaKey: _event.metaKey,
      shiftKey: _event.shiftKey,
    }

    let interrupted = false;
    let display = true;

    if (keyTrace.altKey || keyTrace.ctrlKey || keyTrace.metaKey || keyTrace.shiftKey) {
      if (
        keyTrace.shiftKey &&
        !keyTrace.altKey &&
        !keyTrace.ctrlKey &&
        !keyTrace.metaKey
      ) {
        // Shift pressed only
        if (keyTrace.key.length > 1) {
          if (keyTrace.key === 'Shift') {
            interrupted = false;
            display = false;
            keyTrace.label = '`Shift`';
            keyTrace.textContent = keyTrace.label;
          } else {
            interrupted = true;
            display = true;
            keyTrace.label = '`Shift` + `' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          }
        } else {
          interrupted = false;
          display = true;
          keyTrace.label = keyTrace.key;
          keyTrace.textContent = keyTrace.label;
        }
      } else {
        let modifierKey = '';
        let modifierKeysNum = 0;
        if (keyTrace.altKey) {
          modifierKey = '`Alt` + ';
          modifierKeysNum += 1;
        }
        if (keyTrace.ctrlKey) {
          modifierKey += '`Ctrl` + ';
          modifierKeysNum += 1;
        }
        if (keyTrace.metaKey) {
          modifierKey += '`Meta` + ';
          modifierKeysNum += 1;
        }
        if (keyTrace.shiftKey) {
          modifierKey += '`Shift` + ';
          modifierKeysNum += 1;
        }

        if (keyTrace.key.length > 1) {
          // e.g., Modifier keys only. Ctrl/Shift/Ctrl + Shift /Ctrl + Alt/Ctrl + Shift + Alt...
          if (keyTrace.key === 'Control' || keyTrace.key === 'Alt' || keyTrace.key === 'Meta' || keyTrace.key === 'Shift') {
            if (modifierKeysNum > 1) {
              interrupted = true;
              display = false;
              keyTrace.label = modifierKey.slice(0, -2);
              keyTrace.textContent = keyTrace.label;
            } else {
              // e.g., One modifier key only. Ctrl/Alt/Meta
              interrupted = false;
              display = false;
              keyTrace.label = modifierKey.slice(0, -2);
              keyTrace.textContent = keyTrace.label;
            }
          } else {
            // e.g., Ctrl + Home/ Ctrl + PageDown
            interrupted = true;
            display = true;
            keyTrace.label = modifierKey + '`' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          }
        } else {
          //e.g., Ctrl + c / Ctrl + v
          interrupted = true;
          display = true;
          keyTrace.label = modifierKey + keyTrace.key;
          keyTrace.textContent = keyTrace.label;
          const selection = document.getSelection()?? '';
          const textContent = selection.toString();
          if (
            textContent !== '' &&
            (keyTrace.ctrlKey || keyTrace.metaKey)
          ) {
            const keyPress = keyTrace.key.toLowerCase();
            if (keyPress === 'c') {
              keyTrace.custom = 'copy';
              keyTrace.label = textContent;
              keyTrace.textContent = textContent;
            } else if (keyPress === 'v') {
              keyTrace.custom = 'paste';
            }
          }
        }
      }
    } else {
      if (keyTrace.key.length > 1) {
        if (
          keyTrace.key === 'Backspace' ||
          // keyTrace.key === 'Space' ||
          keyTrace.key === 'Delete'
        ) {
          interrupted = false;
          display = true;
          keyTrace.label = '`' + keyTrace.key + '`';
          keyTrace.textContent = keyTrace.label;

        } else if (keyTrace.key === 'Tab') {
          if (isSpreadsheet() || keyTrace.tagName !== 'TEXTAREA') {
            interrupted = true;
            display = false;
            keyTrace.label = '`' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          } else {
            interrupted = false;
            display = true;
            keyTrace.label = '`' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          }
        } else if (keyTrace.key === 'Enter') {
          if (isSpreadsheet() || isGoogleDoc(keyTrace) || keyTrace.tagName !== 'TEXTAREA') {
            interrupted = true;
            display = false;
            keyTrace.label = '`' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          } else {
            interrupted = false;
            display = true;
            keyTrace.label = '`' + keyTrace.key + '`';
            keyTrace.textContent = keyTrace.label;
          }
        } else if (keyTrace.key === 'CapsLock') {
          interrupted = false;
          display = false;
          keyTrace.label = '`' + keyTrace.key + '`';
          keyTrace.textContent = keyTrace.label;
        } else {
          interrupted = true;
          display = true;
          keyTrace.label = '`' + keyTrace.key + '`';
          keyTrace.textContent = keyTrace.label;
        }
      } else {
        interrupted = false;
        display = true;
        keyTrace.label = keyTrace.key;
        keyTrace.textContent = keyTrace.label;
      }
    }

    const trace = {
      ...keyTrace,
      custom: interrupted ? (keyTrace.custom === 'undefined' ? 'type' : keyTrace.custom) : _event.type,
      display: display,
    }

    sendToServiceWork(
      trace,
      enableCapture
    );
  });

  doc.addEventListener("beforeunload", (event: BeforeUnloadEvent) => {
    sendToServiceWork(
      {
        type: event.type,
        custom: 'close',
        tagName: 'CLOSE',
        label: '',
        textContent: '',
        interactionContext: '',
        xpath: '',
        eventSource: 'RESOURCE PAGE',
        width: window.innerWidth,
        height: window.innerHeight,
      },
      enableCapture,
    );
  })

  document.addEventListener('cut', (event: ClipboardEvent) => {
    const selection = document.getSelection()?? '';
    const text = selection.toString();
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      let trace = {
        type: event.type,
        custom: 'cut',
        tagName: target.tagName,
        label: text,
        textContent: text,
        interactionContext: '',
        xpath: getXPath(target),
        eventSource: 'RESOURCE PAGE',
        width: window.innerWidth,
        height: window.innerHeight,
      };

      sendToServiceWork(
        trace,
        enableCapture
      );

    }
  });

  document.addEventListener('copy', (event: ClipboardEvent) => {
    const selection = document.getSelection()?? '';
    const text = selection.toString();
    const target = event.target as Element | null;
    let trace = {
      type: event.type,
      custom: 'copy',
      tagName: '',
      label: text,
      textContent: text,
      interactionContext: '',
      xpath: '',
      eventSource: 'RESOURCE PAGE',
      width: window.innerWidth,
      height: window.innerHeight,
    };

    if (target) {
      trace.tagName = target.tagName;
      trace.xpath = getXPath(target);
    }

    sendToServiceWork(
      trace,
      enableCapture
    );
  });

  doc.addEventListener('paste', async (event: ClipboardEvent) => {
    try {
      const text = await navigator.clipboard.readText();
      const target = event.target as Element | null;
      let trace = {
        type: event.type,
        custom: 'paste',
        tagName: '',
        label: text,
        textContent: text,
        interactionContext: '',
        xpath: '',
        eventSource: 'RESOURCE PAGE',
        width: window.innerWidth,
        height: window.innerHeight,
      };

      if (target) {
        trace.tagName = target.tagName;
        trace.xpath = getXPath(target);
      }

      sendToServiceWork(
        trace,
        enableCapture
      );

    } catch (err) {
      console.error("Failed to read clipboard content:", err);
    }
  });
}

// Add listeners to the main document
addEventListeners(document);

let content: null | ContentService = null;
const init = async() => {
  if (!content) {
    content = new ContentService();
    content.connect();
  }
}

const release = async() => {
  if (content) {
    content.destroy();
    content = null;
  }
}


// receive from background service
chrome.runtime.onMessage.addListener(async (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) => {
  switch (message.messageType) {
    case 'TraceData':
      if (content) {
        if (typeof message.url === 'undefined' || message.url === '') {
          message.url = window.location.href;
        }
        content.forwardMessage(message);
      }
      break;
    case 'CmdData':
      if (message.event === 'chrome.action.onClicked' && message.value) {
        init();
      }
      if (message.event === 'chrome.action.onClicked' && !message.value) {
        release();
      }
      break;
  }
})

init();
