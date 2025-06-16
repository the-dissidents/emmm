import { assert } from '$lib/Debug';
import * as emmm from '@the_dissidents/libemmm';

const fieldNames = [
    ['AUTHOR', '作者'],
    ['TRANSLATOR', '译者'],
    ['PROOFREADER', '校对'],
    ['TYPESET-BY', '排版'],
    ['COVER-BY', '制图'],
];

export const headerBlock = new emmm.BlockModifierDefinition<HeaderData>(
    'header', emmm.ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        const imageUrl      = cxt.variables.get('COVER-IMG')?.trim();
        const title         = cxt.variables.get('TITLE')?.trim();
        const subtitle      = cxt.variables.get('SUBTITLE')?.trim();
        const originalTitle = cxt.variables.get('ORIG-TITLE')?.trim();
        const originalUrl   = cxt.variables.get('ORIG-LINK')?.trim();
        const fields = new Map<string, string>(fieldNames
            .flatMap(([varname, text]) => cxt.variables.has(varname) 
                ? [[text, cxt.variables.get(varname)!.trim()] as [string, string]]
                : []));
        node.state = { imageUrl, title, subtitle, originalTitle, originalUrl, fields };
        return [];
    },
});

type HeaderData = {
    imageUrl?: string,
    title?: string,
    subtitle?: string,
    originalTitle?: string,
    originalUrl?: string,
    fields: Map<string, string>
};

export const headerRenderer: 
emmm.BlockRendererDefiniton<emmm.HTMLRenderType, HeaderData> = [
    headerBlock, 
    (node, cxt) => {
        assert(node.state !== undefined);
        let fragment = new DocumentFragment();
        if (node.state.imageUrl) {
            let content: Node;
            try {
                let transformed = cxt.config.options.transformAsset(node.state.imageUrl);
                content = transformed 
                    ? <img src={transformed} data-original-src={node.state.imageUrl}/>
                    : <img src={node.state.imageUrl}/>;
            } catch {
                content = cxt.state.invalidBlock(node, 'unable to transform asset');
            }
            fragment.appendChild(<figure>{content}</figure>);
        }
        if (node.state.title)
            fragment.appendChild(<h1>{node.state.title}</h1>);
        else
            fragment.appendChild(cxt.state.invalidBlock(node, 'no title'));
            
        if (node.state.subtitle)
            fragment.appendChild(<h1 class='subtitle'>{node.state.subtitle}</h1>)

        let content1: Node[] = [];
        if (node.state.originalTitle)
            content1.push(<p>
                <span class='key'>原标题：</span>,
                <span class='originalTitle'>{node.state.originalTitle}</span>
            </p>);
        if (node.state.originalUrl)
            content1.push(<p>
                <span class='key'>原文链接：</span>,
                <span class='originalUrl'>{node.state.originalUrl}</span>
            </p>);

        let userToField = new Map<string, string[]>();
        for (const [field, name] of node.state!.fields) {
            if (userToField.has(name))
                userToField.get(name)!.push(field);
            else
                userToField.set(name, [field]);
        }

        const array = [...userToField.entries()];
        let fieldsLeft = fieldNames.map((x) => x[1]);
        let content2: Node[] = [];
        let content3: Node[] = [];
        while (fieldsLeft.length > 0) {
            const field = fieldsLeft.shift()!;
            const entry = array.find(([_, fields]) => fields.includes(field));
            console.log(field, entry);
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
        fragment.append(
            ...content1.length > 0 
                ? [<div class='detail'>{content1}</div>] 
                : [],
            <div class='detail'>
                {content2}
                {content3}
            </div>,
            <aside class='ttr'><p>
                全文约<b>4600</b>字<br/>
                阅读需要<b>12</b>分钟
            </p></aside>,
            <hr/>
        );
        return <header>{fragment}</header>;
    }
]