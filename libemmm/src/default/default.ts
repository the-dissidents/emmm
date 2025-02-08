import { BuiltinConfiguration } from "../builtin/builtin";
import { Configuration, ReadonlyConfiguration } from "../interface";
import { CommentShorthand, HeadingBlock, NumberedHeadingBlock, BulletItemBlock, OrderedListItemBlock, SubItemBlock, CodeBlock, CodeInline } from "./misc";

let config = new Configuration(BuiltinConfiguration);
config.blockShorthands.add(
    CommentShorthand);
config.blockModifiers.add(
    HeadingBlock, NumberedHeadingBlock,
    BulletItemBlock, OrderedListItemBlock, SubItemBlock,
    CodeBlock
);
config.inlineModifiers.add(
    CodeInline
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);