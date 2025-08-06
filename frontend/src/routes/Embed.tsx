import { ReactNode, Suspense } from "react";
import { LuFrown, LuTriangleAlert } from "react-icons/lu";
import { Translation, useTranslation } from "react-i18next";
import {
    graphql, useFragment, usePreloadedQuery,
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
import { PlayerContextProvider, usePlayerContext } from "../ui/player/PlayerContext";
import { PreviewPlaceholder, useEventWithAuthData } from "./Video";
import { PlayerShortcuts } from "../ui/player/PlayerShortcuts";

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

        const creds = getCredentials("event", id);
        const queryRef = loadQuery<EmbedQuery>(query, {
            id,
            eventUser: creds?.user,
            eventPassword: creds?.password,
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
        const creds = getCredentials("oc-event", videoId);
        const queryRef = loadQuery<EmbedDirectOpencastQuery>(query, {
            id: videoId,
            eventUser: creds?.user,
            eventPassword: creds?.password,
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
                <EmbedPageShortcuts />
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
            series { title id opencastId }
            syncedData {
                updated
                startTime
                endTime
                duration
                thumbnail
            }
            ... VideoPageAuthorizedData
                @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
        }
    }
`;


type EmbedProps = {
    query: GraphQLTaggedNode;
    queryRef: PreloadedQuery<EmbedQuery|EmbedDirectOpencastQuery>;
};

const Embed: React.FC<EmbedProps> = ({ query, queryRef }) => {
    const fragmentRef = usePreloadedQuery(query, queryRef);
    const protoEvent = useFragment<EmbedEventData$key>(
        embedEventFragment,
        fragmentRef.event,
    );
    const [event, refetch] = useEventWithAuthData(protoEvent);
    const { t } = useTranslation();

    if (!event) {
        return <PlayerPlaceholder>
            <LuFrown />
            <div>{t("not-found.video-not-found")}</div>
        </PlayerPlaceholder>;
    }

    if (event.__typename === "NotAllowed") {
        return <PlayerPlaceholder>
            <LuTriangleAlert />
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
        ? <Player event={{ ...event, authorizedData: event.authorizedData }} />
        : <PreviewPlaceholder embedded {...{ event, refetch }}/>;
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
                <LuTriangleAlert />
                <div>
                    <Translation>{t => t("embed.not-supported")}</Translation>
                </div>
            </PlayerPlaceholder>,
        };
    },
});

const EmbedPageShortcuts: React.FC = () => {
    const { paella } = usePlayerContext();
    const player = paella.current?.player ?? null;
    return <PlayerShortcuts activePlayer={{ current: player }} />;
};

class ErrorBoundary extends GlobalErrorBoundary {
    public render(): ReactNode {
        if (!this.state.error) {
            return this.props.children;
        }

        return <PlayerPlaceholder>
            <LuTriangleAlert />
            <div>
                <Translation>{t => t("errors.embedded")}</Translation>
            </div>
        </PlayerPlaceholder>;
    }
}
