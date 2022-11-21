import { makeRouter } from "./rauta";
import { AboutRoute } from "./routes/About";
import { LoginRoute } from "./routes/Login";
import { ManageRoute } from "./routes/manage";
import { ManageRealmRoute } from "./routes/manage/Realm";
import { AddChildRoute } from "./routes/manage/Realm/AddChild";
import { ManageRealmContentRoute } from "./routes/manage/Realm/Content";
import { NotFoundRoute } from "./routes/NotFound";
import { RealmRoute } from "./routes/Realm";
import { DirectOpencastVideoRoute, DirectVideoRoute, VideoRoute } from "./routes/Video";
import { DirectSeriesOCRoute, DirectSeriesRoute } from "./routes/Series";
import { ManageVideosRoute } from "./routes/manage/Video";
import { UploadRoute } from "./routes/Upload";
import { SearchRoute } from "./routes/Search";
import { InvalidUrlRoute } from "./routes/InvalidUrl";
import { BlockEmbedRoute, EmbedVideoRoute } from "./routes/Embed";
import { ManageVideoDetailsRoute } from "./routes/manage/Video/Details";
import { ManageVideoTechnicalDetailsRoute } from "./routes/manage/Video/TechnicalDetails";



const {
    ActiveRoute,
    Link: RautaLink,
    matchInitialRoute,
    matchRoute,
    Router,
    useRouter,
} = makeRouter({
    fallback: NotFoundRoute,
    routes: [
        BlockEmbedRoute,
        InvalidUrlRoute,
        AboutRoute,
        LoginRoute,
        RealmRoute,
        SearchRoute,
        VideoRoute,
        DirectVideoRoute,
        DirectOpencastVideoRoute,
        DirectSeriesRoute,
        DirectSeriesOCRoute,
        ManageRoute,
        ManageVideosRoute,
        ManageVideoDetailsRoute,
        ManageVideoTechnicalDetailsRoute,
        ManageRealmRoute,
        UploadRoute,
        AddChildRoute,
        ManageRealmContentRoute,
        EmbedVideoRoute,
    ],
});

export { ActiveRoute, Link, matchInitialRoute, matchRoute, Router, useRouter };

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

const Link = ({ to, children, htmlLink = false, ...props }: LinkProps): JSX.Element => {
    const isExternalLink
        = new URL(to, document.baseURI).origin !== document.location.origin;

    return htmlLink || isExternalLink
        ? <a href={to} {...props}>{children}</a>
        : <RautaLink to={to} {...props}>{children}</RautaLink>;
};
