import { Card, match, useColorScheme } from "@opencast/appkit";
import { useState, useRef, useEffect, ReactNode } from "react";
import { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide,
    LuArrowUpWideNarrow,
    LuChevronLeft,
    LuChevronRight,
} from "react-icons/lu";

import FirstPage from "../../icons/first-page.svg";
import LastPage from "../../icons/last-page.svg";
import { ManageRoute } from ".";
import { COLORS } from "../../color";
import { PageTitle } from "../../layout/header/ui";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import {
    SortDirection,
    VideosSortColumn,
} from "./Video/__generated__/VideoManageQuery.graphql";
import { Event, EventConnection, EventRow, videoColumns } from "./Video";
import { Link } from "../../router";
import { SeriesConnection, SeriesRow, seriesColumns, SingleSeries } from "./Series";
import { SeriesSortColumn } from "./Series/__generated__/SeriesManageQuery.graphql";


type Connection = EventConnection | SeriesConnection;
type ItemVars = {
    order: {
        column: SortColumn;
        direction: SortDirection;
    };
    limit: number;
    offset: number;
};

type SharedProps = {
    connection: Connection;
    vars: ItemVars;
};

type ManageItemProps = SharedProps & {
    titleKey: ParseKeys;
}

const LIMIT = 15;

export const ManageItems: React.FC<ManageItemProps> = ({ connection, vars, titleKey }) => {
    const { t } = useTranslation();

    const totalCount = connection.totalCount;
    const limit = vars.limit ?? 15;
    const pageParam = new URLSearchParams(document.location.search).get("page");
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    useEffect(() => {
        const maxPage = Math.max(Math.ceil(totalCount / limit), 1);

        if (page > maxPage) {
            window.location.href = `?page=${maxPage}`;
        } else if (page < 1) {
            window.location.href = "?page=1";
        }
    }, [page, totalCount, limit]);

    let inner;
    if (connection.items.length === 0 && connection.totalCount === 0) {
        inner = <Card kind="info">{t("manage.item-table.no-entries-found")}</Card>;
    } else {
        inner = <>
            <PageNavigation {...{ vars, connection }} />
            <div css={{ flex: "1 0 0", margin: "16px 0" }}>
                <ItemTable {...{ vars, connection }} />
            </div>
            <PageNavigation {...{ vars, connection }} />
        </>;
    }

    const title = t(titleKey);

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

type Item = Event | SingleSeries;
type SortColumn = VideosSortColumn | SeriesSortColumn;

export type ColumnProps = {
    key: SortColumn;
    label: ParseKeys;
    headerWidth?: number;
    column: (item: Item) => ReactNode;
};

type GenericTableProps = SharedProps & {
    thumbnailWidth?: number;
}

const ItemTable: React.FC<GenericTableProps> = ({
    connection,
    vars,
    thumbnailWidth,
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

    const additionalColumns = match(connection.__typename, {
        "EventConnection": () => videoColumns,
        "SeriesConnection": () => seriesColumns,
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
                {/* Each table has thumbnails, but their width might vary */}
                <col span={1} css={{ width: (thumbnailWidth ?? THUMBNAIL_WIDTH) + 2 * 6 }} />
                {/* Each table has a title and description */}
                <col span={1} />
                {/*
                    Additional columns can be declared in the specific column array.
                */}
                {additionalColumns?.map(col =>
                    <col key={col.key} span={1} css={{ width: col.headerWidth ?? 135 }} />)
                }
            </colgroup>

            <thead ref={tableHeaderRef}>
                <tr>
                    {/* Thumbnail */}
                    <th></th>
                    {/* Title */}
                    <ColumnHeader
                        label={t("manage.item-table.columns.title")}
                        sortKey="TITLE"
                        {...{ vars }}
                    />
                    {/* Sort columns */}
                    {additionalColumns?.map(col => (
                        <ColumnHeader
                            key={col.key}
                            label={t(col.label)}
                            sortKey={col.key}
                            {...{ vars }}
                        />
                    ))}
                </tr>
            </thead>
            <tbody>
                {connection.__typename === "EventConnection" && connection.items.map(event =>
                    <EventRow key={event.id} event={event} />)
                }
                {connection.__typename === "SeriesConnection" && connection.items.map(series =>
                    <SeriesRow key={series.id} series={series} />)
                }
            </tbody>
        </table>
    </div>;
};

// Some styles are used by more than one row component.
// Declaring these here helps with keeping them in sync.
export const thumbnailLinkStyle = {
    ":focus-visible": { outline: "none" },
    ":focus-within div:first-child": {
        outline: `2.5px solid ${COLORS.focus}`,
        outlineOffset: 1,
    },
} as const;

export const titleLinkStyle = {
    ":focus, :focus-visible": {
        outline: "none",
    },
    textDecoration: "none",
} as const;

export const descriptionStyle = {
    padding: "0 4px",
} as const;

// Used for both `EventRow` and `SeriesRow`.
export const DateColumn: React.FC<{ date?: string }> = ({ date }) => {
    const { t, i18n } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const parsedDate = date && new Date(date);
    const greyColor = { color: isDark ? COLORS.neutral60 : COLORS.neutral50 };

    return <td css={{ fontSize: 14 }}>
        {parsedDate
            ? <>
                {parsedDate.toLocaleDateString(i18n.language)}
                <br />
                <span css={greyColor}>
                    {parsedDate.toLocaleTimeString(i18n.language)}
                </span>
            </>
            : <i css={greyColor}>
                {t("manage.item-table.missing-date")}
            </i>
        }
    </td>;
};

type TableRowProps = {
    thumbnail: ReactNode;
    title: ReactNode;
    description: ReactNode;
    customColumns?: ReactNode[];
    syncInfo?: {
        isSynced: boolean;
        notReadyLabel: ParseKeys;
    };
};

/**
 * A row in the item table.
 * This is assuming that each item (video, series, playlist) has a thumbnail, title,
 * and description. These can still be somewhat customized.
 * Additional columns can be declared in the respective item column arrays.
 */
export const TableRow: React.FC<TableRowProps> = ({
    thumbnail,
    title,
    description,
    customColumns,
    syncInfo,
}) => {
    const { t } = useTranslation();

    return <tr>
        {/* Thumbnail */}
        <td>{thumbnail}</td>
        {/* Title & description */}
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
                }}>{title}</div>
                {syncInfo && !syncInfo.isSynced && (
                    <span css={{
                        padding: "0 8px",
                        fontSize: "small",
                        borderRadius: 10,
                        backgroundColor: COLORS.neutral10,
                    }}>
                        {t(syncInfo.notReadyLabel)}
                    </span>
                )}
            </div>
            {description}
        </td>
        {customColumns}
    </tr>;
};

type ColumnHeaderProps = {
    label: string;
    sortKey: SortColumn;
    vars: ItemVars;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, vars }) => {
    const { t } = useTranslation();
    const direction = vars.order.column === sortKey && vars.order.direction === "ASCENDING"
        ? "DESCENDING"
        : "ASCENDING";
    const directionTransKey = direction.toLowerCase() as Lowercase<typeof direction>;

    return <th>
        <Link
            aria-label={t("manage.item-table.columns.description",
                { title: label, direction: t(`manage.item-table.columns.${directionTransKey}`) })
            }
            to={varsToLink({
                order: {
                    column: sortKey,
                    direction,
                },
                limit: vars.limit ?? LIMIT,
                offset: vars.offset ?? 0,
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

const PageNavigation: React.FC<SharedProps> = ({ connection, vars }) => {
    const { t } = useTranslation();
    const pageInfo = connection.pageInfo;
    const total = connection.totalCount;

    const limit = vars.limit ?? LIMIT;
    const offset = vars.offset ?? 0;

    const prevOffset = Math.max(0, offset - limit);
    const nextOffset = offset + limit;
    const lastOffset = total > 0
        ? Math.floor((total - 1) / limit) * limit
        : 0;

    return (
        <div css={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 48,
        }}>
            <div>
                {t("manage.item-table.page-showing-ids", {
                    start: connection.pageInfo.startIndex ?? "?",
                    end: connection.pageInfo.endIndex ?? "?",
                    total,
                })}
            </div>
            <div css={{ display: "flex", alignItems: "center" }}>
                {/* First page */}
                <PageLink
                    vars={{ ...vars, offset: 0 }}
                    disabled={!pageInfo.hasPreviousPage && connection.items.length === limit}
                    label={t("manage.item-table.navigation.first")}
                ><FirstPage /></PageLink>
                {/* Previous page */}
                <PageLink
                    vars={{ ...vars, offset: prevOffset }}
                    disabled={!pageInfo.hasPreviousPage}
                    label={t("manage.item-table.navigation.previous")}
                ><LuChevronLeft /></PageLink>
                {/* Next page */}
                <PageLink
                    vars={{ ...vars, offset: nextOffset }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.item-table.navigation.next")}
                ><LuChevronRight /></PageLink>
                {/* Last page */}
                <PageLink
                    vars={{ ...vars, offset: lastOffset }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.item-table.navigation.last")}
                ><LastPage /></PageLink>
            </div>
        </div>
    );
};

type PageLinkProps = {
    vars: ItemVars;
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

// TODO: add default sort column of playlists
const DEFAULT_SORT_COLUMN = "CREATED";
const DEFAULT_SORT_DIRECTION = "DESCENDING";

/** Helper functions to read URL query parameters and convert them into query variables */
type QueryVars = {
    limit: number;
    offset: number;
    direction: SortDirection;
}
export const parsePaginationAndDirection = (
    queryParams: URLSearchParams,
    defaultDirection: SortDirection = "DESCENDING",
): QueryVars => {
    const limitParam = queryParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : LIMIT;

    const pageParam = queryParams.get("page");
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const offset = Math.max(0, (page - 1) * limit);

    const sortOrder = queryParams.get("sortOrder");
    const direction = sortOrder !== null
        ? match<string, SortDirection>(sortOrder, {
            desc: () => "DESCENDING",
            asc: () => "ASCENDING",
        })
        : defaultDirection;

    return { limit, offset, direction };
};

/**
 * Creates a parser function that extracts query variables for a specific resource
 * (i.e. series, videos or playlists) from URL query parameters.
 * This abstracts the shared logic for parsing pagination and sort direction
 * but still allows specific handling of sort columns.
 */
export function createQueryParamsParser<ColumnType extends string>(
    parseColumnFn: (sortBy: string | null) => ColumnType,
) {
    return (queryParams: URLSearchParams) => {
        const { limit, offset, direction } = parsePaginationAndDirection(queryParams);
        const sortBy = queryParams.get("sortBy");
        const column = parseColumnFn(sortBy);
        return {
            order: { column, direction },
            limit,
            offset,
        };
    };
}

/** Converts query variables to URL query parameters */
const varsToQueryParams = (vars: ItemVars): URLSearchParams => {
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
    const limit = vars.limit ?? LIMIT;
    const offset = vars.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    if (page !== 1) {
        searchParams.set("page", String(page));
    }
    if (limit !== LIMIT) {
        searchParams.set("limit", String(limit));
    }

    return searchParams;
};

const varsToLink = (vars: ItemVars): string => {
    const url = new URL(document.location.href);
    url.search = varsToQueryParams(vars).toString();
    return url.href;
};
