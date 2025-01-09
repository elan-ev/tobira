import { graphql } from "react-relay";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";

import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import {
    CreatedColumn,
    descriptionStyle,
    ManageAssets,
    queryParamsToVars,
    TableRow,
    thumbnailLinkStyle,
    titleLinkStyle,
} from "../shared";
import { useColorScheme } from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../../color";
import {
    SeriesManageQuery,
    SeriesManageQuery$data,
} from "./__generated__/SeriesManageQuery.graphql";
import { Link } from "../../../router";
import { ThumbnailStack } from "../../Search";
import { DirectSeriesRoute } from "../../Series";
import { SmallDescription } from "../../../ui/metadata";


const PATH = "/~manage/series" as const;

export const ManageSeriesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVars(url.searchParams);
        const queryRef = loadQuery<SeriesManageQuery>(query, vars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageAssets
                        vars={vars}
                        connection={data.currentUser.mySeries}
                        titleKey="manage.my-series.title"
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query SeriesManageQuery(
        $order: SortOrder!,
        $offset: Int!,
        $limit: Int!,
    ) {
        ...UserData
        currentUser {
            mySeries(order: $order, offset: $offset, limit: $limit) {
                __typename
                totalCount
                pageInfo {
                    hasNextPage hasPreviousPage
                    startIndex endIndex
                }
                items {
                    id
                    title
                    created
                    syncedData { description }
                    entries {
                        __typename
                        ...on AuthorizedEvent {
                            isLive
                            syncedData { thumbnail audioOnly }
                        }
                    }
                }
            }
        }
    }
`;

export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];

export const SeriesRow: React.FC<{ series: Series[number] }> = ({ series }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const created = series.created && new Date(series.created);

    // Todo: change to "series details" route when available
    const link = DirectSeriesRoute.url({ seriesId: series.id });

    // Seems odd, but simply checking `e => e.__typename === "AuthorizedEvent"` will produce
    // TS2339 errors when compiling.
    type Entry = Series[number]["entries"][number];
    const isAuthorizedEvent = (e: Entry): e is Extract<
        Entry, { __typename: "AuthorizedEvent" }
    > => e.__typename === "AuthorizedEvent";

    const thumbnails = series.entries
        .filter(isAuthorizedEvent)
        .map(e => ({
            isLive: e.isLive,
            audioOnly: e.syncedData ? e.syncedData.audioOnly : false,
            thumbnail: e.syncedData?.thumbnail,
        }));

    return (
        <TableRow
            thumbnail={<Link to={link} css={{ ...thumbnailLinkStyle }}>
                <span css={{ "> div": { width: "100%" } }}>
                    <ThumbnailStack title={series.title} {...{ thumbnails }} />
                </span>
            </Link>}
            title={<Link to={link} css={{ ...titleLinkStyle }}>{series.title}</Link>}
            description={series.syncedData && <SmallDescription
                css={{ ...descriptionStyle }}
                text={series.syncedData.description}
            />}
            syncInfo={{
                isSynced: !!series.syncedData,
                notReadyLabel: "series.not-ready.label",
            }}
        >
            {created
                ? <CreatedColumn {...{ created }} />
                : <i css={{ color: isDark ? COLORS.neutral60 : COLORS.neutral50 }}>
                    {t("manage.my-series.missing-date")}
                </i>
            }
        </TableRow>
    );
};

