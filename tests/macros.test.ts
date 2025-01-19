import { describe, expect, test } from "vitest";
import { BasicConfiguration } from "../src/default";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { stripDocument } from "../src/util";
import { BlockModifierDefinition, CustomConfiguration, InlineModifierDefinition, ModifierFlags } from "../src/interface";

const TestConfig = new CustomConfiguration(BasicConfiguration);
TestConfig.addBlock(
    new BlockModifierDefinition('normal', ModifierFlags.Normal),
    new BlockModifierDefinition('pre', ModifierFlags.Preformatted),
    new BlockModifierDefinition('marker', ModifierFlags.Marker)
);
TestConfig.addInline(
    new InlineModifierDefinition('normal', ModifierFlags.Normal),
    new InlineModifierDefinition('pre', ModifierFlags.Preformatted),
    new InlineModifierDefinition('marker', ModifierFlags.Marker)
);

function parse(src: string) {
    const config = new CustomConfiguration(TestConfig);
    return Parser.parse(new SimpleScanner(src), config);
}

describe('block macros', () => {
    test('simple and empty', () => {
        let doc = parse(`[.define-block p]abc\n[.p]`);
        stripDocument(doc);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }
        ]);
        doc = parse(`[.define-block p;]\n[.p]`);
        stripDocument(doc);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('slot', () => {
        let doc = parse(`[.define-block p][.normal][.slot]\n[.p]abc`);
        stripDocument(doc);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', mod: {name: 'normal'},
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc\ndef' }] }]
            }
        ]);
    });
});