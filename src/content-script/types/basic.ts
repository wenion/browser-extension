export type TraceMeta = {
  type: string,
  custom: string,
  tagName: string,
  label: string,
  textContent: string,
  interactionContext: string,
  xpath: string,
  eventSource: string,
  width: number,
  height: number,
};

export type ClickTraceMeta = {
  clientX: number,
  clientY: number,
} & TraceMeta;

export type KeyTraceMeta = {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  display: boolean;
} & TraceMeta;

export type ScrollTraceMeta = {
  scrollX: number;
  scrollY: number;
} & TraceMeta;

export type ChangeTraceMetaMeta = {
  display: boolean;
} & TraceMeta;

export type Trace = TraceMeta & {
  messageType: string,
  url: string,
  tabId: string,
  windowId: string,
  timestamp: number,
  image: string,
};

export type CustomMeta = {
  type: string,
  custom: string,
};
