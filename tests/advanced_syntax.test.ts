import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { stripDocument } from "../src/util";
import { BlockModifierDefinition, Configuration, InlineModifierDefinition, MessageSeverity, ModifierFlags, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";

const TestConfig = new Configuration(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal)
);
TestConfig.inlineModifiers.add(
    new InlineModifierDefinition('marker', ModifierFlags.Marker, {
        expand(node, cxt) {
            if (node.arguments.length == 1) {
                return [{
                    type: NodeType.Text,
                    start: node.start,
                    end: node.end,
                    content: cxt.evaluateArgument(node.arguments[0])
                }];
            }
            return [];
        },
    })
);

function parse(src: string) {
    const config = new Configuration(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config);
    stripDocument(doc);
    return doc;
}

function parseWithoutStrip(src: string) {
    const config = new Configuration(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config);
    return doc;
}

debug.level = DebugLevel.Warning;

describe('argument parsing', () => {
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
        let doc = parseWithoutStrip(String.raw`[/marker \]]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [{
                type: NodeType.InlineModifier, mod: {name: 'marker'},
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
                    arg: { content: [{ type: NodeType.Text, content: 'x' }] }
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
                    arg: { content: [{ type: NodeType.Escaped, content: ")" }] }
                }] }
            ],
            content: []
        } ]);
    });
    test('variable interpolation: expansion', () => {
        let doc = parse(`[-var x:123][/marker $(x)]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('variable interpolation: nested', () => {
        let doc = parse(`[-var x:y][-var xy:123][/marker $(x$(x))]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
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