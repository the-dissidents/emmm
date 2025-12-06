import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/scanner";
import { MessageSeverity, NodeType } from "../src/interface";
import { BlockModifierDefinition, ModifierSlotType } from "../src/modifier";
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

describe('modifiers', () => {
    test('[-var] and [/$] -- simple', () => {
        let doc = parse(`[-var x=123][/$x]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('[-var] and [/$] -- alternative syntax', () => {
        let doc = parse(`[-var x|123][/$x]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('[-var] and [/$] -- interpolated id', () => {
        let doc = parse(`[-var x|123][-var z-$(x)|456][/$z-123]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] }
        ]);
    });
    test('[.ifdef], [.ifndef]', () => {
        let doc = parse(`[.ifdef x]123\n\n[.ifndef x]456\n\n[-var x=zzz]\n\n[.ifdef x]789\n\n[.ifndef x]abc`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '789' }] }
        ]);
    });
    test('warning - undefined [/$] reference', () => {
        let doc = parse(`[/$x]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 5, severity: MessageSeverity.Warning }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
});

describe('interpolation', () => {
    test('AST', () => {
        let doc = parse(`[.normal $(x)]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [{
                    content: [{
                        type: NodeType.Interpolation,
                        argument: { content: [{ type: NodeType.Text, content: 'x' }] }
                    }]
                }],
            },
            content: []
        } ]);
        doc = parse(String.raw`[.normal $(\))]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [{
                    content: [{
                        type: NodeType.Interpolation,
                        argument: { content: [{ type: NodeType.Escaped, content: ")" }] }
                    }]
                }],
            },
            content: []
        } ]);
    });
    test('incomplete', () => {
        let doc = parse(`[.normal $(x`);
        expect.soft(doc.messages).toMatchObject([
            {
                code: 1,
                what: ')'
            },
            {
                code: 1,
                what: ']'
            }
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            arguments: {
                positional: [{
                    content: [{
                        type: NodeType.Interpolation,
                        argument: { content: [{ type: NodeType.Text, content: 'x' }] }
                    }]
                }],
            },
            content: []
        } ]);
    });
    test('expansion', () => {
        let doc = parse(`[-var x=123][/print $(x)]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
    test('nested', () => {
        let doc = parse(`[-var x=y][-var xy=123][/print $(x$(x))]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
        doc = parse(`[-var x=y][-var xy=123][/print $(x$(y))]`);
        expect.soft(doc.messages).toMatchObject([{ code: 5 }]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
    test('complex argument interpolation (modifier)', () => {
        let doc = parse(`[-define-block a|x|y][-define-block $(y)|z][/$x][/$y][/$z]\n\n[.a b|c;]\n[.c 1;]`);
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
        let doc = parse(`[-define-block a|x|y][-define-block $(y)|z][/print $(x)$(y)$(z)]\n\n[.a b|c;]\n[.c 1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'bc1' }
            ] }
        ]);
    });
});
