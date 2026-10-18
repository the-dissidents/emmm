import type { emmui as API } from "./api.d.ts";

declare global {
  var emmui: typeof API;
}

export {};
