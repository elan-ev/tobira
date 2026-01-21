import { graphql, useFragment } from "react-relay";
import { useTranslation } from "react-i18next";
import { unreachable } from "@opencast/appkit";
import { useEffect } from "react";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { InitialLoading, RootLoader } from "../layout/Root";
import { RealmNav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";
import { keyOfId, playlistId } from "../util";
import { NotFound } from "./NotFound";
import { b64regex } from "./util";
import { isValidRealmPath } from "./Realm";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PlaylistByOpencastIdQuery } from "./__generated__/PlaylistByOpencastIdQuery.graphql";
import { PlaylistRouteData$key } from "./__generated__/PlaylistRouteData.graphql";
import { PlaylistByIdQuery } from "./__generated__/PlaylistByIdQuery.graphql";
import { PlaylistInRealmQuery } from "./__generated__/PlaylistInRealmQuery.graphql";
import { PlaylistByOcIdInRealmQuery } from "./__generated__/PlaylistByOcIdInRealmQuery.graphql";
import { PlaylistPageRealmData$key } from "./__generated__/PlaylistPageRealmData.graphql";
import { NotAuthorized } from "../ui/error";
import { PlaylistBlockFromPlaylist } from "../ui/Blocks/Playlist";
import { useRouter } from "../router";
import { realmBreadcrumbs } from "../util/realm";


