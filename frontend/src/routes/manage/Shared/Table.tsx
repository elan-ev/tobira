import {
    Card,
    currentRef,
    Floating,
    FloatingHandle,
    match,
    ProtoButton,
    screenWidthAtMost,
    useColorScheme,
    useFloatingItemProps,
} from "@opencast/appkit";
import {
    useRef, useEffect, useLayoutEffect, useCallback,
    ReactNode, ComponentType, useId, PropsWithChildren,
} from "react";
import { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import {
    LuArrowDownNarrowWide,
    LuArrowUpWideNarrow,
    LuChevronLeft,
    LuChevronRight,
    LuCalendarRange,
    LuShieldCheck,
    LuX,
    LuTypeOutline,
} from "react-icons/lu";
import { IconType } from "react-icons";
import { css } from "@emotion/react";
import { LucideHatGlasses } from "lucide-react";

import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { prettyDate } from "../../../ui/time";
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
import { floatingMenuProps, OcEntity, visuallyHiddenStyle } from "../../../util";
import { isSynced } from "../../../util";
import { ThumbnailItemState } from "../../../ui/Video";
import { SearchInput } from "../../../layout/header/Search";
import { PlaylistsSortColumn } from "../Playlist/__generated__/PlaylistsManageQuery.graphql";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { FloatingBaseMenu } from "../../../ui/FloatingBaseMenu";
import { MenuItem } from "../../../ui/Blocks/VideoList";
import { LinkButton } from "../../../ui/LinkButton";
import { isRealUser, useUser } from "../../../User";


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
    withCreatorFilter?: boolean;
}

const LIMIT = 15;


export const ManageItems = <T extends Item>({
    connection,
    vars,
    titleKey,
    RenderItem,
    additionalSortOptions,
    createButton,
    withCreatorFilter = false,
}: ManageItemProps<T>) => {
    const { t } = useTranslation();
    const { Notification } = useNotification();
    const textField = parseTextField();

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
                <div css={{
                    marginLeft: "auto",
                    "> div": { gap: "min(5vw, 48px)" },
                }}>
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
                <div css={{
                    flex: "auto",
                    "&& > div": {
                        minWidth: 280,
                        "> div": { maxWidth: "100%" },
                    },
                }}>
                    {/* Text field filter (title, description, creator) */}
                    <SearchField {...{ vars, textField }} />
                </div>

                <div css={{
                    display: "flex",
                    gap: 12,
                    marginLeft: "auto",
                    flexWrap: "wrap",
                    [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                        svg: {
                            fontSize: 20,
                            // Lucide icons don't do font size or sth...
                            // they need these width/height props.
                            width: 20,
                            height: 20,
                        },
                    },
                }}>
                    {/* Selector for search field filter property */}
                    <TextFieldSelector {...{ vars, textField, withCreatorFilter }} />

                    {/* Date range filter */}
                    <DateFilter {...{ vars }} />

                    {/* Visibility filter */}
                    <VisibilityFilter {...{ vars }} />

                    {/* Write access filter */}
                    <AccessFilter {...{ vars }} />

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


/** Sort and filter components */

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
            triggerContent={<>{t(labelKey)}</>}
            triggerStyles={{ ...filterTriggerStyles }}
            tooltip="Sort & Order"
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
    </div>;
};


const filterTriggerStyles = {
    height: 30,
    marginLeft: "auto",
    padding: "4px 8px",
    gap: 8,
    border: 0,
    backgroundColor: "transparent",
    fontSize: 14,
} as const;

type TextFieldFilterProps = {
    vars: ItemVars;
    textField: string;
    withCreatorFilter: boolean;
};

