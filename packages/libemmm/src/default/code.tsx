import { BlockModifierDefinition, ModifierSlotType, InlineModifierDefinition } from "../modifier";
import { BlockRendererDefiniton, InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

export const CodeBlock = new BlockModifierDefinition(
    'code', ModifierSlotType.Preformatted,
    { roleHint: 'code' });

export const CodeInline = new InlineModifierDefinition(
    'code', ModifierSlotType.Preformatted,
    { roleHint: 'code' });

export const CodeBlockRendererHTML =
    [CodeBlock, (node, cxt) =>
        <pre><code>{cxt.state.render(node.content, cxt)}</code></pre>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>;

export const CodeInlineRendererHTML =
    [CodeInline, (node, cxt) =>
        <span><code>{cxt.state.render(node.content, cxt)}</code></span>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>;
