import { Suspense } from "react";
import { FiAlertTriangle, FiFrown } from "react-icons/fi";
import { Translation, useTranslation } from "react-i18next";
import { graphql, PreloadedQuery, usePreloadedQuery } from "react-relay";

import { isSynced } from "../util";
import { unreachable } from "../util/err";
import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { Player, PlayerPlaceholder } from "../ui/player";
import { Spinner } from "../ui/Spinner";
import { MovingTruck } from "../ui/Waiting";
import { b64regex } from "./util";
import { EmbedQuery } from "./__generated__/EmbedQuery.graphql";


const query = graphql`
    query EmbedQuery($id: ID!) {
        eventById(id: $id) {
            __typename
            ... on NotAllowed { dummy }
            ... on AuthorizedEvent {
                title
                created
                isLive
                syncedData {
                    updated
                    startTime
                    endTime
                    duration
                    thumbnail
                    tracks {
                        uri
                        flavor
                        mimetype
                        resolution
                    }
                }
            }
        }
    }
`;

export const EmbedVideoRoute = makeRoute(url => {
    const regex = new RegExp(`^/~embed/!v/(${b64regex}+)/?$`, "u");
    const params = regex.exec(url.pathname);
    if (params === null) {
        return null;
    }
    const videoId = decodeURIComponent(params[1]);
    const eventId = `ev${videoId}`;

    const queryRef = loadQuery<EmbedQuery>(query, { id: eventId });

    return {
        render: () => <Suspense fallback={
            <PlayerPlaceholder>
                <Spinner css={{
                    "& > circle": {
                        stroke: "white",
                    },
                }} />
            </PlayerPlaceholder>
        }>
            <Embed queryRef={queryRef} />
        </Suspense>,
        dispose: () => queryRef.dispose(),
    };
});

type EmbedProps = {
    queryRef: PreloadedQuery<EmbedQuery>;
};

const Embed: React.FC<EmbedProps> = ({ queryRef }) => {
    const { eventById: event } = usePreloadedQuery(query, queryRef);
    const { t } = useTranslation();

    if (!event) {
        return <PlayerPlaceholder>
            <FiFrown />
            <div>{t("not-found.video-not-found")}</div>
        </PlayerPlaceholder>;
    }

    if (event.__typename === "NotAllowed") {
        return <PlayerPlaceholder>
            <FiAlertTriangle />
            <div>{t("api-remote-errors.view.event")}</div>
        </PlayerPlaceholder>;
    }

    if (event.__typename !== "AuthorizedEvent") {
        return unreachable("unhandled event state");
    }

    if (!isSynced(event)) {
        return <PlayerPlaceholder>
            <MovingTruck />
            <div>{t("video.not-ready.title")}</div>
        </PlayerPlaceholder>;
    }

    return <Player event={event} />;
};

export const BlockEmbedRoute = makeRoute(url => {
    // Only do something if we are embedded
    if (window === window.top) {
        return null;
    }

    // And only if this is a non-embeddable route
    if (url.pathname.startsWith("/~embed/")) {
        return null;
    }

    return {
        render: () => <PlayerPlaceholder>
            <FiAlertTriangle />
            <div><Translation>
                {t => t("embed.not-supported")}
            </Translation></div>
        </PlayerPlaceholder>,
    };
});
