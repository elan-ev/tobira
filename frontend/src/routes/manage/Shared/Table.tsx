import {
    Card, Floating, FloatingHandle, match, screenWidthAbove,
    screenWidthAtMost, useColorScheme, useFloatingItemProps,
} from "@opencast/appkit";
import {
    useRef, ReactNode, ComponentType, PropsWithChildren, useId,
} from "react";
import { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide,
    LuArrowUpWideNarrow,
    LuChevronLeft,
    LuChevronRight,
} from "react-icons/lu";
import { css } from "@emotion/react";

import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { prettyDate } from "../../../ui/time";
import { ellipsisOverflowCss, IconWithTooltip } from "../../../ui";
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
import { floatingMenuProps, OcEntity } from "../../../util";
import { isSynced } from "../../../util";
import { ThumbnailItemStatus } from "../../../ui/Video";
import { FloatingBaseMenu } from "../../../ui/FloatingBaseMenu";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { MenuItem } from "../../../ui/Blocks/VideoList";


type ItemVars = {
    order: {
        column: SortColumn;
        direction: SortDirection;
    };
    page: number;
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
    RenderItem: ComponentType<{ item: T }>;
}

type SortingProps<T> = {
    key: T;
    label: ParseKeys;
}

type ManageItemProps<T> = PropsWithChildren & SharedTableProps<T> & {
    titleKey: ParseKeys;
    additionalSortOptions: SortingProps<SortColumn>[];
}

const LIMIT = 15;

export const ManageItems = <T extends Item>({
    connection,
    vars,
    titleKey,
    children,
    RenderItem,
    additionalSortOptions,
}: ManageItemProps<T>) => {
    const { t } = useTranslation();
    const { Notification } = useNotification();
    const listRef = useRef<FloatingHandle>(null);

    const sortOptions: SortingProps<SortColumn>[] = [
        { key: "TITLE", label: "general.title" },
        { key: "CREATED", label: "manage.table.sorting.created" },
        { key: "UPDATED", label: "manage.table.sorting.updated" },
        ...additionalSortOptions,
    ];

    const labelKey: ParseKeys = sortOptions
        .find(o => o.key === vars.order.column)
        ?.label
        ?? "manage.table.sorting.unknown";

    let inner;
    if (connection.items.length === 0) {
        inner = <div css={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 32 }}>
            <Notification />
            <Card kind="info" css={{ width: "fit-content", marginTop: 16 }}>
                {t("manage.table.no-entries-found")}
            </Card>
        </div>;
    } else {
        inner = <>
            <div css={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 16,
            }}>
                <Notification />
            </div>
            <div css={{ flex: "1 0 0", margin: "16px 0", marginTop: 0 }}>
                <ul css={{ padding: 0 }}>
                    {connection.items.map(item => <RenderItem key={item.id} {... { item }} />)}
                </ul>
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
            <div css={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 32,
                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                    flexDirection: "column",
                    alignItems: "flex-start",
                },
            }}>
                <PageTitle title={title} css={{ marginBottom: 0, flexShrink: 0 }} />
                <div css={{
                    [screenWidthAtMost(600)]: {
                        "> div": {
                            flexDirection: "column",
                            gap: 0,
                        },
                    },
                    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                        width: "100%",
                        "> div": {
                            justifyContent: "space-between",
                            flexDirection: "row",
                        },
                    },
                    alignContent: "flex-end",
                }}>
                    <PageNavigation {...{ vars, connection }} />
                </div>
            </div>

            <div css={{ marginBottom: 0, display: "flex", justifyContent: "space-between" }}>
                {/* TODO: search field for filtering */}
                {children}
                <div css={{ display: "flex", gap: 16, marginLeft: "auto" }}>
                    {/* TODO: additional dedicated filter menus (i.e. for date) */}
                    <FloatingBaseMenu
                        ref={listRef}
                        triggerContent={<>{t(labelKey)}</>}
                        triggerStyles={{
                            height: 40,
                            marginLeft: "auto",
                            borderRadius: 8,
                            padding: "7px 14px",
                            gap: 12,

                        }}
                        list={<SortingMenu
                            {...{ vars, sortOptions }}
                            close={() => listRef.current?.close()}
                        />}
                        label={t("manage.table.sorting.label")}
                        icon={vars.order.direction === "ASCENDING"
                            ? <LuArrowDownNarrowWide />
                            : <LuArrowUpWideNarrow />
                        }
                    />
                </div>
            </div>
            {inner}
        </div>
    );
};

