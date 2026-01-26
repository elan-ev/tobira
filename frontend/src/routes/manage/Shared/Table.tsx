import {
    Card,
    currentRef,
    Floating,
    FloatingHandle,
    match,
    screenWidthAbove,
    screenWidthAtMost,
    useColorScheme,
    useFloatingItemProps,
} from "@opencast/appkit";
import { useRef, ReactNode, ComponentType, PropsWithChildren, useId } from "react";
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
import { ThumbnailItemState } from "../../../ui/Video";
import { SearchInput } from "../../../layout/header/Search";
import { PlaylistsSortColumn } from "../Playlist/__generated__/PlaylistsManageQuery.graphql";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { FloatingBaseMenu } from "../../../ui/FloatingBaseMenu";
import { css } from "@emotion/react";
import { MenuItem } from "../../../ui/Blocks/VideoList";


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
        ...additionalSortOptions,
    ];

    const labelKey: ParseKeys = sortOptions
        .find(o => o.key === vars.order.column)
        ?.label
        ?? "manage.table.sorting.unknown";

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
            <div css={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 16,
            }}>
                <Notification />
                <SearchField {...{ vars }} />
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
                {children && <div css={{ marginBottom: 24 }}>
                    {children}
                    {/* <SearchField {...{ vars }} /> */}
                </div>}
                {/* <div>
                    <SearchField {...{ vars }} />
                </div> */}
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
                        ...vars,
                        order: {
                            column: option.key,
                            direction: vars.order.direction,
                        },
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
                        ...vars,
                        order: {
                            column: vars.order.column,
                            direction: direction.key,
                        },
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
            page: 1,
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
                page: 1,
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


type SortColumn = VideosSortColumn | SeriesSortColumn | PlaylistsSortColumn;
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
    thumbnail: (status: ThumbnailItemState) => ReactNode;
    link: string;
    item: T;
    customColumns?: ReactNode[];
    dateAndAdditionalInfo?: ReactNode;
    partOf?: ReactNode;
    created?: string;
};

export const ListItem = <T extends ListItemProps>({ item, ...props }: GenericListItemProps<T>) => {
    const deletionTimestamp = item.tobiraDeletionTimestamp;
    const createdTimestamp = props.created;
    const deletionIsPending = Boolean(deletionTimestamp);
    const deletionDate = new Date(deletionTimestamp ?? "");
    const creationDate = new Date(props.created ?? "");
    const thumbnailState = deletionIsPending ? "DELETED" : (
        !isSynced(item) ? "WAITING" : "READY"
    );

    // This checks if the current time is later than the deletion timestamp + twice
    // the configured poll period to ensure at least one sync has taken place
    // (+ 1min to allow some time for the Opencast delete job).
    // If it is, the deletion in Opencast has possibly failed.
    const pollPeriod = CONFIG.sync.pollPeriod * 1000;
    const deletionFailed = Boolean(deletionTimestamp
        && Date.parse(deletionTimestamp) + pollPeriod * 2 + 60000 < Date.now());

    // Figuring out an appropriate time after which sync of a waiting event has possibly failed
    // is a littler harder, since for videos, processing time is proportionally dependent on the
    // size of the uploaded file and length of the video. So this is rather arbitrarily set to 2.5
    // hours.
    const syncFailed = Boolean(!isSynced(item) && createdTimestamp
        && Date.parse(createdTimestamp) + 150 * 60000 < Date.now());

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
        {/* Link overlay (invisible, covers item completely) */}
        {!deletionIsPending && <Link
            to={props.link}
            css={{ position: "absolute", inset: 0, borderRadius: 12 }}
        />}

        {/* Thumbnail */}
        <div css={{
            width: 130,
            [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                width: "100%",
            },
        }}>
            {deletionIsPending
                ? props.thumbnail(thumbnailState)
                : <Link to={props.link}>
                    {props.thumbnail(thumbnailState)}
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
                {/* Title */}
                <h3 css={{
                    color: COLORS.primary1,
                    fontSize: 15,
                    lineHeight: 1.1,
                    paddingBottom: 2,
                    ...ellipsisOverflowCss(1),
                }}>{item.title}</h3>

                {/* Metadata */}
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

                {/* Description */}
                {!isSynced(item) && props.itemType !== "playlist"
                    ? <StatusPendingDescription
                        action={"sync"}
                        itemType={props.itemType}
                        hasFailed={syncFailed}
                        actionDate={creationDate}
                    />
                    : (deletionIsPending && props.itemType !== "playlist"
                        ? <StatusPendingDescription
                            action={"deletion"}
                            itemType={props.itemType}
                            hasFailed={deletionFailed}
                            actionDate={deletionDate}
                        />
                        : <SmallDescription lines={1} text={item.description} css={{
                            paddingLeft: 2,
                            fontSize: 12,
                            lineHeight: 1.4,
                            maxWidth: 600,
                        }} />
                    )
                }

                {/* More metadata (i.e. `part of series`) */}
                {props.partOf}
            </div>
            {/* Even more metadata, usually at least date of creation. */}
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


// Some styles are used by more than one row component.
// Declaring these here helps with keeping them in sync.
export const thumbnailLinkStyle = {
    ":focus-visible": { outline: "none" },
    ":focus-within div:first-child": {
        outline: `2.5px solid ${COLORS.focus}`,
        outlineOffset: 1,
    },
} as const;

type PendingDescriptionProps = {
    action: "sync" | "deletion";
    itemType: Exclude<OcEntity, "playlist">;
    hasFailed: boolean;
    actionDate: Date;
}

const StatusPendingDescription: React.FC<PendingDescriptionProps> = ({
    action, itemType, hasFailed, actionDate,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const { t, i18n } = useTranslation();

    // TODO: Reevaluate use of prettyDate here. The recent-ish changes to that function
    // makes the date unfit to be used in the middle of a sentence because it is capitalized.
    const [date] = prettyDate(actionDate, new Date(), i18n);

    const pendingText = action === "sync" && !hasFailed
        ? t(`${itemType}.not-ready.title`)
        : t(`manage.table.${action}.${hasFailed ? "failed-maybe" : "pending"}`);

    return (
        <div css={{
            color: isDark ? COLORS.neutral60 : COLORS.neutral50,
            display: "flex",
            fontSize: 13,
            marginTop: 4,
            padding: "0 4px",
        }}>
            <span css={{ fontStyle: "italic" }}>
                {pendingText}
            </span>
            <IconWithTooltip
                tooltip={t(`manage.table.${action}.tooltip.${
                    hasFailed ? "failed" : "pending"
                }`, { time: date })}
                mode={hasFailed ? "warning" : "info"}
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


const FILTERS = ["title"];

const parseFilters = (queryParams: URLSearchParams): Record<string, string> => {
    const filters: Record<string, string> = {};
    for (const name of FILTERS) {
        const value = queryParams.get(`filter:${name}`);
        if (value !== null) {
            filters[name] = value;
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
            searchParams.set(`filter:${key}`, value);
        }
    }

    return searchParams;
};

const varsToLink = (vars: ItemVars): string => {
    const url = new URL(document.location.href);
    url.search = decodeURIComponent(varsToQueryParams(vars).toString());
    return url.href;
};
