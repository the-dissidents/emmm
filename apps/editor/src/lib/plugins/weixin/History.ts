import template from './HistoryTemplate.html?raw';
import { WeixinClient, WeixinAPIError } from '$lib/integration/weixin/API.svelte';
import { weixinFetch } from './Network';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { Memorized } from '$lib/config/Memorized.svelte';
import * as z from 'zod/v4-mini';
import { styleHistory } from './FooterStyle';
export { styleHistory, finalizeWeixinFooterColors, syncWeixinFooterHeadingColors } from './FooterStyle';

const accountName = Memorized.$('weixin-account-name', z.string(), 'default');
export type HistoryCard = { title: string, url: string, image: string };
export type HistoryResult = { cards: HistoryCard[], tailImages?: string[] };
const cache = new Map<string, Promise<HistoryResult>>();

export function articleURL(value: string): string {
    const url = new URL(value.trim());
    if (url.protocol === 'http:' && url.hostname === 'mp.weixin.qq.com') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com'
        || url.port && url.port !== '443' || url.username || url.password
        || url.pathname !== '/s' && !url.pathname.startsWith('/s/')) throw new Error('请输入公众号文章链接');
    url.hash = '';
    return url.href;
}
export function imageURL(value: string): string {
    const url = new URL(value, 'https://mp.weixin.qq.com');
    if (url.protocol === 'http:' && url.hostname.endsWith('.qpic.cn')) url.protocol = 'https:';
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.qpic.cn') || url.username || url.password)
        throw new Error('文章图片地址无效');
    return url.href;
}

