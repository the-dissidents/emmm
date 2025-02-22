import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/scanner";
import * as Parser from "../src/parser";
import { BlockModifierDefinition, MessageSeverity, ModifierSlotType, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";
import { Configuration } from "../src/parser-config";

const TestConfig = Configuration.from(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierSlotType.Normal)
);

function parse(src: string) {
    const config = Configuration.from(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config).toStripped();
    return doc;
}

function parseWithoutStrip(src: string) {
    const config = Configuration.from(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config);
    return doc;
}

debug.level = DebugLevel.Warning;

describe('argument parsing', () => {
    test('[/print]', () => {
        let doc = parse(`[/print 123:456]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '123456' }
            ] }
        ]);
    });
    test('simple', () => {
        let doc = parseWithoutStrip(`[.normal 123:456]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: [
                { content: [{content: "123"}] },
                { content: [{content: "456"}] }
            ]
        } ]);
    });
    test('escaped', () => {
        let doc = parseWithoutStrip(String.raw`[/print \]]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [{
                type: NodeType.InlineModifier, mod: {name: 'print'},
                arguments: [{ content: [{ type: NodeType.Escaped, content: "]" }] }],
                expansion: [{ type: NodeType.Text, content: ']' }]
            }]
        } ]);
    });
    test('variable interpolation: AST', () => {
        let doc = parse(`[.normal $(x)]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: [
                { content: [{
                    type: NodeType.Interpolation, 
                    argument: { content: [{ type: NodeType.Text, content: 'x' }] }
                }] }
            ],
            content: []
        } ]);
        doc = parse(String.raw`[.normal $(\))]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: [
                { content: [{
                    type: NodeType.Interpolation, 
                    argument: { content: [{ type: NodeType.Escaped, content: ")" }] }
                }] }
            ],
            content: []
        } ]);
    });
    test('variable interpolation: expansion', () => {
        let doc = parse(`[-var x:123][/print $(x)]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('variable interpolation: nested', () => {
        let doc = parse(`[-var x:y][-var xy:123][/print $(x$(x))]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('complex argument interpolation (modifier)', () => {
        let doc = parse(`[-define-block a:x:y][-define-block $(y):z][/$x][/$y][/$z]\n\n[.a b:c;]\n[.c 1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'b' },
                { type: NodeType.Text, content: 'c' },
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('complex argument interpolation (interp)', () => {
        let doc = parse(`[-define-block a:x:y][-define-block $(y):z][/print $(x)$(y)$(z)]\n\n[.a b:c;]\n[.c 1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'bc1' }
            ] }
        ]);
    });
});

describe('[-var] and [/$]', () => {
    test('simple', () => {
        let doc = parse(`[-var x:123][/$x]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('warning - undefined reference', () => {
        let doc = parse(`[/$x]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 5, severity: MessageSeverity.Warning }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
});