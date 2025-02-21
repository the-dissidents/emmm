import { debug } from "../debug";
import { BlockModifierDefinition, ModifierFlags, BlockRendererDefiniton, ParagraphNode } from "../interface";
import { InvalidArgumentMessage } from "../messages";
import { checkArguments, onlyPermitSimpleParagraphs, onlyPermitSingleBlock } from "../modifier-helper";
import { assert } from "../util";
import { HTMLRenderType } from "./html-renderer";

const headingBlock = new BlockModifierDefinition<number>(
    'heading', ModifierFlags.Normal,
    {
        roleHint: 'heading',
        prepareExpand(node) {
            let msgs = checkArguments(node, 0, 1);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            if (node.arguments.length == 1) {
                let arg = node.arguments[0];
                let num = Number.parseInt(arg.expansion!);
                if (isNaN(num)) return [new InvalidArgumentMessage(
                    arg.start, arg.end, 'should be a number between 1 and 6')];
                node.state = num;
            } else {
                node.state = 1;
            }
            return [];
        },
    });

const numberedHeadingBlock = new BlockModifierDefinition<string[]>(
    'numbered-heading', ModifierFlags.Normal,
    {
        roleHint: 'heading',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            let arg = node.arguments[0];
            let split = arg.expansion!.trim().split('.').filter((x) => x.length > 0);
            if (split.length == 0 || split.length > 6) return [new InvalidArgumentMessage(
                arg.start, arg.end, 'the heading level must be between 1 and 6')];
            node.state = split;
            debug.trace('numbered-heading', node.state);
            return [];
        },
    });

export const HeadingBlocks = [headingBlock, numberedHeadingBlock];

export const HeadingBlockRenderersHTML = [
    [headingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            assert(node.state >= 1 && node.state <= 6);
            let tag = 'h' + node.state;
            let para = node.content[0] as ParagraphNode;
            return `<${tag}>${cxt.state.render(para.content, cxt)}</${tag}>`;
        }
        console.log(node);
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, number>,

    [numberedHeadingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            assert(node.state.length >= 1 && node.state.length <= 6);
            let tag = 'h' + node.state.length;
            let para = node.content[0] as ParagraphNode;
            return `<${tag}><span class='heading-number'>${node.state.join('.')}</span>${cxt.state.render(para.content, cxt)}</${tag}>`;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, string[]>,
];
