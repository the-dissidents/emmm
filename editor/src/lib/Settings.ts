import { path } from "@tauri-apps/api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import * as fs from "@tauri-apps/plugin-fs"
import { assert } from "./Debug";

const configPath = 'config.json';

let settingsInitialized = false;
let configData = {
    weixinAppId: '',
    weixinAppSecret: '',
    windowW: 1400,
    windowH: 900,
    // TODO: these are no-nps for now
    sizeLeft: 250,
    sizeRight: 350
};
let onInitCallbacks: (() => void)[] = [];

type ConfigType = typeof configData;
type ConfigKey = keyof ConfigType;

async function saveSettings() {
    const configDir = await path.appConfigDir();
    if (!await fs.exists(configDir))
        await fs.mkdir(configDir, {recursive: true});

    try {
        await fs.writeTextFile(configPath, 
            JSON.stringify(configData), {baseDir: BaseDirectory.AppConfig});
        console.log('saved config');
    } catch (e) {
        // fail silently
        console.error('error saving config:', e);
    }
}

export const Settings = {
    async init() {
        console.log('config path:', await path.appConfigDir(), configPath);
        try {
            if (!await fs.exists(configPath, {baseDir: BaseDirectory.AppConfig}))
                console.log('no config file found')
            else configData = JSON.parse(await fs.readTextFile(
                configPath, {baseDir: BaseDirectory.AppConfig}));
        } catch (e) {
            console.error('error reading config file:', e);
        } finally {
            settingsInitialized = true;
            for (const callback of onInitCallbacks)
                callback();
        }
    },
    
    onInitialized(callback: () => void) {
        if (!settingsInitialized) onInitCallbacks.push(callback);
        else callback();
    },

    async set<prop extends ConfigKey>(key: prop, value: ConfigType[prop]) {
        assert(settingsInitialized);
        configData[key] = value;
        await saveSettings();
    },
    get<prop extends ConfigKey>(key: prop): ConfigType[prop] {
        assert(settingsInitialized);
        return configData[key];
    }
}