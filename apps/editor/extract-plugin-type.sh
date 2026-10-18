#! /bin/sh

pnpx typescript src/lib/plugin/api.js --declaration --allowJs --emitDeclarationOnly --outDir "../../packages/emmui-plugin-sdk/" --ignoreConfig --stripInternal
