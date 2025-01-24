import { SimpleScanner } from "./front";
import * as Parser from "./parser";
import { BuiltinConfiguration } from "./builtin/builtin";
import { debug, DebugLevel } from "./debug";
import { BlockModifierDefinition, Configuration, InlineModifierDefinition, ModifierFlags, NodeType } from "./interface";
import { debugDumpDocument } from "./util";
import { checkArguments } from "./modifier-helper";

const TestConfig = new Configuration(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal),
    new BlockModifierDefinition('pre', ModifierFlags.Preformatted),
    new BlockModifierDefinition('marker', ModifierFlags.Marker)
);
TestConfig.inlineModifiers.add(
    new InlineModifierDefinition<string>('print', ModifierFlags.Marker, {
        prepareExpand(node, cxt, immediate) {
            const msgs = checkArguments(node);
            if (msgs) return msgs;
            node.state = node.arguments.map((x) => x.expansion!).join(';');
            return [];
        },
        expand(node, cxt) {
            if (!node.state) return [];
            return [{
                type: NodeType.Text,
                start: node.start,
                end: node.end,
                content: node.state
            }];
        },
    })
);

let text2 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

Version [/$version], created by [/$name]
`;

text2 = `
[-define-block a:x:y]
[-define-block $(y):z]
[/print $(x)$(y)$(z)]

[.a b:c;]
[.c 1;]`;

debug.level = DebugLevel.Trace;
let scanner = new SimpleScanner(text2);
let t0 = performance.now();
let doc = Parser.parse(scanner, new Configuration(TestConfig));
// stripDocument(doc);
console.log(debugDumpDocument(doc, text2))
console.log(performance.now() - t0);
console.log('ok');