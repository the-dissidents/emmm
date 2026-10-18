import type {} from "@the_dissidents/emmui-plugin-sdk";
import * as xlsx from "xlsx";

type Row = Record<string, unknown>;
type PfbTable = Map<string, Row[]>;

const str = (value: unknown): string =>
    value === undefined || value === null ? '' : String(value);

const emmmescape = (text: string): string =>
    text
        .replaceAll(']', '\\]')
        .replaceAll(';', '\\;')
        .replaceAll('|', '\\|');

const fixFeishuFilename = (text: string): string => {
    const dot = text.lastIndexOf('.');
    if (dot < 0) return text;
    return text.slice(0, dot).replaceAll('.', '_') + text.slice(dot);
};

const joinPath = (folder: string, file: string): string => {
    if (file.startsWith('/')) return file;
    return folder.replace(/[\\/]+$/, '') + '/' + file;
};

const readSheet = async (path: string, sheetName: string | number): Promise<unknown[][]> => {
    const data = await emmui.call('read-binary-file', path);
    if (!data) throw new Error(`无法读取文件：${path}`);

    const book = xlsx.read(data, { type: 'array' });
    const name = typeof sheetName == 'number' ? book.SheetNames[sheetName] : sheetName;
    const sheet = name === undefined ? undefined : book.Sheets[name];
    if (!sheet) throw new Error(`未发现工作表：${sheetName}`);

    return xlsx.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
    });
};

const readMonthly = (rows: unknown[][]): Row[] => {
    if (rows.length == 0) return [];

    const headers = rows[0].map(str);
    return rows.slice(1).map((row) => {
        const item: Row = {};
        headers.forEach((header, i) => {
            item[header] = row[i] ?? '';
        });
        return item;
    });
};

const readPfb = (rows: unknown[][]): PfbTable => {
    const table: PfbTable = new Map();
    if (rows.length == 0) return table;

    const headers = rows[0].map(str);
    for (const row of rows.slice(1)) {
        const title = str(row[0]).trim();
        const item: Row = {};
        for (let i = 1; i < headers.length; i++)
            item[headers[i]] = row[i] ?? '';

        const existing = table.get(title);
        if (existing) existing.push(item);
        else table.set(title, [item]);
    }
    return table;
};

