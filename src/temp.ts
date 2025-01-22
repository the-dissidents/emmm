import { SimpleScanner } from "./front";
import * as Parser from "./parser";
import { BasicConfiguration, DefaultConfiguration } from "./default";
import { debugDumpDocument, stripDocument } from "./util";
import { debug, DebugLevel } from "./debug";


let text2 = String.raw`
[-var name:foobar]
[-var version:0.1.0]

Version [/$version], created by [/$name]`;

text2 = `[.quote][.slot]`

// text2 = `
// [-define-block bad]
// [/$xyz]

// [-define-block bad2]
// [.bad;]

// [.bad2;]
// [-var xyz:1]
// [.bad2;]`

text2 = `
[-define-inline p]
:--
[-var x:0]
[/slot]
[-var x:1]
[/slot]
--:

[/p][/$x][;]
`

text2 = `
[-define-inline p]
:--
[/slot][-define-inline q:(1)][/slot 1]
--:
[/p]abc[;][/q]def[;]
`

// text2 = `
// [-define-block q:(A)]
// :--
// [-var x:0]
// [.slot A]
// [-var x:1]
// [.slot A]
// --:

// [.q] [/$x]
// `

// text2 = `
// [-define-block p]
// :--
// [.slot]
// [-define-block q][.slot]
// --:
// [.p] abc
// [.q] def
// `

// text2 = `
// [-define-block p:(A)]
// [-define-block q:(B)]
// :--
// [.slot A]
// [.slot B]
// --:

// [.p] abc
// [.q] def
// `

debug.level = DebugLevel.Trace;
let t0 = performance.now();
let doc = Parser.parse(new SimpleScanner(text2), DefaultConfiguration);
console.log(performance.now() - t0);
// stripDocument(doc);
console.log(debugDumpDocument(doc, text2))