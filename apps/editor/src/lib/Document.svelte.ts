import * as emmm from '@the_dissidents/libemmm';
import * as sass from 'sass';
import { CustomHTMLRenderer } from './emmm/Custom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getSassVariablesFromColors, type ArticleColors } from './ColorTheme';

type DocumentStyle = {
    sass: string,
    colors: ArticleColors,
    backgroundImage: string,
}

function transformAsset(url: string) {
    if (!url.startsWith('file:')) return undefined;
    return convertFileSrc(url.substring(5));
}

export function compileStyles(style: DocumentStyle): string | sass.Exception {
    const vars = getSassVariablesFromColors(style.colors);
    const backgroundImage = style.backgroundImage
        ? new sass.SassString(
            transformAsset(style.backgroundImage) ?? style.backgroundImage, { quotes: true })
        : sass.sassNull;
    console.log(vars);
    try {
        const css = sass.compileString(style.sass, { functions: {
            'param($key)': (args) => {
                const key = args[0].assertString('key').text;
                console.log(key, vars.get(key));
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
    const css = compileStyles(style);
    if (typeof css !== 'string') return { type: 'error' as const, sass: css };

    const state = new emmm.HTMLRenderState();
    state.stylesheet = css;

    const renderConfig = emmm.RenderConfiguration.from(CustomHTMLRenderer);
    renderConfig.options.transformAsset = transformAsset;
    const doc = await renderConfig.render(d, state);
    return { type: 'ok' as const, doc, map: state.sourceMap };
}
