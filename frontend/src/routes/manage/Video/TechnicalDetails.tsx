import { useTranslation } from "react-i18next";

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
import { TrackInfo } from "../../../ui/Video";


export const ManageVideoTechnicalDetailsRoute = makeManageVideoRoute(
    "technical-details",
    "/technical-details",
    event => <Page event={event} />,
);

type Props = {
    event: AuthorizedEvent;
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
            <section>
                <h2>{t("manage.video.technical-details.tracks")}</h2>
                <TrackInfo event={{
                    ...event,
                    authorizedData: {
                        tracks: event.authorizedData?.tracks ?? [],
                        captions: event.authorizedData?.captions ?? [],
                    },
                }} />
            </section>
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


