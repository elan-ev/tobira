import {
    Card,
    currentRef,
    Floating,
    FloatingHandle,
    match,
    ProtoButton,
    screenWidthAbove,
    screenWidthAtMost,
    useColorScheme,
    useFloatingItemProps,
    WithTooltip,
} from "@opencast/appkit";
import {
    useState, useRef, useEffect, useLayoutEffect, useCallback,
    ReactNode, ComponentType, useId, PropsWithChildren,
} from "react";
import { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide,
    LuArrowUpWideNarrow,
    LuChevronLeft,
    LuChevronRight,
    LuCornerUpRight,
    LuX,
} from "react-icons/lu";
import { IconType } from "react-icons";
import { css } from "@emotion/react";
import { LucideFunnel } from "lucide-react";

import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { PrettyDate, prettyDate } from "../../../ui/time";
import { ellipsisOverflowCss, focusStyle, IconWithTooltip } from "../../../ui";
import CONFIG from "../../../config";
import { SmallDescription } from "../../../ui/metadata";
import { ManageRoute } from "..";
import { COLORS } from "../../../color";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { Link, useRouter } from "../../../router";
import { VideosSortColumn } from "../Video/__generated__/VideoManageQuery.graphql";
import { SeriesSortColumn } from "../Series/__generated__/SeriesManageQuery.graphql";
import { useNotification } from "../../../ui/NotificationContext";
import { AccessIcon, floatingMenuProps, OcEntity, visuallyHiddenStyle } from "../../../util";
import { isSynced } from "../../../util";
import { ThumbnailItemState } from "../../../ui/Video";
import { SearchInput } from "../../../layout/header/Search";
import { PlaylistsSortColumn } from "../Playlist/__generated__/PlaylistsManageQuery.graphql";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { FloatingBaseMenu } from "../../../ui/FloatingBaseMenu";
import { MenuItem } from "../../../ui/Blocks/VideoList";
import { LinkButton } from "../../../ui/LinkButton";
import { isRealUser, useUser } from "../../../User";
import { Creators } from "../../../ui/Video";


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

type ManageItemProps<T> = SharedTableProps<T> & {
    titleKey: ParseKeys;
    additionalSortOptions: SortingProps<SortColumn>[];
    createButton: ReactNode;
}

const LIMIT = 15;


export const ManageItems = <T extends Item>({
    connection,
    vars,
    titleKey,
    RenderItem,
    additionalSortOptions,
    createButton,
}: ManageItemProps<T>) => {
    const { t } = useTranslation();
    const { Notification } = useNotification();

    let inner;
    if (connection.items.length === 0) {
        inner = <div css={{ display: "flex", flexDirection: "column" }}>
            <Card kind="info" css={{ width: "fit-content", marginTop: 32 }}>
                {t("manage.table.no-entries-found")}
            </Card>
        </div>;
    } else {
        inner = <>
            <div css={{ flex: "1 0 0", margin: "16px 0", marginTop: 4 }}>
                <ul css={{
                    padding: 0,
                    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                        marginInline: -8,
                    },
                }}>
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
            maxWidth: 1000,
        }}>
            <div css={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
            }}>
                <Breadcrumbs tail={title} path={[{
                    label: t("user.manage"),
                    link: ManageRoute.url,
                }]} />
                <div css={{ marginLeft: "auto" }}>
                    {createButton}
                </div>
            </div>

            <h1 css={visuallyHiddenStyle}>{title}</h1>

            <Notification />

            {/* Header */}
            <div css={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px 8px",
                flexWrap: "wrap",
                marginTop: 16,
                borderRadius: 8,
                padding: 4,
            }}>
                {/* Text field filter (title & description) */}
                <SearchField {...{ vars }} />

                <div css={{
                    display: "flex",
                    gap: 20,
                    marginLeft: "auto",
                    paddingLeft: 12,
                    flexWrap: "wrap",
                    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                        paddingLeft: 0,
                        gap: 4,
                    },
                }}>
                    <div css={{ display: "flex", gap: 4 }}>
                        {/* Date range filter */}
                        <DateFilter {...{ vars }} />

                        {/* Visibility filter */}
                        <VisibilityFilter {...{ vars }} />
                    </div>

                    {/* Sorting & order */}
                    <SortAndOrder {...{ additionalSortOptions, vars }} />
                </div>
            </div>

            {/* Applied filters */}
            <AppliedFilters {...{ vars }} />

            {/* Actual table */}
            {inner}
        </div>
    );
};


