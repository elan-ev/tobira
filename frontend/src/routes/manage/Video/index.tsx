import { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide, LuArrowUpWideNarrow, LuChevronLeft, LuChevronRight,
} from "react-icons/lu";
import { graphql, VariablesOf } from "react-relay";
import { match, useColorScheme, Card } from "@opencast/appkit";

import { ManageNav, ManageRoute } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    EventSortColumn,
    SortDirection,
    VideoManageQuery,
    VideoManageQuery$data,
} from "./__generated__/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId } from "../../../util";
import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { SmallDescription } from "../../../ui/metadata";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { COLORS } from "../../../color";
import { InfoWithTooltip } from "../../../ui";
import { relativeDate } from "../../../ui/time";
import CONFIG from "../../../config";


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
                    : <ManageVideos vars={vars} connection={data.currentUser.myVideos} />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query VideoManageQuery(
        $order: EventSortOrder!,
        $after: Cursor,
        $before: Cursor,
        $first: Int,
        $last: Int,
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, after: $after, before: $before, first: $first, last: $last) {
                totalCount
                pageInfo {
                    hasNextPage hasPreviousPage
                    startCursor endCursor
                    startIndex endIndex
                }
                items {
                    id title created description isLive tobiraDeletionTimestamp
                    syncedData {
                        duration updated startTime endTime
                    }
                    authorizedData {
                        thumbnail
                        tracks { resolution }
                    }
                }
            }
        }
    }
