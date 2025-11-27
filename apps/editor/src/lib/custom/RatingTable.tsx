import * as emmm from '@the_dissidents/libemmm';

const ratings = Symbol();

declare module '@the_dissidents/libemmm' {
    export interface ParseContextStoreDefinitions {
        [ratings]?: {
            data: RatingTableData[]
        }
    }
}

export function initRatings(cxt: emmm.ParseContext) {
    cxt.init(ratings, {
        data: []
    });
}

type RatingData = {
    ratings: Map<string, number>;
    avg: number;
    stddev: number;
};

type RatingTableData = {
    title: string,
    author?: string,
    data: RatingData
};

export const ratingTableBlock = new emmm.BlockModifierDefinition<RatingTableData>(
    'ratings', emmm.ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        let { msgs, args, rest, restNodes } = 
            emmm.helper.bindArgs(node, ['key'], { named: { dir: '' }, rest: true, trim: true });
        if (msgs) return msgs;
        if (rest!.length % 2 !== 0)
            return [new emmm.messages.InvalidArgumentMessage(
                restNodes!.at(-1)!.location, 'a rating should be paired with a name')];

        const title = args!.key;
        const author = args!.dir;
        const map = new Map<string, number>();
        for (let i = 0; i < rest!.length; i += 2) {
            const ratingArg = restNodes![i+1];
            const rating = parseInt(rest![i+1], 10);
            if (isNaN(rating))
                return [new emmm.messages.InvalidArgumentMessage(
                    ratingArg.location, 'a rating should be a number')];
            if (rating < 0 || rating > 4)
                return [new emmm.messages.InvalidArgumentMessage(
                    ratingArg.location, 'a rating should be between 0 and 4 (inclusive)')];
            map.set(rest![i], rating);
        }
        const avg = [...map].map((x) => x[1]).reduce((a, b) => a + b / map.size, 0);
        const stddev = Math.sqrt([...map]
            .map((x) => x[1])
            .reduce((a, b) => a + (b - avg) * (b - avg) / map.size, 0));
        const data: RatingData = {
            ratings: map,
            avg, stddev
        };
        node.state = { title, author, data };
        cxt.get(ratings)!.data.push(node.state);
        return [];
    },
});

export const overallTableBlock = new emmm.BlockModifierDefinition<string>(
    'overall-ratings', emmm.ModifierSlotType.None,
{
    prepareExpand(node) {
        let { msgs, args } = emmm.helper.bindArgs(node, ['key']);
        if (msgs) return msgs;
        node.state = args!.key;
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
        const { title, author, data: { ratings, avg, stddev } } = node.state;
        const head = title
          ? <thead>
                <tr class='title'><th colspan={TABLE_COLUMNS}>
                    {title}
                    {author ? <span class='author'>{author}</span> : []}
                </th></tr>
                <tr class='info'><th colspan={TABLE_COLUMNS}>*本评分表为0－4星制，×代表0星。</th></tr>
            </thead>
          : [];
        
        const articleAuthor = cxt.parsedDocument.context.variables.get('AUTHOR');
        let authorRating: [string, number] | undefined;
        if (articleAuthor && ratings.has(articleAuthor)) {
            authorRating = [articleAuthor, ratings.get(articleAuthor)!];
            ratings.delete(articleAuthor);
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

        let bodyContent: Node[] = [];
        for (const values of grouped) {
            if (values.length < 4) {
                for (let i = values.length; i < 4; i++)
                    values.push(['', 'empty']);
            }
            bodyContent.push(
                <tr>{values.map((x) => <th>{x[0]}</th>)}</tr>,
                <tr>{values.map((x) => <td class={x[1]}></td>)}</tr>
            );
        }

        return <table class='ratings'>
            {head}
            <tbody>{bodyContent}</tbody>
            <tfoot>
                <tr><td colspan={TABLE_COLUMNS}>
                    &nbsp;
                    <span class='count'>{sorted.length}</span>
                    人评分｜均分
                    <span class='avg'>{avg.toFixed(2)}</span>
                    ｜标准差
                    <span class='stddev'>{stddev.toFixed(2)}</span>
                </td></tr>
            </tfoot>
        </table>;
    }
];

export const overallTableRenderer: 
emmm.BlockRendererDefiniton<emmm.HTMLRenderType, string> = [
    overallTableBlock,
    (node, cxt) => {
        if (!node.state)
            return cxt.state.invalidBlock(node, 'bad format');

        const members = new Set<string>();
        const all = cxt.parsedDocument.context.get(ratings)!
            .data.sort((a, b) => b.data.avg - a.data.avg);
        for (const entry of all)
            for (const member of entry.data.ratings.keys())
                members.add(member);
        
        const columns = [...members].sort((a, b) => a.localeCompare(b));
        const colgroups: Node[] = [];
        colgroups.push(<col class="title" />);
        colgroups.push(<col class="avg" />);
        colgroups.push(<col class="stddev" />);
        colgroups.push(...columns.map((x) => <col class="member" />));

        const heads: Node[] = [];
        heads.push(<th class="corner">{node.state}</th>);
        heads.push(<th class="avg" scope="col">平均</th>);
        heads.push(<th class="stddev" scope="col">标准差</th>);
        heads.push(...columns.map((x) => <th class="member" scope="col">{x}</th>));

        const content: Node[] = [];
        for (const entry of all) {
            const cells: Node[] = [];
            cells.push(<th class='title' scope='row'>
                {entry.title}
                {entry.author 
                    ? [<br/>, <span class='author'>{entry.author}</span>] 
                    : []}
            </th>);
            cells.push(<td class='avg'>{entry.data.avg.toFixed(2)}</td>);
            cells.push(<td class='stddev'>{entry.data.stddev.toFixed(2)}</td>);
            for (const member of columns) {
                const n = entry.data.ratings.get(member);
                if (n === undefined) {
                    cells.push(<td class='member empty'></td>);
                } else {
                    cells.push(<td class={`member stars-${n}`}></td>);
                }
            }
            content.push(<tr>{cells}</tr>);
        }

        return <section class='overall-container'>
            <table class='overall'>
                <colgroups>
                    {colgroups}
                </colgroups>
                <thead>
                    <tr>{heads}</tr>
                </thead>
                <tbody>
                    {content}
                </tbody>
            </table>
        </section>;
    }
];