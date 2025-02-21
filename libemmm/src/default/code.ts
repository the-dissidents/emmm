import { BlockModifierDefinition, ModifierFlags, InlineModifierDefinition, BlockRendererDefiniton, InlineRendererDefiniton } from "../interface";
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
        return `<code>${cxt.state.render(node.content, cxt)}</code>`
    }] satisfies InlineRendererDefiniton<HTMLRenderType>;