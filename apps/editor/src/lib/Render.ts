import * as emmm from '@the_dissidents/libemmm';
import type * as sass from 'sass';
import { CustomHTMLRenderer } from './emmm/Custom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import mime from 'mime';
import { getSassVariablesFromColors, type ArticleColors } from './ColorTheme';
import { join } from '@tauri-apps/api/path';
import { Workspace } from './workspace/Workspace.svelte';

type DocumentStyle = {
    sass: string,
    colors: ArticleColors,
    backgroundImage: string,
}

function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function normalizeFileUrlPath(raw: string): string {
    return raw.replace(/^\/+([A-Za-z]:)/, '$1');
}

async function toPreviewUrl(localPath: string): Promise<string> {
    try {
        const bytes = await readFile(localPath);
        const mimeType = mime.getType(localPath) || 'application/octet-stream';
        return `data:${mimeType};base64,${uint8ToBase64(bytes)}`;
    } catch {
        return convertFileSrc(localPath.replace(/\\/g, '/'));
    }
}

async function transformAsset(url: string) {
    if (url.startsWith('file:')) {
        const localPath = normalizeFileUrlPath(url.substring('file:'.length));
        return { transformed: await toPreviewUrl(localPath), original: url };
    }

    if (
        url.startsWith('http:') ||
        url.startsWith('https:') ||
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        !Workspace.assetPath
    )
        return undefined;

    const id = url.startsWith('asset:') ? url.substring('asset:'.length) : url;
    const joined = await join(Workspace.assetPath, id);
    return { transformed: await toPreviewUrl(joined), original: 'file:' + joined };
}

export async function compileStyles(style: DocumentStyle): Promise<string | sass.Exception> {
    const sass = await import('sass');

    const vars = await getSassVariablesFromColors(style.colors);
    const backgroundImage = style.backgroundImage
        ? new sass.SassString(
            (await transformAsset(style.backgroundImage))?.transformed
                ?? style.backgroundImage, { quotes: true })
        : sass.sassNull;
    try {
        const css = sass.compileString(style.sass, { functions: {
            'param($key)': (args) => {
                const key = args[0].assertString('key').text;
                if (vars.has(key)) return vars.get(key)!;
                if (key == 'background-image') return backgroundImage;
                return sass.sassNull;
            }
        } });
        return css.css;
    } catch (e) {
        if (e instanceof sass.Exception)
            return e;
        throw e;
    }
}

export async function renderDocument(d: emmm.Document, style: DocumentStyle) {
    const css = await compileStyles(style);
    if (typeof css !== 'string') return { type: 'error' as const, sass: css };

    const state = new emmm.HTMLRenderState();
    state.stylesheet = css;

    const renderConfig = emmm.RenderConfiguration.from(CustomHTMLRenderer);
    renderConfig.options.transformAsset = transformAsset;
    const doc = await renderConfig.render(d, state);
    return { type: 'ok' as const, doc, map: state.sourceMap };
}
