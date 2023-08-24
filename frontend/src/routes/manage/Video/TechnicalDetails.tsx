import { useTranslation } from "react-i18next";

import { NotAuthorized } from "../../../ui/error";
import { useUser } from "../../../User";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { AuthorizedEvent, makeManageVideoRoute, PAGE_WIDTH } from "./Shared";
import { CopyableInput } from "../../../ui/Input";
import { COLORS } from "../../../color";


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
        syncedData: null | {
            tracks: NonNullable<AuthorizedEvent["syncedData"]>["tracks"];
        };
    };
    className?: string;
    translateFlavors?: boolean;
};

const Page: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    const breadcrumbs = [
        { label: t("user.manage-content"), link: "/~manage" },
        { label: t("manage.my-videos.title"), link: "/~manage/videos" },
        { label: event.title, link: `/~manage/videos/${event.id.substring(2)}` },
    ];

    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }

    return <>
        <Breadcrumbs path={breadcrumbs} tail={t("manage.my-videos.technical-details.title")} />
        <PageTitle title={t("manage.my-videos.technical-details.title")} />
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
            <TrackInfo event={event} />
            <FurtherInfo event={event} />
        </div>
    </>;
};

const OpencastId: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return <section>
        <h2>{t("manage.my-videos.technical-details.opencast-id")}</h2>
        <CopyableInput
            label={t("manage.my-videos.technical-details.copy-oc-id-to-clipboard")}
            value={event.opencastId}
            css={{ width: 400, fontSize: 14 }}
        />
    </section>;
};

type SingleTrackInfo = {
    resolution: readonly number[] | null;
    mimetype: string | null;
    uri: string;
};

export const TrackInfo: React.FC<TrackInfoProps> = (
    { event, className, translateFlavors = false },
) => {
    const { t } = useTranslation();

    if (event.syncedData == null) {
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
    for (const { flavor, resolution, mimetype, uri } of event.syncedData.tracks) {
        let tracks = flavors.get(flavor);
        if (tracks === undefined) {
            tracks = [];
            flavors.set(flavor, tracks);
        }

        tracks.push({ resolution, mimetype, uri });
    }

    return <section css={className}>
        <h2>{t("manage.my-videos.technical-details.tracks")}</h2>
        <ul css={{ fontSize: 15, marginTop: 8, paddingLeft: 24 }}>
            {Array.from(flavors, ([flavor, tracks]) => <li key={flavor}>
                {translateFlavors ? flavorTranslation(flavor) : <code>{flavor}</code>}
                <ul>{tracks
                    .sort((a, b) => (a.resolution?.[0] ?? 0) - (b.resolution?.[0] ?? 0))
                    .map((track, i) => <TrackItem key={i} {...track} />)
                }</ul>
            </li>)}
        </ul>
    </section>;
};

const TrackItem: React.FC<SingleTrackInfo> = ({ mimetype, resolution, uri }) => {
    const { t } = useTranslation();

    return (
        <li css={{ marginBottom: 4 }}>
            <a href={uri}>
                {mimetype == null
                    ? <i>{t("manage.my-videos.technical-details.unknown-mimetype")}</i>
                    : <code>{mimetype}</code>}
                {resolution && <span css={{
                    backgroundColor: COLORS.neutral10,
                    marginLeft: 8,
                    padding: "2px 4px",
                    borderRadius: 4,
                }}>{resolution.join(" × ")}</span>}
            </a>
        </li>
    );
};

const FurtherInfo: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();

    const boolToYesNo = (v: boolean) => v ? t("general.yes") : t("general.no");
    const printDate = (date: string | null): string => {
        if (date == null) {
            return "-";
        }

        return new Date(date).toLocaleString(i18n.language, {
            dateStyle: "medium",
            timeStyle: "medium",
        });
    };

    return <section>
        <h2>{t("manage.my-videos.technical-details.further-info")}</h2>
        <ul>
            <SingleInfo label={t("manage.my-videos.technical-details.synced")}>
                {boolToYesNo(event.syncedData !== null)}
            </SingleInfo>
            <SingleInfo label={t("manage.my-videos.technical-details.part-of")}>
                <code css={{ fontSize: 15 }}>{event.series?.opencastId ?? "null"}</code>
            </SingleInfo>
            <SingleInfo label={t("manage.my-videos.technical-details.is-live")}>
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