`;

type EventConnection = NonNullable<VideoManageQuery$data["currentUser"]>["myVideos"];
type Events = EventConnection["items"];

type Props = {
    connection: EventConnection;
    vars: VariablesOf<VideoManageQuery>;
};

const LIMIT = 15;

/** Main part of this page */
const ManageVideos: React.FC<Props> = ({ connection, vars }) => {
    const { t } = useTranslation();

    let inner;
    if (connection.items.length === 0 && connection.totalCount === 0) {
        inner = <Card kind="info">{t("manage.my-videos.no-videos-found")}</Card>;
    } else {
        inner = <>
            <PageNavigation {...{ vars, connection }} />
            <div css={{ flex: "1 0 0", margin: "16px 0" }}>
                <EventTable events={connection.items} vars={vars} />
            </div>
            <PageNavigation {...{ vars, connection }} />
        </>;
    }

    const title = t("manage.my-videos.title");

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
        }}>
            <Breadcrumbs
                path={[{ label: t("user.manage-content"), link: ManageRoute.url }]}
                tail={title}
            />
            <PageTitle title={title} css={{ marginBottom: 32 }}/>
            {inner}
        </div>
    );
};

const THUMBNAIL_WIDTH = 16 * 8;

type EventTableProps = {
    events: Events;
    vars: VariablesOf<VideoManageQuery>;
};

const EventTable: React.FC<EventTableProps> = ({ events, vars }) => {
    const { t } = useTranslation();

    // We need to know whether the table header is in its "sticky" position to apply a box
    // shadow to indicate that the user can still scroll up. This solution uses intersection
    // observer. Compare: https://stackoverflow.com/a/57991537/2408867
    const [headerSticks, setHeaderSticks] = useState(false);
    const tableHeaderRef = useRef<HTMLTableSectionElement>(null);
    useEffect(() => {
        const tableHeader = tableHeaderRef.current;
        if (tableHeader) {
            const observer = new IntersectionObserver(
                ([e]) => setHeaderSticks(!e.isIntersecting),
                { threshold: [1], rootMargin: "-1px 0px 0px 0px" },
            );

            observer.observe(tableHeader);
            return () => observer.unobserve(tableHeader);
        }
        return () => {};
    });

    return <div css={{ position: "relative" }}>
        <table css={{
            width: "100%",
            borderSpacing: 0,
            tableLayout: "fixed",
            "& > thead": {
                position: "sticky",
                top: 0,
                zIndex: 10,
                backgroundColor: COLORS.neutral05,
                "&  > tr > th": {
                    borderBottom: `1px solid ${COLORS.neutral25}`,
                    textAlign: "left",
                    padding: "8px 12px",
                },
                ...headerSticks && {
                    boxShadow: "0 0 20px rgba(0, 0, 0, 0.3)",
                    clipPath: "inset(0px 0px -20px 0px)",
                },
            },
            "& > tbody": {
                "& > tr:hover, tr:focus-within": {
                    backgroundColor: COLORS.neutral15,
                },
                "& > tr:not(:first-child) > td": {
                    borderTop: `1px solid ${COLORS.neutral25}`,
                },
                "& td": {
                    padding: 6,
                    verticalAlign: "top",
                    "&:not(:first-child)": {
                        padding: "8px 12px 8px 8px",
                    },
                },
            },
        }}>
            <colgroup>
                <col span={1} css={{ width: THUMBNAIL_WIDTH + 2 * 6 }} />
                <col span={1} />
                <col span={1} css={{ width: 135 }} />
            </colgroup>

            <thead ref={tableHeaderRef}>
                <tr>
                    <th></th>
                    <ColumnHeader
                        label={t("manage.my-videos.columns.title")}
                        sortKey="TITLE"
                        {...{ vars }}
                    />
                    <ColumnHeader
                        label={t("manage.my-videos.columns.created")}
                        sortKey="CREATED"
                        {...{ vars }}
                    />
                </tr>
            </thead>
            <tbody>
                {events.map(event => <Row key={event.id} event={event} />)}
            </tbody>
        </table>
    </div>;
};

type ColumnHeaderProps = {
    label: string;
    sortKey: EventSortColumn;
    vars: VariablesOf<VideoManageQuery>;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, vars }) => {
    const { t } = useTranslation();
    const direction = vars.order.column === sortKey && vars.order.direction === "ASCENDING"
        ? "DESCENDING"
        : "ASCENDING";
    const directionTransKey = direction.toLowerCase() as Lowercase<typeof direction>;

    return <th>
        <Link
            aria-label={t("manage.my-videos.columns.description",
                { title: label, direction: t(`manage.my-videos.columns.${directionTransKey}`) })
            }
            to={varsToLink({
                order: {
                    column: sortKey,
                    direction,
                },
            })}
            css={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                transition: "color 70ms",
                textDecoration: "none",
                borderRadius: 4,
                outlineOffset: 1,
                "& > svg": {
                    marginLeft: 6,
                    fontSize: 22,
                },
            }}
        >
            {label}
            {vars.order.column === sortKey && match(vars.order.direction, {
                // Seems like this is flipped right? But no, a short internal
                // poll showed that this matches the intuition of almost everyone.
                "ASCENDING": () => <LuArrowDownNarrowWide />,
                "DESCENDING": () => <LuArrowUpWideNarrow />,
            }, () => null)}
        </Link>
    </th>;
};

const Row: React.FC<{ event: Events[number] }> = ({ event }) => {
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

type PageNavigationProps = {
    connection: EventConnection;
    vars: VariablesOf<VideoManageQuery>;
};

const PageNavigation: React.FC<PageNavigationProps> = ({ connection, vars }) => {
    const { t } = useTranslation();
    const pageInfo = connection.pageInfo;

    return (
        <div css={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 48,
        }}>
            <div>
                {t("manage.my-videos.page-showing-video-ids", {
                    start: connection.pageInfo.startIndex ?? "?",
                    end: connection.pageInfo.endIndex ?? "?",
                    total: connection.totalCount,
                })}
            </div>
            <div css={{ display: "flex", alignItems: "center" }}>
                <PageLink
                    vars={{ order: vars.order, first: LIMIT }}
                    disabled={!pageInfo.hasPreviousPage && connection.items.length === LIMIT}
                    label={t("manage.my-videos.navigation.first")}
                ><FirstPage /></PageLink>
                <PageLink
                    vars={{ order: vars.order, before: pageInfo.startCursor, last: LIMIT }}
                    disabled={!pageInfo.hasPreviousPage}
                    label={t("manage.my-videos.navigation.previous")}
                ><LuChevronLeft /></PageLink>
                <PageLink
                    vars={{ order: vars.order, after: pageInfo.endCursor, first: LIMIT }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.my-videos.navigation.next")}
                ><LuChevronRight /></PageLink>
                <PageLink
                    vars={{ order: vars.order, last: LIMIT }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.my-videos.navigation.last")}
                ><LastPage /></PageLink>
            </div>
        </div>
    );
};

type PageLinkProps = {
    vars: VariablesOf<VideoManageQuery>;
    disabled: boolean;
    children: ReactNode;
    label: string;
};

const PageLink: React.FC<PageLinkProps> = ({ children, vars, disabled, label }) => (
    <Link
        to={varsToLink(vars)}
        tabIndex={disabled ? -1 : 0}
        aria-hidden={disabled}
        aria-label={label}
        css={{
            background: "none",
            border: "none",
            fontSize: 24,
            padding: "4px 4px",
            margin: "0 4px",
            lineHeight: 0,
            borderRadius: 4,
            ...disabled
                ? {
                    color: COLORS.neutral25,
                    pointerEvents: "none",
                }
                : {
                    color: COLORS.neutral60,
                    cursor: "pointer",
                    ":hover, :focus": {
                        color: COLORS.neutral90,
                    },
                },
        }}
    >{children}</Link>
);

const DEFAULT_SORT_COLUMN: EventSortColumn = "CREATED";
const DEFAULT_SORT_DIRECTION: SortDirection = "DESCENDING";

/** Reads URL query parameters and converts them into query variables */
const queryParamsToVars = (queryParams: URLSearchParams): VariablesOf<VideoManageQuery> => {
    // Sort order
    const sortBy = queryParams.get("sortBy");
    const column = sortBy !== null && match<string, EventSortColumn>(sortBy, {
        "title": () => "TITLE",
        "created": () => "CREATED",
        "updated": () => "UPDATED",
    });

    const sortOrder = queryParams.get("sortOrder");
    const direction = sortOrder !== null && match<string, SortDirection>(sortOrder, {
        "desc": () => "DESCENDING",
        "asc": () => "ASCENDING",
    });

    const order = !column || !direction
        ? { column: DEFAULT_SORT_COLUMN, direction: DEFAULT_SORT_DIRECTION }
        : { column, direction };

    // Pagination
    if (queryParams.has("lastPage")) {
        return { order, last: LIMIT };
    }
    if (queryParams.has("before")) {
        return { order, before: queryParams.get("before"), last: LIMIT };
    }
    if (queryParams.has("after")) {
        return { order, after: queryParams.get("after"), first: LIMIT };
    }

    return { order, first: LIMIT };
};

/** Converts query variables to URL query parameters */
const varsToQueryParams = (vars: VariablesOf<VideoManageQuery>): URLSearchParams => {
    const searchParams = new URLSearchParams();

    // Sort order
    const isDefaultOrder = vars.order.column === DEFAULT_SORT_COLUMN
        && vars.order.direction === DEFAULT_SORT_DIRECTION;
    if (!isDefaultOrder) {
        searchParams.set("sortBy", vars.order.column.toLowerCase());
        searchParams.set("sortOrder", match(vars.order.direction, {
            "ASCENDING": () => "asc",
            "DESCENDING": () => "desc",
        }, () => ""));
    }

    // Pagination
    if (vars.last !== undefined) {
        if (!vars.before) {
            searchParams.set("lastPage", "");
        } else {
            searchParams.set("before", vars.before);
        }
    } else if (vars.after) {
        searchParams.set("after", vars.after);
    }

    return searchParams;
};

const varsToLink = (vars: VariablesOf<VideoManageQuery>): string => {
    const url = new URL(document.location.href);
    url.search = varsToQueryParams(vars).toString();
    return url.href;
};
