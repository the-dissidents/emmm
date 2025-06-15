import * as emmm from '@the_dissidents/libemmm';
import { ratingTableBlock, ratingTableRenderer } from './RatingTable';
import { headerBlock, headerRenderer } from './Header';

const custom = emmm.Configuration.from(emmm.DefaultConfiguration);
custom.blockModifiers.add(ratingTableBlock, headerBlock);

const render = emmm.RenderConfiguration.from(emmm.HTMLRenderConfiguration);
render.addBlockRenderer(ratingTableRenderer, headerRenderer);

export const CustomConfig: emmm.ReadonlyConfiguration = custom;
export const CustomHTMLRenderer: emmm.ReadonlyRenderConfiguration<emmm.HTMLRenderType> = render;