<script lang="ts" module>
  export type ListColumn = {
      name: string,
      width?: string,
      contentStyle?: string,
      hAlign?: 'left' | 'center' | 'right',
      vAlign?: 'bottom' | 'middle' | 'top',
      // FIXME: not used
      type: 'text' | 'html' | 'image' | 'button',
      // grow?: number
  };

  export type ListCell = {
      type: 'text',
      content: string,
      style?: string,
      alt?: string
  } | {
      type: 'html',
      content: string
  } | {
      type: 'image',
      url: string,
      height?: string,
      style?: string,
      alt?: string
  } | ListButtonCell;

  export type ListButtonCell = {
      type: 'button',
      text: string,
      onClick?: (self: ListButtonCell) => void,
      style?: string
  }

  export type ListItem = {
      cols: {[key: string]: ListCell | undefined},
      onClick?: (self: ListItem) => void
  };

  export type GrowResult = {
      items: ListItem[],
      more: boolean
  };

  export interface ListViewHandleIn {
      provideMoreItems?(): GrowResult | Promise<GrowResult>;
  }

  export interface ListViewHandleOut {
      reset(initial?: ListItem[]): void;
      getItems(): ReadonlyArray<ListItem>;
  }
</script>

<script lang="ts">
  import { assert } from "$lib/utils";

  import { onMount, tick } from "svelte";
  import type { SvelteMap } from "svelte/reactivity";
  import Resizer from "./Resizer.svelte";
  import type { SvelteHTMLElements } from "svelte/elements";

  type Props = {
      header: SvelteMap<string, ListColumn>,
      hin?: ListViewHandleIn,
      hout?: ListViewHandleOut
  } & SvelteHTMLElements['div'];

  let { header, hin = {}, hout = $bindable(), ...rest }: Props = $props();
  let items: ListItem[] = $state([]),
      loadState: 'hasMore' | 'done' | 'error' = $state('hasMore'),
      loadingLine: HTMLElement | undefined = $state(),
      working = false;

  const observer = new IntersectionObserver(async ([ent]) => {
      if (!ent.isIntersecting) return;
      fetch();
  });

  async function fetch() {
      if (!hin.provideMoreItems) {
          loadState = 'done';
          return;
      }
      if (working || loadState != 'hasMore') return;
      working = true;

      try {
          let result = await hin.provideMoreItems();
          items.push(...result.items);
          loadState = result.more ? 'hasMore' : 'done';
      } catch (e: any) {
          loadState = 'error';
          console.warn(e.stack);
          throw new Error('error when fetching items', {cause: e});
      } finally {
          working = false;
      }

      // check if it is still visible
      await tick();
      observer.unobserve(loadingLine!);
      observer.observe(loadingLine!);
  }

  onMount(() => {
      hout = {
          reset(initial = []) {
              items = initial;
              if (hin.provideMoreItems) {
                  loadState = 'hasMore';
                  fetch();
              } else {
                  loadState = 'done';
              }
          },
          getItems() {
              return items;
          },
      };
      assert(loadingLine !== undefined);
      observer.observe(loadingLine);
  });

  let cols: {[key: string]: HTMLElement} = $state({});

</script>

<div class="list-container" {...rest}>
<table>
<thead>
  <tr>
      {#each header as [_key, col], i}
      <th scope="col"
          style='text-align: {col.hAlign ?? 'left'};
                 width: {col.width ?? 'auto'};'
          bind:this={cols[_key]}>{col.name}</th>
      {#if i < header.size - 1}
      <th scope="col"
          style='width: 2px; height: 0.8lh'>
          <Resizer vertical={true} first={cols[_key]} minValue={0} stretch={true}/>
      </th>
      {/if}
      {/each}
  </tr>
</thead>
<tbody>
  {#each items as item}
  <tr onclick={() => item.onClick?.(item)}>
      {#each header as [key, col], i}
      <td style='text-align: {col.hAlign ?? 'left'};
                 vertical-align: {col.vAlign ?? 'middle'};
                 {col.contentStyle}'>
          {#if item.cols[key]}
          {@const cell = item.cols[key]}
              {#if      cell.type == 'html'}
                  {@html cell.content}
              {:else if cell.type == 'text'}
                  <span title={cell.alt} style={cell.style}>{cell.content}</span>
              {:else if cell.type == 'image'}
                  <img alt={cell.alt} src={cell.url}
                      style="max-height: {cell.height ?? 'auto'}; max-width: 100%; {cell.style}" />
              {:else if cell.type == 'button'}
                  <button style={cell.style}
                      onclick={() => cell.onClick?.(cell)}>{cell.text}</button>
              {/if}
          {/if}
      </td>
      {#if i < header.size - 1}
          <td></td>
      {/if}
      {/each}
  </tr>
  {/each}
  <tr class={[loadState == 'error' ? 'error' : 'loading', loadState == 'done' && 'hidden']}
      bind:this={loadingLine}
  ><td colspan={header.size * 2 - 1}>
      {loadState == 'error' ? 'an error occurred when loading' : 'loading'}
  </td></tr>
</tbody>
</table>
</div>

<style>
  .list-container {
      box-sizing: border-box;
      width: 100%;
      /* height: 100%; */
      overflow: scroll;
      /* margin: 2px 0px; */
      border-radius: 3px;
      border: 1px solid thistle;
      background-color: white;
  }

  table {
      font-size: 80%;
      width: 100%;
      border: none;
      border-collapse: collapse;
      position: relative;
      table-layout: fixed;
  }
  th {
      background-color: thistle;
      position: sticky;
      top: 0;
  }
  th, td {
      padding: 2px 4px;
      border: none;
      margin: none;
      max-width: 0;
  }
  .hidden {
      display: none;
  }

  .loading {
      animation: 0.7s infinite alternate load;
      text-align: center;
  }
  @keyframes load {
      from { background-color: gainsboro; }
      to { background-color: whitesmoke; }
  }

  .error {
      background-color: palevioletred;
      text-align: center;
  }
</style>
