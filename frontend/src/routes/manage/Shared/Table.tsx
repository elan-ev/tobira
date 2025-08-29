import { Card, currentRef, match, screenWidthAtMost, useColorScheme } from "@opencast/appkit";
import { useRef, ReactNode, ComponentType, useEffect, PropsWithChildren, useState } from "react";
import { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide,
    LuArrowUpWideNarrow,
    LuChevronLeft,
    LuChevronRight,
} from "react-icons/lu";

import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { PrettyDate, prettyDate } from "../../../ui/time";
import { IconWithTooltip } from "../../../ui";
import CONFIG from "../../../config";
import { SmallDescription } from "../../../ui/metadata";
import { ManageRoute } from "..";
import { COLORS } from "../../../color";
import { PageTitle } from "../../../layout/header/ui";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { Link, useRouter } from "../../../router";
import { VideosSortColumn } from "../Video/__generated__/VideoManageQuery.graphql";
import { SeriesSortColumn } from "../Series/__generated__/SeriesManageQuery.graphql";
import { useNotification } from "../../../ui/NotificationContext";
import { OcEntity } from "../../../util";
import { isSynced } from "../../../util";
import { ThumbnailItemStatus } from "../../../ui/Video";
import { SearchInput } from "../../../layout/header/Search";


type ItemVars = {
    order: {
        column: SortColumn;
        direction: SortDirection;
    };
    page: number;
    filters: Record<string, string>;
};

export type SharedManageProps<T> = {
    connection: {
        items: readonly T[];
        totalCount: number;
        pageInfo: {
            hasNextPage: boolean;
            hasPrevPage: boolean;
        };
    };
    vars: ItemVars;
};

type SharedTableProps<T> = SharedManageProps<T> & {
    RenderRow: ComponentType<{ item: T }>;
    additionalColumns?: ColumnProps<T>[];
}

type ManageItemProps<T> = PropsWithChildren & SharedTableProps<T> & {
    titleKey: ParseKeys;
}

const LIMIT = 15;

export const ManageItems = <T extends Item>({
    connection,
    vars,
    titleKey,
    additionalColumns,
    children,
    RenderRow,
}: ManageItemProps<T>) => {
    const { t } = useTranslation();
    const { Notification } = useNotification();

    let inner;
    if (connection.items.length === 0) {
        inner = <div css={{ display: "flex", flexDirection: "column" }}>
            <Notification />
            <SearchField {...{ vars }} />
            <Card kind="info" css={{ width: "fit-content", marginTop: 32 }}>
                {t("manage.table.no-entries-found")}
            </Card>
        </div>;
    } else {
        inner = <>
            <Notification />
            <div css={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 16,
            }}>
                <SearchField {...{ vars }} />
                <div css={{ marginLeft: "auto" }}>
                    <PageNavigation {...{ vars, connection }} />
                </div>
            </div>
            <div css={{ flex: "1 0 0", margin: "16px 0" }}>
                <ItemTable {...{ vars, connection, additionalColumns, RenderRow }} />
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
            <Breadcrumbs tail={title} path={[{
                label: t("user.manage"),
                link: ManageRoute.url,
            }]} />
            <PageTitle title={title} css={{ marginBottom: 32 }} />
            {children}
            {inner}
        </div>
    );
};

const SearchField: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const search = (q: string) => {
        router.goto(varsToLink({
            order: {
                column: vars.order.column,
                direction: vars.order.direction,
            },
            page: vars.page,
            filters: { title: q },
        }));

    };

    const clear = () => {
        const { title, ...restFilters } = vars.filters;
        if (Object.keys(vars.filters).length) {
            router.goto(varsToLink({
                order: {
                    column: vars.order.column,
                    direction: vars.order.direction,
                },
                page: vars.page,
                filters: restFilters,
            }));
        } else {
            const input = currentRef(inputRef);
            input.value = "";
        }
    };

    return <SearchInput
        {...{ search, inputRef, clear }}
        defaultValue={vars.filters.title}
        inputProps={{ placeholder: t("manage.table.filter.by-title") }}
    />;
};

const THUMBNAIL_WIDTH = 16 * 8;

type SortColumn = VideosSortColumn | SeriesSortColumn;
type SortDirection = "ASCENDING" | "DESCENDING" | "%future added value";

export type ColumnProps<T> = {
    key: SortColumn;
    label: ParseKeys;
    headerWidth?: number;
    column:({ item }: { item: T }) => ReactNode;
};

type Item = { id: string }

