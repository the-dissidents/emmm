import { plugins } from '../Settings';
import { articleMetadata, field, historyEnabled } from './Fields';
import { getHistory, importedFooter, renderHistory } from './History';

/** One preview hook; disabled plugins return the original document without a mutation or request. */
export async function extendWeixinPreview(doc: Document, source: string) {
    const enabled = { ...plugins.get() };
    if (!enabled.history || !historyEnabled(source)) return;
    const meta = articleMetadata(source, doc);
    if (enabled.history) {
        const spec = field(source, 'wx-history'), file = field(source, 'wx-history-html');
        if (!spec && !file) return;
        try {
            const textColor = field(source, 'wx-history-text-color');
            const footer = file ? await importedFooter(file, undefined, textColor)
                : renderHistory(await getHistory(spec!, meta.title), undefined, textColor);
            // Use the same content container so custom article margins and backgrounds apply to the footer.
            (doc.querySelector('section.article-body') ?? doc.body).append(doc.importNode(footer, true));
        } catch (error) {
            const notice = doc.createElement('section'); notice.dataset.emmmPreviewOnly = '';
            notice.dataset.weixinPluginError = ''; notice.textContent = `往期回顾：${error}`;
            (doc.querySelector('section.article-body') ?? doc.body).append(notice);
        }
    }
}
