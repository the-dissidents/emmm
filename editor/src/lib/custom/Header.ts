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
        let result = `<header>\n`;
        if (node.state.imageUrl) {
            result += '<figure>'
            try {
                let transformed = cxt.config.options.transformAsset(node.state.imageUrl);
                result += transformed 
                    ? `<img src="${transformed}" data-original-src="${node.state.imageUrl}"/>`
                    : `<img src="${node.state}"/>`;
            } catch {
                result += cxt.state.invalidBlock(node, 'unable to transform asset');
            }
            result += '</figure>\n';
        }
        if (node.state.title)
            result += `<h1>${cxt.state.escape(node.state.title)}</h1>\n`
        else
            result += cxt.state.invalidBlock(node, 'no title');
            
        if (node.state.subtitle)
            result += `<h1 class='subtitle'>${cxt.state.escape(node.state.subtitle)}</h1>\n`

        result += `<div class='detail'><p>\n`

        let lines: string[] = [];
        if (node.state.originalTitle)
            lines.push(`<span class='key'>原标题：</span><span class='originalTitle'>${cxt.state.escape(node.state.originalTitle)}</span>`);
        if (node.state.originalUrl)
            lines.push(`<span class='key'>原文链接：</span><span class='originalUrl'>${cxt.state.escape(node.state.originalUrl)}</span>`);
        if (lines.length > 0)
            result += lines.join('<br/>\n') + '\n</p><p>\n';

        let userToField = new Map<string, string[]>();
        for (const [field, name] of node.state!.fields) {
            if (userToField.has(name))
                userToField.get(name)!.push(field);
            else
                userToField.set(name, [field]);
        }

        const array = [...userToField.entries()];
        let fieldsLeft = fieldNames.map((x) => x[1]);
        let single: string[] = [];
        let multiple: string[] = [];
        while (fieldsLeft.length > 0) {
            const field = fieldsLeft.shift()!;
            const entry = array.find(([_, fields]) => fields.includes(field));
            console.log(field, entry);
            if (!entry) continue;
            const text = `<span class='key'>` + cxt.state.escape(entry[1].join(' & ')) 
                + ` / </span><span class='field'>${cxt.state.escape(entry[0])}</span>`;
            if (entry[1].length == 1) {
                single.push(text);
            } else {
                multiple.push(text);
                fieldsLeft = fieldsLeft.filter((x) => !entry[1].includes(x));
            }
        }
        result += [...single, ...multiple].join('<br/>\n') + `\n</p></div>\n`;
        result += `<aside class='ttr'><p>全文约<b>4600</b>字<br/>阅读需要<b>12</b>分钟</p></aside>`;
        result += `<hr></header>\n`;
        return result;
    }
]