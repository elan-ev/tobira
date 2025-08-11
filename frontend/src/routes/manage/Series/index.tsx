import { useTranslation } from "react-i18next";
import { LuCalendar, LuCirclePlus, LuFilm } from "react-icons/lu";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import i18n from "../../../i18n";
import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { createQueryParamsParser, ListItem, ManageItems } from "../Shared/Table";
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
import { COLORS } from "../../../color";
import { PrettyDate } from "../../../ui/time";


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
                        titleKey="manage.series.table.title"
                        additionalSortOptions={[{ key: "EVENT_COUNT", label: "video.plural" }]}
                        RenderItem={SeriesItem}
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
                    description
                    state
                    numVideos
                    thumbnailStack { thumbnails { url live audioOnly }}
                    hostRealms { id }
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

const SeriesItem: React.FC<{ item: SingleSeries }> = ({ item }) => <ListItem
    itemType="series"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={status => <SeriesThumbnail series={item} seriesStatus={status} />}
    dateAndAdditionalInfo={<DateAndCount
        timestamp={item.created ?? undefined}
        count={item.numVideos}
    />}
/>;


type DateAndCountProps = {
    timestamp?: string;
    count: number;
    className?: string;
};

const DateAndCount: React.FC<DateAndCountProps> = ({
    timestamp, count, className,
}) => (
    <div {...{ className }} css={{
        display: "inline-flex",
        color: COLORS.neutral80,
        fontSize: 12,
        gap: 24,
        whiteSpace: "nowrap",
    }}>
        {timestamp && <div css={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LuCalendar css={{ fontSize: 15, color: COLORS.neutral60 }} />
            <PrettyDate date={new Date(timestamp)} />
        </div>}
        <div css={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        }}>
            <LuFilm css={{ fontSize: 15, color: COLORS.neutral60, flexShrink: 0 }} />
            {i18n.t("manage.video-list.no-of-videos", { count })}
        </div>
    </div>
);



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
