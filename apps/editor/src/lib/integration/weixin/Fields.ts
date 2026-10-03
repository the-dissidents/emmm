function escapeValue(value: string): string {
    return value
        .replace(/[\r\n]/g, ' ')
        .replace(/[\\\[\]|;$]/g, (char) => '\\' + char);
}

function fieldPattern(name: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^\\[-var ${escaped}=(.*)\\](?:\\r?\\n|$)`, 'gm');
}

export function field(source: string, name: string): string | undefined {
    const matches = [...source.matchAll(fieldPattern(name))];
    return matches.at(-1)?.[1].replace(/\\(.)/g, '$1').trim();
}

/** Touch metadata lines only, preserving the rest of the editor's history. */
export function fieldChanges(source: string, name: string, value?: string) {
    if (!name.startsWith('wx-')) throw new Error('Expected a Weixin variable');
    const matches = [...source.matchAll(fieldPattern(name))];
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const insert = value
        ? `[-var ${name}=${escapeValue(value)}]${newline}`
        : '';
    if (!matches.length) return insert ? [{ from: 0, to: 0, insert }] : [];
    return matches
        .map((match, index) => ({
            from: match.index,
            to: match.index + match[0].length,
            insert: index === 0 ? insert : '',
        }))
        .filter(
            (change) => source.slice(change.from, change.to) !== change.insert
        );
}

export function setField(source: string, name: string, value?: string) {
    for (const change of fieldChanges(source, name, value).reverse())
        source =
            source.slice(0, change.from) +
            change.insert +
            source.slice(change.to);
    return source;
}

export type Crop = [number, number, number, number];

export function defaultCrops(
    width: number,
    height: number
): { wide: Crop; square: Crop } {
    if (width <= 0 || height <= 0) throw new Error('Invalid cover image');
    const h = Math.min(height, width / 3.35);
    const y = (height - h) / (2 * height);
    return {
        wide: [0, y, (2.35 * h) / width, y + h / height],
        square: [1 - h / width, y, 1, y + h / height],
    };
}

export function articleMetadata(
    source: string,
    doc: Document,
    defaults?: {
        title?: string;
        author?: string;
        origin?: string;
    }
) {
    return {
        title:
            field(source, 'wx-title') ??
            defaults?.title ??
            doc.querySelector('header .title')?.textContent?.trim() ??
            '',
        author:
            field(source, 'wx-author') ??
            defaults?.author ??
            doc.querySelector('header .author')?.textContent?.trim() ??
            '',
        cover: field(source, 'wx-cover') ?? '',
        origin: field(source, 'wx-origin') ?? defaults?.origin ?? '',
    };
}