// ======== Sort and filter components ========

type SortAndOrderProps = {
    additionalSortOptions: SortingProps<SortColumn>[];
    vars: ItemVars;
}
const SortAndOrder: React.FC<SortAndOrderProps> = ({ additionalSortOptions, vars }) => {
    const { t } = useTranslation();
    const listRef = useRef<FloatingHandle>(null);

    const sortOptions: SortingProps<SortColumn>[] = [
        { key: "TITLE", label: "general.title" },
        ...additionalSortOptions,
    ];

    const labelKey: ParseKeys = sortOptions.find(o => o.key === vars.order.column)?.label
        ?? "manage.table.sorting.unknown";

    return <div css={{ display: "flex", alignItems: "center" }}>
        <FloatingBaseMenu
            ref={listRef}
            triggerContent={<>
                {vars.order.direction === "ASCENDING"
                    ? <LuArrowDownNarrowWide />
                    : <LuArrowUpWideNarrow />
                }
                {t(labelKey)}
            </>}
            triggerStyles={{ ...filterTriggerStyles }}
            list={<SortingMenu
                {...{ vars, sortOptions }}
                close={() => listRef.current?.close()}
            />}
            label={t("manage.table.sorting.label")}
        />
    </div>;
};


/** Blur handler to close floating menus when focus moves outside container. */
const handleMenuBlur = (close: () => void) => (
    event: React.FocusEvent<HTMLElement, Element>,
) => {
    if (!event.currentTarget.contains(event.relatedTarget as HTMLElement)) {
        close();
    }
};

const filterTriggerStyles = {
    height: 30,
    marginLeft: "auto",
    padding: "4px 8px",
    gap: 5,
    border: 0,
    backgroundColor: "transparent",
    fontSize: 15,
};

type DatePreset = {
    key: string;
    label: string;
    start: string;
    end: string;
};

type DateFilterMenuProps = {
    vars: ItemVars;
    presets: DatePreset[];
    yearPresets: DatePreset[];
    customStart: string;
    customEnd: string;
    setCustomStart: (v: string) => void;
    setCustomEnd: (v: string) => void;
    applyPreset: (preset: DatePreset) => void;
    applyCustom: (start: string, end: string) => void;
    close: () => void;
};

