import * as emmm from '@the_dissidents/libemmm';
import { getEmmmMetadata } from '$lib/emmm/Header';

/** Read the existing parsed [-digest] metadata, including expansions and multiline text. */
export async function getArticleDigest(parsed: emmm.Document): Promise<string> {
    const config = emmm.createHTMLRenderConfiguration(window);
    const renderer = new emmm.RenderContext(config, parsed, new emmm.HTMLRenderState());
    const metadata = await getEmmmMetadata(parsed.context, renderer);
    return metadata.digest?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
