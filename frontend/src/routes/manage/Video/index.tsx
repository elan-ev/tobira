import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp } from "react-icons/fi";
import { graphql, PreloadedQuery, useQueryLoader } from "react-relay";

import { ManageNav } from "..";
import { Root } from "../../../layout/Root";
import {
    EventSortColumn,
    EventSortOrder,
    SortDirection,
    VideoManageQuery,
    VideoManageQueryResponse,
    VideoManageQueryVariables,
} from "../../../query-types/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Spinner } from "../../../ui/Spinner";
import { Thumbnail } from "../../../ui/Video";
import { QueryLoader } from "../../../util/QueryLoader";
import { keyOfId, match } from "../../../util";
import { unreachable } from "../../../util/err";
import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { Card } from "../../../ui/Card";


const PATH = "/~manage/videos";

type Prepared = {
    queryRef: PreloadedQuery<VideoManageQuery>;
    sortOrder: EventSortOrder;
};

export const ManageVideosRoute = makeRoute<Prepared>({
    path: PATH,
    queryParams: [],
    prepare: ({ url }) => {
        const sortOrder = queryParamsToOrder(url.searchParams);
        return {
            queryRef: loadQuery(query, { order: sortOrder, first: LIMIT }),
            sortOrder,
        };
    },
    render: prepared => <Page {...prepared} />,
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
                    id title duration thumbnail created updated description
                    tracks { resolution }
                }
            }
        }
    }
