import { Configuration, ReadonlyConfiguration } from "../interface";
import { DefineBlockMod, DefineInlineMod } from "./define-modifier";
import { DefineBlockShorthandMod, DefineInlineShorthandMod } from "./define-shorthand";
import { initParseContext } from "./internal";
import { ModuleMod, UseBlockMod, UseSystemMod } from "./module";
import { InjectPreSlotBlockMod, InjectPreSlotInlineMod, PreSlotBlockMod, PreSlotInlineMod, SlotBlockMod, SlotInlineMod } from "./slot";
import { VarMod, GetVarInlineMod, GetVarInterpolator, PrintInlineMod } from "./var";

let basic = new Configuration();
basic.initializers = [initParseContext];
basic.systemModifiers.add(
    DefineBlockMod, DefineInlineMod, 
    DefineBlockShorthandMod, DefineInlineShorthandMod, 
    VarMod, 
    UseSystemMod);
basic.blockModifiers.add(
    SlotBlockMod, PreSlotBlockMod, InjectPreSlotBlockMod,
    ModuleMod, UseBlockMod);
basic.inlineModifiers.add(
    SlotInlineMod, PreSlotInlineMod, InjectPreSlotInlineMod,
    GetVarInlineMod, PrintInlineMod);
basic.argumentInterpolators.add(GetVarInterpolator);

export const BuiltinConfiguration: ReadonlyConfiguration = Object.freeze(basic);