const work = async (
    imgfolder: string,
    monthlyPath: string,
    monthlyCats: string | null,
    pfbPath: string,
    pfbCategory: string,
    blacklist: Set<string>,
): Promise<[string, string[]]> => {
    const messages: string[] = [];

    if (!imgfolder) messages.push('请指定图片文件夹地址');
    if (!monthlyPath) messages.push('请指定月度回顾表格地址');
    if (!pfbPath) messages.push('请指定评分表地址');
    if (messages.length > 0) return ['', messages];

    const cats = new Set(
        (monthlyCats || '').split('//').filter((cat) => cat !== ''));

    const monthly = readMonthly(await readSheet(monthlyPath, 0));
    let pfb = readPfb(await readSheet(pfbPath, '评分表'));

    if (pfbCategory) {
        const filtered: PfbTable = new Map();
        for (const [title, rows] of pfb) {
            const kept = rows.filter((row) => str(row['特殊']) == pfbCategory);
            if (kept.length > 0) filtered.set(title, kept);
        }
        pfb = filtered;
    }

    const printRatings = (title: string, n?: number, data = false): string => {
        const selection = pfb.get(title);
        if (!selection) {
            messages.push(`评分表未发现「${title}」`);
            return `Title '${title}' not found.`;
        }

        let item: Row;
        if (selection.length > 1) {
            if (n === undefined) {
                messages.push(`评分表中发现多个「${title}」，采取第一个`);
                n = 0;
            }
            if (n < 0 || n >= selection.length)
                return `Index ${n} out of bounds for duplicated title '${title}'`;
            item = selection[n];
        } else {
            if (n !== undefined && n > 0)
                return `Title '${title}' is unique; cannot select index ${n}`;
            item = selection[0];
        }

        const ZEROES = ['×', 'x', 'X'];

        const author = str(item['导演']);
        if (!author) messages.push(`评分表中「${title}」没有导演信息`);

        let ratings = '';
        for (const [key, value] of Object.entries(item)) {
            const score = str(value);
            if (!(score.startsWith('★') || ZEROES.includes(score))) continue;
            if (blacklist.has(key)) continue;
            ratings += `|${key}|${ZEROES.includes(score) ? 0 : score.length}`;
        }

        return `[.ratings${data ? '-data' : ''} ${title}|dir=${author}\n${ratings}]`;
    };

    const entries: [string, string][] = [];
    const dataOnly: string[] = [];

    for (let i = 0; i < monthly.length; i++) {
        const row = monthly[i];
        const cat = str(row['分类']);
        if (cats.size > 0 && !cats.has(cat)) continue;

        const debugTitle = str(row['片名'] || row['原片名']).trim();
        if (!debugTitle)
            messages.push(`回顾表中第${i}行没有中文名也没有英文名`);

        if (!row['编辑']) {
            messages.push(`回顾表中「${debugTitle}」没有任何短评，只加入总表`);
            dataOnly.push(printRatings(debugTitle, undefined, true) || '???');
            continue;
        }

        let entry = '<<<\n[.style test]\n';

        if (row['配图']) {
            const filename = fixFeishuFilename(str(row['配图']));
            entry += `[.image file:${emmmescape(joinPath(imgfolder, filename))};]\n\n`;
        } else {
            messages.push(`回顾表中「${debugTitle}」没有配图`);
            entry += '?? Missing Image\n\n';
        }

        entry += '## ';
        if (row['片名'])
            entry += str(row['片名']).trim() + (row['原片名'] ? '\n' : ' ');
        if (row['原片名'])
            entry += `_${str(row['原片名']).trim()}_ `;
        if (row['年份']) {
            entry += `(${str(row['年份'])})\n\n`;
        } else {
            messages.push(`回顾表中「${debugTitle}」没有年份`);
            entry += '\n\n';
        }

        entry += `*@${str(row['编辑'])} 评分：${str(row['个人评分'])}*\n`;
        entry += `${row['短评'] ? str(row['短评']) : '???'}\n\n`;
        if (!row['短评']) messages.push(`回顾表中「${debugTitle}」短评1为空`);

        if (row['编辑2']) {
            entry += `*@${str(row['编辑2'])} 评分：${str(row['个人评分2'])}*\n`;
            entry += `${row['短评2'] ? str(row['短评2']) : '???'}\n\n`;
            if (!row['短评2']) messages.push(`回顾表中「${debugTitle}」短评2为空`);
        }

        entry += (printRatings(debugTitle) || '???') + '\n>>>';
        entries.push([cat, entry]);
    }

    entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

    let text = '';
    for (let i = 0; i < entries.length;) {
        const cat = entries[i][0];
        const group: string[] = [];
        while (i < entries.length && entries[i][0] == cat) {
            group.push(entries[i][1]);
            i++;
        }
        text += '# ' + cat + '\n\n[.gallery]\n<<<\n\n'
            + group.join('\n\n') + '\n\n>>>\n\n';
    }

    return [dataOnly.join('\n') + '\n' + text, messages];
};

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
            names: { 'zh-cn': '评分表文件', },
            defaultValue: ''
        }, {
            input: 'textbox',
            key: 'pfb_category',
            names: { 'zh-cn': '评分表分类', },
            defaultValue: ''
        }, {
            input: 'file',
            key: 'monthly_path',
            names: { 'zh-cn': '月度回顾文件', },
            defaultValue: ''
        }, {
            input: 'folder',
            key: 'asset_path',
            names: { 'zh-cn': '素材文件夹', },
            defaultValue: ''
        }, {
            input: 'textbox',
            key: 'monthly_cats',
            names: { 'zh-cn': '月度回顾分类列表', },
            defaultValue: ''
        }, {
            input: 'textbox',
            key: 'blacklist',
            names: { 'zh-cn': '从评分表中排除的编辑', },
            defaultValue: '脆脆鲨//铜tt//42.'
        }, {
            action: 'button',
            key: 'generate',
            names: { 'zh-cn': '生成', },
        }, {
            input: 'textarea',
            key: 'messages',
            readonly: true, save: false,
            names: { 'zh-cn': '提示信息', },
            defaultValue: ''
        }, {
            input: 'textarea',
            key: 'output',
            readonly: true, save: false, isCode: true,
            names: { 'zh-cn': '结果', },
            defaultValue: ''
        }]
    });
    await emmui.call('log', 'initialized');

    emmui.onAction('generate', async () => {
        void (async () => {
            try {
                const pfbPath = await emmui.get('pfb_path') as string;
                const pfbCategory = await emmui.get('pfb_category') as string;
                const monthlyPath = await emmui.get('monthly_path') as string;
                const assetPath = await emmui.get('asset_path') as string;
                const monthlyCats = await emmui.get('monthly_cats') as string;
                const blacklist = await emmui.get('blacklist') as string;

                const [output, msgs] = await work(
                    assetPath,
                    monthlyPath,
                    monthlyCats || null,
                    pfbPath,
                    pfbCategory,
                    new Set(blacklist.split('//')),
                );

                await emmui.set('messages', msgs.join('\n'));
                await emmui.set('output', output);
            } catch (e) {
                await emmui.set('output', '');
                await emmui.set('messages', `出现了意外错误：\n\n${e}`);
            }
        })();
    });

    emmui.on('ping', async () => {
        return `${await emmui.get('message')} ${await emmui.call('counter', undefined)}`;
    });

    emmui.on('finalize', async () => {
        await emmui.call('log', 'finalizing');
    });
})();
