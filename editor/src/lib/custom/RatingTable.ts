import * as emmm from '@the_dissidents/libemmm';

type RatingTableData = {
    title: string,
    ratings: Map<string, number>
};

export const ratingTableBlock = new emmm.BlockModifierDefinition<RatingTableData>(
    'ratings', emmm.ModifierSlotType.None,
{
    prepareExpand(node, cxt, immediate) {
        let msg = emmm.helper.checkArguments(node, 3, Infinity);
        if (msg) return msg;
        if ((node.arguments.length - 1) % 2 !== 0)
            return [new emmm.messages.InvalidArgumentMessage(
                node.arguments.at(-1)!.location, 'a rating should be paired with a name')];

        const title = node.arguments[0].expansion!.trim();
        const ratings = new Map<string, number>();
        for (let i = 1; i < node.arguments.length; i += 2) {
            const ratingArg = node.arguments[i+1];
            const rating = parseInt(ratingArg.expansion!.trim(), 10);
            if (isNaN(rating))
                return [new emmm.messages.InvalidArgumentMessage(
                    ratingArg.location, 'a rating should be a number')];
            if (rating < 0 || rating > 4)
                return [new emmm.messages.InvalidArgumentMessage(
                    ratingArg.location, 'a rating should be between 0 and 4 (inclusive)')];
            ratings.set(node.arguments[i].expansion!.trim(), rating);
        }
        node.state = { title, ratings };
        return [];
    },
});

const TABLE_COLUMNS = 4;

export const ratingTableRenderer: 
emmm.BlockRendererDefiniton<emmm.HTMLRenderType, RatingTableData> = [
    ratingTableBlock,
    (node, cxt) => {
        if (!node.state)
            return cxt.state.invalidBlock(node, 'bad format');
        const { title, ratings } = node.state;
        let result = `
<table class='ratings'>
<thead>
<tr class='title'><th colspan=${TABLE_COLUMNS}>${cxt.state.escape(title)}</th></tr>
<tr class='info'><th colspan=${TABLE_COLUMNS}>*本评分表为0－4星制，×代表0星。</th></tr>
</thead>
<tbody>\n`;
        const author = cxt.parseContext.variables.get('AUTHOR');
        let authorRating: [string, number] | undefined;
        if (author && ratings.has(author)) {
            authorRating = [author, ratings.get(author)!];
            ratings.delete(author);
        }
        const sorted = [...ratings].sort((a, b) => a[0].localeCompare(b[0]));
        if (authorRating)
            sorted.splice(0, 0, authorRating);
        const grouped: [string, string][][] = [];
        sorted.forEach(([name, rating], i) => {
            if (i % TABLE_COLUMNS == 0)
                grouped.push([]);
            grouped.at(-1)!.push([name, `stars-${rating}`]);
        });
        for (const values of grouped) {
            if (values.length < 4) {
                for (let i = values.length; i < 4; i++)
                    values.push(['', 'empty']);
            }
            result += `<tr>\n` + values
                .map((x) => `<th>${cxt.state.escape(x[0])}</th>\n`).join('') + `</tr>\n`;
            result += `<tr>\n` + values
                .map((x) => `<td class='${x[1]}'></td>\n`).join('') + `</tr>\n`;
        }
        result += `</tbody>\n`;
        const avg = sorted.map((x) => x[1]).reduce((a, b) => a + b / sorted.length, 0);
        const stddev = Math.sqrt(sorted
            .map((x) => x[1])
            .reduce((a, b) => a + (b - avg) * (b - avg) / sorted.length, 0));
        result += `<tfoot><tr>\n<td colspan=${TABLE_COLUMNS}><span class='count'>${sorted.length}</span>人评分｜均分<span class='avg'>${avg.toFixed(2)}</span>｜标准差<span class='stddev'>${stddev.toFixed(2)}</span></td>\n</tr></tfoot>\n</table>\n`;
        return result;
    }
];