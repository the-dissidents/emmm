import { ParagraphNode } from "../interface";
import { BlockModifierDefinition, ModifierSlotType } from "../modifier";
import { InvalidArgumentMessage } from "../messages";
import { bindArgs, onlyPermitSimpleParagraphs, onlyPermitSingleBlock } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { BlockRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

export const headings = Symbol();

type HeadingData = {
    name: string | undefined,
    implicit?: boolean,
    level: number
}

declare module '../parser-config' {
    export interface ParseContextStoreDefinitions {
        [headings]?: {
            path: HeadingData[]
        };
    }
}

export function initHeadings(cxt: ParseContext) {
    cxt.init(headings, {
        path: []
    });
}

function setHeading(cxt: ParseContext, data: HeadingData) {
    const path = cxt.get(headings)!.path;
    while (path.length > 0 && path.at(-1)!.level >= data.level)
        path.pop();
    path.push(data);
    return [];
}

function currentHeadingLevel(cxt: ParseContext) {
    return cxt.get(headings)!.path.at(-1)?.level;
}

function currentExplicitHeadingLevel(cxt: ParseContext) {
    return cxt.get(headings)!.path.findLast((x) => !x.implicit)?.level;
}

const headingBlock = new BlockModifierDefinition<HeadingData>(
    'heading', ModifierSlotType.Normal,
    {
        roleHint: 'heading',
        prepareExpand(node, cxt) {
            let { msgs, args, nodes } = bindArgs(node, [], { optional: ['n'] });
            if (msgs) return msgs;

            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            node.state = {
                name: undefined,
                level: currentHeadingLevel(cxt) ?? 1
            };
            if (args!.n !== undefined) {
                const level = Number.parseInt(args!.n);
                if (isNaN(level) || level < 1 || level > 6)
                    msgs = [new InvalidArgumentMessage(
                        nodes!.n!.location, 'should be a number between 1 and 6')];
                else node.state.level = level;
            }
            setHeading(cxt, node.state);
            return msgs ?? [];
        },
    });

const implicitHeadingBlock = new BlockModifierDefinition<HeadingData>(
    'implicit-heading', ModifierSlotType.None,
    {
        roleHint: 'heading',
        prepareExpand(node, cxt) {
            let { msgs, args, nodes } = bindArgs(node, [], { optional: ['n'] });
            if (msgs) return msgs;

            node.state = {
                name: undefined, implicit: true,
                level: (currentExplicitHeadingLevel(cxt) ?? 0) + 1
            };
            if (args!.n !== undefined) {
                const level = Number.parseInt(args!.n);
                if (isNaN(level) || level < 1 || level > 6)
                    msgs = [new InvalidArgumentMessage(
                        nodes!.n!.location, 'should be a number between 1 and 6')];
                else node.state.level = level;
            }
            setHeading(cxt, node.state);
            return msgs ?? [];
        },
    });

const numberedHeadingBlock = new BlockModifierDefinition<HeadingData>(
    'numbered-heading', ModifierSlotType.Normal,
    {
        roleHint: 'heading',
        prepareExpand(node, cxt) {
            let { msgs, args, nodes } = bindArgs(node, ['number']);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node, {optional: true});
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            node.state = { name: undefined, level: currentHeadingLevel(cxt) ?? 1 };
            const split = args!.number.trim().split('.').filter((x) => x.length > 0);
            if (split.length == 0 || split.length > 6)
                msgs = [new InvalidArgumentMessage(
                    nodes!.number.location, 'heading level should be between 1 and 6')];
            else node.state = { name: split.join('.'), level: split.length };
            setHeading(cxt, node.state);
            return msgs ?? [];
        },
    });

export const HeadingBlocks = [headingBlock, implicitHeadingBlock, numberedHeadingBlock];

export const HeadingBlockRenderersHTML = [
    [headingBlock, async (node, cxt) => {
        if (node.state !== undefined) {
            const tag = 'h' + node.state.level;
            const para = node.content[0] as ParagraphNode;
            const element = cxt.config.options.window.document.createElement(tag);
            element.appendChild(await cxt.state.render(para.content, cxt));
            return element;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,
    [implicitHeadingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            const tag = 'h' + node.state.level;
            const element = cxt.config.options.window.document.createElement(tag);
            element.className = 'implicit';
            return element;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,

    [numberedHeadingBlock, async (node, cxt) => {
        if (node.state !== undefined) {
            const tag = 'h' + node.state.level;
            const element = cxt.config.options.window.document.createElement(tag);
            element.className = 'numbered-heading';
            element.appendChild(<span class='heading-number'>{node.state.name}</span>);
            if (node.content.length > 0) {
                const para = node.content[0] as ParagraphNode;
                element.appendChild(<span class='heading-content'>
                    {await cxt.state.render(para.content, cxt)}
                </span>);
            }
            return element;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,
];
