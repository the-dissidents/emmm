import { BuiltinConfiguration } from "../builtin/builtin";
import { BulletBlocks } from "./bullets";
import { HeadingBlocks, initHeadings } from "./headings";
import { initNotes, NoteBlocks, NoteInlines, NoteSystems } from "./notes";
import { CodeBlock, CodeInline } from "./code";
import { QuoteBlocks } from "./quotes";
import { InlineStyles } from "./inline-styles";
import { MiscBlocks, MiscInlines } from "./misc";
import { Configuration, ReadonlyConfiguration } from "../parser-config";

let config = Configuration.from(BuiltinConfiguration);
config.initializers.push(initNotes, initHeadings);
config.blockModifiers.add(
    ...HeadingBlocks,
    ...BulletBlocks,
    CodeBlock,
    ...QuoteBlocks,
    ...MiscBlocks,
    ...NoteBlocks
);
config.inlineModifiers.add(
    CodeInline,
    ...InlineStyles,
    ...MiscInlines,
    ...NoteInlines
);
config.systemModifiers.add(
    ...NoteSystems,
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);