import { useTranslation } from "react-i18next";
import { LuCirclePlus } from "react-icons/lu";
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
import { SeriesThumbnail } from "./Shared";
import { CREATE_SERIES_PATH } from "./Create";
import { LinkButton } from "../../../ui/LinkButton";
import { isRealUser, useUser } from "../../../User";


export const PATH = "/~manage/series" as const;

export const ManageSeriesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToSeriesVars(url.searchParams);
        const titleFilter = vars.filters?.title ?? null;
        const queryVars = {
            ...vars,
            // Todo: Adjust when more filter options are added
            filter: titleFilter ? { title: titleFilter } : null,
        };
        const queryRef = loadQuery<SeriesManageQuery>(query, queryVars);

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
                        titleKey="manage.series.table.title"
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
        $filter: SearchFilter,
    ) {
        ...UserData
        currentUser {
            mySeries(order: $order, offset: $offset, limit: $limit, filter: $filter) {
                __typename
                totalCount
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    created
                    updated
                    tobiraDeletionTimestamp
                    description
                    state
                    numVideos
                    thumbnailStack { thumbnails { url live audioOnly }}
                }
            }
        }
    }
`;

const CreateSeriesLink: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    return (!isRealUser(user) || !user.canCreateSeries)
        ? null
        : <LinkButton to={CREATE_SERIES_PATH} css={{ width: "fit-content" }}>
            {t("manage.series.table.create")}
            <LuCirclePlus />
        </LinkButton>;
};


export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];

const seriesColumns: ColumnProps<SingleSeries>[] = [
    {
        key: "EVENT_COUNT",
        label: "video.plural",
        headerWidth: 112,
        column: ({ item }) => <td css={{ fontSize: 14 }}>
            {i18n.t("manage.video-list.no-of-videos", { count: item.numVideos })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.table.columns.updated",
        column: ({ item }) => <DateColumn date={item.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.table.columns.created",
        column: ({ item }) => <DateColumn date={item.created} />,
    },
];


const SeriesRow: React.FC<{ item: SingleSeries }> = ({ item }) => <TableRow
    itemType="series"
    item={item}
    thumbnail={status => <SeriesThumbnail series={item} seriesStatus={status} />}
    link={`${PATH}/${keyOfId(item.id)}`}
    customColumns={seriesColumns.map(col => <col.column key={col.key} item={item} />)}
/>;



const parseSeriesColumn = (sortBy: string | null): SeriesSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "created": () => "CREATED" as const,
            "updated": () => "UPDATED" as const,
            "event_count": () => "EVENT_COUNT" as const,
        }) ?? "CREATED"
        : "CREATED";

const queryParamsToSeriesVars = createQueryParamsParser<SeriesSortColumn>(parseSeriesColumn);
