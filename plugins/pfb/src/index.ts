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

const toStars = (n: number) => n == 0 ? '×' : '★'.repeat(n);

type PfbEntry = {
    ratings: Map<string, number>,
    director: string,
    title: string
};

const work = async (
    imgfolder: string,
    monthlyPath: string,
    pfbPath: string,
    monthlyCats: Set<string>,
    pfbCats: Set<string>,
    blacklist: Set<string>,
): Promise<[string, string[]]> => {
    const messages: string[] = [];

    if (!imgfolder) messages.push('请指定图片文件夹地址');
    if (!monthlyPath) messages.push('请指定月度回顾表格地址');
    if (!pfbPath) messages.push('请指定评分表地址');
    if (messages.length > 0) return ['', messages];

    const monthly = readMonthly(await readSheet(monthlyPath, 0));
    let pfb = readPfb(await readSheet(pfbPath, '评分表'));

    if (pfbCats.size > 0) {
        const filtered: PfbTable = new Map();
        for (const [title, rows] of pfb) {
            // keep one category
            filtered.set(title, rows.filter((row) => pfbCats.has(str(row['特殊']))));
        }
        pfb = filtered;
    }

    const readEntry = (title: string, n?: number): PfbEntry | null => {
        const selection = pfb.get(title);
        if (!selection) {
            messages.push(`评分表未发现「${title}」`);
            return null;
        }

        let item: Row;
        if (selection.length > 1) {
            if (n === undefined) {
                messages.push(`评分表中发现多个「${title}」，采取第一个`);
                n = 0;
            } else if (n < 0 || n >= selection.length) {
                messages.push(`评分表中只有${selection.length}个「${title}」，却要求第${n+1}个`);
                return null;
            }
            item = selection[n];
        } else {
            if (n !== undefined && n > 0) {
                messages.push(`评分表中只有一个「${title}」，却要求第${n+1}个`);
                return null;
            }
            item = selection[0];
        }

        const ZEROES = ['×', 'x', 'X'];
        const ratings = new Map<string, number>();
        for (const [key, value] of Object.entries(item)) {
            const score = str(value);
            if (!(score.startsWith('★') || ZEROES.includes(score))) continue;
            if (blacklist.has(key)) continue;
            ratings.set(key, ZEROES.includes(score) ? 0 : score.length);
        }

        const director = str(item['导演']);
        if (!director) messages.push(`评分表中「${title}」没有导演信息`);

        return { title, ratings, director };
    }

    const printRatings = (entry: PfbEntry, data = false): string => {
        let ratings = '';
        for (const [key, score] of entry.ratings) {
            ratings += `|${key}|${score}`;
        }
        return `[.ratings${data ? '-data' : ''} ${entry.title}|dir=${entry.director}\n${ratings}]`;
    };

    const entries: [string, string][] = [];
    const dataOnly: string[] = [];

    for (let i = 0; i < monthly.length; i++) {
        const row = monthly[i];
        const category = str(row['分类']);
        if (monthlyCats.size > 0 && !monthlyCats.has(category)) continue;

        const titleKey = str(row['片名'] || row['原片名']).trim();
        if (!titleKey)
            messages.push(`回顾表中第${i}行没有中文名也没有英文名`);

        const pfbEntry = readEntry(titleKey);

        if (!row['编辑']) {
            messages.push(`回顾表中「${titleKey}」没有任何短评，只加入总表`);
            dataOnly.push(pfbEntry ? printRatings(pfbEntry, true) : '???');
            continue;
        }

        let entry = '<<<\n[.style test]\n';

        if (row['配图']) {
            const filename = fixFeishuFilename(str(row['配图']));
            entry += `[.image file:${emmmescape(joinPath(imgfolder, filename))};]\n\n`;
        } else {
            messages.push(`回顾表中「${titleKey}」没有配图`);
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
            messages.push(`回顾表中「${titleKey}」没有年份`);
            entry += '\n\n';
        }

        const makeReview = (postfix: string) => {
            const editor = str(row['编辑' + postfix]);
            const rating = pfbEntry?.ratings.get(editor);
            let ratingString: string;
            if (rating === undefined) {
                ratingString = str(row['个人评分' + postfix]);
                if (ratingString)
                    messages.push(`评论「${titleKey}」的编辑${editor}没有在评分表里打分，采用回顾表中数据`);
                else {
                    messages.push(`评论「${titleKey}」的编辑${editor}没有找到任何打分数据`);
                    ratingString = '???';
                }
            } else {
                ratingString = toStars(rating);
            }
            entry += `*@${editor} 评分：${ratingString}*\n`;

            const review = str(row['短评' + postfix]);
            if (!review) messages.push(`回顾表中编辑${editor}的「${titleKey}」短评为空`);
            entry += `${review || '???'}\n\n`;
        }

        makeReview('');
        if (row['编辑2']) makeReview('2');

        entry += (pfbEntry ? printRatings(pfbEntry) : '???') + '\n>>>';
        entries.push([category, entry]);
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
        version: '000002',
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
            input: 'textbox',
            key: 'blacklist',
            names: { 'zh-cn': '从评分表中排除的编辑', },
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
        }, {
            action: 'button',
            key: 'help',
            names: { 'zh-cn': '使用说明', },
        }, ]
    });
    await emmui.call('log', 'initialized');

    emmui.onAction('generate', () => void (async () => {
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
                pfbPath,
                new Set(monthlyCats.split('//').filter(Boolean)),
                new Set(pfbCategory.split('//').filter(Boolean)),
                new Set(blacklist.split('//').filter(Boolean)),
            );

            await emmui.set('messages', msgs.join('\n'));
            await emmui.set('output', output);
        } catch (e) {
            await emmui.set('messages', '');
            await emmui.set('output', '');
            await emmui.call('messagebox', {
                msg: `出现了意外错误：\n\n${e}`,
                kind: 'error'
            });
        }
    })());

    emmui.onAction('help', () => void (async () => {
        await emmui.call('messagebox', {
            msg: '1. 去飞书里打开月度回顾表格，导出Excel文件，注意选择只下载月度回顾这一个页面。记得勾选下载附件，下载了之后解压成一个文件夹。\n\n2. 去腾讯文档将评分表导出为Excel文件，这里不需要下载附件\n\n3. 点击按钮填入以上得到的两个表格和一个文件夹，输入相应信息。多个分类用双斜杠（//）分开\n\n4. 点击生成',
            kind: 'info',
            title: '「月度回顾评分表」插件使用说明'
        });
    })());

    emmui.on('finalize', async () => {
        await emmui.call('log', 'finalizing');
    });
})();
