import { Configuration, ReadonlyConfiguration } from "../interface";
import { DefineBlockMod, DefineInlineMod } from "./define-modifier";
import { DefineBlockShorthandMod, DefineInlineShorthandMod } from "./define-shorthand";
import { initParseContext } from "./internal";
import { ModuleMod, UseBlockMod, UseSystemMod } from "./module";
import { InjectPreSlotBlockMod, InjectPreSlotInlineMod, PreSlotBlockMod, PreSlotInlineMod, SlotBlockMod, SlotInlineMod } from "./slot";
import { VarMod, GetVarInlineMod, GetVarInterpolator, PrintInlineMod } from "./var";

let builtin = new Configuration();
builtin.initializers = [initParseContext];
builtin.systemModifiers.add(
    DefineBlockMod, DefineInlineMod, 
    DefineBlockShorthandMod, DefineInlineShorthandMod, 
    VarMod, 
    UseSystemMod);
builtin.blockModifiers.add(
    SlotBlockMod, PreSlotBlockMod, InjectPreSlotBlockMod,
    ModuleMod, UseBlockMod);
builtin.inlineModifiers.add(
    SlotInlineMod, PreSlotInlineMod, InjectPreSlotInlineMod,
    GetVarInlineMod, PrintInlineMod);
builtin.argumentInterpolators.add(GetVarInterpolator);

export const BuiltinConfiguration: ReadonlyConfiguration = Object.freeze(builtin);
