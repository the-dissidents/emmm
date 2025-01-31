import { Configuration, ReadonlyConfiguration } from "../interface";
import { DefineBlockMod } from "./define-block";
import { DefineInlineMod } from "./define-inline";
import { DefineInlineShorthandMod } from "./define-shorthand";
import { initParseContext } from "./internal";
import { ModuleMod, UseBlockMod, UseSystemMod } from "./module";
import { SlotBlockMod, SlotInlineMod } from "./slot";
import { VarMod, GetVarInlineMod, GetVarInterpolator, PrintInlineMod } from "./var";

let basic = new Configuration();
basic.initializers = [initParseContext];
basic.systemModifiers.add(
    DefineBlockMod, DefineInlineMod, DefineInlineShorthandMod,
    VarMod, 
    UseSystemMod);
basic.blockModifiers.add(
    SlotBlockMod, ModuleMod, UseBlockMod);
basic.inlineModifiers.add(SlotInlineMod, GetVarInlineMod, PrintInlineMod);
basic.argumentInterpolators.add(GetVarInterpolator);

export const BuiltinConfiguration: ReadonlyConfiguration = Object.freeze(basic);
