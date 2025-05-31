import { describe, expect, test } from "vitest";
import { Configuration, SimpleScanner, ParseContext, DebugLevel, DefaultConfiguration, Document, HTMLRenderConfiguration, HTMLRenderState } from "../../src";
import { debug } from "../../src/debug";
import * as Parser from "../../src/parser";

function parse(src: string) {
    const config = Configuration.from(DefaultConfiguration);
    return Parser.parse(new SimpleScanner(src), new ParseContext(config)).toStripped();
}

function render(doc: Document) {
    let renderConfig = HTMLRenderConfiguration;
    return renderConfig.render(doc, new HTMLRenderState());
}

debug.level = DebugLevel.Warning;

describe('default/headings', () => {
    test('simple', () => {
        let doc = parse(`[.heading 1] Head\n\n[.implicit-heading 6]\n\nBody\n[.heading 6] Head\n\nBody\n\n[.implicit-heading 1]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h1>Head</h1>\n<h6 class='implicit'></h6>\n<p>Body</p>\n<h6>Head</h6>\n<p>Body</p>\n<h1 class='implicit'></h1>`);
    });
    test('explicit: infer', () => {
        let doc = parse(`[.heading 1] aaa\n\n[.heading 2] bbb\n\n[.heading] ccc`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h1>aaa</h1>\n<h2>bbb</h2>\n<h2>ccc</h2>`);
    });
    test('explicit: invalid value', () => {
        let doc = parse(`[.heading 2] aaa\n\n[.heading zzz] bbb`);
        expect.soft(doc.messages).toMatchObject([{ code: 6 }]);
        expect.soft(render(doc)).includes(`<h2>aaa</h2>\n<h2>bbb</h2>`);
        doc = parse(`[.heading 2] aaa\n\n[.heading 7] bbb`);
        expect.soft(doc.messages).toMatchObject([{ code: 6 }]);
        expect.soft(render(doc)).includes(`<h2>aaa</h2>\n<h2>bbb</h2>`);
    });
    test('explicit: inside definition', () => {
        let doc = parse(`[-define-block z:a][.heading $(a)][.slot]\n\n[.z 2]abc`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h2>abc</h2>`);
        doc = parse(`[-define-block z][.heading][.slot]\n\n[.heading 4]abc\n[.z]def`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h4>abc</h4>\n<h4>def</h4>`);
    });
    test('implicit: infer', () => {
        let doc = parse(`[.heading 1] aaa\n\n[.heading 2] bbb\n\n[.implicit-heading]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h1>aaa</h1>\n<h2>bbb</h2>\n<h3 class='implicit'></h3>`);
    });
    test('implicit: inside definition', () => {
        let doc = parse(`[-define-block z:a][.implicit-heading $(a)]\n\n[.z 2]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h2 class='implicit'></h2>`);
        doc = parse(`[-define-block z][.implicit-heading]\n\n[.heading 4]abc\n[.z]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(render(doc)).includes(`<h4>abc</h4>\n<h5 class='implicit'></h5>`);
    });
})