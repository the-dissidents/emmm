import { Menu, Submenu, CheckMenuItem } from '@tauri-apps/api/menu';
import { pluginDefinitions, plugins } from './Settings';

/** Plugin switches live in the native menu; disabled plugins add no controls to the editor. */
export async function installPluginMenu(onChange: () => void) {
    const menu = await Menu.default();
    const items = await Promise.all(pluginDefinitions.map(async ({ id, name }) => {
        const item = await CheckMenuItem.new({ id: `plugin-${id}`, text: name,
            checked: plugins.get()[id], action: () => {
                plugins.set({ ...plugins.get(), [id]: !plugins.get()[id] });
                onChange();
            } });
        plugins.subscribe(value => { void item.setChecked(value[id]); });
        return item;
    }));
    await menu.append(await Submenu.new({ text: '插件', items }));
    await menu.setAsAppMenu();
}
