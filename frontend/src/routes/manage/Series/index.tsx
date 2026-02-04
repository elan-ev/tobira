import { LuCirclePlus } from "react-icons/lu";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { CreateButton, createQueryParamsParser, ListItem, ManageItems } from "../Shared/Table";
import {
    SeriesManageQuery, SeriesManageQuery$data, SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { keyOfId } from "../../../util";
import { SeriesThumbnail } from "./Shared";
import { CreateSeriesRoute } from "./Create";
import { EntryCount, Timestamp } from "../../../ui/metadata";


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
        <Timestamp
            key="timestamp"
            timestamp={item.created ?? undefined}
        />,
    ]}
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
