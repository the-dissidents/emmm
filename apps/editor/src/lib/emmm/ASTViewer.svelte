<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import { Debug } from '$lib/Debug';

  interface Props {
    node?: emmm.DocumentNode
  };

  const { node }: Props = $props();
</script>

{#snippet argument(a: emmm.ModifierArgument)}
  {#each a.content as x}
    {#if x.type == emmm.NodeType.Text}
      {x.content}
    {:else if x.type == emmm.NodeType.Escaped}
      <code class="escaped">{x.content}</code>
    {:else if x.type == emmm.NodeType.Interpolation}
      <code class="interp">{x.definition.name}</code>
      {@render argument(x.argument)}
      <code class="interp">{x.definition.postfix} = </code>
      {x.expansion}
    {:else}
      {Debug.never(x)}
    {/if}
  {/each}
{/snippet}

{#snippet ast(node: emmm.DocumentNode)}
  {@const type = emmm.NodeType[node.type]}
  {#if node.type == emmm.NodeType.Root}
    <details open>
      <summary>{type}@{node.source.name}</summary>
      {#each node.content as n (n)}
        {@render ast(n)}
      {/each}
    </details>
  {:else if node.type == emmm.NodeType.Group}
    <details>
      <summary>{type}@{node.location.start}</summary>
      {#each node.content as n (n)}
        {@render ast(n)}
      {/each}
    </details>
  {:else if node.type == emmm.NodeType.Paragraph}
    <details open class='inline'>
      <summary>{type}@{node.location.start}</summary>
      {#each node.content as n (n)}
        {@render ast(n)}
      {/each}
    </details>
  {:else if node.type == emmm.NodeType.Escaped}
    <code class="escaped">{node.content}</code>
  {:else if node.type == emmm.NodeType.Preformatted}
    <details open class='inline'>
      <summary>{type}@{node.location.start}</summary>
      <code>{node.content.text}</code>
    </details>
  {:else if node.type == emmm.NodeType.InlineModifier
         || node.type == emmm.NodeType.BlockModifier
         || node.type == emmm.NodeType.SystemModifier}
    <details class={type}>
      <summary>{type}:{node.mod.name}@{node.location.start}</summary>
      <table>
        <tbody>
          {#each node.arguments.named.entries() as [k, v]}
            <tr>
              <th>{k}</th>
              <td>
                {@render argument(v)}
              </td>
            </tr>
          {/each}
          {#each node.arguments.positional as v, i}
            <tr>
              <th>
                ({i})
              </th>
              <td>
                {@render argument(v)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if node.expansion}
        {#if node.content.length}
          <details open class='inline'>
            <summary>content</summary>
            {#each node.content as n (n)}
              {@render ast(n)}
            {/each}
          </details>
        {/if}
        <details open class='inline'>
          <summary class='inline'>expansion</summary>
          {#each node.expansion as n (n)}
            {@render ast(n)}
          {/each}
        </details>
      {:else}
        {#each node.content as n (n)}
          {@render ast(n)}
        {/each}
      {/if}
    </details>
  {:else if node.type == emmm.NodeType.Text}
    <span class="text">
      {node.content}
    </span>
  {:else}
    {Debug.never(node)}
  {/if}
{/snippet}

{#if node}
  {@render ast(node)}
{/if}

<style>
  details {
    font-size: 0.8rem;

    padding-left: 5px;
    border-left: 1px solid gray;
    border-radius: 4px;
    margin-block: 5px;

    & summary {
      font-family: monospace;
      font-weight: bold;

      &:hover {
        background-color: gainsboro;
      }
    }

    &.inline {
      & > summary {
        display: inline-block;
      }
      &[open]::details-content {
        display: inline;
      }
    }
  }

  code.escaped {
    color: gray;
    &::before {
      content: '\\';
    }
  }

  code.interp {
    color: darkcyan;
  }

  .text:has(+ details)::after {
    content: '';
    display: inline-block;
    width: 20px;
    border-bottom: 1px dashed gray;
  }
</style>
