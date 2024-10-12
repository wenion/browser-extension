// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


export function getXPath(node: Element) {
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
