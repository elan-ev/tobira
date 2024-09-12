import { ReactNode, Suspense } from "react";
import { LuFrown, LuAlertTriangle } from "react-icons/lu";
import { Translation, useTranslation } from "react-i18next";
import {
    graphql, useFragment, usePreloadedQuery, useQueryLoader,
    GraphQLTaggedNode, PreloadedQuery,
} from "react-relay";
import { unreachable } from "@opencast/appkit";

import { eventId, getCredentials, isSynced, keyOfId } from "../util";
import { GlobalErrorBoundary } from "../util/err";
import { loadQuery } from "../relay";
import { makeRoute, MatchedRoute } from "../rauta";
import { Player, PlayerPlaceholder } from "../ui/player";
import { Spinner } from "@opencast/appkit";
import { MovingTruck } from "../ui/Waiting";
import { b64regex } from "./util";
import { EmbedQuery } from "./__generated__/EmbedQuery.graphql";
import { EmbedDirectOpencastQuery } from "./__generated__/EmbedDirectOpencastQuery.graphql";
import { EmbedEventData$key } from "./__generated__/EmbedEventData.graphql";
import { PlayerContextProvider } from "../ui/player/PlayerContext";
import { authorizedDataQuery, ProtectedPlayer } from "./Video";
import { VideoAuthorizedDataQuery } from "./__generated__/VideoAuthorizedDataQuery.graphql";

export const EmbedVideoRoute = makeRoute({
    url: ({ videoId }: { videoId: string }) => `/~embed/!v/${keyOfId(videoId)}`,
    match: url => {
        const regex = new RegExp(`^/~embed/!v/(${b64regex}+)/?$`, "u");
        const params = regex.exec(url.pathname);
        if (params === null) {
            return null;
        }
        const id = eventId(decodeURIComponent(params[1]));

        const query = graphql`
            query EmbedQuery($id: ID!, $eventUser: String, $eventPassword: String) {
                event: eventById(id: $id) { ... EmbedEventData }
            }
        `;

        const queryRef = loadQuery<EmbedQuery>(query, {
            id,
            ...getCredentials("event" + id),
        });


        return matchedEmbedRoute(query, queryRef);
    },
});

export const EmbedOpencastVideoRoute = makeRoute({
    url: (args: { ocID: string }) => `/~embed/!v/:${args.ocID}`,
    match: url => {
        const regex = new RegExp("^/~embed/!v/:([^/]+)$", "u");
        const matches = regex.exec(url.pathname);
        if (!matches) {
            return null;
        }

        const query = graphql`
            query EmbedDirectOpencastQuery(
                $id: String!,
                $eventUser: String,
                $eventPassword: String)
            {
                event: eventByOpencastId(id: $id)  { ... EmbedEventData }
            }
        `;

        const videoId = decodeURIComponent(matches[1]);
        const queryRef = loadQuery<EmbedDirectOpencastQuery>(query, {
            id: videoId,
            ...getCredentials(videoId),
        });

        return matchedEmbedRoute(query, queryRef);
    },
});

const matchedEmbedRoute = (
    query: GraphQLTaggedNode,
    queryRef: PreloadedQuery<EmbedQuery | EmbedDirectOpencastQuery>,
): MatchedRoute => ({
    render: () => <ErrorBoundary>
        <Suspense fallback={
            <PlayerPlaceholder>
                <Spinner css={{
                    "& > circle": {
                        stroke: "white",
                    },
                }} />
            </PlayerPlaceholder>
        }>
            <PlayerContextProvider>
                <Embed query={query} queryRef={queryRef} />
            </PlayerContextProvider>
        </Suspense>
    </ErrorBoundary>,
    dispose: () => queryRef.dispose(),
});

const embedEventFragment = graphql`
    fragment EmbedEventData on Event {
        __typename
        ... on NotAllowed { dummy }
        ... on AuthorizedEvent {
            id
            title
            created
            isLive
            opencastId
            creators
            metadata
            description
            canWrite
            hasPassword
            series { title opencastId }
            syncedData {
                updated
                startTime
                endTime
                duration
            }
            authorizedData(user: $eventUser, password: $eventPassword) {
                thumbnail
                tracks { uri flavor mimetype resolution isMaster }
                captions { uri lang }
                segments { uri startTime }
            }
        }
    }
`;


type EmbedProps = {
    query: GraphQLTaggedNode;
    queryRef: PreloadedQuery<EmbedQuery|EmbedDirectOpencastQuery>;
};

const Embed: React.FC<EmbedProps> = ({ query, queryRef }) => {
    const fragmentRef = usePreloadedQuery(query, queryRef);
    const event = useFragment<EmbedEventData$key>(
        embedEventFragment,
        fragmentRef.event,
    );
    const { t } = useTranslation();
    const [queryReference, loadQuery]
        = useQueryLoader<VideoAuthorizedDataQuery>(authorizedDataQuery);

    if (!event) {
        return <PlayerPlaceholder>
            <LuFrown />
            <div>{t("not-found.video-not-found")}</div>
        </PlayerPlaceholder>;
    }

    if (event.__typename === "NotAllowed") {
        return <PlayerPlaceholder>
            <LuAlertTriangle />
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

    return event.authorizedData
        ? <Player event={{
            ...event,
            authorizedData: event.authorizedData,
        }} />
        : <ProtectedPlayer embedded {...{
            queryReference,
            event,
            loadQuery,
        }}/>;
};

export const BlockEmbedRoute = makeRoute({
    match: url => {
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
                <LuAlertTriangle />
                <div>
                    <Translation>{t => t("embed.not-supported")}</Translation>
                </div>
            </PlayerPlaceholder>,
        };
    },
});

class ErrorBoundary extends GlobalErrorBoundary {
    public render(): ReactNode {
        if (!this.state.error) {
            return this.props.children;
        }

        return <PlayerPlaceholder>
            <LuAlertTriangle />
            <div>
                <Translation>{t => t("errors.embedded")}</Translation>
            </div>
        </PlayerPlaceholder>;
    }
}
