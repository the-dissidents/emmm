import { BlockModifierDefinition, ModifierSlotType, ParagraphNode } from "../interface";
import { InvalidArgumentMessage } from "../messages";
import { checkArguments, onlyPermitSimpleParagraphs, onlyPermitSingleBlock } from "../modifier-helper";
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
            let msgs = checkArguments(node, 0, 1);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            node.state = { name: undefined, level: currentHeadingLevel(cxt) ?? 1 };
            if (node.arguments.length == 1) {
                const arg = node.arguments[0];
                const level = Number.parseInt(arg.expansion!);
                if (isNaN(level) || level < 1 || level > 6)
                    msgs = [new InvalidArgumentMessage(
                        arg.location, 'should be a number between 1 and 6')];
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
            let msgs = checkArguments(node, 0, 1);
            if (msgs) return msgs;

            node.state = { 
                name: undefined, implicit: true, 
                level: (currentExplicitHeadingLevel(cxt) ?? 0 ) + 1
            };
            if (node.arguments.length == 1) {
                const arg = node.arguments[0];
                const level = Number.parseInt(arg.expansion!);
                if (isNaN(level) || level < 1 || level > 6)
                    msgs = [new InvalidArgumentMessage(
                        arg.location, 'should be a number between 1 and 6')];
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
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            node.state = { name: undefined, level: currentHeadingLevel(cxt) ?? 1 };
            const arg = node.arguments[0];
            const split = arg.expansion!.trim().split('.').filter((x) => x.length > 0);
            if (split.length == 0 || split.length > 6)
                msgs = [new InvalidArgumentMessage(
                    arg.location, 'should be a number between 1 and 6')];
            else node.state = { name: split.join('.'), level: split.length };
            setHeading(cxt, node.state);
            return msgs ?? [];
        },
    });

export const HeadingBlocks = [headingBlock, implicitHeadingBlock, numberedHeadingBlock];

export const HeadingBlockRenderersHTML = [
    [headingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            let tag = 'h' + node.state.level;
            let para = node.content[0] as ParagraphNode;
            return `<${tag}>${cxt.state.render(para.content, cxt)}</${tag}>`;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,
    [implicitHeadingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            let tag = 'h' + node.state.level;
            return `<${tag} class='implicit'></${tag}>`;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,

    [numberedHeadingBlock, (node, cxt) => {
        if (node.state !== undefined) {
            let tag = 'h' + node.state.level;
            let para = node.content[0] as ParagraphNode;
            return `<${tag}><span class='heading-number'>${node.state.name}</span>${cxt.state.render(para.content, cxt)}</${tag}>`;
        }
        return cxt.state.invalidBlock(node, 'Bad format');
    }] satisfies BlockRendererDefiniton<HTMLRenderType, HeadingData>,
];
