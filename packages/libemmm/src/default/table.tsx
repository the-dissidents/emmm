import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, BlockModifierDefinition, InlineModifierDefinition, ModifierSlotType } from "../interface";
import { EntityNotAllowedMessage } from "../messages";
import { ParseContext } from "../parser-config";
import { BlockRendererDefiniton, InlineRendererDefiniton } from "../renderer";
import { cloneNode, stripNode } from "../util";
import { HTMLRenderType } from "./html-renderer";

const table = Symbol();

declare module '../parser-config' {
    export interface ParseContextStoreDefinitions {
        [table]?: {
            current?: TableDefiniton
        }
    }
}

type TableDefiniton = {
    status: 'header' | 'body' | 'footer',
    header: BlockEntity[],
    body: BlockEntity[],
    footer: BlockEntity[]
};


export function initTable(cxt: ParseContext) {
    cxt.init(table, {
        current: undefined
    });
}

const tableBlock = new BlockModifierDefinition<TableDefiniton>(
    'table', ModifierSlotType.Normal,
{
    beforeParseContent(node, cxt, immediate) {
        if (!immediate || node.state) return [];
        const t = cxt.get(table)!;
        if (t.current) return [
            new EntityNotAllowedMessage(node.location, 'tables cannot be nested')];

        node.state = {
            status: 'header',
            header: [], body: [], footer: []
        };
        t.current = node.state;
        debug.trace('entering table');
        return [];
    },
    afterParseContent(_node, cxt) {
        cxt.get(table)!.current = undefined;
        debug.trace('leaving table');
        return []
    },
});

const tableRowBlock = new BlockModifierDefinition(
    'table-row', ModifierSlotType.Normal,
{
    beforeProcessExpansion(node, cxt, immediate) {
        if (!immediate) return [];
        const t = cxt.get(table)!.current;
        if (!t) return [
            new EntityNotAllowedMessage(node.location, 'rows can only appear in tables')];

        const newNode = stripNode(cloneNode(node)) as BlockEntity[];
        debug.info('pushing table row\n', debugPrint.node(...newNode));
        if (t.status == 'header') t.header.push(...newNode);
        if (t.status == 'body')   t.body.push(...newNode);
        if (t.status == 'footer') t.footer.push(...newNode);
        return [];
    },
});

const tableSeparatorBlock = new BlockModifierDefinition(
    'table-separator', ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        const t = cxt.get(table)!.current;
        if (!t) return [
            new EntityNotAllowedMessage(node.location, 'separators can only appear in tables')];

        if      (t.status == 'header') t.status = 'body';
        else if (t.status == 'body')   t.status = 'footer';
        else if (t.status == 'footer') {}; // do nothing

        debug.trace('table status ->', t.status);
        return [];
    },
    expand() {
        return [];
    },
})

const tableCellBlock = new BlockModifierDefinition(
    'table-cell', ModifierSlotType.Normal,
{
    beforeProcessExpansion(node, cxt, immediate) {
        if (!immediate) return [];
        const t = cxt.get(table)!.current;
        if (!t) return [
            new EntityNotAllowedMessage(node.location, 'cells can only appear in tables')];
        return [];
    }
});

const tableCellInline = new InlineModifierDefinition(
    'table-cell', ModifierSlotType.Normal,
{
    beforeProcessExpansion(node, cxt, immediate) {
        if (!immediate) return [];
        const t = cxt.get(table)!.current;
        if (!t) return [
            new EntityNotAllowedMessage(node.location, 'cells can only appear in tables')];
        return [];
    }
});

export const TableBlocks = [tableBlock, tableRowBlock, tableCellBlock, tableSeparatorBlock];
export const TableInlines = [tableCellInline];

export const TableBlockRenderers = [
    [tableBlock, (node, cxt) => {
        const t = node.state;
        if (!t) return cxt.state.invalidBlock(node, 'bad format');
        return <table>
            <thead>{cxt.state.render(t.header, cxt)}</thead>
            <tbody>{cxt.state.render(t.body, cxt)}</tbody>
            <tfoot>{cxt.state.render(t.footer, cxt)}</tfoot>
        </table>;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, TableDefiniton>,

    [tableRowBlock, (node, cxt) => {
        return <tr>{cxt.state.render(node.content, cxt)}</tr>;
    }] satisfies BlockRendererDefiniton<HTMLRenderType>,

    [tableCellBlock, (node, cxt) => {
        return <td>{cxt.state.render(node.content, cxt)}</td>;
    }] satisfies BlockRendererDefiniton<HTMLRenderType>,
];

export const TableInlineRenderers = [
    [tableCellInline, (node, cxt) => {
        return <td>{cxt.state.render(node.content, cxt)}</td>;
    }] satisfies InlineRendererDefiniton<HTMLRenderType>,
];