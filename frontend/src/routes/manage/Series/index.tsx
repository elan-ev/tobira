import { LuCirclePlus } from "react-icons/lu";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import {
    CreateButton, createQueryParamsParser, ListItem,
    ManageItems, buildSearchFilter,
} from "../Shared/Table";
import {
    SeriesManageQuery, SeriesManageQuery$data, SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { keyOfId } from "../../../util";
import { SeriesThumbnail } from "./Shared";
import { CreateSeriesRoute } from "./Create";
import { EntryCount, Timestamp } from "../../../ui/metadata";
import { ActualLinkButton } from "../Video";
import { DirectSeriesRoute } from "../../Series";
import { VideoListShareButton } from "../../../ui/Blocks/VideoList";


export const PATH = "/~manage/series" as const;

export const ManageSeriesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToSeriesVars(url.searchParams);
        const queryVars = {
            ...vars,
            filter: buildSearchFilter(vars.filters),
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
                        withCreatorFilter
                        connection={data.currentUser.mySeries}
                        titleKey="manage.series.table.title"
                        additionalSortOptions={[
                            { key: "EVENT_COUNT", label: "video.plural" },
                            { key: "CREATED", label: "manage.table.sorting.created" },
                            { key: "UPDATED", label: "manage.table.sorting.updated" },
                        ]}
                        RenderItem={SeriesItem}
                        createButton={<CreateLink />}
                    />
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
                    thumbnailStack { thumbnails { url live audioOnly state }}
                    hostRealms { id }
                }
            }
        }
    }
`;

const CreateLink: React.FC = () => <CreateButton
    condition="canCreateSeries"
    path={CreateSeriesRoute.url}
    text="manage.series.table.create"
    Icon={LuCirclePlus}
/>;


export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];


const SeriesItem: React.FC<{ item: SingleSeries }> = ({ item }) => <ListItem
    itemType="series"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={state => <SeriesThumbnail series={item} seriesState={state} />}
    created={item.created ?? undefined}
    metadata={[
        <EntryCount key={"entry count"} count={item.numVideos} />,
        <Timestamp key="timestamp" timestamp={item.created ?? undefined}/>,
    ]}
    shareButton={<VideoListShareButton
        kind="series"
        shareUrl={new URL(DirectSeriesRoute.url({ seriesId: item.id }), document.baseURI).href}
        rssUrl={`/~rss/series/${keyOfId(item.id)}`}
        hideLabel
    />}
    linkButton={<ActualLinkButton
        to={new URL(DirectSeriesRoute.url({ seriesId: item.id }), document.baseURI).href}
    />}
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
