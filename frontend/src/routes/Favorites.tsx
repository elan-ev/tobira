import React from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { PageTitle } from "../layout/header/ui";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { FavoritesQuery, FavoritesQuery$data } from "./__generated__/FavoritesQuery.graphql";
import { RealmNav } from "../layout/Navigation";
import { NotAuthorized } from "../ui/error";
import { matchTag } from "@opencast/appkit";
import { DirectPlaylistRoute } from "./Playlist";
import { DirectSeriesRoute } from "./Series";
import { COLORS } from "../color";
import { Link } from "../router";
import { LinkButton } from "../ui/LinkButton";
import { FavoritesManageRoute } from "./manage/Favorites";


export const PATH = "/~favorites" as const;
export const FavoritesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<FavoritesQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.realm} />}
                render={data => <Favorites queryData={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query FavoritesQuery {
        ... UserData
        realm: rootRealm {
            ... NavigationData
        }
        currentUser {
            myFavorites {
                __typename
                ... on Series { id title creators created }
                ... on AuthorizedPlaylist { id title creator }
                ... on InaccessibleFavoriteItem { id }
            }
        }
    }
`;


type Props = {
    queryData: FavoritesQuery$data;
};

const Favorites: React.FC<Props> = ({ queryData }) => {
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
                        tail={t("fav.main-label")}
                    />
                    <PageTitle title={t("fav.main-label")} />
                </div>
                <div>
                    <LinkButton to={FavoritesManageRoute.url}>{t("fav.manage")}</LinkButton>
                </div>
            </div>
            <QuickLinks favs={user.myFavorites} />
        </div>
    );
};

type QuickLinksProps = {
    favs: NonNullable<FavoritesQuery$data["currentUser"]>["myFavorites"];
};

const QuickLinks: React.FC<QuickLinksProps> = ({ favs }) => (
    // TODO: we might want to deal with items with the same title and year at some point.
    <ul css={{
        fontSize: 14,
        display: "flex",
        flexWrap: "wrap",
        gap: "10px 8px",
        borderLeft: `3px solid ${COLORS.neutral20}`,
        padding: 12,
    }}>
        {favs.map(fav => {
            if (fav.__typename !== "AuthorizedPlaylist" && fav.__typename !== "Series") {
                return null;
            }

            const { link, extraInfo } = matchTag(fav, "__typename", {
                "AuthorizedPlaylist": playlist => ({
                    link: DirectPlaylistRoute.url({ playlistId: playlist.id }),
                    extraInfo: null,
                }),
                "Series": series => ({
                    link: DirectSeriesRoute.url({ seriesId: series.id }),
                    extraInfo: series.created ? new Date(series.created).getFullYear() : null,
                }),
            });

            return <li key={fav.id} css={{ display: "block" }}>
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
                    {fav.title}
                    {extraInfo && <span css={{
                        color: COLORS.neutral70,
                    }}>{"("}{extraInfo}{")"}</span>}
                </Link>
            </li>;
        })}
    </ul>
);