export const PlaylistRoute = makeRoute({
    url: ({ realmPath, playlistId }: { realmPath: string; playlistId: string }) =>
        `${realmPath === "/" ? "" : realmPath}/p/${keyOfId(playlistId)}`,
    match: url => {
        const params = checkPlaylistRealmPath(url, b64regex);
        if (params == null) {
            return null;
        }
        const query = graphql`
            query PlaylistInRealmQuery($id: ID!, $realmPath: String!) {
                ... UserData
                playlist: playlistById(id: $id) {
                    __typename
                    ...PlaylistRouteData
                    ... on AuthorizedPlaylist {
                        isReferencedByRealm(path: $realmPath)
                    }
                }
                realm: realmByPath(path: $realmPath) {
                    ... NavigationData
                    ... PlaylistPageRealmData
                }
            }
        `;
        const queryRef = loadQuery<PlaylistInRealmQuery>(query, {
            id: playlistId(params.playlistId),
            realmPath: params.realmPath,
        });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ playlist, realm }) => {
                    const isReferencedByRealm = playlist?.__typename === "AuthorizedPlaylist"
                        && playlist.isReferencedByRealm;
                    if (!realm || !isReferencedByRealm) {
                        return <ForwardToDirectRoute playlistId={params.playlistId} />;
                    }

                    return <PlaylistPage
                        playlistFrag={playlist}
                        realmRef={realm}
                        realmPath={params.realmPath}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

export const OpencastPlaylistRoute = makeRoute({
    url: ({ realmPath, playlistOcId }: { realmPath: string; playlistOcId: string }) =>
        `${realmPath === "/" ? "" : realmPath}/p/:${playlistOcId}`,
    match: url => {
        const params = checkPlaylistRealmPath(url, ":([^/]+)");
        if (params == null) {
            return null;
        }
        params.playlistId = params.playlistId.substring(1);

        const query = graphql`
            query PlaylistByOcIdInRealmQuery($id: String!, $realmPath: String!) {
                ... UserData
                playlist: playlistByOpencastId(id: $id) {
                    __typename
                    ...PlaylistRouteData
                    ... on AuthorizedPlaylist {
                        isReferencedByRealm(path: $realmPath)
                    }
                }
                realm: realmByPath(path: $realmPath) {
                    ... NavigationData
                    ... PlaylistPageRealmData
                }
            }
        `;
        const queryRef = loadQuery<PlaylistByOcIdInRealmQuery>(query, {
            id: params.playlistId,
            realmPath: params.realmPath,
        });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ playlist, realm }) => {
                    const isReferencedByRealm = playlist?.__typename === "AuthorizedPlaylist"
                        && playlist.isReferencedByRealm;
                    if (!realm || !isReferencedByRealm) {
                        return <ForwardToDirectOCRoute ocID={params.playlistId} />;
                    }

                    return <PlaylistPage
                        playlistFrag={playlist}
                        realmRef={realm}
                        realmPath={params.realmPath}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const ForwardToDirectRoute: React.FC<{ playlistId: string }> = ({ playlistId }) => {
    const router = useRouter();
    useEffect(() => router.goto(DirectPlaylistRoute.url({ playlistId }), true));
    return <InitialLoading />;
};

const ForwardToDirectOCRoute: React.FC<{ ocID: string }> = ({ ocID }) => {
    const router = useRouter();
    useEffect(() => router.goto(DirectPlaylistOCRoute.url({ ocID }), true));
    return <InitialLoading />;
};

const checkPlaylistRealmPath = (url: URL, idRegex: string) => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const parts = urlPath.split("/").map(decodeURIComponent);
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "p") {
        return null;
    }
    const playlistId = parts[parts.length - 1];
    if (!playlistId.match(idRegex)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    if (!isValidRealmPath(realmPathParts)) {
        return null;
    }

    const realmPath = "/" + realmPathParts.join("/");

    return { realmPath, playlistId };
};

export const DirectPlaylistOCRoute = makeRoute({
    url: ({ ocID }: { ocID: string }) => `/!p/:${ocID}`,
    match: url => {
        const regex = new RegExp("^/!p/:([^/]+)$", "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const opencastId = decodeURIComponent(matches[1]);
        const query = graphql`
            query PlaylistByOpencastIdQuery($id: String!) {
                ... UserData
                playlist: playlistByOpencastId(id: $id) { ...PlaylistRouteData }
                rootRealm { ... NavigationData, ... PlaylistPageRealmData }
            }
        `;
        const queryRef = loadQuery<PlaylistByOpencastIdQuery>(query, { id: opencastId });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.rootRealm} />}
                render={result => <PlaylistPage
                    playlistFrag={result.playlist}
                    realmRef={result.rootRealm}
                    realmPath={null}
                />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

export const DirectPlaylistRoute = makeRoute({
    url: ({ playlistId }: { playlistId: string }) => `/!p/${keyOfId(playlistId)}`,
    match: url => {
        const regex = new RegExp(`^/!p/(${b64regex}+)$`, "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const id = decodeURIComponent(matches[1]);
        const query = graphql`
            query PlaylistByIdQuery($id: ID!) {
                ... UserData
                playlist: playlistById(id: $id) { ...PlaylistRouteData }
                rootRealm { ... NavigationData, ... PlaylistPageRealmData }
            }
        `;
        const queryRef = loadQuery<PlaylistByIdQuery>(query, { id: playlistId(id) });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.rootRealm} />}
                render={result => <PlaylistPage
                    playlistFrag={result.playlist}
                    realmRef={result.rootRealm}
                    realmPath={null}
                />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const realmFragment = graphql`
    fragment PlaylistPageRealmData on Realm {
        name
        path
        isMainRoot
        ancestors { name path }
    }
`;

const fragment = graphql`
    fragment PlaylistRouteData on Playlist {
        __typename
        ... on NotAllowed { dummy } # workaround
        ... on AuthorizedPlaylist {
            id
            title
            description
            entries {
                __typename
                ...on AuthorizedEvent { id, ...VideoListEventData }
                ...on Missing { dummy }
                ...on NotAllowed { dummy }
            }
        }
        ... PlaylistBlockPlaylistData
    }
`;

type PlaylistPageProps = {
    playlistFrag?: PlaylistRouteData$key | null;
    realmRef: NonNullable<PlaylistPageRealmData$key>;
    realmPath: string | null;
};

const PlaylistPage: React.FC<PlaylistPageProps> = ({ playlistFrag, realmRef, realmPath }) => {
    const { t } = useTranslation();
    const playlist = useFragment(fragment, playlistFrag ?? null);
    const realm = useFragment(realmFragment, realmRef);
    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

    if (!playlist) {
        return <NotFound kind="playlist" breadcrumbsPath={breadcrumbs} />;
    }

    if (playlist.__typename === "NotAllowed") {
        return <NotAuthorized />;
    }
    if (playlist.__typename !== "AuthorizedPlaylist") {
        return unreachable();
    }

    // There is no point in repeating the same name twice in the breadcrumbs.
    const tail = playlist.title === realm.name
        ? <i>{t("playlist.singular")}</i>
        : playlist.title ?? "";

    return <div css={{ display: "flex", flexDirection: "column" }}>
        <Breadcrumbs path={breadcrumbs} tail={tail} />
        <PageTitle title={playlist.title ?? ""} />
        <p css={{ maxWidth: "90ch" }}>{playlist.description}</p>
        <div css={{ marginTop: 12 }}>
            <PlaylistBlockFromPlaylist
                title={t("video.singular")}
                realmPath={realmPath}
                fragRef={playlist}
            />
        </div>
    </div>;
};