type SortingMenuProps = {
    close: () => void;
    vars: ItemVars;
    sortOptions: SortingProps<SortColumn>[];
}

const SortingMenu: React.FC<SortingMenuProps> = ({ close, vars, sortOptions }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const itemId = useId();
    const router = useRouter();
    const itemProps = useFloatingItemProps();

    const directionTransKey = vars.order.direction === "ASCENDING" ? "ascending" : "descending";

    const listStyle = {
        minWidth: 125,
        div: {
            cursor: "default",
            fontSize: 12,
            padding: "8px 14px 4px 14px",
            color: COLORS.neutral60,
        },
        ul: {
            listStyle: "none",
            margin: 0,
            padding: 0,
        },
    };

    const handleBlur = (event: React.FocusEvent<HTMLUListElement, Element>) => {
        if (!event.currentTarget.contains(event.relatedTarget as HTMLUListElement)) {
            close();
        }
    };

    const sortDirections: SortingProps<SortDirection>[] = [
        { key: "ASCENDING", label: "manage.table.sorting.ascending" },
        { key: "DESCENDING", label: "manage.table.sorting.descending" },
    ];

    const extraStyles = css({
        "&&": {
            borderBottom: 0,
        },
        "&& button": {
            padding: "4px 14px",
        },
    });

    const list = (
        <ul role="menu" onBlur={handleBlur} css={{
            borderBottom: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}`,
        }}>
            <div>{t("manage.table.sorting.sort-by")}</div>
            {sortOptions.map((option, index) =>
                <MenuItem
                    key={`${itemId}-${option.key}`}
                    label={t(option.label)}
                    aria-label={
                        t("manage.table.sorting.description", {
                            title: option,
                            direction: t(`manage.table.sorting.${directionTransKey}`),
                        })
                    }
                    disabled={option.key === vars.order.column}
                    {...itemProps(index)}
                    onClick={() => router.goto(varsToLink({
                        order: {
                            column: option.key,
                            direction: vars.order.direction,
                        },
                        page: vars.page,
                    }))}
                    css={extraStyles}
                />)
            }
            <div css={{ borderTop: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}` }}>
                {t("manage.table.sorting.order")}
            </div>
            {sortDirections.map((direction, index) =>
                <MenuItem
                    key={`${itemId}-${direction.key}`}
                    label={t(`manage.table.sorting.${direction.key === "ASCENDING"
                        ? "ascending"
                        : "descending"
                    }-cap`)}
                    aria-label={
                        t("manage.table.sorting.description", {
                            column: vars.order.column,
                            direction: direction.label,
                        })
                    }
                    disabled={direction.key === vars.order.direction}
                    {...itemProps(sortOptions.length + index)}
                    onClick={() => router.goto(varsToLink({
                        order: {
                            column: vars.order.column,
                            direction: direction.key,
                        },
                        page: vars.page,
                    }))}
                    css={extraStyles}
                />)
            }
        </ul>
    );

    return <Floating
        {...floatingMenuProps(isDark)}
        hideArrowTip
        css={listStyle}
    >
        {list}
    </Floating>;
};


type SortColumn = VideosSortColumn | SeriesSortColumn;
type SortDirection = "ASCENDING" | "DESCENDING" | "%future added value";

