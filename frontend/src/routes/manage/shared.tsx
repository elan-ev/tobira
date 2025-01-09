import { Card, match, useColorScheme } from "@opencast/appkit";
import { useState, useRef, useEffect, ReactNode, PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { VariablesOf } from "react-relay";
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
    VideoManageQuery,
    SortDirection,
    SortColumn,
} from "./Video/__generated__/VideoManageQuery.graphql";
import { EventConnection, EventRow } from "./Video";
import { Link } from "../../router";
import { ParseKeys } from "i18next";
import { SeriesConnection, SeriesRow } from "./Series";
import { SeriesManageQuery } from "./Series/__generated__/SeriesManageQuery.graphql";


type Connection = EventConnection | SeriesConnection;
type AssetVars = VariablesOf<VideoManageQuery> | VariablesOf<SeriesManageQuery>;

type SharedProps = {
    connection: Connection;
    vars: AssetVars;
};

type ManageAssetsProps = SharedProps & {
    titleKey: ParseKeys;
}

const LIMIT = 15;

export const ManageAssets: React.FC<ManageAssetsProps> = ({ connection, vars, titleKey }) => {
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
        inner = <Card kind="info">{t("manage.asset-table.no-entries-found")}</Card>;
    } else {
        inner = <>
            <PageNavigation {...{ vars, connection }} />
            <div css={{ flex: "1 0 0", margin: "16px 0" }}>
                <AssetTable {...{ vars, connection }} />
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

const AssetTable: React.FC<SharedProps> = ({ connection, vars }) => {
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

    // TODO: Replace hardcoded columns. Even though each asset has a thumbnail,
    // title, and description (some of which might be optional), this might change in the future.
    // Also, playlists do not have a `created` field.
    // So this should keep the overall structure and style but allow for custom columns.
    // This also needs to be considered in the backend, where the `SortColumn` enum is defined.
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
                        label={t("manage.asset-table.columns.title")}
                        sortKey="TITLE"
                        {...{ vars }}
                    />
                    <ColumnHeader
                        label={t("manage.asset-table.columns.created")}
                        sortKey="CREATED"
                        {...{ vars }}
                    />
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

// Some styles used by both `EventRow` and `SeriesRow`.
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

export const CreatedColumn: React.FC<{ created: Date }> = ({ created }) => {
    const { i18n } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    return <td css={{ fontSize: 14 }}>
        {created.toLocaleDateString(i18n.language)}
        <br />
        <span css={{ color: isDark ? COLORS.neutral60 : COLORS.neutral50 }}>
            {created.toLocaleTimeString(i18n.language)}
        </span>
    </td>;
};

type TableRowProps = PropsWithChildren & {
    thumbnail: ReactNode;
    title: ReactNode;
    syncInfo?: {
        isSynced: boolean;
        notReadyLabel: ParseKeys;
    };
    description: ReactNode;
};

/**
 * A row in the asset table
 * This is assuming that each asset (video, series, playlist) has a thumbnail, title,
 * and description. These can still be somewhat customized.
 * TODO: Allow adding custom columns (also needs adjusting `AssetTable`).
 */
export const TableRow: React.FC<TableRowProps> = ({
    thumbnail,
    title,
    syncInfo,
    description,
    children,
}) => {
    const { t } = useTranslation();

    return <tr>
        <td>{thumbnail}</td>
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
                    }}>{t(syncInfo.notReadyLabel)}</span>)
                }
            </div>
            {description}
        </td>
        {children}
    </tr>;
};


type ColumnHeaderProps = {
    label: string;
    sortKey: SortColumn;
    vars: AssetVars;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, vars }) => {
    const { t } = useTranslation();
    const direction = vars.order.column === sortKey && vars.order.direction === "ASCENDING"
        ? "DESCENDING"
        : "ASCENDING";
    const directionTransKey = direction.toLowerCase() as Lowercase<typeof direction>;

    return <th>
        <Link
            aria-label={t("manage.asset-table.columns.description",
                { title: label, direction: t(`manage.asset-table.columns.${directionTransKey}`) })
            }
            to={varsToLink({
                order: {
                    column: sortKey,
                    direction,
                },
                limit: vars.limit,
                offset: vars.offset,
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
                {t("manage.asset-table.page-showing-ids", {
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
                    label={t("manage.asset-table.navigation.first")}
                ><FirstPage /></PageLink>
                {/* Previous page */}
                <PageLink
                    vars={{ ...vars, offset: prevOffset }}
                    disabled={!pageInfo.hasPreviousPage}
                    label={t("manage.asset-table.navigation.previous")}
                ><LuChevronLeft /></PageLink>
                {/* Next page */}
                <PageLink
                    vars={{ ...vars, offset: nextOffset }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.asset-table.navigation.next")}
                ><LuChevronRight /></PageLink>
                {/* Last page */}
                <PageLink
                    vars={{ ...vars, offset: lastOffset }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.asset-table.navigation.last")}
                ><LastPage /></PageLink>
            </div>
        </div>
    );
};

type PageLinkProps = {
    vars: AssetVars;
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

const DEFAULT_SORT_COLUMN: SortColumn = "CREATED";
const DEFAULT_SORT_DIRECTION: SortDirection = "DESCENDING";

/** Reads URL query parameters and converts them into query variables */
export const queryParamsToVars = (queryParams: URLSearchParams): AssetVars => {
    // Sort order
    const sortBy = queryParams.get("sortBy");
    const column = sortBy !== null && match<string, SortColumn>(sortBy, {
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
    const pageParam = queryParams.get("page");
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    const limitParam = queryParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : LIMIT;

    const offset = Math.max(0, (page - 1) * limit);

    return { order, limit, offset };
};

/** Converts query variables to URL query parameters */
const varsToQueryParams = (vars: AssetVars): URLSearchParams => {
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

const varsToLink = (vars: AssetVars): string => {
    const url = new URL(document.location.href);
    url.search = varsToQueryParams(vars).toString();
    return url.href;
};
