import { describe, expect, test } from "vitest";
import { Configuration, SimpleScanner, ParseContext, DebugLevel, DefaultConfiguration } from "../../src";
import { debug } from "../../src/debug";
import * as Parser from "../../src/parser";

function parse(src: string) {
    const config = Configuration.from(DefaultConfiguration);
    return Parser.parse(new SimpleScanner(src), new ParseContext(config)).toStripped();
}

debug.level = DebugLevel.Warning;

describe('default/vars', () => {
    test('simple', () => {
        let doc = parse(`[-title] abc`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.context.variables.get('TITLE')).toBe('abc');
    });
    test('with expandable', () => {
        let doc = parse(`[-var z:123][-title] abc[/$z]def`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.context.variables.get('TITLE')).toBe('abc123def');
    });
    test('error: multiple blocks', () => {
        let doc = parse(`[-title]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toMatchObject([{ code: 13 }]);
        expect.soft(doc.context.variables.get('TITLE')).toBe(undefined);
    });
    test('error: non-plaintext blocks', () => {
        let doc = parse(`[-title] abc[/code]def[;]g`);
        expect.soft(doc.messages).toMatchObject([{ code: 7 }]);
        expect.soft(doc.context.variables.get('TITLE')).toBe(undefined);
    });
    test('error: simple only', () => {
        let doc = parse(`[-title][-var abc:123]`);
        expect.soft(doc.messages).toMatchObject([{ code: 14 }]);
        expect.soft(doc.context.variables.get('TITLE')).toBe(undefined);
    });
});