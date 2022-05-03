import React, { ReactNode, useState } from "react";
import { graphql } from "react-relay/hooks";
import { HiOutlineUserCircle } from "react-icons/hi";
import { useTranslation } from "react-i18next";

import type { VideoQuery, VideoQuery$data } from "./__generated__/VideoQuery.graphql";
import { loadQuery } from "../relay";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { Player, Track } from "../ui/player";
import { SeriesBlockFromReadySeries } from "../ui/Blocks/Series";
import { makeRoute, MatchedRoute } from "../rauta";
import { isValidPathSegment } from "./Realm";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PageTitle } from "../layout/header/ui";
import { unreachable } from "../util/err";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { LinkButton } from "../ui/Button";
import CONFIG from "../config";
import { translatedConfig, match } from "../util";
import { Link } from "../router";
import { useUser } from "../User";
import { b64regex } from "./util";


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
        event: eventById(id: $id) {
            title
            description
            creators
            created
            updated
            duration
            thumbnail
            isLive
            metadata
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
    const { t } = useTranslation();

    const breadcrumbs = (realm.isRoot ? realm.ancestors : realm.ancestors.concat(realm))
        .map(({ name, path }) => ({ label: name, link: path }));

    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <Player
            tracks={event.tracks as Track[]}
            title={event.title}
            isLive={event.isLive}
            duration={event.duration}
            coverImage={event.thumbnail}
            css={{ margin: "0 auto" }}
        />
        <Metadata id={id} event={event} />

        <div css={{ height: 80 }} />

        {event.series && <SeriesBlockFromReadySeries
            basePath={basePath}
            fragRef={event.series}
            title={t("video.more-from-series", { series: event.series.title })}
            activeEventId={id}
        />}
    </>;
};

type MetadataProps = {
    id: string;
    event: NonNullable<VideoQuery$data["event"]>;
};

const Metadata: React.FC<MetadataProps> = ({ id, event }) => {
    const { t } = useTranslation();
    const user = useUser();

    return <>
        <div css={{ display: "flex", alignItems: "center", marginTop: 24 }}>
            <div css={{ flex: "1" }}>
                <VideoTitle title={event.title} />
                <VideoDate created={event.created} updated={event.updated} />
            </div>
            <div>
                {event.canWrite && user !== "none" && user !== "unknown" && (
                    <LinkButton to={`/~manage/videos/${id.slice(2)}`}>
                        {t("manage.my-videos.manage-video")}
                    </LinkButton>
                )}
            </div>
        </div>
        <hr />
        <div css={{
            display: "grid",
            gridTemplate: "1fr / 1fr fit-content(30%)",
            columnGap: 48,
            rowGap: 24,
            [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                gridTemplate: "auto auto / 1fr",
            },
        }}>
            <div css={{ maxWidth: 700 }}>
                <Creators creators={event.creators} />
                <Description description={event.description} />
            </div>
            <div css={{ paddingTop: 8 }}>
                <MetadataTable event={event} />
            </div>
        </div>

    </>;
};

type VideoTitleProps = {
    title: string;
};

