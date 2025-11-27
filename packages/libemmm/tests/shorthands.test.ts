import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/scanner";
import { BlockModifierDefinition, ModifierSlotType, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";
import { Configuration, ParseContext } from "../src/parser-config";

const TestConfig = Configuration.from(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierSlotType.Normal)
);

function parse(src: string) {
    const config = Configuration.from(TestConfig);
    let doc = new ParseContext(config).parse(new SimpleScanner(src)).toStripped();
    return doc;
}
debug.level = DebugLevel.Warning;

describe('inline shorthands', () => {
    test('literal and empty', () => {
        let doc = parse(`[-inline-shorthand p] 123\n\np`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
        doc = parse(`[-inline-shorthand p;]\n\np`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
    test('slots', () => {
        let doc = parse(`[-inline-shorthand p|()|p]([/slot])\n\np123p`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '(' },
                { type: NodeType.Text, content: '123' },
                { type: NodeType.Text, content: ')' }
            ] }
        ]);
        doc = parse(`[-inline-shorthand P|()|p]([/slot])\n\n[-inline-shorthand Q|()|q]{[/slot]}\n\nP1P2Q3qp4p`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '(' },
                { type: NodeType.Text, content: '1' },
                { type: NodeType.Text, content: '(' },
                { type: NodeType.Text, content: '2' },
                { type: NodeType.Text, content: '{' },
                { type: NodeType.Text, content: '3' },
                { type: NodeType.Text, content: '}' },
                { type: NodeType.Text, content: ')' },
                { type: NodeType.Text, content: '4' },
                { type: NodeType.Text, content: ')' }
            ] }
        ]);
    });
    test('arguments: simple scope', () => {
        let doc = parse(`[-inline-shorthand p|x|p][/print $(x)]\n\n[-inline-shorthand q|y|q][/print $(y)]\n\np1pq2q`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' },
                { type: NodeType.Text, content: '2' }
            ] }
        ]);
        doc = parse(`[-inline-shorthand p|x|p][/print $(x)]\n\n[-inline-shorthand q][/print $(x)]\n\np1pq`);
        expect.soft(doc.messages).toMatchObject([{ code: 5 }]);
    });
    test('arguments: complex scope', () => {
        let doc = parse(`[-inline-shorthand p|x|p|()|p][/print $(x)][/slot]\n\n[-inline-shorthand q][/print $(x)]\n\np1pqp`);
        expect.soft(doc.messages).toMatchObject([{ code: 5 }]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
        doc = parse(`[-inline-shorthand p|x|p|()|p][/print $(x)][/slot]\n\n[-inline-shorthand q|x|q][/print $(x)]\n\np1pq2qp`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' },
                { type: NodeType.Text, content: '2' }
            ] }
        ]);
    });
    test('arguments: reference (interp)', () => {
        let doc = parse(`[-inline-shorthand p|x|p][/print $(x)]\n\np1p`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '1' }] }
        ]);
    });
    test('arguments: reference (modifier)', () => {
        let doc = parse(`[-inline-shorthand p|x|p][/$x]\n\np1p`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '1' }] }
        ]);
    });
});

describe('block shorthands', () => {
    test('simple', () => {
        let doc = parse(`[-block-shorthand >|()][.normal][.slot]\n\n> 123`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.BlockModifier, content: [{
                type: NodeType.Paragraph,
                content: [{ type: NodeType.Text, content: '123' }]
            }] }
        ]);
    });
    test('slotless', () => {
        let doc = parse(`[-block-shorthand >] 123\n\n>\n456`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] }
        ]);
        doc = parse(`[-block-shorthand >;]\n\n>\n123`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
        ]);
    });
    test('no content', () => {
        let doc = parse(`[-block-shorthand >|()][.normal][.slot]\n\n>`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.BlockModifier, content: [] }
        ]);
    });
});