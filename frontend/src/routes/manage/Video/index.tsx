import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
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
            queryRef: loadQuery(query, { order: sortOrder }),
            sortOrder,
        };
    },
    render: prepared => <Page {...prepared} />,
});

const query = graphql`
    query VideoManageQuery($order: EventSortOrder) {
        ...UserData
        currentUser {
            myVideos(order: $order) {
                id title duration thumbnail created updated description
                tracks { resolution }
            }
        }
    }
`;

/** Main component, mainly loading relay data */
const Page: React.FC<Prepared> = ({ queryRef: initialQueryRef, sortOrder }) => {
    const [queryRef, loadQuery] = useQueryLoader(query, initialQueryRef);
    if (!queryRef) {
        return unreachable();
    }

    return <QueryLoader {...{ query, queryRef }} render={result => (
        <Root nav={<ManageNav key={1} active={PATH} />} userQuery={result}>
            <ManageVideos
                sortOrder={sortOrder}
                reloadQuery={vars => loadQuery(vars, { fetchPolicy: "network-only" })}
                events={result.currentUser?.myVideos}
            />
        </Root>
    )} />;
};


type Events = NonNullable<VideoManageQueryResponse["currentUser"]>["myVideos"];

type Props = {
    events?: Events;
    sortOrder: EventSortOrder;
    reloadQuery: (vars: VideoManageQueryVariables) => void;
};

/** Main part of this page */
const ManageVideos: React.FC<Props> = ({ sortOrder, events, reloadQuery }) => {
    const { t } = useTranslation();

    if (!events) {
        return <NotAuthorized />;
    }

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 16,
        }}>
            <h1>{t("manage.my-videos.title")}</h1>
            <div css={{
                overflowY: "auto",
                minHeight: 0,
                flex: "1 0 0",
            }}>
                <EventTable events={events} urlSortOrder={sortOrder} reloadQuery={reloadQuery} />
            </div>
        </div>
    );
};

const THUMBNAIL_WIDTH = 16 * 8;

type EventTableProps = {
    events: Events;
    urlSortOrder: EventSortOrder;
    reloadQuery: (vars: VideoManageQueryVariables) => void;
};

const EventTable: React.FC<EventTableProps> = ({ events, urlSortOrder, reloadQuery }) => {
    const { t } = useTranslation();
    const [sortOrder, setSortOrder] = useState(urlSortOrder);
    const [isPending, startTransition] = useTransition();


    const onColHeaderClick = (sortKey: EventSortColumn) => {
        const newOrder: EventSortOrder = {
            column: sortKey,
            direction: sortOrder.column === sortKey
                ? (sortOrder.direction === "ASCENDING" ? "DESCENDING" : "ASCENDING")
                : "ASCENDING",
        };

        setSortQueryParams(newOrder);
        startTransition(() => {
            reloadQuery({ order: newOrder });
            setSortOrder(newOrder);
        });
    };

    return (
        <table css={{
            width: "100%",
            overflowY: "auto",
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
            },
            "& > tbody": {
                overflowY: "auto",
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

            <thead css={{ position: "relative" }}>
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
    );
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
