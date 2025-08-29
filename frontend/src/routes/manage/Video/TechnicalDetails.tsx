import { useTranslation } from "react-i18next";
import { Fragment } from "react";

import { NotAuthorized } from "../../../ui/error";
import { useUser } from "../../../User";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { AuthorizedEvent, makeManageVideoRoute, PAGE_WIDTH } from "./Shared";
import { CopyableInput } from "../../../ui/Input";
import { COLORS } from "../../../color";
import { ManageRoute } from "..";
import { ManageVideosRoute } from ".";
import { ManageVideoDetailsRoute } from "./VideoDetails";
import { Caption } from "../../../ui/player";
import { captionsText } from "../../../util";


export const ManageVideoTechnicalDetailsRoute = makeManageVideoRoute(
    "technical-details",
    "/technical-details",
    event => <Page event={event} />,
);

type Props = {
    event: AuthorizedEvent;
};

type TrackInfoProps = {
    event: {
        authorizedData?: null | {
            tracks: NonNullable<AuthorizedEvent["authorizedData"]>["tracks"];
            captions: readonly Caption[];
        };
    };
    className?: string;
    translateFlavors?: boolean;
};

const Page: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    const breadcrumbs = [
        { label: t("user.manage"), link: ManageRoute.url },
        { label: t("manage.video.table"), link: ManageVideosRoute.url },
        { label: event.title, link: ManageVideoDetailsRoute.url({ videoId: event.id }) },
    ];

    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }

    return <>
        <Breadcrumbs path={breadcrumbs} tail={t("manage.video.technical-details.title")} />
        <PageTitle title={t("manage.video.technical-details.title")} />
        <div css={{
            maxWidth: PAGE_WIDTH,
            "& > section:not(:last-child)": {
                marginBottom: 32,
            },
            "& > section > h2": {
                fontSize: 18,
                marginBottom: 4,
            },
        }}>
            <OpencastId event={event} />
            <TrackInfo event={{
                ...event,
                authorizedData: {
                    tracks: event.authorizedData?.tracks ?? [],
                    captions: event.authorizedData?.captions ?? [],
                },
            }} />
            <FurtherInfo event={event} />
        </div>
    </>;
};

const OpencastId: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return <section>
        <h2>{t("manage.video.technical-details.opencast-id")}</h2>
        <CopyableInput
            label={t("manage.video.technical-details.copy-oc-id-to-clipboard")}
            value={event.opencastId}
            css={{ width: 400, fontSize: 14 }}
        />
    </section>;
};

type SingleTrackInfo = {
    resolution?: readonly number[] | null;
    mimetype?: string | null;
    uri: string;
};

export const TrackInfo: React.FC<TrackInfoProps> = (
    { event, className, translateFlavors = false },
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

        tracks.push({ resolution, mimetype, uri });
    }

    const isSingleFlavor = flavors.size === 1;

    return <section css={className}>
        <h2>{t("manage.video.technical-details.tracks")}</h2>
        <ul css={{ fontSize: 15, marginTop: 8, paddingLeft: 24 }}>
            {Array.from(flavors, ([flavor, tracks]) => {
                const trackItems = tracks
                    .sort((a, b) => (a.resolution?.[0] ?? 0) - (b.resolution?.[0] ?? 0))
                    .map((track, i) => <TrackItem key={i} {...track} />);
                const flavorLabel = translateFlavors
                    ? flavorTranslation(flavor)
                    : <code>{flavor}</code>;
                const flat = isSingleFlavor && translateFlavors;

                return <Fragment key={flavor}>
                    {flat ? trackItems : <>{flavorLabel}<ul>{trackItems}</ul></>}
                </Fragment>;
            })}
            {event.authorizedData.captions && <VTTInfo captions={event.authorizedData.captions} />}
        </ul>
    </section>;
};


const TrackItem: React.FC<SingleTrackInfo> = ({ mimetype, resolution, uri }) => {
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
            <a href={uri}>
                {type
                    ? <>{typeTranslation}</>
                    : <i>{t("manage.video.technical-details.unknown-mimetype")}</i>
                }
                {(resolution || subtype) && resolutionString}
            </a>
        </li>
    );
};

const VTTInfo: React.FC<{ captions: readonly Caption[] }> = ({ captions }) => <>{
    captions.map((caption, index) => {
        const label = captionsText({
            lang: caption.lang ?? undefined,
            index,
            captions,
        });
        return <li key={label}>
            <a href={caption.uri}>
                {label}
            </a>
        </li>;
    })
}</>;

const FurtherInfo: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();

    const boolToYesNo = (v: boolean) => v ? t("general.yes") : t("general.no");
    const printDate = (date?: string | null): string => {
        if (date == null) {
            return "-";
        }

        return new Date(date).toLocaleString(i18n.language, {
            dateStyle: "medium",
            timeStyle: "medium",
        });
    };

    return <section>
        <h2>{t("manage.video.technical-details.further-info")}</h2>
        <ul>
            <SingleInfo label={t("manage.video.technical-details.synced")}>
                {boolToYesNo(event.syncedData !== null)}
            </SingleInfo>
            <SingleInfo label={t("manage.video.technical-details.part-of")}>
                <code css={{ fontSize: 15 }}>{event.series?.opencastId ?? "null"}</code>
            </SingleInfo>
            <SingleInfo label={t("manage.video.technical-details.is-live")}>
                {boolToYesNo(event.isLive)}
            </SingleInfo>
            {event.syncedData && <>
                <SingleInfo label={t("video.start") + ":"}>
                    {printDate(event.syncedData.startTime)}
                </SingleInfo>
                <SingleInfo label={t("video.end") + ":"}>
                    {printDate(event.syncedData.endTime)}
                </SingleInfo>
            </>}
        </ul>
    </section>;
};

const SingleInfo: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
    <li>
        <span css={{ color: COLORS.neutral60, marginRight: 16 }}>{label}</span>
        {children}
    </li>
);


