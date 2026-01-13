import { makeRouter } from "./rauta";
import { AboutRoute } from "./routes/About";
import { LoginRoute } from "./routes/Login";
import { ManageRoute } from "./routes/manage";
import { ManageRealmRoute } from "./routes/manage/Realm";
import { AddChildRoute } from "./routes/manage/Realm/AddChild";
import { ManageRealmContentRoute } from "./routes/manage/Realm/Content";
import { NotFoundRoute } from "./routes/NotFound";
import { RealmRoute } from "./routes/Realm";
import {
    DirectOpencastVideoRoute,
    DirectVideoRoute,
    OpencastVideoRoute,
    VideoRoute,
} from "./routes/Video";
import {
    DirectSeriesOCRoute,
    DirectSeriesRoute,
    OpencastSeriesRoute,
    SeriesRoute,
} from "./routes/Series";
import { ManageVideosRoute } from "./routes/manage/Video";
import { UploadRoute } from "./routes/Upload";
import { SearchRoute } from "./routes/Search";
import { InvalidUrlRoute } from "./routes/InvalidUrl";
import { BlockEmbedRoute, EmbedOpencastVideoRoute, EmbedVideoRoute } from "./routes/Embed";
import { ManageVideoDetailsRoute } from "./routes/manage/Video/VideoDetails";
import { ManageVideoTechnicalDetailsRoute } from "./routes/manage/Video/TechnicalDetails";
import React from "react";
import { ManageVideoAccessRoute } from "./routes/manage/Video/VideoAccess";
import { DirectPlaylistOCRoute, DirectPlaylistRoute } from "./routes/Playlist";
import { ManageSeriesRoute } from "./routes/manage/Series";
import { ManageSeriesDetailsRoute } from "./routes/manage/Series/SeriesDetails";
import { ManageSeriesAccessRoute } from "./routes/manage/Series/SeriesAccess";
import { CreateSeriesRoute } from "./routes/manage/Series/Create";
import { AdminDashboardRoute } from "./routes/manage/admin";
import { ManagePlaylistsRoute } from "./routes/manage/Playlist";
import { ManagePlaylistDetailsRoute } from "./routes/manage/Playlist/PlaylistDetails";
import { ManagePlaylistAccessRoute } from "./routes/manage/Playlist/PlaylistAccess";
import { CreatePlaylistRoute } from "./routes/manage/Playlist/Create";
import { AdminDashboardUserRealmsRoute } from "./routes/manage/admin/UserRealm";
import { AdminDashboardUserSessionsRoute } from "./routes/manage/admin/UserSessions";



const {
    ActiveRoute,
    Link: RautaLink,
    matchInitialRoute,
    matchRoute,
    Router,
    useRouter,
    useRouterState,
} = makeRouter({
    fallback: NotFoundRoute,
    routes: [
        BlockEmbedRoute,
        InvalidUrlRoute,
        AboutRoute,
        LoginRoute,
        RealmRoute,
        SearchRoute,
        OpencastVideoRoute,
        VideoRoute,
        OpencastSeriesRoute,
        SeriesRoute,
        DirectVideoRoute,
        DirectOpencastVideoRoute,
        DirectSeriesRoute,
        DirectSeriesOCRoute,
        DirectPlaylistRoute,
        DirectPlaylistOCRoute,
        ManageRoute,
        ManageVideosRoute,
        ManageVideoAccessRoute,
        ManageVideoDetailsRoute,
        ManageVideoTechnicalDetailsRoute,
        ManageRealmRoute,
        ManageSeriesAccessRoute,
        ManageSeriesRoute,
        ManageSeriesDetailsRoute,
        ManagePlaylistsRoute,
        ManagePlaylistDetailsRoute,
        ManagePlaylistAccessRoute,
        AdminDashboardRoute,
        AdminDashboardUserRealmsRoute,
        AdminDashboardUserSessionsRoute,
        UploadRoute,
        CreateSeriesRoute,
        CreatePlaylistRoute,
        AddChildRoute,
        ManageRealmContentRoute,
        EmbedVideoRoute,
        EmbedOpencastVideoRoute,
    ],
});

export { ActiveRoute, Link, matchInitialRoute, matchRoute, Router, useRouter, useRouterState };

type LinkProps = {
    to: string;

    /**
     * If `true`, a standard `<a>` link without special onClick handler is used.
     * If you set this to `true` unconditionally, rather use `<a>` directly.
     * This is just convenient if you need to switch between router-link and
     * html-link based on a boolean. Default: `false`.
     */
    htmlLink?: boolean;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">;

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
    ({ to, children, htmlLink = false, ...props }, ref): JSX.Element => {
        const isExternalLink
            = new URL(to, document.baseURI).origin !== document.location.origin;

        return htmlLink || isExternalLink
            ? <a ref={ref} href={to} {...props}>{children}</a>
            : <RautaLink ref={ref} to={to} {...props}>{children}</RautaLink>;
    },
);