const TextFieldSelector: React.FC<TextFieldFilterProps> = ({ textField, withCreatorFilter }) => {
    const { t } = useTranslation();
    const listRef = useRef<FloatingHandle>(null);
    const router = useRouter();

    const options = [
        { key: "title", label: t("general.title") },
        { key: "description", label: t("general.description") },
        ...withCreatorFilter
            ? [{ key: "creators", label: t("manage.table.filter.creator") }]
            : [],
    ];

    const activeLabel = options.find(o => o.key === textField)?.label
        ?? t("general.title");

    const handleSelect = (key: string) => {
        const url = new URL(document.location.href);
        if (key === "title") {
            url.searchParams.delete("tf");
        } else {
            url.searchParams.set("tf", key);
        }
        router.goto(url.href);
    };

    return <FloatingBaseMenu
        ref={listRef}
        triggerContent={<TriggerLabel triggerLabel={activeLabel} />}
        triggerStyles={filterTriggerStyles}
        tooltip={t("manage.table.filter.text-field")}
        label={t("manage.table.filter.text-field")}
        icon={<LuTypeOutline />}
        list={<FilterMenu
            vars={{ order: { column: "CREATED", direction: "DESCENDING" }, page: 1, filters: {} }}
            options={options}
            filterKey="textField"
            current={textField}
            label="Choose text filter"
            onSelect={key => handleSelect(key)}
            close={() => listRef.current?.close()}
        />}
    />;
};

const DateFilter: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const isDark = useColorScheme().scheme === "dark";

    const startDate = vars.filters.start ?? "";
    const endDate = vars.filters.end ?? "";
    const isActive = startDate || endDate;

    const handleChange = (date: string, type: "start" | "end") => {
        const newFilters = { ...vars.filters };
        if (date) {
            newFilters[type] = date;
        } else {
            delete newFilters[type];
        }
        router.goto(varsToLink({ ...vars, page: 1, filters: newFilters }));
    };

    const clearDates = () => {
        const { start, end, ...restFilters } = vars.filters;
        router.goto(varsToLink({ ...vars, page: 1, filters: restFilters }));
    };

    const inputStyle = {
        borderRadius: 4,
        border: `1px solid ${COLORS.neutral40}`,
        ...focusStyle({ width: 2, inset: true }),
    };

    return <FloatingBaseMenu
        triggerContent={<TriggerLabel triggerLabel={t("manage.table.filter.date")} />}
        triggerStyles={filterTriggerStyles}
        tooltip={t("manage.table.filter.select-date")}
        label={t("manage.table.filter.select-date")}
        icon={<LuCalendarRange />}
        list={
            <Floating {...floatingMenuProps(isDark)} hideArrowTip>
                <div css={{
                    cursor: "default",
                    fontSize: 12,
                    padding: "6px 14px 4px 14px",
                    color: COLORS.neutral60,
                }}>
                    {t("manage.table.filter.select-date")}
                </div>
                <div css={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 8px 8px",
                }}>
                    {isActive && <ProtoButton
                        aria-label={t("manage.table.filter.clear-date")}
                        css={{ display: "flex", alignItems: "center" }}
                        onClick={clearDates}
                    ><LuX /></ProtoButton>}
                    <input
                        value={startDate}
                        css={inputStyle}
                        type="date"
                        onChange={e => handleChange(e.target.value, "start")}
                    />
                    <span>{"-"}</span>
                    <input
                        value={endDate}
                        css={inputStyle}
                        type="date"
                        min={startDate}
                        onChange={e => handleChange(e.target.value, "end")}
                    />
                </div>
            </Floating>
        }
    />;
};

const TriggerLabel: React.FC<{ triggerLabel?: string }> = ({ triggerLabel }) => (
    triggerLabel ? <span css={{ [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
        display: "none",
    } }}>
        {triggerLabel}
    </span> : null
);

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
            key: "private",
            label: t("manage.table.filter.visibility-private"),
        },
        {
            key: "protected",
            label: t("manage.table.filter.visibility-protected"),
        },
        {
            key: "shared",
            label: t("manage.table.filter.visibility-shared"),
        },
    ];

    const triggerLabel = current
        ? options.find(o => o.key === current)?.label
        : t("manage.table.filter.visibility");

    return <FloatingBaseMenu
        ref={listRef}
        triggerContent={<TriggerLabel triggerLabel={triggerLabel} />}
        triggerStyles={filterTriggerStyles}
        tooltip={t("manage.table.filter.visibility")}
        label={t("manage.table.filter.visibility")}
        icon={<LucideHatGlasses size={14} />}
        list={<FilterMenu
            {...{ vars, options }}
            filterKey="visibility"
            current={current}
            label="Filter by visibility"
            close={() => listRef.current?.close()}
        />}
    />;
};

