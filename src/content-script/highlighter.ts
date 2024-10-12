type HighlightProps = {
  // Associated SVG rect drawn to represent this highlight (in PDFs)
  svgHighlight?: SVGRectElement;
};

type HighlightElement = HTMLElement & HighlightProps;

export function getCustomsContainingNode(node: Node): HighlightElement[] {
  let el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  const highlights = [];

  while (el) {
    if (
      el.classList.contains('hypothesis-highlight') &&
      el.classList.contains('custom-content')
    ) {
      highlights.push(el);
    }
    el = el.parentElement;
  }

  return highlights as HighlightElement[];
}