const DateFilterMenu: React.FC<DateFilterMenuProps> = ({
    vars, presets, yearPresets, customStart, customEnd,
    setCustomStart, setCustomEnd, applyPreset, applyCustom,
    close,
}) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const itemProps = useFloatingItemProps();

    const inputStyle = {
        borderRadius: 4,
        border: `1px solid ${COLORS.neutral40}`,
        fontSize: 14,
        ...focusStyle({ width: 2, inset: true }),
    };

    const menuItemStyle = css({
        "&&": { borderBottom: 0 },
        "&& button": { padding: "4px 14px 7px", fontSize: 14 },
    });

    const sectionLabelStyle = {
        cursor: "default",
        fontSize: 11,
        padding: "6px 12px 2px 12px",
        color: COLORS.neutral60,
    };

    const dividerStyle = {
        borderTop: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}`,
    };

    return <Floating {...floatingMenuProps(isDark)} hideArrowTip>
        <ul
            role="menu"
            onBlur={handleMenuBlur(close)}
            css={{ listStyle: "none", margin: 0, padding: 0 }}
        >
            <div css={sectionLabelStyle}>
                {t("manage.table.filter.select-date")}
            </div>
            {presets.map((preset, i) => <MenuItem
                key={preset.key}
                label={preset.label}
                disabled={preset.key === vars.filters.datePreset}
                {...itemProps(i)}
                onClick={() => applyPreset(preset)}
                css={menuItemStyle}
            />)}
            <div css={{ ...dividerStyle, ...sectionLabelStyle }} />
            {yearPresets.map((preset, i) => <MenuItem
                key={preset.key}
                label={preset.label}
                disabled={preset.key === vars.filters.datePreset}
                {...itemProps(presets.length + i)}
                onClick={() => applyPreset(preset)}
                css={menuItemStyle}
            />)}
            <div css={{ ...dividerStyle, ...sectionLabelStyle }}>
                {t("manage.table.filter.date-custom-range")}
            </div>
            <li css={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: "4px 8px 8px",
            }}>
                <input
                    value={customStart}
                    css={inputStyle}
                    type="date"
                    max={customEnd || undefined}
                    onChange={e => {
                        const val = e.target.value;
                        setCustomStart(val);
                        if (val && customEnd) {
                            applyCustom(val, customEnd);
                            close();
                        }
                    }}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            applyCustom(customStart, customEnd);
                            close();
                        }
                    }}
                />
                <span>{"-"}</span>
                <input
                    value={customEnd}
                    css={inputStyle}
                    type="date"
                    min={customStart}
                    onChange={e => {
                        const val = e.target.value;
                        setCustomEnd(val);
                        if (customStart && val) {
                            applyCustom(customStart, val);
                            close();
                        }
                    }}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            applyCustom(customStart, customEnd);
                            close();
                        }
                    }}
                />
            </li>
        </ul>
    </Floating>;
};

const DateFilter: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const listRef = useRef<FloatingHandle>(null);

    const [customStart, setCustomStart] = useState(
        vars.filters.datePreset ? "" : (vars.filters.start ?? ""),
    );
    const [customEnd, setCustomEnd] = useState(
        vars.filters.datePreset ? "" : (vars.filters.end ?? ""),
    );

    const formatDate = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const currentYear = today.getFullYear();

    const presets: DatePreset[] = [
        {
            key: "last-3-months",
            label: t("manage.table.filter.date-last-3-months"),
            start: formatDate(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())),
            end: formatDate(today),
        },
        {
            key: "last-6-months",
            label: t("manage.table.filter.date-last-6-months"),
            start: formatDate(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())),
            end: formatDate(today),
        },
        {
            key: "last-year",
            label: t("manage.table.filter.date-last-12-months"),
            start: formatDate(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
            end: formatDate(today),
        },
    ];

    const yearPresets: DatePreset[] = [currentYear - 1, currentYear - 2, currentYear - 3].map(
        year => ({
            key: String(year),
            label: String(year),
            start: `${year}-01-01`,
            end: `${year}-12-31`,
        }),
    );

    const allPresets = [...presets, ...yearPresets];
    const activePreset = allPresets.find(p => p.key === vars.filters.datePreset);

    const applyPreset = (preset: DatePreset) => {
        setCustomStart("");
        setCustomEnd("");
        router.goto(varsToLink({
            ...vars,
            page: 1,
            filters: {
                ...vars.filters,
                datePreset: preset.key,
                start: preset.start,
                end: preset.end,
            },
        }));
        listRef.current?.close();
    };

    const applyCustom = (start: string, end: string) => {
        const newFilters = { ...vars.filters };
        delete newFilters.datePreset;
        if (start) {
            newFilters.start = start;
        } else {
            delete newFilters.start;
        }
        if (end) {
            newFilters.end = end;
        } else {
            delete newFilters.end;
        }
        router.goto(varsToLink({ ...vars, page: 1, filters: newFilters }));
    };

    return <FloatingBaseMenu
        ref={listRef}
        triggerContent={<>{activePreset?.label ?? t("manage.table.filter.date")}</>}
        triggerStyles={filterTriggerStyles}
        label={t("manage.table.filter.select-date")}
        list={<DateFilterMenu close={() => listRef.current?.close()} {...{
            vars,
            presets,
            yearPresets,
            customStart,
            customEnd,
            setCustomStart,
            setCustomEnd,
            applyPreset,
            applyCustom,
        }}/>}
    />;
};

const VisibilityFilter: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const listRef = useRef<FloatingHandle>(null);

    const current = vars.filters.visibility ?? null;
    const options = [
        {
            key: "public",
            label: t("manage.table.filter.visibility-public"),
        },
        {
            key: "shared",
            label: t("manage.table.filter.visibility-shared"),
        },
        {
            key: "private",
            label: t("manage.table.filter.visibility-private"),
        },
    ];

    const triggerLabel = current
        ? options.find(o => o.key === current)?.label
        : t("manage.table.filter.visibility");

    return <FloatingBaseMenu
        ref={listRef}
        triggerContent={<>{triggerLabel}</>}
        triggerStyles={filterTriggerStyles}
        label={t("manage.table.filter.visibility")}
        list={<FilterMenu
            {...{ vars, options }}
            filterKey="visibility"
            current={current}
            label={t("manage.table.filter.filter-by-visibility")}
            close={() => listRef.current?.close()}
        />}
    />;
};


type FilterMenuProps = {
    vars: ItemVars;
    options: { key: string; label: string }[];
    filterKey: string;
    current: string | null;
    close: () => void;
    label: string;
};

const FilterMenu: React.FC<FilterMenuProps> = ({
    vars, options, filterKey, current, close, label,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const router = useRouter();
    const itemProps = useFloatingItemProps();

    const handleSelect = (key: string) => {
        const newFilters = { ...vars.filters };

        newFilters[filterKey] = key;
        router.goto(varsToLink({
            ...vars, page: 1, filters: newFilters,
        }));
        close();
    };

    return <Floating {...floatingMenuProps(isDark)} hideArrowTip>
        <ul
            role="menu"
            onBlur={handleMenuBlur(close)}
            css={{ listStyle: "none", margin: 0, padding: 0 }}
        >
            <div css={{
                cursor: "default",
                fontSize: 11,
                padding: "6px 12px 2px 12px",
                color: COLORS.neutral60,
            }}>
                {label}
            </div>
            {options.map((opt, i) => <MenuItem
                key={opt.key}
                label={opt.label}
                disabled={opt.key === current}
                {...itemProps(i)}
                onClick={() => handleSelect(opt.key)}
                css={{
                    "&&": { borderBottom: 0 },
                    "&& button": {
                        padding: "4px 14px 7px",
                        fontSize: 14,
                    },
                }}
            />)}
        </ul>
    </Floating>;
};


const AppliedFilters: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const router = useRouter();

    type Filter = { key: string; value: string };
    const filters: Filter[] = [];
    for (const [key, value] of Object.entries(vars.filters)) {
        if (!value) {
            continue;
        }
        if (vars.filters.datePreset && (key === "start" || key === "end")) {
            continue;
        }
        filters.push({ key, value });
    }

    if (filters.length === 0) {
        return null;
    }

    const removeFilter = (key: string) => {
        const newFilters = { ...vars.filters };
        delete newFilters[key];
        if (key === "datePreset") {
            delete newFilters.start;
            delete newFilters.end;
        }
        router.goto(varsToLink({ ...vars, page: 1, filters: newFilters }));
    };

    const formatLabel = (key: string, value: string): string => {
        switch (key) {
            case "textQuery":
                return `${t("search.input-label")}: ${value}`;
            case "start":
                return `${t("manage.table.filter.from")}: ${value}`;
            case "end":
                return `${t("manage.table.filter.to")}: ${value}`;
            case "datePreset": {
                const presetLabels: Record<string, () => string> = {
                    "last-3-months": () => t("manage.table.filter.date-last-3-months"),
                    "last-6-months": () => t("manage.table.filter.date-last-6-months"),
                    "last-year": () => t("manage.table.filter.date-last-12-months"),
                };
                const label = presetLabels[value]?.() ?? value;
                return `${t("manage.table.filter.date")}: ${label}`;
            }
            case "visibility": {
                const visibilityLabel: string = match(value, {
                    "public": () => t("manage.table.filter.visibility-public"),
                    "private": () => t("manage.table.filter.visibility-private"),
                    "shared": () => t("manage.table.filter.visibility-shared"),
                }) ?? value;
                return `${t("manage.table.filter.visibility")}: ${visibilityLabel}`;
            }
            default: return `${key}: ${value}`;
        }
    };

    return <div css={{
        display: "flex",
        flexDirection: "row",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 12,
        marginInline: 12,
    }}>
        {filters.map(f => (
            <div key={f.key} css={{
                backgroundColor: COLORS.neutral15,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                fontSize: 14,
                gap: 8,
            }}>
                <span css={{ padding: "2px 0 2px 8px" }}>
                    {formatLabel(f.key, f.value)}
                </span>
                <ProtoButton
                    aria-label={t("manage.table.filter.remove")}
                    onClick={() => removeFilter(f.key)}
                    css={{
                        padding: 5,
                        border: 0,
                        display: "flex",
                        borderRadius: 8,
                        ":hover": { backgroundColor: COLORS.neutral25 },
                    }}
                >
                    <LuX size={20} />
                </ProtoButton>
            </div>
        ))}
    </div>;
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
        div: {
            cursor: "default",
            fontSize: 12,
            padding: "6px 12px 2px 12px",
            color: COLORS.neutral60,
        },
        ul: {
            listStyle: "none",
            margin: 0,
            padding: 0,
            "li button": { fontSize: 15 },
        },
    };

    const sortDirections: SortingProps<SortDirection>[] = [
        { key: "ASCENDING", label: "manage.table.sorting.ascending" },
        { key: "DESCENDING", label: "manage.table.sorting.descending" },
    ];

    const extraStyles = css({
        "&&": { borderBottom: 0 },
        "&& button": { padding: "4px 14px 7px" },
    });

    const list = <ul role="menu" onBlur={handleMenuBlur(close)}>
        <div css={{ paddingTop: 6 }}>{t("manage.table.sorting.sort-by")}</div>
        {sortOptions.map((option, index) => <MenuItem
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
        />)}
        <div css={{
            borderTop: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}`,
            "&&": { paddingTop: 6 },
        }}>
            {t("manage.table.sorting.order")}
        </div>
        {sortDirections.map((direction, index) => <MenuItem
            key={`${itemId}-${direction.key}`}
            label={t(`manage.table.sorting.${direction.key === "ASCENDING"
                ? "ascending"
                : "descending"
            }-cap`)}
            aria-label={
                t("manage.table.sorting.description", {
                    title: vars.order.column,
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
        />)}
    </ul>;

    return (
        <Floating
            {...floatingMenuProps(isDark)}
            hideArrowTip
            css={listStyle}
        >
            {list}
        </Floating>
    );
};

const SearchField: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const navigate = (newFilters: Record<string, string>) => {
        router.goto(varsToLink({
            order: {
                column: vars.order.column,
                direction: vars.order.direction,
            },
            page: 1,
            filters: newFilters,
        }));
    };

    const search = (q: string) => {
        const newFilters = { ...vars.filters };
        if (q) {
            newFilters.textQuery = q;
        } else {
            delete newFilters.textQuery;
        }
        navigate(newFilters);
    };

    const clear = () => {
        const newFilters = { ...vars.filters };
        delete newFilters.textQuery;
        navigate(newFilters);
        const input = currentRef(inputRef);
        input.value = "";
    };

    return <div css={{
        flex: "auto",
        minWidth: 280,
        [screenWidthAbove(1080)]: {
            maxWidth: 450,
        },
        input: {
            border: 0,
            paddingLeft: 34,
            fontSize: 16,
            outline: `1px solid ${COLORS.neutral30}`,
        },
        "> div": { maxWidth: "100%" },
    }}>
        <SearchInput
            {...{ search, inputRef, clear }}
            height={30}
            spinnerSize={20}
            defaultValue={vars.filters.textQuery}
            inputProps={{}}
            icon={<LucideFunnel size={18} css={{
                position: "absolute",
                height: "100%",
                left: 8,
                color: COLORS.neutral60,
            }} />}
        />
    </div>;
};



// ======== Main components ========

type SortColumn = VideosSortColumn | SeriesSortColumn | PlaylistsSortColumn;
type SortDirection = "ASCENDING" | "DESCENDING" | "%future added value";

type Item = { id: string }

type ListItemProps = {
    tobiraDeletionTimestamp?: string | null;
    title: string;
    description?: string | null;
    readRoles?: readonly string[];
    writeRoles?: readonly string[];
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
    created?: string;
    specificMetadata: ReactNode[];
    generalMetadataProps: {
        timestamp?: string;
        isLive?: boolean;
        creators: readonly string[];
    };
    directUrl: string;
    renderShareButton: (directUrl: string) => ReactNode;
};

export const ListItem = <T extends ListItemProps>({ item, ...props }: GenericListItemProps<T>) => {
    const isDark = useColorScheme().scheme === "dark";
    const { t } = useTranslation();
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
    // is a little harder, since for videos, processing time is proportionally dependent on the
    // size of the uploaded file and length of the video. So this is rather arbitrarily set to 2.5
    // hours.
    const syncFailed = Boolean(!isSynced(item) && createdTimestamp
        && Date.parse(createdTimestamp) + 150 * 60000 < Date.now());

    // Videos use the medium breakpoint; series and playlists use the small
    // one since they generally have less metadata..
    const variableBreakpoint = props.itemType === "video" ? BREAKPOINT_MEDIUM : BREAKPOINT_SMALL;

    const hasRoles = (i: ListItemProps): i is ListItemProps & {
        readRoles: readonly string[];
        writeRoles: readonly string[];
    } => i.readRoles != null && i.writeRoles != null;

    return <li css={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        borderRadius: 12,
        padding: 6,
        gap: 12,
        textDecoration: "none",
        transition: "background 200ms, outline-color 200ms",
        outline: "1px solid transparent",
        "&:hover, &:focus-within": {
            backgroundColor: COLORS.neutral15,
            outlineColor: COLORS.neutral20,
            transition: "background 50ms, outline-color 50ms",
        },
        [screenWidthAtMost(variableBreakpoint)]: {
            flexWrap: "wrap",
            marginBottom: 8,
            gap: "4px 12px",
        },

        // This has to be here in order to make the share and link button visible on hover
        // of this item.
        "&:hover > div:last-of-type, &:focus-within > div:last-of-type": {
            "button, a": { opacity: 1 },
        },
    }}>
        {/* Link overlay (invisible, covers item completely) */}
        {!deletionIsPending && <Link to={props.link} css={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
        }} />}

        {/* Thumbnail */}
        <div css={{
            position: "relative",
            width: 163,
            [screenWidthAtMost(variableBreakpoint)]: {
                width: 150,
            },
        }}>
            {deletionIsPending
                ? props.thumbnail(thumbnailState)
                : <Link to={props.link}>
                    {props.thumbnail(thumbnailState)}
                </Link>
            }
            {hasRoles(item) && <AccessIcon
                {...{ item }}
                isPlaylist={props.itemType === "playlist"}
            />}
        </div>


        {/* ======= Main body =======  */}

        {/* Mobile specific */}
        <div css={{
            display: "none",
            [screenWidthAtMost(variableBreakpoint)]: {
                display: "flex",
                flex: 1,
                minWidth: 0,
                gap: 4,
            },
        }}>
            <div css={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                {/* Title mobile  */}
                <h3 css={{
                    color: COLORS.primary1,
                    fontSize: 16,
                    lineHeight: 1.3,
                    paddingBottom: 2,
                    ...ellipsisOverflowCss(2),
                }}>
                    {item.title}
                </h3>

                {/* Description mobile */}
                <div css={{ marginTop: "auto" }}>
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
                            : <SmallDescription
                                withoutPlaceholder
                                lines={2}
                                text={item.description}
                                css={{
                                    paddingLeft: 2,
                                    fontSize: 12,
                                    lineHeight: 1.4,
                                }}
                            />
                        )
                    }
                </div>
            </div>
        </div>

        <div css={{
            minWidth: 0,
            display: "flex",
            justifyContent: "space-between",
            flex: 1,
            gap: 6,
            [screenWidthAtMost(variableBreakpoint)]: {
                flexBasis: "100%",
            },
        }}>
            <div css={{
                color: COLORS.neutral90,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                flex: 1,
                minWidth: 0,
                maxWidth: 700,
                gap: 4,
            }}>
                {/* Title desktop */}
                <div css={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "space-between",
                    [screenWidthAtMost(variableBreakpoint)]: {
                        display: "none",
                    },
                }}>
                    <h3 css={{
                        color: COLORS.primary1,
                        fontSize: 16,
                        lineHeight: 1.1,
                        paddingBottom: 2,
                        ...ellipsisOverflowCss(1),
                    }}>
                        {item.title}
                    </h3>
                </div>

                <ShrinkWrapContainer breakpoint={variableBreakpoint} css={{
                    gap: "4px 18px",
                    "&& svg": { fontSize: 13 },
                    color: COLORS.neutral80,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    backgroundColor: COLORS.neutral10,
                    borderRadius: 8,
                    padding: "2px 12px 2px 6px",
                    ...isDark && { color: COLORS.neutral90 },
                    [screenWidthAtMost(variableBreakpoint)]: {
                        width: "100%",
                        marginTop: 2,
                    },
                    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                        gap: "2px 12px",
                    },
                }}>
                    {/* First line */}
                    <div css={{
                        display: "flex",
                        alignItems: "center",
                        minWidth: 0,
                        gap: 18,
                    }}>
                        {props.generalMetadataProps.timestamp && <PrettyDate
                            date={new Date(props.generalMetadataProps.timestamp)}
                            isLive={props.generalMetadataProps.isLive}
                        />}
                        {/* Extra stuff */}
                        {props.specificMetadata}
                    </div>
                    {/* Second line (when wrapping) */}
                    <ListCreators creators={props.generalMetadataProps.creators} />
                </ShrinkWrapContainer>

                {/* Description desktop */}
                <div css={{
                    marginBottom: 4,
                    "> div": { marginTop: 2 },
                    [screenWidthAtMost(variableBreakpoint)]: {
                        display: "none",
                    },
                }}>
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
                            : <SmallDescription
                                withoutPlaceholder
                                lines={1}
                                text={item.description}
                                css={{
                                    paddingLeft: 2,
                                    fontSize: 12,
                                    lineHeight: 1.4,
                                }}
                            />
                        )
                    }
                </div>
            </div>
        </div>

        {/* Action buttons desktop */}
        {!item.tobiraDeletionTimestamp && <div css={{
            // Share and link buttons are transparent while the item isn't hovered over or in focus.
            "button, a": { opacity: 0, transition: "opacity 200ms" },
            display: "flex",
            flexDirection: "column",
            [screenWidthAtMost(variableBreakpoint)]: {
                display: "none",
            },
        }}>
            <WithTooltip placement="left" tooltip={t("general.action.share")}>
                <div css={shareButtonStyle}>
                    {props.renderShareButton(props.directUrl)}
                </div>
            </WithTooltip>
            <WithTooltip placement="left" tooltip={t("manage.realm.content.view-page")}>
                <div><ItemLinkButton to={props.directUrl} /></div>
            </WithTooltip>
        </div>}
    </li>;
};


