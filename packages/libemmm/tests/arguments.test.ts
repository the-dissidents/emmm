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

function parseWithoutStrip(src: string) {
    const config = Configuration.from(TestConfig);
    let doc = new ParseContext(config).parse(new SimpleScanner(src));
    return doc;
}

debug.level = DebugLevel.Warning;

describe('positional arguments', () => {
    test('[/print]', () => {
        let doc = parse(`[/print 123|456]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '123456' }
            ] }
        ]);
    });
    test('simple', () => {
        let doc = parseWithoutStrip(`[.normal 123|456]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [
                    { content: [{content: "123"}] },
                    { content: [{content: "456"}] }
                ]
            }
        } ]);
    });
    test('multiple lines', () => {
        let doc = parseWithoutStrip(`[.normal 123\n456\n\n\n78900|\nab\n\ncdef\n|zzzz]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [
                    { content: [{content: "123\n456\n\n\n78900"}] },
                    { content: [{content: "\nab\n\ncdef\n"}] },
                    { content: [{content: "zzzz"}] }
                ]
            }
        } ]);
    });
    test('escaped', () => {
        let doc = parseWithoutStrip(String.raw`[/print \]]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [{
                type: NodeType.InlineModifier, mod: {name: 'print'},
                arguments: {
                    positional: [{ content: [{ type: NodeType.Escaped, content: "]" }] }]
                },
                expansion: [{ type: NodeType.Text, content: ']' }]
            }]
        } ]);
    });
});

describe('named arguments', () => {
    test('simple', () => {
        let doc = parseWithoutStrip(`[.normal name1=value1|name2=value2]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [],
                named: new Map([
                    ['name1', { content: [{ content: "value1" }] }],
                    ['name2', { content: [{ content: "value2" }] }],
                ])
            }
        } ]);
    });
    test('mixed', () => {
        let doc = parseWithoutStrip(`[.normal pos0|name1=value1|pos1|name2=value2|pos2]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [
                    { content: [{content: "pos0"}] },
                    { content: [{content: "pos1"}] },
                    { content: [{content: "pos2"}] },
                ],
                named: new Map([
                    ['name1', { content: [{ content: "value1" }] }],
                    ['name2', { content: [{ content: "value2" }] }],
                ])
            }
        } ]);
    });
    test('not a name', () => {
        let doc = parseWithoutStrip(String.raw`[.normal http://example.com?q=search]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [
                    { content: [{content: "http://example.com?q=search"}] },
                ],
                named: new Map()
            }
        } ]);
    });
    test('error -- duplicate', () => {
        let doc = parseWithoutStrip(`[.normal name=value1|name=value2]`);
        expect.soft(doc.messages).toMatchObject([
            {
                code: 17,
                severity: 2
            }
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [],
                named: new Map([
                    ['name', { content: [{ content: "value2" }] }],
                ])
            }
        } ]);
    });
})