import { untrack } from 'svelte';

export function hook<T>(
    track: () => T,
    action: (value: ReturnType<typeof $state.snapshot<T>>) => void
) {
    $effect(() => {
        const value = $state.snapshot(track());
        untrack(() => action(value));
    });
}
