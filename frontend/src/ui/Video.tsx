import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuCircleUser } from "react-icons/lu";
import { Spinner } from "@opencast/appkit";

import { COLORS } from "../color";
import { AuthorizedEvent } from "../routes/manage/Video/Shared";
import { Caption } from "./player";
import { captionsWithLabels } from "../util";
import { graphql } from "react-relay";
import { fetchQuery } from "../relay";
import { VideoStaticFileLinkQuery } from "./__generated__/VideoStaticFileLinkQuery.graphql";
import CONFIG from "../config";


/**
 * Takes a video duration in milliseconds and returns a formatted string in
 * `HH:MM:SS` or `MM:SS` format.
 */
export const formatDuration = (totalMs: number): string => {
    const totalSeconds = Math.round(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / (60 * 60));

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${minutes}:${pad(seconds)}`;
    }
};

export const isPastLiveEvent = (endTime: string | null, isLive: boolean): boolean =>
    isLive && endTime != null && new Date(endTime) < new Date();

export const isUpcomingLiveEvent = (startingTime: string | null, isLive: boolean): boolean =>
    isLive && startingTime != null && new Date(startingTime) > new Date();


type CreatorsProps = {
    creators: readonly (JSX.Element | string)[] | null;
    className?: string;
};

/**
 * Shows a list of creators (of a video) separated by '•' with a leading user
 * icon. If the given creators are null or empty, renders nothing.
 */
export const Creators: React.FC<CreatorsProps> = ({ creators, className }) => (
    creators == null || creators.length === 0
        ? null
        : <div
            css={{
                display: "flex",
                alignItems: "center",
                fontSize: 14,
                gap: 8,
            }}
            {...{ className }}
        >
            <LuCircleUser css={{
                color: COLORS.neutral60,
                fontSize: 16,
                flexShrink: 0,
            }} />
            <ul css={{
                listStyle: "none",
                display: "inline-flex",
                flexWrap: "wrap",
                margin: 0,
                padding: 0,
                "& > li:not(:last-child)::after": {
                    content: "'•'",
                    padding: "0 6px",
                    color: COLORS.neutral40,
                },
            }}>
                {creators.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
        </div>
);


type TrackInfoProps = {
    event: {
        id: string;
        authorizedData?: null | {
            tracks: NonNullable<AuthorizedEvent["authorizedData"]>["tracks"];
            captions: readonly Caption[];
        };
    };
    translateFlavors?: boolean;
};

export const TrackInfo: React.FC<TrackInfoProps> = (
    { event, translateFlavors = false },
) => {
    const { t } = useTranslation();

    if (event.authorizedData == null) {
        return null;
    }


    const flavorTranslation = (flavor: string) => {
        if (flavor.startsWith("presenter")) {
            return t("video.download.presenter");
        }
        if (flavor.startsWith("presentation")) {
            return t("video.download.slides");
        }
        return flavor;
    };

    const flavors: Map<string, SingleTrackInfo[]> = new Map();
    for (const { flavor, resolution, mimetype, uri } of event.authorizedData.tracks) {
        let tracks = flavors.get(flavor);
        if (tracks === undefined) {
            tracks = [];
            flavors.set(flavor, tracks);
        }

        tracks.push({ resolution, mimetype, uri, eventId: event.id });
    }

    const isSingleFlavor = flavors.size === 1;

    return <ul css={{ fontSize: 15, marginBottom: 4, paddingLeft: 24 }}>
        {Array.from(flavors, ([flavor, tracks]) => {
            const trackItems = tracks
                .sort((a, b) => (a.resolution?.[0] ?? 0) - (b.resolution?.[0] ?? 0))
                .map((track, i) => <TrackItem key={i} {...track} />);
            const flavorLabel = translateFlavors
                ? flavorTranslation(flavor)
                : <code>{flavor}</code>;
            const flat = isSingleFlavor && translateFlavors;

            return <Fragment key={flavor}>
                {flat ? trackItems : <li>{flavorLabel}<ul>{trackItems}</ul></li>}
            </Fragment>;
        })}
        <VTTInfo captions={event.authorizedData.captions} eventId={event.id} />
    </ul>;
};


type SingleTrackInfo = {
    resolution?: readonly number[] | null;
    mimetype?: string | null;
    uri: string;
    eventId: string;
};

const TrackItem: React.FC<SingleTrackInfo> = ({ mimetype, resolution, uri, eventId }) => {
    const { t } = useTranslation();
    const type = mimetype && mimetype.split("/")[0];
    const subtype = mimetype && mimetype.split("/")[1];
    const typeTranslation = (type === "audio" || type === "video")
        ? t(`manage.video.technical-details.${type}`)
        : type;

    const resolutionString = (type && " ")
        + "("
        + [subtype, resolution?.join(" × ")].filter(Boolean).join(", ")
        + ")";

    return (
        <li css={{ marginBottom: 4 }}>
            <StaticFileLink link={uri} event={eventId}>
                {type
                    ? <>{typeTranslation}</>
                    : <i>{t("manage.video.technical-details.unknown-mimetype")}</i>
                }
                {(resolution || subtype) && resolutionString}
            </StaticFileLink>
        </li>
    );
};

type VTTInfoProps = {
    captions: readonly Caption[];
    eventId: string;
};

const VTTInfo: React.FC<VTTInfoProps> = ({ captions, eventId }) => {
    const { t } = useTranslation();

    return <>{captionsWithLabels(captions, t).map(({ caption, label }) =>
        <li key={label}>
            <StaticFileLink link={caption.uri} event={eventId}>
                {label}
            </StaticFileLink>
        </li>)
    }</>;
};

type StaticFileLinkProps = React.PropsWithChildren<{
    event: string;
    link: string;
}>;

const StaticFileLink: React.FC<StaticFileLinkProps> = ({ event, link, children }) => {
    const [pending, setPending] = useState(false);

    const buildLink = () => {
        const query = graphql`
            query VideoStaticFileLinkQuery($id: ID!) {
                eventById(id:$id) {
                    ...on AuthorizedEvent { jwtForDownload }
                }
            }
        `;
        fetchQuery<VideoStaticFileLinkQuery>(query, { id: event }, { fetchPolicy: "network-only" })
            .subscribe({
                start: () => setPending(true),
                complete: () => setPending(false),
                error: () => setPending(false),
                next: data => {
                    const elem = document.createElement("a");
                    const url = new URL(link);
                    if (data.eventById?.jwtForDownload) {
                        url.searchParams.set("jwt", data.eventById.jwtForDownload);
                    }
                    url.searchParams.set("download", "1");
                    elem.href = url.toString();
                    elem.target = "_blank";
                    elem.click();
                },
            });
    };

    return (
        <a {...CONFIG.auth.authStaticFiles ? {
            onClick: buildLink,
            css: {
                cursor: "pointer",
            },
        } : {
            href: link,
        }}>
            {children}
            {pending && <Spinner css={{
                verticalAlign: "middle",
                marginLeft: 8,
            }} />}
        </a>
    );
};
