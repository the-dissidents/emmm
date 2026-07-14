function isHTMLElement(el: Node): el is HTMLElement {
    const HTMLElement = el.ownerDocument?.defaultView?.HTMLElement;
    return !!el && !!HTMLElement && el instanceof HTMLElement;
}

export function findBoundingRect(element: HTMLElement): DOMRect | null {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return rect;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let foundVisibleChild = false;
    for (const child of element.children) {
        if (isHTMLElement(child)) {
            const rect = findBoundingRect(child);
            if (rect && (rect.width > 0 || rect.height > 0)) {
                minX = Math.min(minX, rect.left);
                minY = Math.min(minY, rect.top);
                maxX = Math.max(maxX, rect.right);
                maxY = Math.max(maxY, rect.bottom);
                foundVisibleChild = true;
            }
        }
    }

    // If no visible children with dimensions were found, return a zero rect.
    if (!foundVisibleChild) {
        return null;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return new DOMRect(minX, minY, width, height);
}