const VideoTitle: React.FC<VideoTitleProps> = ({ title }) => (
    <PageTitle title={title} css={{
        marginBottom: 4,
        fontSize: 22,
        [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: { fontSize: 20 },
        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: { fontSize: 18 },
        lineHeight: 1.2,

        // Truncate title after two lines
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        textOverflow: "ellipsis",
        WebkitLineClamp: 2,
        overflow: "hidden",
    }} />
);

type CreatorsProps = {
    creators: readonly string[];
};

const Creators: React.FC<CreatorsProps> = ({ creators }) => (
    <div css={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <HiOutlineUserCircle css={{ color: "var(--grey40)" }} />
        <ul css={{
            display: "inline-block",
            listStyle: "none",
            margin: 0,
            padding: 0,
            fontSize: 14,
            fontWeight: "bold",
            "& > li": {
                display: "inline-block",
                "&:not(:last-child)::after": {
                    content: "'•'",
                    margin: "0 8px",
                    color: "var(--grey65)",
                },
            },
        }}>
            {creators.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
    </div>
);

type DescriptionProps = {
    description: string | null;
};

const Description: React.FC<DescriptionProps> = ({ description }) => {
    if (description === null) {
        return null;
    }

    // We ignore all leading or trailing newlines and then split the whole
    // description by empty lines (two or more consecutive newlines). That's
    // the typical "make paragraphs from text" algorithm also used by Markdown.
    // However, we capture those newlines to be able to output any extra
    // (in addition to two) newlines. If a user typed many newlines in their
    // description, they probably want to have more space there. The newlines
    // between and within the paragraphs are then displayed via `white-space:
    // pre-line` below.
    const paragraphs = description.replace(/^\n*|\n*$/g, "").split(/(\n{2,})/);

    // TODO: auto link URL-like things?
    return (
        <div css={{
            color: "var(--grey20)",
            fontSize: 14,
            lineHeight: "20px",
            whiteSpace: "pre-line",
            "& > p:not(:first-child)": {
                marginTop: 8,
            },
        }}>
            {paragraphs.map((s, i) => i % 2 === 0
                ? <p key={i}>{s}</p>
                : s.slice(2))}
        </div>
    );
};

type VideoDateProps = {
    created: string;
    updated: string;
};

const VideoDate: React.FC<VideoDateProps> = props => {
    const { t, i18n } = useTranslation();
    const [hovering, setHovering] = useState(false);

    const created = new Date(props.created);
    const updated = new Date(props.updated);

    const fullOptions = { dateStyle: "long", timeStyle: "short" } as const;
    const createdDate = created.toLocaleDateString(i18n.language, { dateStyle: "long" });
    const createdFull = created.toLocaleString(i18n.language, fullOptions);
    const updatedFull = updated.getTime() - created.getTime() > 5 * 60 * 1000
        ? updated.toLocaleString(i18n.language, fullOptions)
        : null;

    return (
        <div
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            css={{
                display: "inline-block",
                position: "relative",
                color: "var(--grey40)",
                fontSize: 14,
            }}
        >
            {createdDate}
            {hovering && <div css={{
                position: "absolute",
                left: 2,
                bottom: "calc(100% + 10px)",
                width: "max-content",
                padding: "5px 10px",
                backgroundColor: "var(--grey86)",
                borderRadius: 5,
                color: "black",
            }}>
                <div css={{
                    position: "absolute",
                    width: 12,
                    height: 12,
                    bottom: -5,
                    left: 20,
                    backgroundColor: "inherit",
                    transform: "rotate(45deg)",
                }} />
                <i>{t("video.created")}</i>: {createdFull}
                <br/>
                <i>{t("video.updated")}</i>: {updatedFull}
            </div>}
        </div>
    );
};

type MetadataTableProps = {
    event: NonNullable<VideoQuery$data["event"]>;
};

const MetadataTable: React.FC<MetadataTableProps> = ({ event }) => {
    const { t, i18n } = useTranslation();

    const pairs: [string, ReactNode][] = [];

    if (event.series !== null) {
        pairs.push([t("video.part-of-series"), event.series.title]);
    }

    for (const [namespace, fields] of Object.entries(CONFIG.metadataLabels)) {
        const metadataNs = event.metadata[namespace];
        if (metadataNs === undefined) {
            continue;
        }

        for (const [field, label] of Object.entries(fields)) {
            if (field in metadataNs) {
                const translatedLabel = typeof label === "object"
                    ? translatedConfig(label, i18n)
                    : match(label, {
                        "builtin:license": () => t("video.license"),
                        "builtin:source": () => t("video.source"),
                    });

                const values = metadataNs[field].map((value, i) => <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {isValidLink(value) ? <Link to={value}>{value}</Link> : value}
                </React.Fragment>);

                pairs.push([translatedLabel, values]);
            }
        }
    }

    return (
        <dl css={{
            display: "grid",
            columnGap: 16,
            rowGap: 6,
            fontSize: 14,
            lineHeight: 1.3,
            gridTemplateColumns: "max-content 1fr",
            "& > dt::after": {
                content: "':'",
            },
            "& > dd": {
                color: "var(--grey40)",
            },
        }}>
            {pairs.map(([label, value], i) => <React.Fragment key={i}>
                <dt>{label}</dt>
                <dd>{value}</dd>
            </React.Fragment>)}
        </dl>
    );
};

const isValidLink = (s: string): boolean => {
    const trimmed = s.trim();
    if (!(trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
        return false;
    }

    try {
        new URL(trimmed);
    } catch (_) {
        return false;
    }

    return true;
};
