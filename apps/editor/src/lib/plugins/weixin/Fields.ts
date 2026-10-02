// Plugin settings use the original built-in [-var] syntax. Older emmm parsers ignore unused variables safely.
function escapeValue(value: string): string {
    return value.replace(/[\r\n]/g, ' ').replace(/[\\\[\]|;$]/g, char => '\\' + char);
}
function unescapeValue(value: string): string { return value.replace(/\\(.)/g, '$1'); }

export function field(source: string, name: string): string | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (name.startsWith('wx-')) {
        const matches = [...source.matchAll(new RegExp(`^\\[-var ${escaped}=(.*)\\]\\r?$`, 'gm'))];
        return matches.length ? unescapeValue(matches.at(-1)![1]).trim() : undefined;
    }
    const matches = [...source.matchAll(new RegExp(`^\\[-${escaped}\\] ?(.*)$`, 'gm'))];
    return matches.at(-1)?.[1].trim();
}

export function setField(source: string, name: string, value: string): string {
    if (!name.startsWith('wx-')) throw new Error('Only plugin variables can be edited here');
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = `[-var ${name}=${escapeValue(value)}]`;
    const regex = new RegExp(`^\\[-var ${escaped}=.*\\](?:\\r?\\n|$)`, 'gm');
    if (regex.test(source)) {
        let replaced = false;
        return source.replace(regex, () => { if (replaced) return ''; replaced = true; return line + '\n'; });
    }
    return line + '\n' + source;
}

export type Crop = [number, number, number, number];
export function parseCrop(value: string | undefined): Crop | undefined {
    if (!value) return;
    const parts = value.split(',').map(Number);
    if (parts.length !== 4 || parts.some(x => !Number.isFinite(x) || x < 0 || x > 1)
        || parts[2] <= parts[0] || parts[3] <= parts[1]) return;
    return parts as Crop;
}

export function defaultCrops(width: number, height: number, dual = true): { wide: Crop, square: Crop } {
    if (width <= 0 || height <= 0) throw new Error('封面图片无效');
    if (dual) {
        const h = Math.min(height, width / 3.35);
        const y = (height - h) / 2 / height;
        return { wide: [0, y, 2.35 * h / width, y + h / height],
            square: [1 - h / width, y, 1, y + h / height] };
    }
    const rect = (ratio: number): Crop => {
        const h = Math.min(height, width / ratio), w = h * ratio;
        return [(width - w) / width / 2, (height - h) / height / 2,
            (width + w) / width / 2, (height + h) / height / 2];
    };
    return { wide: rect(2.35), square: rect(1) };
}

export function articleMetadata(source: string, doc: Document) {
    return {
        title: field(source, 'wx-title') ?? doc.querySelector('header .title')?.textContent?.trim() ?? field(source, 'title') ?? '',
        author: field(source, 'wx-author') ?? field(source, 'author') ?? '',
        cover: field(source, 'wx-cover') ?? field(source, 'cover-img') ?? '',
        dual: field(source, 'wx-cover-mode') !== 'single',
        origin: field(source, 'wx-origin') ?? '',
        wide: parseCrop(field(source, 'wx-crop-wide')),
        square: parseCrop(field(source, 'wx-crop-square')),
    };
}

export function historyEnabled(source: string): boolean {
    const enabled = field(source, 'wx-history-enabled');
    return enabled === undefined ? !!field(source, 'wx-history') || !!field(source, 'wx-history-html') : enabled === 'true';
}
