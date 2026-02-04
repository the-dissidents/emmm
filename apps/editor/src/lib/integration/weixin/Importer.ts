export function htmlToEmmm(htmlString: string): string {
  // 1. Parse string into a DOM tree
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 2. Recursive walker function
  function walk(node: Node): string {
    // Handle Text Nodes
    if (node.nodeType === Node.TEXT_NODE) {
      // Normalize whitespace: replace newlines/tabs with spaces, collapse multiple spaces
      const text = node.textContent
        ?.replaceAll(/\s+/g, ' ')
         .replaceAll(/[\\*`_]/g, (x) => `\\${x}`) || '';
      return text;
    }

    // Handle Element Nodes
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      // Recurse children first to build inner content
      let content = Array.from(element.childNodes)
        .map(walk)
        .join('');

      // --- Inline Formatting Logic ---

      // Check for bold (tags or inline styles)
      const isBold =
        ['b', 'strong'].includes(tagName) ||
        element.style.fontWeight === 'bold' ||
        parseInt(element.style.fontWeight || '0') >= 600;

      // Check for italic (tags or inline styles)
      const isItalic =
        ['i', 'em'].includes(tagName) ||
        element.style.fontStyle === 'italic';

      if (isBold) content = `*${content}*`;
      if (isItalic) content = `_${content}_`;

      // --- Block Level Logic ---

      switch (tagName) {
        // Headings (h1-h6)
        case 'h1': return `# ${content}\n\n`;
        case 'h2': return `## ${content}\n\n`;
        case 'h3': return `### ${content}\n\n`;
        case 'h4': return `#### ${content}\n\n`;
        case 'h5': return `##### ${content}\n\n`;
        case 'h6': return `###### ${content}\n\n`;

        // Paragraphs
        case 'p':
          // Heuristic: remove empty paragraphs or those containing only whitespace
          const trimmed = content.trim();
          if (!trimmed) return '';
          return `${trimmed}\n\n`;

        // Line breaks
        case 'br':
          return '\n';

        // Blockquotes (optional, but good for articles)
        case 'blockquote':
          return `> ${content.trim()}\n\n`;

        // Containers (div, section, span, article, etc.)
        // Pass content through without extra newlines, allowing children (like <p>)
        // to handle their own spacing.
        default:
          return content;
      }
    }

    return '';
  }

  // 3. Initiate walk from body
  return walk(doc.body).trim()
    .replaceAll(/\*\s*\*|_\s*_/g, '')
    .replaceAll(/[\u200B\u200E\u200F\u00AD\uFFFC\uFFFD]/g, '')
    .replaceAll(/（([\u0000-\u5000]+?)）/g, (_, a) => `[=${a}]`)
    .replaceAll(/（=?_([^（）\n]+?)_?,\s*(\d{4})_?）/g, (_, a, b) => `[|${a}|${b}]`)
    .replaceAll(/\[=?_([^（）\[\]\n]+?)_?,\s*(\d{4})_?\]/g, (_, a, b) => `[|${a}|${b}]`);
}
