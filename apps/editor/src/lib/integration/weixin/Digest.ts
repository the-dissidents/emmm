import * as emmm from '@the_dissidents/libemmm';
import { getEmmmMetadata } from '$lib/emmm/Header';

export async function getArticleInfo(parsed: emmm.Document) {
    const config = emmm.createHTMLRenderConfiguration(window);
    const renderer = new emmm.RenderContext(
        config,
        parsed,
        new emmm.HTMLRenderState()
    );
    const metadata = await getEmmmMetadata(parsed.context, renderer);
    return {
        title: metadata.title?.textContent?.trim() ?? '',
        author: metadata.author ?? '',
        origin: metadata.originalUrl ?? '',
        digest: metadata.digest?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
}

export async function getArticleDigest(parsed: emmm.Document) {
    return (await getArticleInfo(parsed)).digest;
}
