import { SimpleScanner } from "./front";
import * as Parser from "./parser";
import { BuiltinConfiguration } from "./builtin/builtin";
import { debug, DebugLevel } from "./debug";
import { BlockModifierDefinition, Configuration, InlineModifierDefinition, ModifierFlags, NodeType } from "./interface";
import { debugDumpDocument, stripDocument } from "./util";
import { checkArguments } from "./modifier-helper";

const TestConfig = new Configuration(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal),
    new BlockModifierDefinition('pre', ModifierFlags.Preformatted),
    new BlockModifierDefinition('marker', ModifierFlags.Marker)
);

let text2 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

Version [/$version], created by [/$name]
`;

text2 = String.raw`
[-define-inline p:x][-define-inline q:x][/$x]

[/p:0;][/q:1;]`;

debug.level = DebugLevel.Trace;
let scanner = new SimpleScanner(text2);
let t0 = performance.now();
let doc = Parser.parse(scanner, new Configuration(TestConfig));
stripDocument(doc);
console.log(debugDumpDocument(doc, text2))
console.log(performance.now() - t0);
console.log('ok');