import type {} from "@the_dissidents/emmui-plugin-sdk";
import * as xlsx from "xlsx";

void (async () => {
    await emmui.init({
        id: 'pfb',
        version: '000001',
        names: {
            'zh-cn': '月度回顾评分表',
        },
        apiVersion: '000200',
        ui: [{
            input: 'file',
            key: 'pfb_path',
            readonly: true,
            names: { 'zh-cn': '评分表文件', },
            defaultValue: ''
        }, {
            input: 'file',
            key: 'monthly_path',
            readonly: true,
            names: { 'zh-cn': '月度回顾文件', },
            defaultValue: ''
        }, {
            input: 'folder',
            key: 'asset_path',
            readonly: true,
            names: { 'zh-cn': '素材文件夹', },
            defaultValue: ''
        }, {
            input: 'textbox',
            key: 'monthly_cats',
            readonly: true,
            names: { 'zh-cn': '月度回顾分类列表', },
            defaultValue: ''
        }, {
            input: 'textbox',
            key: 'blacklist',
            readonly: true,
            names: { 'zh-cn': '从评分表中排除的编辑', },
            defaultValue: ''
        }, {
            action: 'button',
            key: 'generate',
            names: { 'zh-cn': '生成', },
        }, {
            input: 'textarea',
            key: 'messages',
            names: { 'zh-cn': '提示信息', },
            defaultValue: ''
        }, {
            input: 'textarea',
            key: 'output',
            names: { 'zh-cn': '结果', },
            defaultValue: ''
        }]
    });
    await emmui.call('log', 'initialized');

    emmui.onAction('generate', async () => {
        const pfb_path = await emmui.get('pfb_path') as string;

        const book = xlsx.read(await emmui.call('read-binary-file', pfb_path));
        await emmui.call('log', `sheets: ${book.SheetNames}`);
    });

    emmui.on('ping', async () => {
        return `${await emmui.get('message')} ${await emmui.call('counter', undefined)}`;
    });

    emmui.on('finalize', async () => {
        await emmui.call('log', 'finalizing');
    });
})();
