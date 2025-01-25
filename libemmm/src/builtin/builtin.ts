import { Configuration } from "../interface";
import { DefineBlockMod } from "./define-block";
import { DefineInlineMod } from "./define-inline";
import { initParseContext } from "./internal";
import { SlotBlockMod, SlotInlineMod } from "./slot";
import { VarMod, GetVarInlineMod, GetVarInterpolator, PrintInlineMod } from "./var";

let basic = new Configuration();
basic.initializers = [initParseContext];
basic.systemModifiers.add(DefineBlockMod, DefineInlineMod, VarMod);
basic.blockModifiers.add(SlotBlockMod);
basic.inlineModifiers.add(SlotInlineMod, GetVarInlineMod, PrintInlineMod);
basic.argumentInterpolators.add(GetVarInterpolator);

export const BuiltinConfiguration: Configuration = Object.freeze(basic);
