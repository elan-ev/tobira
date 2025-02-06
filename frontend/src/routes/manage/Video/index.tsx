import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { match, useColorScheme } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    VideoManageQuery,
    VideoManageQuery$data,
    VideosSortColumn,
} from "./__generated__/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId } from "../../../util";
import { SmallDescription } from "../../../ui/metadata";
import { COLORS } from "../../../color";
import { InfoWithTooltip } from "../../../ui";
import { relativeDate } from "../../../ui/time";
import CONFIG from "../../../config";
import {
    ColumnProps,
    createQueryParamsParser,
    DateColumn,
    descriptionStyle,
    ManageAssets,
    TableRow,
    thumbnailLinkStyle,
    titleLinkStyle,
} from "../shared";


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVideosVars(url.searchParams);
        const queryRef = loadQuery<VideoManageQuery>(query, vars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageAssets
                        vars={vars}
                        connection={data.currentUser.myVideos}
                        titleKey="manage.my-videos.title"
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query VideoManageQuery(
        $order: VideosSortOrder!,
        $offset: Int!,
        $limit: Int!,
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, offset: $offset, limit: $limit) {
                __typename
                totalCount
                pageInfo {
                    hasNextPage hasPreviousPage
                    startIndex endIndex
                }
                items {
                    id
                    title
                    created
                    description
                    isLive
                    tobiraDeletionTimestamp
                    series { id }
                    syncedData {
                        duration
                        thumbnail
                        updated
                        startTime
                        endTime
                        audioOnly
                    }
                    authorizedData {
                        tracks { resolution }
                    }
                }
            }
        }
    }
`;

export type EventConnection = NonNullable<VideoManageQuery$data["currentUser"]>["myVideos"];
export type Events = EventConnection["items"];
export type Event = Events[number];

// Todo: add series column
export const videoColumns: ColumnProps[] = [
    {
        key: "UPDATED",
        label: "manage.asset-table.columns.updated",
        column: event => (event.syncedData && "updated" in event.syncedData)
            && <DateColumn date={event.syncedData.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.asset-table.columns.created",
        column: event => <DateColumn date={event.created ?? undefined} />,
    },
];

export const EventRow: React.FC<{ event: Event }> = ({ event }) => {
    const link = `${PATH}/${keyOfId(event.id)}`;

    const deletionIsPending = Boolean(event.tobiraDeletionTimestamp);
    const deletionDate = new Date(event.tobiraDeletionTimestamp ?? "");

    // This checks if the current time is later than the deletion timestamp + twice
    // the configured poll period to ensure at least one sync has taken place
    // (+ 1min to allow some time for the Opencast delete job).
    // If it is, the deletion in Opencast has possibly failed.
    const pollPeriod = CONFIG.sync.pollPeriod * 1000;
    const deletionFailed = Boolean(event.tobiraDeletionTimestamp
        && Date.parse(event.tobiraDeletionTimestamp) + pollPeriod * 2 + 60000 < Date.now());

    return <TableRow
        thumbnail={deletionIsPending
            ? <Thumbnail {...{ event, deletionIsPending }} />
            : <Link to={link} css={{ ...thumbnailLinkStyle }}>
                <Thumbnail {...{ event }} />
            </Link>
        }
        title={deletionIsPending
            ? <span css={{ color: COLORS.neutral60 }}>{event.title}</span>
            : <Link to={link} css={{ ...titleLinkStyle }}>{event.title}</Link>
        }
        description={deletionIsPending
            ? <PendingDeletionBody {...{ deletionFailed, deletionDate, event }} />
            : <SmallDescription css={{ ...descriptionStyle }} text={event.description} />
        }
        syncInfo={{
            isSynced: !!event.syncedData,
            notReadyLabel: "video.not-ready.label",
        }}
        customColumns={videoColumns.map(col => <Fragment key={col.key}>
            {col.column(event)}
        </Fragment>)}
    />;
};

type PendingDeleteBodyProps = {
    deletionFailed: boolean;
    deletionDate: Date;
}

const PendingDeletionBody: React.FC<PendingDeleteBodyProps> = ({
    deletionFailed, deletionDate,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const { t } = useTranslation();

    const now = Date.now();
    const [, relative] = relativeDate(deletionDate, now);

    return (
        <div css={{
            color: isDark ? COLORS.neutral60 : COLORS.neutral50,
            display: "flex",
            fontSize: 13,
            marginTop: 4,
            padding: "0 4px",
        }}>
            <span css={{ fontStyle: "italic" }}>
                {t(`manage.my-videos.details.delete.${
                    deletionFailed ? "failed-maybe" : "pending"
                }`)}
            </span>
            <InfoWithTooltip
                tooltip={t(`manage.my-videos.details.delete.tooltip.${
                    deletionFailed ? "failed" : "pending"
                }`, { time: relative })}
                mode={deletionFailed ? "warning" : "info"}
            />
        </div>
    );
};

const parseVideosColumn = (sortBy: string | null): VideosSortColumn =>
    sortBy !== null ? match<string, VideosSortColumn>(sortBy, {
        "title": () => "TITLE",
        "created": () => "CREATED",
        "updated": () => "UPDATED",
    }) : "CREATED";

const queryParamsToVideosVars = createQueryParamsParser<VideosSortColumn>(parseVideosColumn);