const AccessFilter: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const listRef = useRef<FloatingHandle>(null);

    const current = vars.filters.writable ?? null;
    const options = [
        {
            key: "write",
            label: t("manage.table.filter.write"),
        },
        {
            key: "read",
            label: t("manage.table.filter.read"),
        },
    ];

    const triggerLabel = current
        ? options.find(o => o.key === current)?.label
        : t("manage.table.filter.writable");

    return <FloatingBaseMenu
        ref={listRef}
        triggerContent={<TriggerLabel triggerLabel={triggerLabel} />}
        triggerStyles={filterTriggerStyles}
        tooltip={t("manage.table.filter.writable")}
        label={t("manage.table.filter.writable")}
        icon={<LuShieldCheck />}
        list={<FilterMenu
            {...{ vars, options }}
            filterKey="access"
            current={current}
            label="Filter by access"
            close={() => listRef.current?.close()}
        />}
    />;
};


type FilterMenuProps = {
    vars: ItemVars;
    options: { key: string; label: string }[];
    filterKey: string;
    current: string | null;
    onSelect?: (key: string) => void;
    close: () => void;
    label: string;
};

const FilterMenu: React.FC<FilterMenuProps> = ({
    vars, options, filterKey, current, onSelect, close, label,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const router = useRouter();
    const itemProps = useFloatingItemProps();

    const handleSelect = (key: string) => {
        if (onSelect) {
            onSelect(key);
        } else {
            const newFilters = { ...vars.filters };
            // Toggle off if already selected
            if (newFilters[filterKey] === key) {
                delete newFilters[filterKey];
            } else {
                newFilters[filterKey] = key;
            }
            router.goto(varsToLink({
                ...vars, page: 1, filters: newFilters,
            }));
        }
        close();
    };

    return (
        <Floating {...floatingMenuProps(isDark)} hideArrowTip css={{
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
        }}>
            <ul role="menu" css={{ listStyle: "none", margin: 0, padding: 0 }}>
                <div css={{ paddingTop: 6 }}>{label}</div>
                {options.map((opt, i) => <MenuItem
                    key={opt.key}
                    label={opt.label}
                    disabled={opt.key === current}
                    {...itemProps(i)}
                    onClick={() => handleSelect(opt.key)}
                    css={{
                        "&&": { borderBottom: 0 },
                        "&& button": { padding: "4px 14px 7px" },
                    }}
                />)}
            </ul>
        </Floating>
    );
};


const AppliedFilters: React.FC<{ vars: ItemVars }> = ({ vars }) => {
    const { t } = useTranslation();
    const router = useRouter();

    type Filter = { key: string; value: string; creatorName?: string };
    const filters: Filter[] = [];
    for (const [key, value] of Object.entries(vars.filters)) {
        if (!value) {
            continue;
        }
        if (key === "creators") {
            for (const name of value.split(",").filter(Boolean)) {
                filters.push({ key, value: name, creatorName: name });
            }
        } else {
            filters.push({ key, value });
        }
    }

    if (filters.length === 0) {
        return null;
    }

    const removeFilter = (key: string) => {
        const newFilters = { ...vars.filters };
        delete newFilters[key];
        router.goto(varsToLink({ ...vars, page: 1, filters: newFilters }));
    };

    const removeCreator = (name: string) => {
        const remaining = (vars.filters.creators ?? "")
            .split(",")
            .filter(c => c && c !== name);
        const newFilters = { ...vars.filters };
        if (remaining.length > 0) {
            newFilters.creators = remaining.join(",");
        } else {
            delete newFilters.creators;
        }
        router.goto(varsToLink({ ...vars, page: 1, filters: newFilters }));
    };

    const formatLabel = (key: string, value: string): string => {
        switch (key) {
            case "title":
                return `${t("general.title")}: ${value}`;
            case "description":
                return `${t("general.description")}: ${value}`;
            case "creators":
                return `${t("manage.table.filter.creator")}: ${value}`;
            case "start":
                return `${t("manage.table.filter.from")}: ${value}`;
            case "end":
                return `${t("manage.table.filter.to")}: ${value}`;
            case "visibility": {
                const visibilityLabel: string = match(value, {
                    "public": () => t("manage.table.filter.visibility-public"),
                    "private": () => t("manage.table.filter.visibility-private"),
                    "protected": () => t("manage.table.filter.visibility-protected"),
                    "shared": () => t("manage.table.filter.visibility-shared"),
                }) ?? value;
                return `${t("manage.table.filter.visibility")}: ${visibilityLabel}`;
            }
            case "writable":
                return `${t("manage.table.filter.writable")}: ${
                    value === "true"
                        ? t("manage.table.filter.write")
                        : t("manage.table.filter.read")
                }`;
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
        {filters.map(chip => (
            <div key={chip.creatorName ? `creators:${chip.creatorName}` : chip.key} css={{
                backgroundColor: COLORS.neutral15,
                borderRadius: 8,
                padding: "2px 8px",
                display: "flex",
                alignItems: "center",
                fontSize: 14,
                gap: 8,
            }}>
                {formatLabel(chip.key, chip.value)}
                <ProtoButton
                    aria-label={t("manage.table.filter.remove")}
                    onClick={() => chip.creatorName
                        ? removeCreator(chip.creatorName)
                        : removeFilter(chip.key)
                    }
                    css={{
                        padding: 0,
                        border: 0,
                        display: "flex",
                        borderRadius: 4,
                        ":hover": { backgroundColor: COLORS.neutral25 },
                    }}
                >
                    <LuX />
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
        "&&": { borderBottom: 0 },
        "&& button": { padding: "4px 14px 7px" },
    });

    const list = <ul role="menu" onBlur={handleBlur}>
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
        />)}
    </ul>;

    return <Floating
        {...floatingMenuProps(isDark)}
        hideArrowTip
        css={listStyle}
    >
        {list}
    </Floating>;
};

const SearchField: React.FC<{ vars: ItemVars; textField: string }> = ({ vars, textField }) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const isCreators = textField === "creators";

    // Parse comma-separated creator values
    const creatorChips = isCreators
        ? (vars.filters.creators ?? "").split(",").filter(Boolean)
        : [];

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
        if (isCreators) {
            // Append to existing list.
            const trimmed = q.trim();
            if (trimmed) {
                const existing = creatorChips;
                if (!existing.includes(trimmed)) {
                    existing.push(trimmed);
                }
                newFilters.creators = existing.join(",");
            }
            // Clear the input after adding.
            const input = currentRef(inputRef);
            input.value = "";
        } else if (q) {
            newFilters[textField] = q;
        } else {
            delete newFilters[textField];
        }
        navigate(newFilters);
    };

    const clear = () => {
        const newFilters = { ...vars.filters };
        delete newFilters[textField];
        if (Object.keys(newFilters).length) {
            navigate(newFilters);
        } else {
            const input = currentRef(inputRef);
            input.value = "";
        }
    };

    const placeholderKey = textField === "description"
        ? "manage.table.filter.by-description" as const
        : textField === "creators"
            ? "manage.table.filter.by-creator" as const
            : "manage.table.filter.by-title" as const;

    return <div css={{
        svg: {
            left: 6,
            fontSize: 18,
        },
        input: {
            border: 0,
            paddingLeft: 34,
        },
    }}>
        <SearchInput
            key={textField}
            {...{ search, inputRef, clear }}
            height={30}
            spinnerSize={20}
            defaultValue={isCreators ? "" : vars.filters[textField]}
            inputProps={{ placeholder: t(placeholderKey) }}
        />
    </div>;
};



