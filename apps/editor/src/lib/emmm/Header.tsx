import { assert } from '$lib/Debug';
import * as emmm from '@the_dissidents/libemmm';

export const CATEGORIES = [
  'review',
  'interview',
  'translation',
  'feature',
  'essay',
  'roundtable',
  'editorial',
] as const;

export type Category = (typeof CATEGORIES)[number];

const header = Symbol();

declare module '@the_dissidents/libemmm' {
    export interface ParseContextStoreDefinitions {
        [header]?: {
            title?: emmm.ParagraphNode,
            subtitle?: emmm.ParagraphNode,
            digest?: emmm.ParagraphNode,

            originalTitle?: emmm.ParagraphNode,
            originalUrl?: string,
            coverUrl?: string,
            posterUrl?: string,
            author?: string,
            category?: Category,
            publishedDate?: Date,
            fields: [string, emmm.ParagraphNode][]
        };
    }
}

export type EmmmMetadata = {
    title?: DocumentFragment;
    subtitle?: DocumentFragment;
    digest?: DocumentFragment;
    originalTitle?: DocumentFragment;
    originalUrl?: string;
    coverUrl?: string;
    posterUrl?: string;
    author?: string;
    category?: Category;
    publishedDate?: Date;
    fields: (readonly [string, DocumentFragment])[];
    wordCount: number;
};

export async function getEmmmMetadata(
  cxt: emmm.ParseContext,
  r: emmm.RenderContext<emmm.HTMLRenderType>
): Promise<EmmmMetadata> {
  const h = cxt.get(header)!;
  return {
    title:         h.title         ? await r.state.render(h.title.content, r) : undefined,
    subtitle:      h.subtitle      ? await r.state.render(h.subtitle.content, r) : undefined,
    digest:        h.digest        ? await r.state.render(h.digest.content, r) : undefined,
    originalTitle: h.originalTitle ? await r.state.render(h.originalTitle.content, r) : undefined,
    originalUrl:   h.originalUrl,
    coverUrl:      h.coverUrl,
    posterUrl:     h.posterUrl,
    author:        h.author,
    category:      h.category,
    publishedDate: h.publishedDate,
    fields:        await Promise.all(h.fields
                    .map(async ([k, v]) => [k, await r.state.render(v.content, r)] as const)),
    wordCount:     countWords(r.parsedDocument)
  };
}

export function initHeader(cxt: emmm.ParseContext) {
    cxt.init(header, {
        fields: []
    });
}

export const basicFieldSystems = [
    emmm.helper.createParagraphWrapper('title',
        (c) => c.get(header)!.title,
        (c, v) => c.get(header)!.title = v),
    emmm.helper.createParagraphWrapper('subtitle',
        (c) => c.get(header)!.subtitle,
        (c, v) => c.get(header)!.subtitle = v),
    emmm.helper.createParagraphWrapper('digest',
        (c) => c.get(header)!.digest,
        (c, v) => c.get(header)!.digest = v),
    emmm.helper.createParagraphWrapper('orig-title',
        (c) => c.get(header)!.originalTitle,
        (c, v) => c.get(header)!.originalTitle = v),
    emmm.helper.createPlaintextWrapper('orig-url',
        (c) => c.get(header)!.originalUrl,
        (c, v) => c.get(header)!.originalUrl = v, emmm.ModifierSlotType.Preformatted),
    emmm.helper.createPlaintextWrapper('author',
        (c) => c.get(header)!.author,
        (c, v) => c.get(header)!.author = v),
    emmm.helper.createPlaintextWrapper('cover-img',
        (c) => c.get(header)!.coverUrl,
        (c, v) => c.get(header)!.coverUrl = v, emmm.ModifierSlotType.Preformatted),
    emmm.helper.createPlaintextWrapper('poster-img',
        (c) => c.get(header)!.posterUrl,
        (c, v) => c.get(header)!.posterUrl = v, emmm.ModifierSlotType.Preformatted),
];

