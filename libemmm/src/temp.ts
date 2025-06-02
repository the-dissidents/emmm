import { SimpleScanner } from "./scanner";
import * as Parser from "./parser";
import { debug, DebugLevel } from "./debug";
import { debugPrint } from "./debug-print";
import { DefaultConfiguration } from "./default/default";
import { HTMLRenderConfiguration, HTMLRenderState } from "./default/html-renderer";
import { Configuration, ParseContext } from "./parser-config";
import { BlockModifierDefinition, ModifierSlotType } from "./interface";

const TestConfig = Configuration.from(DefaultConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierSlotType.Normal),
    new BlockModifierDefinition('pre', ModifierSlotType.Preformatted),
    new BlockModifierDefinition('marker', ModifierSlotType.None)
);

let text1 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

[-inline-shorthand:»:():«]
[/emphasis][/slot][;]

[-block-shorthand:[\::id:\]:()]
[.note $(id)][.slot]

[-block-shorthand #:()]
[.heading 1][.slot]

Version [/$version], created by [/$name]
`;

text1 = `
[-define-block recommend:path:id]
[.style gallery][.link $(path)][.image $(id)][.slot]

[.recommend:path/to/article:imgid] title`;

text1 = `
[.heading 1] Chapter 1

[.heading 2] Section 1

Text

[.heading] Section 2

First

[.implicit-heading]

Second

[.implicit-heading]

Third

[.heading 2] Section 3

Text
`;

text1 = `[-block-shorthand pp:()][.heading][.slot]
pp[/print 123]`;

// text1 = `[.pre]abc

// def`;

debug.level = DebugLevel.Trace;
let context = new ParseContext(TestConfig);

export let doc = Parser.parse(new SimpleScanner(text1), context);

console.log('-----');
console.log(debugPrint.document(doc));

console.log('-----');
doc = doc.toStripped();
console.log(debugPrint.document(doc));

// console.log('-----');
// let doc = Parser.parse(new SimpleScanner(text1, {name: '<lib>'}), context);
// doc = doc.toStripped();
// console.log(debugPrint.document(doc, text2))

// console.log('-----');
// doc = Parser.parse(new SimpleScanner(text2, {name: '<source>'}), context);
// doc = doc.toStripped();
// console.log(debugPrint.document(doc, text2))

console.log('-----');
let renderConfig = HTMLRenderConfiguration;
let html = renderConfig.render(doc, new HTMLRenderState());
console.log(html);