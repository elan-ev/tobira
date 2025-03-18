import { useTranslation } from "react-i18next";
import { LuPlusCircle } from "react-icons/lu";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import i18n from "../../../i18n";
import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import {
    ColumnProps,
    createQueryParamsParser,
    DateColumn,
    ManageItems,
    TableRow,
} from "../Shared/Table";
import {
    SeriesManageQuery,
    SeriesManageQuery$data,
    SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { keyOfId } from "../../../util";
import { ThumbnailStack } from "../../../ui/Series";
import { CREATE_SERIES_PATH } from "./Create";
import { LinkButton } from "../../../ui/LinkButton";


export const PATH = "/~manage/series" as const;

export const ManageSeriesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToSeriesVars(url.searchParams);
        const queryRef = loadQuery<SeriesManageQuery>(query, vars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageItems
                        vars={vars}
                        connection={data.currentUser.mySeries}
                        titleKey="manage.my-series.title"
                        additionalColumns={seriesColumns}
                        RenderRow={SeriesRow}
                    >
                        <CreateSeriesLink />
                    </ManageItems>
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query SeriesManageQuery(
        $order: SeriesSortOrder!,
        $offset: Int!,
        $limit: Int!,
    ) {
        ...UserData
        currentUser {
            mySeries(order: $order, offset: $offset, limit: $limit) {
                __typename
                totalCount
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    created
                    updated
                    tobiraDeletionTimestamp
                    syncedData { description }
                    numVideos
                    thumbnailStack { thumbnails { url live audioOnly }}
                }
            }
        }
    }
`;

const CreateSeriesLink: React.FC = () => {
    const { t } = useTranslation();
    return <LinkButton to={CREATE_SERIES_PATH} css={{ width: "fit-content" }}>
        {t("manage.my-series.create.title")}
        <LuPlusCircle />
    </LinkButton>;
};


export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];

export const seriesColumns: ColumnProps<SingleSeries>[] = [
    {
        key: "EVENT_COUNT",
        label: "manage.video-list.content",
        headerWidth: 112,
        column: ({ item }) => <td css={{ fontSize: 14 }}>
            {i18n.t("manage.video-list.no-of-videos", { count: item.numVideos })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.item-table.columns.updated",
        column: ({ item }) => <DateColumn date={item.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.item-table.columns.created",
        column: ({ item }) => <DateColumn date={item.created} />,
    },
];


export const SeriesRow: React.FC<{ item: SingleSeries }> = ({ item }) => <TableRow
    itemType="series"
    item={item}
    thumbnail={deletionIsPending => <SeriesThumbnail series={item} {...{ deletionIsPending }} />}
    link={`${PATH}/${keyOfId(item.id)}`}
    customColumns={seriesColumns.map(col => <col.column key={col.key} item={item} />)}
/>;



const parseSeriesColumn = (sortBy: string | null): SeriesSortColumn =>
    sortBy !== null
        ? match<string, SeriesSortColumn>(sortBy, {
            "title": () => "TITLE",
            "created": () => "CREATED",
            "updated": () => "UPDATED",
            "event_count": () => "EVENT_COUNT",
        }, () => "CREATED")
        : "CREATED";

const queryParamsToSeriesVars = createQueryParamsParser<SeriesSortColumn>(parseSeriesColumn);

type SeriesThumbnailProps = {
    series: SingleSeries;
}

export const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ series }) => (
    <div css={{ "> div": { width: "100%" } }}>
        <ThumbnailStack title={series.title} thumbnailStack={series.thumbnailStack} />
    </div>
);
