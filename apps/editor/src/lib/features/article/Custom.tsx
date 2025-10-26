import * as emmm from '@the_dissidents/libemmm';
import { ratingTableBlock, ratingTableRenderer } from './RatingTable';
import { basicFieldSystems, endBlock, endRenderer, headerBlock, headerRenderer, infoFieldSystem, initHeader } from './Header';
import wcwidth from 'wcwidth';

const custom = emmm.Configuration.from(emmm.DefaultConfiguration);
custom.kernel.collapseWhitespaces = true;
custom.initializers.push(initHeader);
custom.systemModifiers.add(infoFieldSystem, ...basicFieldSystems);
custom.blockModifiers.add(ratingTableBlock, headerBlock, endBlock);

const render = emmm.RenderConfiguration.from(emmm.HTMLRenderConfiguration);
render.addBlockRenderer(ratingTableRenderer, headerRenderer, endRenderer);

export function renderText(text: string) {
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
    for (const ch of text) {
        if (ch == '\n') {
            submit();
            result.push(<br/>);
            continue;
        }
        const w = wcwidth(ch);
        if (w != previousWidth) {
            submit();
            previousWidth = w;
        }
        previous += ch;
    }
    submit();
    return result;
}

render.textRenderer = (node, cxt) => {
    switch (node.type) {
        case emmm.NodeType.Preformatted:
            return new Text(node.content.text);
        case emmm.NodeType.Escaped:
            return new Text(node.content);
        case emmm.NodeType.Text:
            return renderText(node.content);
    }
}

export const CustomConfig: emmm.ReadonlyConfiguration = custom;
export const CustomHTMLRenderer: emmm.ReadonlyRenderConfiguration<emmm.HTMLRenderType> = render;
