import * as emmm from '@the_dissidents/libemmm';

export const prerenderBlock = new emmm.BlockModifierDefinition<string>(
    'pre-render', emmm.ModifierSlotType.Normal,
    { });

export const prerenderRenderer: emmm.BlockRendererDefiniton<emmm.HTMLRenderType> = [
    prerenderBlock, async (node, cxt) => {
        return <div data-prerender style="display:contents" data-id={cxt.state.addSourceMap(node.location)}>
            {await cxt.state.render(node.content, cxt)}
        </div>
    }
]
