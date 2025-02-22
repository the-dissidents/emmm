import { BlockModifierDefinition, ModifierFlags, InlineModifierDefinition } from "../interface";
import { BlockRendererDefiniton, InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

export const CodeBlock = new BlockModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: 'code' });

export const CodeInline = new InlineModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: 'code' });

export const CodeBlockRendererHTML = 
    [CodeBlock, (node, cxt) => {
        return `<pre><code>${cxt.state.render(node.content, cxt)}</code></pre>`
    }] satisfies BlockRendererDefiniton<HTMLRenderType>;

export const CodeInlineRendererHTML = 
    [CodeInline, (node, cxt) => {
        return `<span><code>${cxt.state.render(node.content, cxt)}</code></span>`
    }] satisfies InlineRendererDefiniton<HTMLRenderType>;