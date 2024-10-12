/**
 * This module defines the events that are sent between frames with different
 * roles in the client (extension, sidebar).
 */

/**
 * Events that the extension sends to the sidebar
 */
export type ExtensionToSidebarEvent =
  /**
   * The guest is asking the sidebar to create an annotation.
   */
  | 'traceData'

  /**
   * The guest is asking the sidebar to relay the message to the host to close the sidebar.
   */
  | 'cmdData';

/**
 * Events that the sidebar sends to the extension
 */
export type SidebarToExtensionEvent =
  /**
   * The sidebar informs the extension of recording status.
   */
  | 'recording';
