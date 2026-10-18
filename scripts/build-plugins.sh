#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

pnpm -r --filter='./plugins/*' build

rm -rf plugins/dist
mkdir -p plugins/dist

for dir in plugins/*/dist; do
    [ -d "$dir" ] || continue
    cp -R "$dir/." plugins/dist/
done
