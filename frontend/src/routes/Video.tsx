import React from "react";
import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";

import type { VideoQuery } from "../query-types/VideoQuery.graphql";
import { environment as relayEnv } from "../relay";
import type { Route } from "../router";
import { Root } from "../layout/Root";
import { PATH_SEGMENT_REGEX } from "./Realm";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { TextBlock } from "../ui/blocks/Text";
import { Player, Track } from "../ui/player";
import { useTranslation } from "react-i18next";
import { useTitle } from "../util";
import { SeriesBlockFromSeries } from "../ui/blocks/Series";


export const VideoRoute: Route<Props> = {
    path: `((?:/${PATH_SEGMENT_REGEX})*)/v/([a-zA-Z0-9\\-_]+)`,
    // TODO: check if video belongs to realm
    prepare: ([realmPath, videoId]) => {
        const id = `ev${videoId}`;
        const queryRef = loadQuery<VideoQuery>(relayEnv, query, { id, realmPath });
        return { queryRef, realmPath, id };
    },
    render: props => <VideoPage {...props} />,
};

const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        event(id: $id) {
            title
            description
            creator
            created
            updated
            duration
            series { title, ...SeriesBlockSeriesData }
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            ... NavigationData
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<VideoQuery>;
    realmPath: string;
    id: string;
};

const VideoPage: React.FC<Props> = ({ queryRef, realmPath, id }) => {
    const { t, i18n } = useTranslation();
    const { event, realm } = usePreloadedQuery(query, queryRef);

    // TODO: this realm check is useless once we check a video belongs to a realm.
    if (!event || !realm) {
        return <NotFound kind="video" />;
    }

    const createdDate = new Date(event.created);
    const created = createdDate.toLocaleString(i18n.language);

    // If the event was updated only shortly after the creation date, we don't
    // want to show it.
    const updatedDate = new Date(event.updated);
    const updated = updatedDate.getTime() - createdDate.getTime() > 5 * 60 * 1000
        ? updatedDate.toLocaleString(i18n.language)
        : null;

    const { title, tracks, description } = event;
    const duration = event.duration ?? 0; // <-- TODO
    useTitle(title);
    return (
        <Root nav={<Nav fragRef={realm} />}>
            <Player tracks={tracks as Track[]} title={title} duration={duration} />
            <h1 css={{ marginTop: 24, fontSize: 24 }}>{title}</h1>
            {description !== null && <TextBlock content={description} />}
            <table css={{
                marginBottom: 100,
                "& tr": {
                    "& > td:first-child": {
                        color: "var(--grey40)",
                        paddingRight: 32,
                    },
                },
            }}>
                <tbody>
                    <MetaDatum label={t("video.creator")} value={event.creator} />
                    <MetaDatum label={t("video.created")} value={created} />
                    <MetaDatum label={t("video.updated")} value={updated} />
                    <MetaDatum label={t("video.part-of-series")} value={event.series?.title} />
                </tbody>
            </table>
            {event.series && <SeriesBlockFromSeries
                realmPath={realmPath} fragRef={event.series}
                title={t("video.more-from-series", { series: event.series.title })}
                activeEventId={id}
            />}
        </Root>
    );
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