/** Same extraction rule as the user's footer script: latest issue plus its first two recommendations. */
export function extractLinkedHistory(html: string, submitted: string): HistoryResult {
    const url = articleURL(submitted);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const content = doc.querySelector('#js_content, .rich_media_content');
    if (!content) throw new Error('未读到文章正文，请导入往期工具生成的 HTML');
    const title = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || doc.querySelector('#activity-name')?.textContent || '').trim();
    const cover = imageURL(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '');
    if (!title) throw new Error('未读到文章标题');
    const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let marker: Node | null = null;
    while (walker.nextNode()) if (walker.currentNode.textContent?.includes('往期推荐')) { marker = walker.currentNode; break; }
    const seen = new Set([url]), cards: HistoryCard[] = [{ title, url, image: cover }];
    for (const anchor of content.querySelectorAll<HTMLAnchorElement>('a[linktype="image"][href]')) {
        if (marker && !(marker.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        try {
            const nextURL = articleURL(anchor.href);
            if (seen.has(nextURL)) continue;
            const root = anchor.parentElement?.parentElement;
            const title = [...root?.querySelectorAll('p') || []].map(p => p.textContent).join(' ').trim();
            const img = anchor.querySelector('img');
            if (!title || !img) continue;
            cards.push({ title, url: nextURL, image: imageURL(img.getAttribute('data-src') || img.src) });
            seen.add(nextURL);
            if (cards.length === 3) break;
        } catch { /* Ignore unrelated links. */ }
    }
    if (cards.length < 3) throw new Error('文末没有两条完整的往期推荐');
    const expected = [0.1490566, 0.0472222, 0.1318786];
    const tail = [...content.querySelectorAll<HTMLImageElement>('img')].slice(-3);
    const tailImages = tail.length === 3 && tail.every((img, i) => Math.abs(Number(img.dataset.ratio) - expected[i]) < 0.012)
        ? tail.map(img => imageURL(img.getAttribute('data-src') || img.src)) : undefined;
    return { cards, tailImages };
}

/** Only news_item[0] counts. A picture-only headline never promotes the second article. */
export function publicationHeadlines(items: any[], excludedTitle = ''): HistoryCard[] {
    const result: HistoryCard[] = [], seen = new Set<string>();
    for (const publication of items) {
        const first = publication.content?.news_item?.[0];
        if (!first || first.is_deleted || first.is_ban || first.article_type && first.article_type !== 'news'
            || !first.title || first.title === excludedTitle || !first.url || !first.thumb_url) continue;
        try {
            const url = articleURL(first.url);
            if (seen.has(url)) continue;
            result.push({ title: first.title, url, image: imageURL(first.thumb_url) });
            seen.add(url);
        } catch { /* Skip deleted or malformed publications. */ }
    }
    return result;
}

export async function getHistory(spec: string, excludedTitle = '', force = false, visible = false): Promise<HistoryResult> {
    const key = `${accountName.get()}\0${spec}\0${excludedTitle}`;
    if (force) cache.delete(key);
    if (!cache.has(key)) {
        const pending = (async () => {
            if (!spec.startsWith('api:')) {
                const url = articleURL(spec);
                const response = await weixinFetch(url, { headers: {
                    'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html',
                }, maxRedirections: 0, signal: AbortSignal.timeout(20000) });
                if (!response.ok) {
                    if ([301, 302, 303, 307, 308, 403].includes(response.status))
                        return extractLinkedHistory(await invoke<string>('read_weixin_history_article', {url, visible}), url);
                    throw new Error(`读取文章失败 (${response.status})`);
                }
                const html = await response.text();
                if (html.includes('id="js_content"') || html.includes("id='js_content'")) return extractLinkedHistory(html, url);
                return extractLinkedHistory(await invoke<string>('read_weixin_history_article', {url, visible}), url);
            }
            const count = Number(spec.slice(4));
            if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('往期数量须为 1–10');
            const client = new WeixinClient(accountName.get());
            await client.fetchToken();
            const cards: HistoryCard[] = [];
            for (let offset = 0; offset < 200 && cards.length < count; offset += 20) {
                let page;
                try { page = await client.execute('freepublish/batchget', { offset, count: 20, no_content: 0 }); }
                catch (error) {
                    if (error instanceof WeixinAPIError && error.code === 48001)
                        throw new Error('此公众号未开放已发布列表接口，请使用文章链接');
                    throw error;
                }
                cards.push(...publicationHeadlines(page.item || [], excludedTitle));
                if (offset + (page.item?.length || 0) >= page.total_count || !page.item?.length) break;
            }
            const unique = cards.filter((card, i) => cards.findIndex(item => item.url === card.url) === i).slice(0, count);
            if (!unique.length) throw new Error('没有可用的图文头条');
            return { cards: unique };
        })();
        cache.set(key, pending);
        pending.catch(() => cache.delete(key));
    }
    return cache.get(key)!;
}

export function sanitizeFooter(html: string): HTMLElement {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,form,input,button,link,meta,style').forEach(node => node.remove());
    for (const node of doc.body.querySelectorAll('*')) {
        for (const attr of [...node.attributes])
            if (/^on/i.test(attr.name) || ['srcdoc', 'formaction', 'crossorigin'].includes(attr.name)) node.removeAttribute(attr.name);
        if (node instanceof HTMLAnchorElement) {
            try { node.href = articleURL(node.href); } catch { node.removeAttribute('href'); }
        }
        if (node instanceof HTMLImageElement) {
            try { node.src = imageURL(node.getAttribute('data-src') || node.src); }
            catch { node.remove(); }
        }
    }
    const wrapper = document.createElement('section');
    wrapper.dataset.weixinHistory = '';
    wrapper.append(...doc.body.childNodes);
    return wrapper;
}

export function renderHistory(result: HistoryResult, color = '#28428c', textColor?: string): HTMLElement {
    const parsed = new DOMParser().parseFromString(template, 'text/html');
    const wrapper = document.createElement('section');
    wrapper.append(...parsed.body.childNodes);
    const anchors = [...wrapper.querySelectorAll<HTMLAnchorElement>('a[linktype="image"]')];
    const prototypes = anchors.map(anchor => anchor.parentElement!.parentElement!.parentElement!.parentElement!);
    const first = prototypes[0];
    const parent = first.parentElement!;
    for (const card of result.cards) {
        const row = first.cloneNode(true) as HTMLElement;
        const anchor = row.querySelector<HTMLAnchorElement>('a')!;
        anchor.href = articleURL(card.url); anchor.title = anchor.href;
        anchor.setAttribute('formlinkparm', JSON.stringify([{href: anchor.href}]));
        row.querySelector<HTMLImageElement>('img')!.src = imageURL(card.image);
        const caption = anchor.parentElement!.nextElementSibling?.querySelector('p');
        if (caption) caption.textContent = card.title;
        parent.insertBefore(row, first);
    }
    prototypes.forEach(row => row.remove());
    if (result.tailImages?.length === 3)
        [...wrapper.querySelectorAll<HTMLImageElement>('img')].slice(-3).forEach((img, i) => img.src = imageURL(result.tailImages![i]));
    return styleHistory(sanitizeFooter(wrapper.innerHTML), color, textColor);
}

export async function importedFooter(file: string, headingColor?: string, textColor?: string) {
    const path = file.startsWith('file:') ? decodeURIComponent(new URL(file).pathname) : file;
    return styleHistory(sanitizeFooter(await readTextFile(path)), headingColor, textColor);
}
