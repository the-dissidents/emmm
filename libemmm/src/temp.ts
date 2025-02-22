import { SimpleScanner } from "./scanner";
import * as Parser from "./parser";
import { BuiltinConfiguration } from "./builtin/builtin";
import { debug, DebugLevel } from "./debug";
import { BlockModifierDefinition, Configuration, ModifierFlags } from "./interface";
import { debugPrint } from "./debug-print";
import { DefaultConfiguration } from "./default/default";
import { HTMLRenderConfiguration, HTMLRenderState } from "./default/html-renderer";

const TestConfig = Configuration.from(DefaultConfiguration);
// TestConfig.blockModifiers.add(
//     new BlockModifierDefinition('normal', ModifierFlags.Normal),
//     new BlockModifierDefinition('pre', ModifierFlags.Preformatted),
//     new BlockModifierDefinition('marker', ModifierFlags.Marker)
// );

let text2 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

Version [/$version], created by [/$name]
`;

text2 = String.raw`
[-block-shorthand:[\::id:\]:()]
[.note $(id)][.slot]

[.heading 1] Heading

»Setzt Sie das in solches Erstaunen?« fragte der Diener.

»Ich will es mir nur zurechtlegen. Wenn man solche Beziehungen nicht kennt, kann man ja die größten Fehler machen«, antwortete Karl.[/note 1]

[:1] Franz Kafka: Gesammelte Werke. Band 6, Frankfurt a.M. 1950 ff., S. 88.

[.bullet-item] a & b > c: should be escaped.
[.bullet-item] So I can also write: <script> ..? </script>`;

debug.level = DebugLevel.Trace;
let scanner = new SimpleScanner(text2);
let t0 = performance.now();
let doc = Parser.parse(scanner, Configuration.from(TestConfig));
doc = doc.toStripped();
console.log(debugPrint.document(doc, text2))
// console.log(performance.now() - t0);

let renderConfig = HTMLRenderConfiguration;
let html = renderConfig.render(doc, new HTMLRenderState());
console.log(html);