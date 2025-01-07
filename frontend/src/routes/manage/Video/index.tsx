import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { useColorScheme } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    VideoManageQuery,
    VideoManageQuery$data,
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
import { ManageAssets, queryParamsToVars } from "../shared";


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVars(url.searchParams);
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
                        Row={Row}
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query VideoManageQuery(
        $order: SortOrder!,
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

const Row: React.FC<{ asset: Events[number] }> = ({ asset: event }) => {
    const isDark = useColorScheme().scheme === "dark";
    const created = new Date(event.created);
    const link = `${PATH}/${keyOfId(event.id)}`;
    const { t, i18n } = useTranslation();

    const deletionIsPending = Boolean(event.tobiraDeletionTimestamp);
    const deletionDate = new Date(event.tobiraDeletionTimestamp ?? "");

    // This checks if the current time is later than the deletion timestamp + twice
    // the configured poll period to ensure at least one sync has taken place
    // (+ 1min to allow some time for the Opencast delete job).
    // If it is, the deletion in Opencast has possibly failed.
    const pollPeriod = CONFIG.sync.pollPeriod * 1000;
    const deletionFailed = Boolean(event.tobiraDeletionTimestamp
        && Date.parse(event.tobiraDeletionTimestamp) + pollPeriod * 2 + 60000 < Date.now());

    return (
        <tr>
            <td>
                {deletionIsPending
                    ? <Thumbnail {...{ event, deletionIsPending }} />
                    : <Link to={link} css={{
                        ":focus-visible": { outline: "none" },
                        ":focus-within div:first-child": {
                            outline: `2.5px solid ${COLORS.focus}`,
                            outlineOffset: 1,
                        },
                    }}>
                        <Thumbnail {...{ event }} />
                    </Link>
                }
            </td>
            <td>
                <div css={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                }}>
                    <div css={{
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        padding: "0 4px",
                        ":focus-within": {
                            borderRadius: 4,
                            outline: `2.5px solid ${COLORS.focus}`,
                        },
                    }}>
                        {deletionIsPending
                            ? <span css={{ color: COLORS.neutral60 }}>
                                {event.title}
                            </span>
                            : <Link
                                to={link}
                                css={{
                                    ":focus, :focus-visible": {
                                        outline: "none",
                                    },
                                    textDecoration: "none",
                                }}
                            >{event.title}</Link>
                        }
                    </div>
                    {!event.syncedData && <span css={{
                        padding: "0 8px",
                        fontSize: "small",
                        borderRadius: 10,
                        backgroundColor: COLORS.neutral10,
                    }}>{t("video.not-ready.label")}</span>}
                </div>
                {deletionIsPending
                    ? <PendingDeletionBody {...{ deletionFailed, deletionDate, event }} />
                    : <SmallDescription css={{ padding: "0 4px" }} text={event.description} />
                }
            </td>
            <td css={{ fontSize: 14 }}>
                {created.toLocaleDateString(i18n.language)}
                <br />
                <span css={{ color: isDark ? COLORS.neutral60 : COLORS.neutral50 }}>
                    {created.toLocaleTimeString(i18n.language)}
                </span>
            </td>
        </tr>
    );
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
