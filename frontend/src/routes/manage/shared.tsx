import { Card, match } from "@opencast/appkit";
import { useState, useRef, useEffect, ReactNode } from "react";
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
import { EventConnection, Events } from "./Video";
import { Link } from "../../router";
import { ParseKeys } from "i18next";


type Assets = Events;
type AssetConnection = EventConnection;
type AssetVars = VariablesOf<VideoManageQuery>;
type TableRow = React.FC<{ asset: Events[number] }>;

type Props = {
    connection: AssetConnection;
    vars: AssetVars;
    Row: TableRow;
    titleKey: ParseKeys;
};

const LIMIT = 15;

export const ManageAssets: React.FC<Props> = ({ connection, vars, Row, titleKey }) => {
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
                <AssetTable assets={connection.items} vars={vars} Row={Row} />
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

type AssetTableProps = {
    assets: Assets;
    vars: AssetVars;
    Row: TableRow;
};

const AssetTable: React.FC<AssetTableProps> = ({ assets, vars, Row }) => {
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
                {assets.map(asset => <Row key={asset.id} asset={asset} />)}
            </tbody>
        </table>
    </div>;
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

type PageNavigationProps = {
    connection: AssetConnection;
    vars: AssetVars;
};

const PageNavigation: React.FC<PageNavigationProps> = ({ connection, vars }) => {
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
