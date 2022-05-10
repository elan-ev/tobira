import React from "react";
import { graphql } from "react-relay/hooks";

import type { VideoQuery, VideoQuery$data } from "./__generated__/VideoQuery.graphql";
import { loadQuery } from "../relay";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { TextBlock } from "../ui/Blocks/Text";
import { Player, Track } from "../ui/player";
import { useTranslation } from "react-i18next";
import { SeriesBlockFromReadySeries } from "../ui/Blocks/Series";
import { makeRoute, MatchedRoute } from "../rauta";
import { Link } from "../router";
import { FiChevronRight } from "react-icons/fi";
import { isValidPathSegment } from "./Realm";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PageTitle } from "../layout/header/ui";
import { unreachable } from "../util/err";


export const b64regex = "[a-zA-Z0-9\\-_]";

export const VideoRoute = makeRoute(url => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const parts = urlPath.split("/").map(decodeURIComponent);
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "v") {
        return null;
    }
    const videoId = parts[parts.length - 1];
    if (!videoId.match(b64regex)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    for (const segment of realmPathParts) {
        if (!isValidPathSegment(segment)) {
            return null;
        }
    }

    const realmPath = "/" + realmPathParts.join("/");
    return prepare(`ev${videoId}`, realmPath);
});

export const DirectVideoRoute = makeRoute(url => {
    const regex = new RegExp(`^/!v/(${b64regex}+)/?$`, "u");
    const params = regex.exec(url.pathname);
    if (params === null) {
        return null;
    }

    const videoId = decodeURIComponent(params[1]);
    return prepare(`ev${videoId}`);
});

const prepare = (id: string, realmPath?: string): MatchedRoute => {
    const isDirectLink = realmPath === undefined;
    const queryRef = loadQuery<VideoQuery>(query, { id, realmPath: realmPath ?? "/" });

    const render: (result: VideoQuery$data) => JSX.Element = isDirectLink
        ? ({ event, realm }) => (
            !event
                ? <NotFound kind="video" />
                : <VideoPage
                    {...{ id, event }}
                    realm={realm ?? unreachable("root realm doesn't exist")}
                    basePath="/!v"
                />
        )
        : ({ event, realm }) => (
            !event || !realm || !realm.referencesVideo
                ? <NotFound kind="video" />
                : <VideoPage
                    {...{ id, event, realm }}
                    basePath={realmPath.replace(/\/$/u, "") + "/v"}
                />
        );

    return {
        render: () => <RootLoader
            {... { query, queryRef }}
            nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
            render={render}
        />,
        dispose: () => queryRef.dispose(),
    };
};


const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        ... UserData
        event(id: $id) {
            title
            description
            creators
            created
            updated
            duration
            thumbnail
            isLive
            canWrite
            series { title ... SeriesBlockReadySeriesData }
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            name
            path
            isRoot
            ancestors { name path }
            referencesVideo: references(id: $id)
            ... NavigationData
        }
    }
`;

type Props = {
    event: NonNullable<VideoQuery$data["event"]>;
    realm: NonNullable<VideoQuery$data["realm"]>;
    basePath: string;
    id: string;
};

const VideoPage: React.FC<Props> = ({ event, realm, id, basePath }) => {
    const { t, i18n } = useTranslation();

    const createdDate = new Date(event.created);
    const created = createdDate.toLocaleString(i18n.language);

    // If the event was updated only shortly after the creation date, we don't
    // want to show it.
    const updatedDate = new Date(event.updated);
    const updated = updatedDate.getTime() - createdDate.getTime() > 5 * 60 * 1000
        ? updatedDate.toLocaleString(i18n.language)
        : null;

    const { title, tracks, description } = event;

    const breadcrumbs = (realm.isRoot ? realm.ancestors : realm.ancestors.concat(realm))
        .map(({ name, path }) => ({ label: name, link: path }));

    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <Player
            tracks={tracks as Track[]}
            title={title}
            isLive={event.isLive}
            duration={event.duration}
            coverImage={event.thumbnail}
            css={{ margin: "0 auto" }}
        />
        <PageTitle title={title} css={{ marginTop: 24, fontSize: 24 }} />
        {description !== null && <TextBlock content={description} />}
        <table css={{
            marginBottom: 16,
            "& tr": {
                "& > td:first-child": {
                    color: "var(--grey40)",
                    paddingRight: 32,
                },
            },
        }}>
            <tbody>
                {/* TODO: improve upon join */}
                <MetaDatum label={t("video.creator")} value={event.creators.join(", ")} />
                <MetaDatum label={t("video.created")} value={created} />
                <MetaDatum label={t("video.updated")} value={updated} />
                <MetaDatum label={t("video.part-of-series")} value={event.series?.title} />
            </tbody>
        </table>

        {event.canWrite && (
            <Link
                to={`/~manage/videos/${id.slice(2)}`}
                css={{ display: "inline-flex", alignItems: "center" }}
            >
                {t("manage.my-videos.manage-video")}
                <FiChevronRight css={{ fontSize: 22 }} />
            </Link>
        )}

        <div css={{ height: 80 }} />

        {event.series && <SeriesBlockFromReadySeries
            basePath={basePath}
            fragRef={event.series}
            title={t("video.more-from-series", { series: event.series.title })}
            activeEventId={id}
        />}
    </>;
};

type MetaDatumProps = {
    label: string;
    value: string | null | undefined;
};

const MetaDatum: React.FC<MetaDatumProps> = ({ label, value }) => {
    if (value == null) {
        return null;
    }

    return <tr>
        <td>{label}:</td>
        <td>{value}</td>
    </tr>;
};