export type ColumnProps<T> = {
    key: SortColumn;
    label: ParseKeys;
    headerWidth?: number;
    column:({ item }: { item: T }) => ReactNode;
};

type Item = { id: string }

type ListItemProps = {
    tobiraDeletionTimestamp?: string | null;
    title: string;
    description?: string | null;
} & ({
    syncedData: Record<string, unknown> | null | undefined;
} | {
    state: "WAITING" | "READY" | "%future added value";
});

type GenericListItemProps<T extends ListItemProps> = {
    itemType: OcEntity;
    thumbnail: (status: ThumbnailItemStatus) => ReactNode;
    link: string;
    item: T;
    customColumns?: ReactNode[];
    dateAndAdditionalInfo?: ReactNode;
    partOf?: ReactNode;
};


export const ListItem = <T extends ListItemProps>({ item, ...props }: GenericListItemProps<T>) => {
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

    return <li css={{
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "row",
        borderRadius: 12,
        padding: 8,
        gap: 12,
        height: 85,
        textDecoration: "none",
        transition: "background 200ms, outline-color 200ms",
        outline: "1px solid transparent",
        "&:hover, &:focus-within": {
            backgroundColor: COLORS.neutral15,
            outlineColor: COLORS.neutral20,
            transition: "background 50ms, outline-color 50ms",
        },
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            flexDirection: "column",
            gap: 10,
            margin: "8px auto",
            height: "unset",
            maxWidth: 330,
        },
    }}>
        {!deletionIsPending && <Link
            to={props.link}
            css={{ position: "absolute", inset: 0, borderRadius: 12 }}
        />}
        <div css={{
            width: 130,
            [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                width: "100%",
            },
        }}>
            {deletionIsPending
                ? props.thumbnail(thumbnailStatus)
                : <Link to={props.link}>
                    {props.thumbnail(thumbnailStatus)}
                </Link>
            }
        </div>
        <div css={{
            minWidth: 0,
            display: "flex",
            justifyContent: "space-between",
            flex: "1",
            gap: 6,
        }}>
            <div css={{
                color: COLORS.neutral90,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                flex: 1,
                maxWidth: "calc(100% - 150px)",
                minWidth: 0,
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    maxWidth: 330,
                },
            }}>
                <h3 css={{
                    color: COLORS.primary1,
                    fontSize: 15,
                    lineHeight: 1.1,
                    paddingBottom: 2,
                    ...ellipsisOverflowCss(1),
                }}>{item.title}</h3>

                <div css={{ "&& > *": {
                    display: "flex",
                    gap: 24,
                    marginTop: 2,
                    fontSize: 11,
                    "&& svg": { fontSize: 13 },
                    div: { gap: 6 },
                    [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                        display: "none",
                    },
                } }}>
                    {props.dateAndAdditionalInfo}
                </div>

                {deletionIsPending
                    ? <PendingDeletionBody {...{ deletionFailed, deletionDate }} />
                    : <SmallDescription lines={1} text={item.description} css={{
                        paddingLeft: 2,
                        fontSize: 12,
                        lineHeight: 1.4,
                        maxWidth: 600,
                    }} />}

                {props.partOf}
            </div>
            <div css={{ "&& > *": {
                display: "flex",
                flexDirection: "column",
                gap: 2,
                width: 150,
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            } }}>
                {props.dateAndAdditionalInfo}
            </div>
        </div>
    </li>;
};

export const thumbnailLinkStyle = {
    ":focus-visible": { outline: "none" },
    ":focus-within div:first-child": {
        outline: `2.5px solid ${COLORS.focus}`,
        outlineOffset: 1,
    },
} as const;


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
        return {
            order: { column, direction },
            page,
            limit: LIMIT,
            offset: Math.max(0, (page - 1) * LIMIT),
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

    return searchParams;
};

const varsToLink = (vars: ItemVars): string => {
    const url = new URL(document.location.href);
    url.search = decodeURIComponent(varsToQueryParams(vars).toString());
    return url.href;
};
