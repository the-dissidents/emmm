import * as emmm from '@the_dissidents/libemmm';
import { initRatings, overallTableBlock, overallTableRenderer, ratingHeaderSystem, ratingHiddenBlock, ratingTableBlock, ratingTableRenderer } from './RatingTable';
import { ratingEntryBlock } from './RatingEntry';
import { basicFieldSystems, categorySystem, endBlock, endRenderer, getEmmmMetadata, infoFieldSystem, initHeader, publishedSystem } from './Header';
import wcwidth from 'wcwidth';

const custom = emmm.Configuration.from(emmm.DefaultConfiguration);
custom.kernel.collapseWhitespaces = true;
custom.initializers.push(initHeader, initRatings);
custom.systemModifiers.add(infoFieldSystem, publishedSystem, categorySystem, ...basicFieldSystems, ratingHeaderSystem);
custom.blockModifiers.add(ratingTableBlock, ratingHiddenBlock, overallTableBlock, endBlock, ratingEntryBlock);

const render = emmm.createHTMLRenderConfiguration(window);
render.addBlockRenderer(ratingTableRenderer, overallTableRenderer, endRenderer);

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

render.options.headerPlugins.push(async (cxt) => {
    const metadata = await getEmmmMetadata(cxt.parsedDocument.context, cxt);
    return <header>
        { metadata.coverUrl &&
            <figure>
            <img src={await cxt.config.options.transformAsset(metadata.coverUrl)}
                 data-original-src={metadata.coverUrl} />
            </figure> }

      <h1 class="titles">
        <div class="title">{metadata.title}</div>
        { metadata.subtitle &&
          <div class='subtitle'>{metadata.subtitle}</div> }
      </h1>

      <div class='metadata'>
        { metadata.originalTitle &&
          <p>
              <span class='key'>原标题：</span>
              <span class='originalTitle'>{metadata.originalTitle}</span>
          </p> }
        { metadata.originalUrl &&
          <p>
              <span class='key'>原文链接：</span>
              <span class='originalUrl'>{metadata.originalUrl}</span>
          </p> }
      </div>

      <div class='metadata'>
        { metadata.fields.map(([k, v]) =>
          <p>
              <span class='key'>{k}</span> / <span class='field'>{v}</span>
          </p>) }
      </div>

      <aside class='ttr'><p>
        全文 {(Math.round(metadata.wordCount / 50) * 50).toString()} 字，阅读时间 {(metadata.wordCount / 225).toFixed(0)} 分钟
      </p></aside>

      <hr />
    </header>
})

export const CustomConfig: emmm.ReadonlyConfiguration = custom;
export const CustomHTMLRenderer: emmm.ReadonlyRenderConfiguration<emmm.HTMLRenderType> = render;
