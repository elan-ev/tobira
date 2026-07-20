import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { PageTitle } from "../layout/header/ui";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { BookmarksQuery, BookmarksQuery$data } from "./__generated__/BookmarksQuery.graphql";
import { RealmNav } from "../layout/Navigation";
import { NotAuthorized } from "../ui/error";
import { matchTag, unreachable } from "@opencast/appkit";
import { DirectPlaylistRoute } from "./Playlist";
import { DirectSeriesRoute } from "./Series";
import { COLORS } from "../color";
import { Link } from "../router";
import { LinkButton } from "../ui/LinkButton";
import { BookmarksManageRoute } from "./manage/Bookmarks";
import {
    categorizeEvent, LayoutOrderContext, readVideoListEventDataFragment, UpcomingEventsGrid,
    VideoListBlockContainer, VideoListItem, VideoListItems, VideoListLayout, VideoListLayoutMenu,
} from "../ui/Blocks/VideoList";
import { paginationControlStyles, PaginationNav } from "../ui/PaginationNav";
import { CollapsibleBlock } from "../ui/CollapsibleBlock";


const ITEMS_PER_PAGE = 24;

export const PATH = "/~bookmarks" as const;
export const BookmarksRoute = makeRoute({
    url: ({ page }: { page?: number }) => PATH + (page && page > 1
        ? "?" + new URLSearchParams({ page: page.toString() }).toString()
        : ""),
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }
        const page = (() => {
            const num = Number(url.searchParams.get("page") ?? "1");
            return Number.isInteger(num) && num > 0 ? num : 1;
        })();

        const queryRef = loadQuery<BookmarksQuery>(query, {
            limit: ITEMS_PER_PAGE,
            offset: (page - 1) * ITEMS_PER_PAGE,
        });
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.realm} />}
                render={data => <Bookmarks queryData={data} page={page} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query BookmarksQuery($offset:Int!, $limit: Int!) {
        ... UserData
        realm: rootRealm {
            ... NavigationData
        }
        currentUser {
            myBookmarks {
                __typename
                ... on Series { id title creators created }
                ... on AuthorizedPlaylist { id title creator }
                ... on InaccessibleBookmarkItem { id }
            }
            bookmarkFeed(offset:$offset, limit: $limit) {
                totalCount
                items {
                    event {
                        __typename
                        ... on AuthorizedEvent {
                            ...VideoListEventData @arguments(includeSeries: true)
                        }
                        ... on NotAllowed { dummy }
                    }
                }
            }
        }
    }
`;


type Props = {
    queryData: BookmarksQuery$data;
    page: number;
};

const Bookmarks: React.FC<Props> = ({ queryData, page }) => {
    const { t } = useTranslation();
    const user = queryData.currentUser;
    if (!user) {
        return <NotAuthorized />;
    }

    return (
        <div css={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
        }}>
            <div css={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
            }}>
                <div>
                    <Breadcrumbs
                        path={[]}
                        tail={t("bookmark.main-label")}
                    />
                    <PageTitle title={t("bookmark.main-label")} />
                </div>
                <div>
                    <LinkButton to={BookmarksManageRoute.url}>{t("bookmark.manage")}</LinkButton>
                </div>
            </div>

            <QuickLinks bookmarks={user.myBookmarks} />
            <Feed feed={user.bookmarkFeed} page={page} />
        </div>
    );
};

type QuickLinksProps = {
    bookmarks: NonNullable<BookmarksQuery$data["currentUser"]>["myBookmarks"];
};

const QuickLinks: React.FC<QuickLinksProps> = ({ bookmarks }) => {
    const { t } = useTranslation();

    // TODO: we might want to deal with items with the same title and year at some point.

    return (
        <CollapsibleBlock
            maxHeight={160}
            buttonLabel={expanded => expanded ? t("bookmark.show-fewer") : t("bookmark.show-all")}
        >
            <ul css={{
                fontSize: 14,
                display: "flex",
                flexWrap: "wrap",
                gap: "10px 8px",
                borderLeft: `3px solid ${COLORS.neutral20}`,
                padding: 12,
                margin: 0,
            }}>
                {bookmarks.map(bookmark => {
                    const isVideoList = bookmark.__typename === "AuthorizedPlaylist"
                        || bookmark.__typename === "Series";
                    if (!isVideoList) {
                        return null;
                    }

                    const { link, extraInfo } = matchTag(bookmark, "__typename", {
                        "AuthorizedPlaylist": playlist => ({
                            link: DirectPlaylistRoute.url({ playlistId: playlist.id }),
                            extraInfo: null,
                        }),
                        "Series": series => ({
                            link: DirectSeriesRoute.url({ seriesId: series.id }),
                            extraInfo: series.created
                                ? new Date(series.created).getFullYear()
                                : null,
                        }),
                    });

                    return <li key={bookmark.id} css={{ display: "block" }}>
                        <Link to={link} css={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            padding: "2px 6px",
                            border: `1px solid ${COLORS.neutral25}`,
                            backgroundColor: COLORS.neutral10,
                            borderRadius: 8,
                            textDecoration: "none",
                            ":hover": {
                                backgroundColor: COLORS.neutral15,
                            },
                            svg: {
                                color: COLORS.neutral70,
                            },
                        }}>
                            {bookmark.title}
                            {extraInfo && <span css={{
                                color: COLORS.neutral70,
                            }}>{"("}{extraInfo}{")"}</span>}
                        </Link>
                    </li>;
                })}
            </ul>
        </CollapsibleBlock>
    );
};

type FeedProps = {
    feed: NonNullable<BookmarksQuery$data["currentUser"]>["bookmarkFeed"];
    page: number,
};

const ALLOWED_INLINE_UPCOMING_ITEMS = 3;

const Feed: React.FC<FeedProps> = ({ feed, page }) => {
    const { t } = useTranslation();

    const items = feed.items.map(item => matchTag(item.event, "__typename", {
        "AuthorizedEvent": entry => readVideoListEventDataFragment(entry),
        "NotAllowed": () => "unauthorized" as VideoListItem,
        "%other": () => unreachable(),
    }));

    let mainItems: VideoListItem[] = [];
    let upcomingItems: VideoListItem[] = [];
    for (const item of items) {
        categorizeEvent(item, mainItems, upcomingItems);
    }
    if (upcomingItems.length <= ALLOWED_INLINE_UPCOMING_ITEMS) {
        mainItems = [...upcomingItems, ...mainItems];
        upcomingItems = [];
    }

    const [layoutState, setLayoutState] = useState<VideoListLayout>("GALLERY");
    const layoutOrderContext: LayoutOrderContext = {
        allowOriginalOrder: true,
        eventOrder: "ORIGINAL",
        setEventOrder: () => {},
        layoutState,
        setLayoutState,
    };

    const renderEvents = (items: VideoListItem[]) => <VideoListItems
        items={items.map(item => ({ item, active: false }))}
        itemsPerPage={ITEMS_PER_PAGE * 1000} // Do not render frontend-pagination
        showSeries={true}
        itemLink={key => `/!v/${key}`}
    />;

    return (
        <LayoutOrderContext.Provider value={layoutOrderContext}>
            <VideoListBlockContainer
                buttons={<VideoListLayoutMenu />}
                title={t("bookmark.feed-title")}
            >
                {upcomingItems.length > 1 && (
                    <UpcomingEventsGrid count={upcomingItems.length}>
                        {renderEvents(upcomingItems)}
                    </UpcomingEventsGrid>
                )}

                {items.length === 0 && (
                    <div css={{ padding: 14 }}>{t("manage.video-list.no-content")}</div>
                )}

                {renderEvents(mainItems)}

                <div css={{ marginTop: 16 }}>
                    <PaginationNav
                        totalItems={feed.totalCount}
                        itemsPerPage={ITEMS_PER_PAGE}
                        currentPage={page}
                        renderControl={({ label, icon, disabled, targetPage }) => <Link
                            css={paginationControlStyles}
                            to={BookmarksRoute.url({ page: targetPage })}
                            aria-label={t(label)}
                            aria-disabled={disabled}
                            tabIndex={disabled ? -1 : 0}
                        >{icon}</Link>}
                    />
                </div>
            </VideoListBlockContainer>
        </LayoutOrderContext.Provider>
    );
};
