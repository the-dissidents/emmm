<script lang="ts" module>
    export type ListColumn = {
        name: string,
        short?: boolean,
        contentStyle?: string,
        hAlign?: 'left' | 'center' | 'right',
        vAlign?: 'bottom' | 'middle' | 'top',
        type: 'text' | 'html' | 'image',
        // grow?: number
    };

    export type ListCell = {
        type: 'text',
        content: string
    } | {
        type: 'html',
        content: string
    } | {
        type: 'image',
        url: string,
        height?: number
    };

    export type ListItem = {
        cols: {[key: string]: ListCell},
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
    import { assert } from "$lib/Debug";

    import { onMount, tick } from "svelte";
    import type { SvelteMap } from "svelte/reactivity";
    import Resizer from "./Resizer.svelte";

    interface Props {
        header: SvelteMap<string, ListColumn>,
        hin?: ListViewHandleIn,
        hout?: ListViewHandleOut
    };

    let { header, hin = {}, hout = $bindable() }: Props = $props();
    let items: ListItem[] = $state([]),
        hasMore = $state(true),
        loadingLine: HTMLElement | undefined = $state(),
        working = false;

    const observer = new IntersectionObserver(async ([ent]) => {
        if (!ent.isIntersecting) return;
        fetch();
    });

    async function fetch() {
        if (!hin.provideMoreItems) {
            hasMore = false;
            return;
        }
        if (working || !hasMore) return;
        working = true;
        let result = await hin.provideMoreItems();
        items.push(...result.items);
        hasMore = result.more;
        console.log(`got ${result.items.length} item[s]`);
        if (!hasMore) console.log(`note: no more items`);
        working = false;
        
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
                    hasMore = true;
                    fetch();
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

<div class="list-container">
<table>
<thead>
    <tr>
        {#each header as [_key, col], i}
        <th scope="col"
            style='text-align: {col.hAlign ?? 'left'};
                   {col.short ? 'width: 5%; white-space: nowrap;' : 'width: auto;'}'
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
                   {col.contentStyle}'
            colspan={i == header.size - 1 ? 1 : 2}>
            {#if item.cols[key]}
            {@const cell = item.cols[key]}
                {#if      cell.type == 'html'}
                    {@html cell.content}
                {:else if cell.type == 'text'}
                    {cell.content}
                {:else if cell.type == 'image'}
                    <img alt={col.name} height={cell.height} src={cell.url} />
                {/if}
            {/if}
        </td>
        {/each}
    </tr>
    {/each}
    <tr class={['loading', !hasMore && 'hidden']}
        bind:this={loadingLine}
    ><td colspan={header.size * 2 - 1}>loading</td></tr>
</tbody>
</table>
</div>

<style>
    .list-container {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        overflow: scroll;
        /* margin: 2px 0px; */
        border-radius: 3px;
        border: 1px solid thistle;
    }

    table {
        font-size: 85%;
        width: 100%;
        border: none;
        border-collapse: collapse;
        position: relative;
        background-color: white;
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
</style>