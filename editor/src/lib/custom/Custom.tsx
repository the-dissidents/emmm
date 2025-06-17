import * as emmm from '@the_dissidents/libemmm';
import { ratingTableBlock, ratingTableRenderer } from './RatingTable';
import { endBlock, endRenderer, headerBlock, headerRenderer } from './Header';
import wcwidth from 'wcwidth';

const custom = emmm.Configuration.from(emmm.DefaultConfiguration);
custom.blockModifiers.add(ratingTableBlock, headerBlock, endBlock);

const render = emmm.RenderConfiguration.from(emmm.HTMLRenderConfiguration);
render.addBlockRenderer(ratingTableRenderer, headerRenderer, endRenderer);

render.textRenderer = (node, cxt) => {
    switch (node.type) {
        case emmm.NodeType.Preformatted:
            return new Text(node.content.text);
        case emmm.NodeType.Text:
            let result: Node[] = [];
            let previous = '', previousWidth: number | undefined;
            function submit() {
                if (previous.length > 0) {
                    result.push(previousWidth == 2 
                        ? <span class='wide'>{previous}</span>
                        : new Text(previous));
                    previous = '';
                }
            }
            for (const ch of node.content) {
                const w = wcwidth(ch);
                if (w != previousWidth) {
                    submit();
                    previousWidth = w;
                }
                previous += ch;
            }
            submit();
            return result;
        case emmm.NodeType.Escaped:
            return new Text(node.content);
    }
}

export const CustomConfig: emmm.ReadonlyConfiguration = custom;
export const CustomHTMLRenderer: emmm.ReadonlyRenderConfiguration<emmm.HTMLRenderType> = render;