const ItemTable = <T extends Item>({
    connection,
    vars,
    additionalColumns,
    RenderRow,
}: SharedTableProps<T>) => {
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

    return <div css={{ position: "relative", overflow: "auto" }}>
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
                <col span={1} css={{ width: THUMBNAIL_WIDTH + 2 * 6 }} />
                {/* Each table has a column for title and description */}
                <col span={1} css={{ [screenWidthAtMost(1000)]: { width: 135 } }} />
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
                        label={t("general.title")}
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
                {connection.items.map(item => <RenderRow key={item.id} item={item}/>)}
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
export const DateColumn: React.FC<{ date?: string | null }> = ({ date }) => {
    const isDark = useColorScheme().scheme === "dark";
    const parsedDate = date && new Date(date);
    const greyColor = { color: isDark ? COLORS.neutral60 : COLORS.neutral50 };

    return <td css={{ fontSize: 14 }}>
        {parsedDate
            ? <PrettyDate date={parsedDate} />
            : <i css={greyColor}>{"—"}</i>
        }
    </td>;
};

type TableRowItem = {
    tobiraDeletionTimestamp?: string | null;
    title: string;
    description?: string | null;
} & ({
    syncedData: Record<string, unknown> | null | undefined;
} | {
    state: "WAITING" | "READY" | "%future added value";
});

type TableRowProps<T extends TableRowItem> = {
    itemType: OcEntity;
    thumbnail: (status: ThumbnailItemStatus) => ReactNode;
    link: string;
    item: T;
    customColumns?: ReactNode[];
};

/**
 * A row in the item table
 * This is assuming that each item (video, series, playlist) has a thumbnail, title,
 * and description. These can still be somewhat customized.
 * Additional columns can be declared in the respective item column arrays.
 */
export const TableRow = <T extends TableRowItem>({ item, ...props }: TableRowProps<T>) => {
    const { t } = useTranslation();
    const deletionTimestamp = item.tobiraDeletionTimestamp;
    const deletionIsPending = Boolean(deletionTimestamp);
    const deletionDate = new Date(deletionTimestamp ?? "");
    const thumbnailStatus = deletionIsPending ? "deleted" : (
        !isSynced(item) ? "waiting" : "ready"
    );

    // This checks if the current time is later than the deletion timestamp + twice
    // the configured poll period to ensure at least one sync has taken place
    // (+ 1min to allow some time for the Opencast delete job).
    // If it is, the deletion in Opencast has possibly failed.
    const pollPeriod = CONFIG.sync.pollPeriod * 1000;
    const deletionFailed = Boolean(deletionTimestamp
        && Date.parse(deletionTimestamp) + pollPeriod * 2 + 60000 < Date.now());

    return <tr>
        {/* Thumbnail */}
        <td>
            {deletionIsPending
                ? props.thumbnail(thumbnailStatus)
                : <Link to={props.link} css={{ ...thumbnailLinkStyle }}>
                    {props.thumbnail(thumbnailStatus)}
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
                    {/* Title */}
                    {deletionIsPending
                        ? <span css={{ color: COLORS.neutral60 }}>{item.title}</span>
                        : <Link to={props.link} css={{ ...titleLinkStyle }}>{item.title}</Link>
                    }
                </div>
                {!isSynced(item) && (
                    <span css={{
                        padding: "0 8px",
                        fontSize: "small",
                        borderRadius: 10,
                        backgroundColor: COLORS.neutral10,
                    }}>
                        {t(`${props.itemType}.not-ready.label`)}
                    </span>
                )}
            </div>
            {/* Description */}
            {deletionIsPending
                ? <PendingDeletionBody {...{ deletionFailed, deletionDate }} />
                : <SmallDescription
                    css={{ ...descriptionStyle }}
                    text={item.description}
                />
            }
        </td>
        {props.customColumns}
    </tr>;
};

type PendingDeleteBodyProps = {
    deletionFailed: boolean;
    deletionDate: Date;
}

const PendingDeletionBody: React.FC<PendingDeleteBodyProps> = ({
    deletionFailed,
    deletionDate,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const { t, i18n } = useTranslation();

    const [date] = prettyDate(deletionDate, new Date(), i18n);

    return (
        <div css={{
            color: isDark ? COLORS.neutral60 : COLORS.neutral50,
            display: "flex",
            fontSize: 13,
            marginTop: 4,
            padding: "0 4px",
        }}>
            <span css={{ fontStyle: "italic" }}>
                {t(`manage.table.deletion.${
                    deletionFailed ? "failed-maybe" : "pending"
                }`)}
            </span>
            <IconWithTooltip
                tooltip={t(`manage.table.deletion.tooltip.${
                    deletionFailed ? "failed" : "pending"
                }`, { time: date })}
                mode={deletionFailed ? "warning" : "info"}
            />
        </div>
    );
};

type ColumnHeaderProps = {
    label: string;
    sortKey: SortColumn;
    vars: ItemVars;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, vars }) => {
    const { t } = useTranslation();
    const direction = vars.order.direction === "ASCENDING" ? "DESCENDING" : "ASCENDING";
    const directionTransKey = direction === "ASCENDING" ? "ascending" : "descending";

    return <th>
        <Link
            aria-label={
                t("manage.table.columns.description", {
                    title: label,
                    direction: t(`manage.table.columns.${directionTransKey}`),
                })
            }
            to={varsToLink({
                order: {
                    column: sortKey,
                    direction,
                },
                page: vars.page,
                filters: vars.filters,
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
            })}
        </Link>
    </th>;
};

const PageNavigation = <T, >({ connection, vars }: SharedManageProps<T>) => {
    const { t } = useTranslation();
    const pageInfo = connection.pageInfo;
    const total = connection.totalCount;
    const page = vars.page;

    return (
        <div css={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 48,
        }}>
            <div>
                {t("manage.table.page-showing-ids", {
                    start: page * LIMIT - LIMIT + 1,
                    end: Math.min(page * LIMIT, total),
                    total,
                })}
            </div>
            <div css={{ display: "flex", alignItems: "center" }}>
                {/* First page */}
                <PageLink
                    vars={{ ...vars, page: 1 }}
                    disabled={!pageInfo.hasPrevPage}
                    label={t("manage.table.navigation.first")}
                ><FirstPage /></PageLink>
                {/* Previous page */}
                <PageLink
                    vars={{ ...vars, page: page - 1 }}
                    disabled={!pageInfo.hasPrevPage}
                    label={t("manage.table.navigation.previous")}
                ><LuChevronLeft /></PageLink>
                {/* Next page */}
                <PageLink
                    vars={{ ...vars, page: page + 1 }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.table.navigation.next")}
                ><LuChevronRight /></PageLink>
                {/* Last page */}
                <PageLink
                    vars={{ ...vars, page: Math.ceil(total / LIMIT) }}
                    disabled={!pageInfo.hasNextPage}
                    label={t("manage.table.navigation.last")}
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
    page: number;
    sortColumn: string;
    direction: SortDirection;
}
export const parsePaginationAndDirection = (
    queryParams: URLSearchParams,
    defaultDirection: SortDirection = DEFAULT_SORT_DIRECTION,
): QueryVars => {
    const pageParam = queryParams.get("page");
    const pageNumber = pageParam && parseInt(pageParam);
    const page = pageNumber && !isNaN(pageNumber) && pageNumber > 0
        ? pageNumber
        : 1;

    const sortParams = queryParams.get("sort")?.split(":") ?? [];
    const sortColumn = sortParams[0] ?? DEFAULT_SORT_COLUMN;
    const sortOrder = sortParams[1] ?? null;
    const direction = sortOrder !== null
        ? match(sortOrder, {
            desc: () => "DESCENDING" as const,
            asc: () => "ASCENDING" as const,
        }) ?? defaultDirection
        : defaultDirection;

    return { page, direction, sortColumn };
};

const parseFilters = (queryParams: URLSearchParams): Record<string, string> => {
    const filters: Record<string, string> = {};
    for (const [key, value] of queryParams.entries()) {
        if (key !== "page" && key !== "sort") {
            filters[key] = value;
        }
    }
    return filters;
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
        const { page, direction, sortColumn } = parsePaginationAndDirection(queryParams);
        const column = parseColumnFn(sortColumn);
        const filters = parseFilters(queryParams);
        return {
            order: { column, direction },
            page,
            limit: LIMIT,
            offset: Math.max(0, (page - 1) * LIMIT),
            filters,
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
        const order = vars.order.direction === "ASCENDING" ? "asc" : "desc";
        const sortParam = `${vars.order.column.toLowerCase()}:${order}`;
        searchParams.set("sort", sortParam);
    }

    if (vars.page !== 1) {
        searchParams.set("page", String(vars.page));
    }

    if (vars.filters) {
        for (const [key, value] of Object.entries(vars.filters)) {
            searchParams.set(key, value);
        }
    }

    return searchParams;
};

const varsToLink = (vars: ItemVars): string => {
    const url = new URL(document.location.href);
    url.search = decodeURIComponent(varsToQueryParams(vars).toString());
    return url.href;
};
