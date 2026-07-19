import { Debug } from "$lib/Debug"
import { RustAPI } from "$lib/RustAPI"

const GENERIC_FAMILIES = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'math', 'fangsong',
    'inherit', 'initial', 'unset', 'revert',
]);

/** maps lowercased family names to ready-made `@font-face` rules */
const fontCssCache = new Map<string, string>();

function collectFontFamilies(root: HTMLElement): string[] {
    const families = new Map<string, string>();
    for (const elem of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
        const value = elem.style?.fontFamily
            || (elem.ownerDocument === document && elem.isConnected
                ? getComputedStyle(elem).fontFamily : '');
        if (!value) continue;
        for (const part of value.split(',')) {
            const family = part.trim().replace(/^["']|["']$/g, '').trim();
            if (!family || GENERIC_FAMILIES.has(family.toLowerCase())) continue;
            if (!families.has(family.toLowerCase()))
                families.set(family.toLowerCase(), family);
        }
    }
    return [...families.values()];
}

function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function fontFacesFor(families: string[]): Promise<string> {
    const missing = families.filter((x) => !fontCssCache.has(x.toLowerCase()));
    if (missing.length > 0) {
        const rules = new Map<string, string[]>(
            missing.map((x) => [x.toLowerCase(), []]));
        for (const font of await RustAPI.packFonts(missing)) {
            const url = await blobToDataURL(
                new Blob([font.data], { type: 'application/octet-stream' }));
            rules.get(font.family.toLowerCase())?.push(
                `@font-face{font-family:${JSON.stringify(font.family)};`
              + `font-weight:${font.weight};font-style:${font.style};`
              + `src:url("${url}")}`);
        }
        for (const [family, list] of rules) {
            if (list.length == 0)
                console.warn('no font data found for family:', family);
            fontCssCache.set(family, list.join('\n'));
        }
    }
    return families
        .map((x) => fontCssCache.get(x.toLowerCase()) ?? '')
        .filter((x) => x.length > 0)
        .join('\n');
}

async function svgToDataURL(svg: SVGElement): Promise<string> {
    await Promise.resolve();
    const uriComponent = new XMLSerializer().serializeToString(svg);
    const html = encodeURIComponent(uriComponent);
    return `data:image/svg+xml;charset=utf-8,${html}`;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      img.decode().then(() => {
        requestAnimationFrame(() => resolve(img))
      })
    }
    img.onerror = reject
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url
  });
}

export async function elementToImage(
    node: HTMLElement,
    width: number,
    height: number,
): Promise<HTMLImageElement> {
    const fontCss = await fontFacesFor(collectFontFamilies(node));

    const xmlns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(xmlns, 'svg')
    const foreignObject = document.createElementNS(xmlns, 'foreignObject')

    svg.setAttribute('width', `${width}`)
    svg.setAttribute('height', `${height}`)
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)

    foreignObject.setAttribute('width', '100%')
    foreignObject.setAttribute('height', '100%')
    foreignObject.setAttribute('x', '0')
    foreignObject.setAttribute('y', '0')
    foreignObject.setAttribute('externalResourcesRequired', 'true')

    if (fontCss) {
        const style = document.createElementNS(xmlns, 'style')
        style.textContent = fontCss
        svg.appendChild(style)
    }
    svg.appendChild(foreignObject)
    foreignObject.appendChild(node)
    return createImage(await svgToDataURL(svg))
}

export async function toCanvas(
    e: HTMLElement, width: number, height: number, scale = 1
) {
    const canvas = new OffscreenCanvas(width * scale, height * scale);
    const ctx = canvas.getContext('2d');
    Debug.assert(!!ctx);

    const i = await elementToImage(e, width, height);
    ctx.drawImage(i, 0, 0, width * scale, height * scale);
    return await canvas.convertToBlob();
}
