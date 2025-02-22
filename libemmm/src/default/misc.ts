import { ModifierFlags, InlineModifierDefinition } from "../interface";
import { checkArguments } from "../modifier-helper";
import { InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const rubyInline = new InlineModifierDefinition<string>(
    'ruby', ModifierFlags.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const linkInline = new InlineModifierDefinition<string>(
    'link', ModifierFlags.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });


export const MiscInlines = [rubyInline, linkInline];

export const MiscInlineRenderersHTML = [
    [rubyInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        return `<ruby>${cxt.state.render(node.content, cxt)}<rt>${node.state}</rt></ruby>`
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
    [linkInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        return `<a href="${encodeURI(node.state)}">${cxt.state.render(node.content, cxt)}</a>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
];