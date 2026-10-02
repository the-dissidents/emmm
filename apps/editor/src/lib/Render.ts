import * as emmm from '@the_dissidents/libemmm';
import * as sass from 'sass';
import { CustomHTMLRenderer } from './emmm/Custom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getSassVariablesFromColors, type ArticleColors } from './ColorTheme';
import { join } from '@tauri-apps/api/path';
import { Workspace } from './workspace/Workspace.svelte';

type DocumentStyle = {
    sass: string,
    colors: ArticleColors,
    backgroundImage: string,
}

async function transformAsset(url: string) {
    if (url.startsWith('file:'))
        return { transformed: convertFileSrc(url.substring('file:'.length)), original: url};

    if (url.startsWith('http:') || url.startsWith('https:') || !Workspace.assetPath)
        return undefined;

    const joined = await join(Workspace.assetPath, url);
    return { transformed: convertFileSrc(joined), original: 'file:' + joined };
}

export async function compileStyles(style: DocumentStyle): Promise<string | sass.Exception> {
    const vars = getSassVariablesFromColors(style.colors);
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
