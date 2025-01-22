import { CustomConfiguration, Configuration } from "../interface";
import { DefineBlockMod } from "./define-block";
import { DefineInlineMod } from "./define-inline";
import { initParseContext } from "./internal";
import { SlotBlockMod, SlotInlineMod } from "./slot";
import { VarMod, GetVarInlineMod, GetVarInterpolator } from "./var";

let basic = new CustomConfiguration();
basic.initializers = [initParseContext];
basic.addSystem(DefineBlockMod, DefineInlineMod, VarMod);
basic.addBlock(SlotBlockMod);
basic.addInline(SlotInlineMod, GetVarInlineMod);
basic.addInterpolator(GetVarInterpolator);

export const BuiltinConfiguration: Configuration = Object.freeze(basic);
