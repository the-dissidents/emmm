import { assert } from '$lib/Debug';
import * as emmm from '@the_dissidents/libemmm';

const header = Symbol();

declare module '@the_dissidents/libemmm' {
    export interface ParseContextStoreDefinitions {
        [header]?: {
            imageUrl?: string,
            title?: string,
            subtitle?: string,
            originalTitle?: string,
            originalUrl?: string,
            fields: [string, string][]
        };
    }
}

export function initHeader(cxt: emmm.ParseContext) {
    cxt.init(header, {
        fields: []
    });
}

export const basicFieldSystems = [
    emmm.helper.createWrapperModifier('title',
        (c) => c.get(header)!.title, 
        (c, v) => c.get(header)!.title = v),
    emmm.helper.createWrapperModifier('subtitle',
        (c) => c.get(header)!.subtitle, 
        (c, v) => c.get(header)!.subtitle = v),
    emmm.helper.createWrapperModifier('orig-title',
        (c) => c.get(header)!.originalTitle, 
        (c, v) => c.get(header)!.originalTitle = v),
    emmm.helper.createWrapperModifier('orig-url',
        (c) => c.get(header)!.originalUrl, 
        (c, v) => c.get(header)!.originalUrl = v, emmm.ModifierSlotType.Preformatted),
    emmm.helper.createWrapperModifier('cover-img',
        (c) => c.get(header)!.imageUrl, 
        (c, v) => c.get(header)!.imageUrl = v, emmm.ModifierSlotType.Preformatted)
];

export const infoFieldSystem = new emmm.SystemModifierDefinition(
    'info-field', emmm.ModifierSlotType.Normal,
{
    delayContentExpansion: true,
    afterProcessExpansion(node, cxt) {
        let msgs = emmm.helper.checkArguments(node, 1, 1);
        if (msgs) return msgs;
        const result = emmm.helper.onlyPermitPlaintextParagraph(node);
        if (typeof result !== 'string') return result;

        const key = node.arguments[0].expansion!.trim();
        const data = cxt.get(header)!;
        const previous = data.fields.findIndex(([a, _]) => a == key);
        if (previous >= 0) {
            console.log(node.head);
            msgs = [new emmm.messages.OverwriteSpecialVariableMessage(
                node.head, key, data.fields[previous][1])];
            data.fields.splice(previous, 1);
        }
        data.fields.push([key, result.trim()]);
        return msgs ?? [];
    },
});

export const headerBlock = new emmm.BlockModifierDefinition(
    'header', emmm.ModifierSlotType.None,
{});

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

export const headerRenderer: 
emmm.BlockRendererDefiniton<emmm.HTMLRenderType> = [
    headerBlock, 
    (node, cxt) => {
        const data = cxt.parsedDocument.context.get(header);
        assert(data !== undefined);
        let fragment = new DocumentFragment();
        if (data.imageUrl) {
            let content: Node;
            try {
                let transformed = cxt.config.options.transformAsset(data.imageUrl);
                content = transformed 
                    ? <img src={transformed} data-original-src={data.imageUrl}/>
                    : <img src={data.imageUrl}/>;
            } catch {
                content = cxt.state.invalidBlock(node, 'unable to transform asset');
            }
            fragment.appendChild(<figure>{content}</figure>);
        }
        if (data.title)
            fragment.appendChild(<h1>{data.title}</h1>);
        else
            fragment.appendChild(cxt.state.invalidBlock(node, 'no title'));
            
        if (data.subtitle)
            fragment.appendChild(<h1 class='subtitle'>{data.subtitle}</h1>)

        let content1: Node[] = [];
        if (data.originalTitle)
            content1.push(<p>
                <span class='key'>原标题：</span>
                <span class='originalTitle'>{data.originalTitle}</span>
            </p>);
        if (data.originalUrl)
            content1.push(<p>
                <span class='key'>原文链接：</span>
                <span class='originalUrl'>{data.originalUrl}</span>
            </p>);

        let userToField = new Map<string, string[]>();
        for (const [field, name] of data!.fields) {
            if (userToField.has(name))
                userToField.get(name)!.push(field);
            else
                userToField.set(name, [field]);
        }

        const array = [...userToField.entries()];
        let fieldsLeft = data!.fields.map((x) => x[0]);
        let content2: Node[] = [];
        let content3: Node[] = [];
        while (fieldsLeft.length > 0) {
            const field = fieldsLeft.shift()!;
            const entry = array.find(([_, fields]) => fields.includes(field));
            if (!entry) continue;
            const node = 
                <p>
                    <span class='key'>{entry[1].join(' & ')} / </span>
                    <span class='field'>{entry[0]}</span>
                </p>;
            if (entry[1].length == 1) {
                content2.push(node);
            } else {
                content3.push(node);
                fieldsLeft = fieldsLeft.filter((x) => !entry[1].includes(x));
            }
        }

        const wc = countWords(cxt.parsedDocument);
        fragment.append(
            ...content1.length > 0 
                ? [<div class='detail'>{content1}</div>] 
                : [],
            <div class='detail'>
                {content2}
                {content3}
            </div>,
            <aside class='ttr'><p>
                全文约<b>{Math.round(wc / 50) * 50}</b>字<br/>
                阅读需要<b>{(wc / 400).toFixed(0)}</b>分钟
            </p></aside>,
            <hr/>
        );
        return <header>{fragment}</header>;
    }
];


export const endRenderer: 
emmm.BlockRendererDefiniton<emmm.HTMLRenderType> = [
    endBlock,
    (node, cxt) => [
        <aside class='the-end'>{cxt.state.render(node.content, cxt)}</aside>,
        <hr/>
    ]
];