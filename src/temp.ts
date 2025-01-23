import { SimpleScanner } from "./front";
import * as Parser from "./parser";
import { BuiltinConfiguration } from "./builtin/builtin";
import { debug, DebugLevel } from "./debug";
import { Configuration } from "./interface";


let text2 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

Version [/$version], created by [/$name]
`;

for (let i = 0; i < 5000; i++)
    text2 += `
[-define-block p${i}]
:--
[-var x:${i}]
[.slot]
[-var x:${i+1}]
[.slot]
--:

[.p${i}][/$x]

[-define-inline p${i}]
:--
[/slot][-define-inline q${i}:(1)][/slot 1]
--:
[/p${i}]abc[;][/q${i}]def[;]
`

// debug.level = DebugLevel.Warning;
// let scanner = new SimpleScanner(text2);
// let t0 = performance.now();
// let doc = Parser.parse(scanner, new Configuration(BuiltinConfiguration));
// // stripDocument(doc);
// // console.log(debugDumpDocument(doc, text2))
// console.log(performance.now() - t0);
// console.log('ok');