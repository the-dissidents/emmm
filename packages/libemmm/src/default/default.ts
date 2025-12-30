import { BuiltinConfiguration } from "../builtin/builtin";
import { BulletBlocks } from "./bullets";
import { HeadingBlocks, initHeadings } from "./headings";
import { initNotes, NoteBlocks, NoteInlines, NoteSystems } from "./notes";
import { CodeBlock, CodeInline } from "./code";
import { QuoteBlocks } from "./quotes";
import { InlineStyles } from "./inline-styles";
import { MiscBlocks, MiscInlines } from "./misc";
import { Configuration, ReadonlyConfiguration } from "../parser-config";
import { initTable, TableBlocks, TableInlines } from "./table";
import { GalleryBlock } from "./gallery";

let config = Configuration.from(BuiltinConfiguration);
config.initializers.push(initNotes, initHeadings, initTable);
config.blockModifiers.add(
    ...HeadingBlocks,
    ...BulletBlocks,
    CodeBlock,
    ...QuoteBlocks,
    ...MiscBlocks,
    ...NoteBlocks,
    ...TableBlocks,
    GalleryBlock
);
config.inlineModifiers.add(
    CodeInline,
    ...InlineStyles,
    ...MiscInlines,
    ...NoteInlines,
    ...TableInlines,
);
config.systemModifiers.add(
    ...NoteSystems,
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);
