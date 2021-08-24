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
import { VideoBlock } from "../ui/blocks/Video";
import { TextBlock } from "../ui/blocks/Text";
import type { Track } from "../ui/player";
import { useTranslation } from "react-i18next";
import { useTitle } from "../util";


export const VideoRoute: Route<PreloadedQuery<VideoQuery>> = {
    path: `((?:/${PATH_SEGMENT_REGEX})*)/v/([a-zA-Z0-9\\-_]+)`,
    // TODO: check if video belongs to realm
    prepare: ([realmPath, videoId]) =>
        loadQuery(relayEnv, query, { id: `ev${videoId}`, realmPath }),
    render: queryRef => <VideoPage queryRef={queryRef} />,
};

const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        event(id: $id) {
            title
            description
            creator
            created
            updated
            series { title }
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            ... NavigationData
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<VideoQuery>;
};

const VideoPage: React.FC<Props> = ({ queryRef }) => {
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
    useTitle(title);
    return (
        <Root nav={<Nav fragRef={realm} />}>
            <h1>{title}</h1>
            <VideoBlock tracks={tracks as Track[]} />
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