const ItemLinkButton: React.FC<{ to: string }> = ({ to }) => (
    <LinkButton
        to={to}
        extraCss={{
            "&&": {
                border: 0,
                background: "transparent",
                padding: 4,
                height: "unset",
                position: "relative",
                borderRadius: 8,
                ":hover": {
                    backgroundColor: COLORS.neutral20,
                    border: 0,
                },
            },
        }}
    >
        <LuCornerUpRight size={18} />
    </LinkButton>
);

/** Creators display used in manage list items. */
const ListCreators: React.FC<{
    creators: readonly string[];
}> = ({ creators }) => creators.length === 0 ? null : (
    <Creators creators={[...creators]} css={{
        minWidth: 0,
        fontSize: 12,
        svg: { fontSize: 15 },
        ul: {
            display: "inline-block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
        li: { display: "inline" },
        gap: 6,
    }} />
);

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



// ======== Other components ========

type CreateButtonProps = {
    condition: "canUpload" | "canCreateSeries" | "canCreatePlaylists";
    path: string;
    text: ParseKeys;
    Icon: IconType;
}
export const CreateButton: React.FC<CreateButtonProps> = ({
    condition, path, text, Icon,
}) => {
    const { t } = useTranslation();
    const user = useUser();

    return (!isRealUser(user) || !user[condition])
        ? null
        : <LinkButton to={path} css={{
            backgroundColor: "unset",
            padding: "4px 10px",
            gap: 7,
            height: 38,
            fontSize: 14,
            [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                "&&, &&:hover": {
                    border: 0,
                },
                height: "unset",
                padding: 8,
                marginTop: -4,
            },
        }}>
            <p css={{
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            }}>
                {t(text)}
            </p>
            <Icon size={17} />
        </LinkButton>;
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



// ======== Miscellaneous helpers ========


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


const FILTERS = [
    "textQuery",
    "start",
    "end",
    "datePreset",
    "visibility",
];

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

const VISIBILITY_MAP = {
    "public": "PUBLIC",
    "shared": "SHARED",
    "private": "PRIVATE",
} as const;

/**
 * Builds a GraphQL SearchFilter input from the parsed filter vars.
 * Converts date strings (YYYY-MM-DD) to ISO DateTime values.
 * For `end`, adds a full day (minus 1 millisecond) so that filtering
 * is inclusive of the end date.
 */
export const buildSearchFilter = (filters: Record<string, string>) => {
    const textQuery = filters.textQuery ?? null;

    const start = filters.start ?? null;
    const end = filters.end ?? null;
    const visibilityKey = filters.visibility;
    const visibility = visibilityKey && visibilityKey in VISIBILITY_MAP
        ? VISIBILITY_MAP[visibilityKey as keyof typeof VISIBILITY_MAP]
        : null;

    const createdStart = start ? `${start}T00:00:00Z` : null;
    // Make end date inclusive: set to end of day
    const createdEnd = end
        ? new Date(Date.parse(`${end}T00:00:00Z`) + 86400000 - 1).toISOString()
        : null;

    const hasFilter = textQuery || createdStart || createdEnd || visibility;
    return hasFilter
        ? {
            textQuery,
            createdStart,
            createdEnd,
            visibility,
        }
        : null;
};

// This is super stupid. Don't try at home.
// Breaks as soon as a simple thing is changed in the OG share button.
// So, probably better to just...
// TODO: build a dedicated share menu/make the old one somehow reusable while allowing
// custom styling without all this poking around.
const shareButtonStyle = css({
    "&& > div > button": {
        background: "transparent",
        padding: 4,
        border: 0,
        borderRadius: 8,
        height: "unset",
        "> svg": {
            width: "18px",
            height: "18px",
        },
    },
    "&& > div > button:hover": {
        backgroundColor: COLORS.neutral20,
        border: 0,
    },
    "> div > button + div": {
        fontSize: 14,
        borderRadius: 12,
        "> div": {
            button: { opacity: 1 },
            height: 165,
            width: 300,
            borderRadius: 12,
            "> div + div": {
                gap: 8,
                padding: 11,
                "input, button": {
                    fontSize: 14,
                },
            },
        },
    },
});


type ShrinkWrapContainerProps = PropsWithChildren<{
    className?: string;
    breakpoint: number;
}>
/**
 * Wraps around children to always apply `width: fit-content`-like logic, even
 * when the parent (i.e. this wrapper) itself is wrapping. That's a lot of wraps.
 * Basically this just makes sure this works for components that can either span one or two lines.
 * Below `breakpoint` however, the measurement is skipped so the element just uses 100% width.
 *
 * Probably over engineered and built for a very special case, so it might make more sense inline..
 * But idk, at least it *does the thing*™.
 */
const ShrinkWrapContainer: React.FC<ShrinkWrapContainerProps> = ({
    className, breakpoint, children,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) {
            return;
        }

        // Reset before measure.
        el.style.width = "";

        if (window.innerWidth <= breakpoint) {
            return;
        }

        // Find rightmost edge of all children, then set width to  fit content.
        const containerLeft = el.getBoundingClientRect().left;
        let maxRight = 0;
        for (const child of el.children) {
            const right = child.getBoundingClientRect().right - containerLeft;
            if (right > maxRight) {
                maxRight = right;
            }
        }
        const paddingRight = parseFloat(getComputedStyle(el).paddingRight) || 0;
        el.style.width = `${Math.ceil(maxRight + paddingRight)}px`;
    }, [breakpoint]);

    useLayoutEffect(() => measure());

    // Observe parent's size to re-measure on resize.
    useEffect(() => {
        const parent = ref.current?.parentElement;
        if (!parent) {
            return;
        }
        const observer = new ResizeObserver(() => measure());
        observer.observe(parent);
        return () => observer.disconnect();
    }, [measure]);

    return (
        <div
            ref={ref}
            className={className}
            css={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                maxWidth: "100%",
            }}
        >
            {children}
        </div>
    );
};