// ======== Main components ========

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
    created?: string;
    metadata: ReactNode[];
    shareButton: ReactNode;
    linkButton: ReactNode;
};

export const ListItem = <T extends ListItemProps>({ item, ...props }: GenericListItemProps<T>) => {
    const isDark = useColorScheme().scheme === "dark";
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

    const hasDescription = Boolean(item.description || deletionIsPending || !isSynced(item));

    // Videos use the medium breakpoint; series and playlists use the small one.
    const bp = props.itemType === "video" ? BREAKPOINT_MEDIUM : BREAKPOINT_SMALL;

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
        [screenWidthAtMost(bp)]: {
            flexWrap: "wrap",
            marginBottom: 8,
            gap: "4px 12px",
            border: `1px solid ${COLORS.neutral10}`,
        },

        "&:hover > div:last-of-type, &:focus-within > div:last-of-type": {
            button: { opacity: 1 },
        },
    }}>
        {/* Link overlay (invisible, covers item completely) */}
        {!deletionIsPending && <Link
            to={props.link}
            css={{ position: "absolute", inset: 0, borderRadius: 12 }}
        />}

        {/* Thumbnail */}
        <div css={{ width: 163 }}>
            {deletionIsPending
                ? props.thumbnail(thumbnailState)
                : <Link to={props.link}>
                    {props.thumbnail(thumbnailState)}
                </Link>
            }
        </div>

        {/* Mobile specific */}
        <div css={{
            display: "none",
            [screenWidthAtMost(bp)]: {
                display: "flex",
                flex: 1,
                minWidth: 0,
                gap: 4,
            },
        }}>
            <div css={{ flex: 1, minWidth: 0 }}>
                <h3 css={{
                    color: COLORS.primary1,
                    fontSize: 15,
                    lineHeight: 1.3,
                    paddingBottom: 2,
                    ...ellipsisOverflowCss(2),
                }}>{item.title}</h3>
                {/* Description (mobile) */}
                <div css={{ marginTop: 2 }}>
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
            {/* Action buttons (mobile) */}
            <div css={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                flexShrink: 0,
                button: { opacity: 1 },
            }}>
                <div css={shareButtonStyle}>
                    {props.shareButton}
                </div>
                {props.linkButton}
            </div>
        </div>

        {/* Main body  */}
        <div css={{
            minWidth: 0,
            display: "flex",
            justifyContent: "space-between",
            flex: "1",
            gap: 6,
            [screenWidthAtMost(bp)]: {
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
                marginRight: 12,
                maxWidth: 700,
            }}>
                {/* Title (desktop) */}
                <div css={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "space-between",
                    [screenWidthAtMost(bp)]: {
                        display: "none",
                    },
                }}>
                    <h3 css={{
                        color: COLORS.primary1,
                        fontSize: 15,
                        lineHeight: 1.1,
                        paddingBottom: 2,
                        ...ellipsisOverflowCss(1),
                    }}>{item.title}</h3>
                </div>

                {/* Description (desktop) */}
                <div css={{
                    marginBottom: 4,
                    [screenWidthAtMost(bp)]: {
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

                <ShrinkWrapContainer css={{
                    ...hasDescription && { marginTop: 4 },
                    gap: "4px 24px",
                    "&& svg": { fontSize: 13 },
                    color: COLORS.neutral80,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    backgroundColor: COLORS.neutral10,
                    borderRadius: 8,
                    padding: "2px 12px 2px 6px",
                    ...isDark && { color: COLORS.neutral90 },
                }}>
                    {props.metadata}
                </ShrinkWrapContainer>
            </div>
        </div>

        {/* Space on the right for misc buttons, indicators etc (desktop only) */}
        <div css={{
            button: { opacity: 0 },
            display: "flex",
            flexDirection: "column",
            [screenWidthAtMost(bp)]: {
                display: "none",
            },
        }}>
            <div css={shareButtonStyle}>
                {props.shareButton}
            </div>
            {props.linkButton}
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
        : <LinkButton to={path} css={{ width: "fit-content", height: 40 }}>
            <p css={{ [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                display: "none",
            } }}>
                {t(text)}
            </p>
            <Icon />
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


// ======== Filtering/sorting related functions ========


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
    "title",
    "description",
    "creators",
    "start",
    "end",
    "visibility",
    "writable",
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

/** Reads the active text field selector from the URL. */
const parseTextField = (): "title" | "description" | "creators" => {
    const tf = new URLSearchParams(document.location.search).get("tf");
    return tf === "description"
        ? "description"
        : tf === "creators"
            ? "creators"
            : "title";
};

const varsToLink = (vars: ItemVars): string => {
    const url = new URL(document.location.href);
    // Preserve the 'tf' param
    const tf = url.searchParams.get("tf");
    url.search = decodeURIComponent(varsToQueryParams(vars).toString());
    if (tf) {
        url.searchParams.set("tf", tf);
    }
    return url.href;
};

const VISIBILITY_MAP = {
    "public": "PUBLIC",
    "private": "PRIVATE",
    "protected": "PROTECTED",
    "shared": "SHARED",
} as const;

/**
 * Builds a GraphQL SearchFilter input from the parsed filter vars.
 * Converts date strings (YYYY-MM-DD) to ISO DateTime values.
 * For `end`, adds a full day so that filtering is inclusive of the end date.
 */
export const buildSearchFilter = (filters: Record<string, string>) => {
    const title = filters.title ?? null;
    const description = filters.description ?? null;

    const start = filters.start ?? null;
    const end = filters.end ?? null;
    const visibilityKey = filters.visibility;
    const visibility = visibilityKey && visibilityKey in VISIBILITY_MAP
        ? VISIBILITY_MAP[visibilityKey as keyof typeof VISIBILITY_MAP]
        : null;
    const writable = filters.writable ?? null;

    const createdStart = start ? `${start}T00:00:00Z` : null;
    // Make end date inclusive: set to end of day
    const createdEnd = end
        ? new Date(
            new Date(`${end}T00:00:00Z`).getTime() + 86400000 - 1,
        ).toISOString()
        : null;

    const creators = filters.creators
        ? filters.creators.split(",").filter(Boolean)
        : null;

    const hasFilter = title || description || (creators && creators.length > 0)
        || createdStart || createdEnd
        || visibility || writable;
    return hasFilter
        ? {
            title,
            description,
            creators,
            createdStart,
            createdEnd,
            visibility,
            writable: writable === "true" ? true
                : writable === "false" ? false : null,
        }
        : null;
};

const shareButtonStyle = css({
    "&& > div > button": {
        background: "transparent",
        padding: 4,
        fontSize: 14,
        border: 0,
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


/**
 * Wraps around children to always apply `width: fit-content`-like logic, even
 * when the parent (i.e. this wrapper) itself is wrapping. That's a lot of wraps.
 * Basically this just makes sure this works for components that can either span one or two lines.
 */
const ShrinkWrapContainer: React.FC<PropsWithChildren<{ className?: string }>> = ({
    className, children,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) {
            return;
        }

        // Clear any previously set width so the browser lays out with the
        // natural inline-flex width (capped by max-width: 100%).
        el.style.width = "";

        // Find the rightmost edge of all direct children.
        const containerLeft = el.getBoundingClientRect().left;
        let maxRight = 0;
        for (const child of el.children) {
            const right = child.getBoundingClientRect().right - containerLeft;
            if (right > maxRight) {
                maxRight = right;
            }
        }

        // Set width to tighten the box around the actual content.
        const paddingRight = parseFloat(getComputedStyle(el).paddingRight) || 0;
        el.style.width = `${Math.ceil(maxRight + paddingRight)}px`;
    }, []);

    // Re-measure after every render (e.g. when children change).
    useLayoutEffect(() => measure());

    // Re-measure when the parent's size changes (e.g. window resize).
    // Only observes the parent to avoid a feedback loop.
    useEffect(() => {
        const parent = ref.current?.parentElement;
        if (!parent) {
            return;
        }
        const observer = new ResizeObserver(() => measure());
        observer.observe(parent);
        return () => observer.disconnect();
    }, [measure]);

    return <div
        ref={ref}
        className={className}
        css={{
            display: "inline-flex",
            flexWrap: "wrap",
            alignItems: "center",
            maxWidth: "100%",
        }}
    >{children}</div>;
};