`;

/** Main component, mainly loading relay data */
const Page: React.FC<Prepared> = ({ queryRef: initialQueryRef, sortOrder }) => {
    const [queryRef, loadQuery] = useQueryLoader(query, initialQueryRef);
    if (!queryRef) {
        // `useQueryLoader` is incorrectly typed, I believe. If
        // `initialQueryRef` is given, it never returns null.
        return unreachable();
    }

    return <QueryLoader {...{ query, queryRef }} render={result => (
        <Root nav={<ManageNav key={1} active={PATH} />} userQuery={result}>
            {!result.currentUser
                ? <NotAuthorized />
                : <ManageVideos
                    urlSortOrder={sortOrder}
                    reloadQuery={vars => loadQuery(vars, { fetchPolicy: "network-only" })}
                    connection={result.currentUser.myVideos}
                />
            }
        </Root>
    )} />;
};


type EventConnection = NonNullable<VideoManageQueryResponse["currentUser"]>["myVideos"];
type Events = EventConnection["items"];

type Props = {
    connection: EventConnection;
    urlSortOrder: EventSortOrder;
    reloadQuery: (vars: VideoManageQueryVariables) => void;
};

const LIMIT = 15;

/** Main part of this page */
const ManageVideos: React.FC<Props> = ({ urlSortOrder, connection, reloadQuery }) => {
    const { t } = useTranslation();

    const [sortOrder, setSortOrder] = useState(urlSortOrder);
    const [isPending, startTransition] = useTransition();
    const loadFirst = (after: string | null) => {
        startTransition(() => reloadQuery({ order: sortOrder, after, first: LIMIT }));
    };
    const loadLast = (before: string | null) => {
        startTransition(() => reloadQuery({ order: sortOrder, before, last: LIMIT }));
    };
    const reloadWithOrder = (order: EventSortOrder) => {
        startTransition(() => {
            // We go to page one again when changing sort order.
            reloadQuery({ order, first: LIMIT });
            setSortOrder(order);
        });
    };

    let inner;
    if (connection.items.length === 0 && connection.totalCount === 0) {
        inner = <Card kind="info">{t("manage.my-videos.no-videos-found")}</Card>;
    } else {
        inner = <>
            <PageNavigation {...{ loadFirst, loadLast, connection }} />
            <div css={{ flex: "1 0 0" }}>
                <EventTable
                    events={connection.items}
                    {...{ reloadWithOrder, isPending, sortOrder }}
                />
            </div>
            <PageNavigation {...{ loadFirst, loadLast, connection }} />
        </>;
    }

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 16,
        }}>
            <h1>{t("manage.my-videos.title")}</h1>
            {inner}
        </div>
    );
};

const THUMBNAIL_WIDTH = 16 * 8;

type EventTableProps = {
    events: Events;
    reloadWithOrder: (order: EventSortOrder) => void;
    isPending: boolean;
    sortOrder: EventSortOrder;
};

const EventTable: React.FC<EventTableProps> = ({
    events,
    reloadWithOrder,
    isPending,
    sortOrder,
}) => {
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

    const onColHeaderClick = (sortKey: EventSortColumn) => {
        const newOrder: EventSortOrder = {
            column: sortKey,
            direction: sortOrder.column === sortKey
                ? (sortOrder.direction === "ASCENDING" ? "DESCENDING" : "ASCENDING")
                : "ASCENDING",
        };

        setSortQueryParams(newOrder);
        reloadWithOrder(newOrder);
    };

    return <div css={{ position: "relative" }}>
        {isPending && (
            <div css={{
                position: "absolute",
                zIndex: 100,
                fontSize: 48,
                left: 0,
                right: 0,
                top: 64,
                textAlign: "center",
            }}><Spinner/></div>
        )}
        <table css={{
            width: "100%",
            borderSpacing: 0,
            tableLayout: "fixed",

            ...isPending && {
                pointerEvents: "none",
                "& > thead > tr, & > tbody": { opacity: 0.3 },
            },

            "& > thead": {
                position: "sticky",
                top: 0,
                zIndex: 10,
                backgroundColor: "white",
                "&  > tr > th": {
                    borderBottom: "1px solid var(--grey80)",
                    textAlign: "left",
                    padding: "8px 12px",
                },
                ...headerSticks && {
                    boxShadow: "0 0 20px rgba(0, 0, 0, 0.3)",
                    clipPath: "inset(0px 0px -20px 0px)",
                },
            },
            "& > tbody": {
                "& > tr:hover": {
                    backgroundColor: "var(--grey92)",
                },
                "& > tr:not(:first-child) > td": {
                    borderTop: "1px solid var(--grey80)",
                },
                "& td": {
                    padding: 6,
                    verticalAlign: "top",
                    "&:not(:first-child)": {
                        padding: "8px 12px",
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
                        onClick={onColHeaderClick}
                        {...{ sortOrder }}
                    />
                    <ColumnHeader
                        label={t("manage.my-videos.columns.created")}
                        sortKey="CREATED"
                        onClick={onColHeaderClick}
                        {...{ sortOrder }}
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
    sortOrder: EventSortOrder;
    onClick: (sortKey: EventSortColumn) => void;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, sortOrder, onClick }) => (
    <th>
        <div
            onClick={() => onClick(sortKey)}
            css={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                transition: "color 70ms",
                "& > svg": {
                    marginLeft: 6,
                    fontSize: 22,
                },
                "&:hover": {
                    color: "var(--accent-color)",
                },
            }}
        >
            {label}
            {sortOrder.column === sortKey && match(sortOrder.direction, {
                "ASCENDING": () => <FiChevronUp />,
                "DESCENDING": () => <FiChevronDown />,
            }, () => null)}
        </div>
    </th>
);

const Row: React.FC<{ event: Events[number] }> = ({ event }) => {
    const created = new Date(event.created);
    const link = `${PATH}/${keyOfId(event.id)}`;
    const { i18n } = useTranslation();

    return (
        <tr>
            <td>
                <Link to={link}>
                    <Thumbnail event={event} width={THUMBNAIL_WIDTH} />
                </Link>
            </td>
            <td>
                <div css={{
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}><Link to={link}>{event.title}</Link></div>
                <Description text={event.description} />
            </td>
            <td css={{ fontSize: 14 }}>
                {created.toLocaleDateString(i18n.language)}
                <br />
                <span css={{ color: "var(--grey40)" }}>
                    {created.toLocaleTimeString(i18n.language)}
                </span>
            </td>
        </tr>
    );
};

const Description: React.FC<{ text: string | null }> = ({ text }) => {
    const { t } = useTranslation();
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
    };

    if (text === null) {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey65)",
            fontStyle: "italic",
        }}>{t("manage.my-videos.no-description")}</div>;
    } else {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey40)",
            maxWidth: 800,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            textOverflow: "ellipsis",
            WebkitLineClamp: 2,
            overflow: "hidden",
        }}>{text}</div>;
    }
};

type PageNavigationProps = {
    connection: EventConnection;
    loadFirst: (after: string | null) => void;
    loadLast: (before: string | null) => void;
};

const PageNavigation: React.FC<PageNavigationProps> = ({ connection, loadFirst, loadLast }) => {
    const { t } = useTranslation();
    const pageInfo = connection.pageInfo;

    return (
        <div css={{
            display: "flex",
            justifyContent: "end",
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
            <div>
                <PageButton
                    onClick={() => loadFirst(null)}
                    disabled={!pageInfo.hasPreviousPage}
                ><FirstPage /></PageButton>
                <PageButton
                    onClick={() => loadLast(pageInfo.startCursor)}
                    disabled={!pageInfo.hasPreviousPage}
                ><FiChevronLeft /></PageButton>
                <PageButton
                    onClick={() => loadFirst(pageInfo.endCursor)}
                    disabled={!pageInfo.hasNextPage}
                ><FiChevronRight /></PageButton>
                <PageButton
                    onClick={() => loadLast(null)}
                    disabled={!pageInfo.hasNextPage}
                ><LastPage /></PageButton>
            </div>
        </div>
    );
};

type PageButtonProps = {
    onClick: () => void;
    disabled: boolean;
};

const PageButton: React.FC<PageButtonProps> = ({ children, onClick, disabled }) => (
    <button
        onClick={disabled ? () => {} : onClick}
        disabled={disabled}
        css={{
            background: "none",
            border: "none",
            fontSize: 24,
            padding: "4px 4px",
            margin: "0 4px",
            lineHeight: 0,
            ...disabled
                ? {
                    color: "var(--grey80)",
                }
                : {
                    color: "var(--grey40)",
                    cursor: "pointer",
                    ":hover": {
                        color: "black",
                    },
                },
        }}
    >{children}</button>
);

const queryParamsToOrder = (queryParams: URLSearchParams): EventSortOrder => {
    const sortBy = queryParams.get("sortBy");
    const column = sortBy !== null && match<string, EventSortColumn>(sortBy, {
        "title": () => "TITLE",
        "duration": () => "DURATION",
        "created": () => "CREATED",
        "updated": () => "UPDATED",
    });

    const sortOrder = queryParams.get("sortOrder");
    const direction = sortOrder !== null && match<string, SortDirection>(sortOrder, {
        "desc": () => "DESCENDING",
        "asc": () => "ASCENDING",
    });

    return column === false || direction === false
        ? { column: "CREATED", direction: "DESCENDING" }
        : { column, direction };
};

const setSortQueryParams = (order: EventSortOrder) => {
    const url = new URL(document.location.href);
    url.searchParams.set("sortBy", order.column.toLowerCase());
    url.searchParams.set("sortOrder", match(order.direction, {
        "ASCENDING": () => "asc",
        "DESCENDING": () => "desc",
    }, () => ""));
    history.pushState(null, "", url);
};
