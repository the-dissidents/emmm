import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { stripDocument } from "../src/util";
import { BlockModifierDefinition, Configuration, MessageSeverity, ModifierFlags, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";

const TestConfig = new Configuration(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal)
);

function parse(src: string) {
    const config = new Configuration(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config);
    stripDocument(doc);
    return doc;
}
debug.level = DebugLevel.Warning;

describe('[-push-notation] [-pop-notation]', () => {
    test('block', () => {
        let doc = parse(`
[-define-block p;][-push-notation][-define-block q;][-push-notation][-define-block r;]\n[.p;][.q;][.r;]\n[-pop-notation][.p;][.q;][.r;]\n[-pop-notation][.p;][.q;][.r;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 2, what: 'r' },
            { code: 2, what: 'q' },
            { code: 2, what: 'r' }
        ]);
    });
    test('inline', () => {
        let doc = parse(`
[-define-inline p;][-push-notation][-define-inline q;][-push-notation][-define-inline r;]\n[/p;][/q;][/r;]\n[-pop-notation][/p;][/q;][/r;]\n[-pop-notation][/p;][/q;][/r;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 2, what: 'r' },
            { code: 2, what: 'q' },
            { code: 2, what: 'r' }
        ]);
    });
    test('error - cannot pop', () => {
        let doc = parse(`[-push-notation][-pop-notation][-pop-notation]`);
        expect.soft(doc.messages).toMatchObject([{ code: 10 }]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
});