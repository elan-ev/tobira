import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { matchTag, ProtoButton, Spinner, WithTooltip } from "@opencast/appkit";

import { RootLoader } from "../../layout/Root";
import { loadQuery } from "../../relay";
import { makeRoute } from "../../rauta";
import { PageTitle } from "../../layout/header/ui";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import { ManageNav, ManageRoute } from ".";
import {
    BookmarksManageQuery, BookmarksManageQuery$data,
} from "./__generated__/BookmarksManageQuery.graphql";
import { NotAuthorized } from "../../ui/error";
import SeriesIcon from "../../icons/series.svg";
import PlaylistIcon from "../../icons/playlist.svg";
import { LuStarOff } from "react-icons/lu";
import { Link } from "../../router";
import { DirectPlaylistRoute } from "../Playlist";
import { DirectSeriesRoute } from "../Series";
import { COLORS } from "../../color";
import { Creators } from "../../ui/Video";
import { DateAndCreators } from "../../ui/metadata";


export const PATH = "/~manage/bookmarks" as const;
export const BookmarksManageRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<BookmarksManageQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => <ManageBookmarks queryData={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query BookmarksManageQuery {
        ... UserData
        currentUser {
            myBookmarks {
                __typename
                ... on Series { id title creators created }
                ... on AuthorizedPlaylist { id title creator }
                ... on InaccessibleBookmarkItem { id }
            }
        }
    }
`;


type Props = {
    queryData: BookmarksManageQuery$data;
};

const ManageBookmarks: React.FC<Props> = ({ queryData }) => {
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
            <Breadcrumbs tail={t("bookmark.main-label")} path={[{
                label: t("user.manage"),
                link: ManageRoute.url,
            }]} />
            <PageTitle title={t("bookmark.manage")} />

            <ul css={{
                maxWidth: 700,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                border: `1px solid ${COLORS.neutral20}`,
                borderRadius: 8,
            }}>
                {user.myBookmarks.map((fav, i) => <ListItem key={i} fav={fav} />)}
            </ul>
        </div>
    );
};

type ListItemProps = {
    fav: NonNullable<BookmarksManageQuery$data["currentUser"]>["myBookmarks"][number];
};

const ListItem: React.FC<ListItemProps> = ({ fav }) => {
    const { t } = useTranslation();
    const [isDeleted, setIsDeleted] = useState(false);
    const [commit, inFlight] = useMutation(graphql`
        mutation BookmarksRemoveMutation($id: ID!) {
            removeBookmark(id:$id)
        }
    `);

    if (fav.__typename === "%other") {
        return null;
    }

    const creatorsCss = {
        fontSize: 12,
        svg: { fontSize: 15 },
    } as const;

    const body = matchTag(fav, "__typename", {
        "AuthorizedPlaylist": playlist => <VideoListItem
            icon={<PlaylistIcon />}
            link={DirectPlaylistRoute.url({ playlistId: playlist.id })}
            title={playlist.title}
            type={t("playlist.singular")}
            details={<Creators creators={[playlist.creator]} css={creatorsCss} />}
        />,
        "Series": series => <VideoListItem
            icon={<SeriesIcon />}
            link={DirectSeriesRoute.url({ seriesId: series.id })}
            title={series.title}
            type={t("series.singular")}
            details={
                <DateAndCreators
                    timestamp={series.created ?? undefined}
                    creators={[...series.creators]}
                    isLive={false}
                    css={creatorsCss}
                />
            }
        />,
        "InaccessibleBookmarkItem": () => <i>{t("bookmark.inaccessible")}</i>,
    });

    const onButtonClick = () => {
        commit({
            variables: { id: fav.id },
            onCompleted: () => setIsDeleted(true),
        });
    };

    return <li css={{
        display: "flex",
        gap: 16,
        height: 58,
        alignItems: "center",
        padding: "4px 8px 4px 16px",
        backgroundColor: COLORS.neutral10,
        ...isDeleted && { textDecoration: "line-through" },
        ":hover": {
            backgroundColor: COLORS.neutral15,
        },
        "> svg": {
            flexShrink: 0,
            fontSize: 18,
        },
        ":last-of-type": {
            borderRadius: "0 0 8px 8px",
        },
        ":first-of-type": {
            borderRadius: "8px 8px 0 0",
        },
    }}>

        <div css={{ flex: "1", minWidth: 0 }}>{body}</div>

        {!isDeleted && <WithTooltip tooltip={t("bookmark.remove")}>
            <ProtoButton onClick={onButtonClick} css={{
                padding: 8,
                lineHeight: 1,
                borderRadius: 4,
                ":hover": { backgroundColor: COLORS.neutral30 },
            }}>
                {inFlight ? <Spinner size={22} /> : <LuStarOff size={22} />}
            </ProtoButton>
        </WithTooltip>}
    </li>;
};


type VideoListItemProps = {
    title: string,
    link: string,
    icon: JSX.Element,
    type: string,
    details: JSX.Element,
};

const VideoListItem: React.FC<VideoListItemProps> = ({ title, link, icon, type, details }) => <>
    <div css={{
        textOverflow: "ellipsis",
        overflow: "hidden",
        whiteSpace: "nowrap",
        marginBottom: 4,
    }}>
        <Link to={link}>{title}</Link>
    </div>
    <div css={{
        fontSize: 12,
        color: COLORS.neutral80,
        display: "flex",
        gap: 24,
        marginBottom: 4,
    }}>
        <div css={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            "svg": { fontSize: 15, color: COLORS.neutral60 },
        }}>
            {icon} {type}
        </div>
        {details}
    </div>
</>;