export const publishedSystem = new emmm.SystemModifierDefinition(
    'published', emmm.ModifierSlotType.Normal,
{
  beforeProcessExpansion(node, cxt) {
    let { msgs } = emmm.helper.bindArgs(node, []);
    if (msgs) return msgs;

    const result = emmm.helper.onlyPermitPlaintextParagraph(node);
    if (typeof result !== 'string') return result;

    const h = cxt.get(header)!;

    let date: Date;
    const oldDate = result.match(/^\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s*$/);
    if (oldDate) {
      date = new Date(`${oldDate[1]}-${oldDate[2].padStart(2, '0')}-${oldDate[3].padStart(2, '0')}T12:00:00Z`);
    } else if (result.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)) {
      date = new Date(result);
    } else {
      return [
        new emmm.messages.InvalidArgumentMessage(node.location,
          'date should either be YYYY[-./]MM[-./]DD or in ISO format')
      ];
    }

    if (h.publishedDate)
      msgs = [new emmm.messages.OverwriteSpecialVariableMessage(
        node.head, 'published date', h.publishedDate.toDateString())];

    h.publishedDate = date;
    return msgs ?? [];
  }
});

export const categorySystem = new emmm.SystemModifierDefinition(
    'category', emmm.ModifierSlotType.Normal,
{
  beforeProcessExpansion(node, cxt) {
    let { msgs } = emmm.helper.bindArgs(node, []);
    if (msgs) return msgs;

    const result = emmm.helper.onlyPermitPlaintextParagraph(node);
    if (typeof result !== 'string') return result;

    const h = cxt.get(header)!;

    if (!CATEGORIES.includes(result as Category)) {
      return [
        new emmm.messages.InvalidArgumentMessage(node.location,
          `category must be one of: ${CATEGORIES.join(', ')}`)
      ];
    }

    if (h.category)
      msgs = [new emmm.messages.OverwriteSpecialVariableMessage(
        node.head, 'cateogry', h.category)];

    h.category = result as Category;
    return msgs ?? [];
  }
});

export const infoFieldSystem = new emmm.SystemModifierDefinition(
    'info-field', emmm.ModifierSlotType.Normal,
{
    // delayContentExpansion: true,
    beforeProcessExpansion(node, cxt) {
        let { msgs, args } = emmm.helper.bindArgs(node, ['key'], { trim: true });
        if (msgs) return msgs;
        msgs = emmm.helper.onlyPermitSingleBlock(node);
        if (msgs) return msgs;
        msgs = emmm.helper.onlyPermitSimpleParagraphs(node);
        if (msgs) return msgs;

        const key = args!.key;
        const data = cxt.get(header)!;
        const previous = data.fields.findIndex(([a, _]) => a == key);
        if (previous >= 0) {
            console.log(node.head);
            msgs = [new emmm.messages.OverwriteSpecialVariableMessage(
                node.head, key, "<...>")];
            data.fields.splice(previous, 1);
        }
        const content = emmm.cloneNode(node.content[0]);
        const stripped = emmm.stripNode(content)[0] as emmm.ParagraphNode;
        data.fields.push([key, stripped]);
        return msgs ?? [];
    },
});

export const endBlock = new emmm.BlockModifierDefinition(
    'the-end', emmm.ModifierSlotType.Normal,
{});

function countWords(doc: emmm.Document) {
    let count = 0;
    const regex = /[\u4E00-\u9FFF]|(\b\w+\b)/g;
    doc.walk((node) => {
        if (node.type == emmm.NodeType.SystemModifier)
            return 'skip';
        if (node.type == emmm.NodeType.Text)
            count += [...node.content.matchAll(regex)].length;
        return 'continue';
    });
    return count;
}

export const endRenderer:
emmm.BlockRendererDefiniton<emmm.HTMLRenderType> = [
    endBlock,
    async (node, cxt) => [
        <aside class='the-end'>{await cxt.state.render(node.content, cxt)}</aside>,
        <hr/>
    ]
];
