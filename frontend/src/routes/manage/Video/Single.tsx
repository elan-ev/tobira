import { useTranslation } from "react-i18next";
import { FiArrowLeft } from "react-icons/fi";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import {
    SingleVideoManageQuery,
    SingleVideoManageQuery$data,
} from "./__generated__/SingleVideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { LinkList, LinkWithIcon } from "../../../ui";
import { NotAuthorized } from "../../../ui/error";
import { Form } from "../../../ui/Form";
import { CopyableInput, Input, TextArea } from "../../../ui/Input";
import { InputContainer, TitleLabel } from "../../../ui/metadata";
import { Thumbnail } from "../../../ui/Video";
import { NotFound } from "../../NotFound";
import { PATH as MANAGE_VIDEOS_PATH } from ".";
import { useUser } from "../../../User";
import { LinkButton } from "../../../ui/Button";
import CONFIG from "../../../config";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { b64regex } from "../../util";


export const ManageSingleVideoRoute = makeRoute(url => {
    const regex = new RegExp(`^/~manage/videos/(${b64regex}+)/?$`, "u");
    const params = regex.exec(url.pathname);
    if (params === null) {
        return null;
    }

    const videoId = decodeURIComponent(params[1]);
    const queryRef = loadQuery<SingleVideoManageQuery>(query, { id: `ev${videoId}` });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={() => <BackLink />}
            render={data => data.event === null
                ? <NotFound kind="video" />
                : data.event.__typename === "AuthorizedEvent" && data.event.canWrite
                    ? <ManageSingleVideo event={data.event}/>
                    : <NotAuthorized />
            }
        />,
        dispose: () => queryRef.dispose(),
    };
});

const BackLink: React.FC = () => {
    const { t } = useTranslation();
    const items = [
        <LinkWithIcon key={MANAGE_VIDEOS_PATH} to={MANAGE_VIDEOS_PATH} iconPos="left">
            <FiArrowLeft />
            {t("manage.nav.my-videos")}
        </LinkWithIcon>,
    ];

    return <LinkList items={items} />;
};

const query = graphql`
    query SingleVideoManageQuery($id: ID!) {
        ...UserData
        event: eventById(id: $id) {
            __typename
            ... on AuthorizedEvent {
                id
                title
                description
                opencastId
                created
                canWrite
                isLive
                syncedData {
                    duration
                    thumbnail
                    updated
                    tracks { flavor resolution }
                }
                series { title ...SeriesBlockSeriesData }
                hostRealms { id isRoot name path }
            }
        }
    }
`;

type Event = NonNullable<SingleVideoManageQuery$data["event"]>;
type AuthorizedEvent = Extract<Event, { __typename: "AuthorizedEvent" }>;

type Props = {
    event: AuthorizedEvent;
};

const BREAKPOINT = 1100;

const ManageSingleVideo: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    const breadcrumbs = [
        { label: t("manage.management"), link: "/~manage" },
        { label: t("manage.my-videos.title"), link: "/~manage/videos" },
    ];

    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }
    const editorUrl = `${CONFIG.opencast.editorUrl}?mediaPackageId=${event.opencastId}`;

    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <PageTitle
            title={t("manage.my-videos.video-details", { title: event.title })}
            css={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        />
        <section css={{
            width: 1100,
            maxWidth: "100%",
            marginBottom: 32,

            [`@media(min-width: ${BREAKPOINT}px)`]: {
                display: "flex",
                flexDirection: "row-reverse",
                gap: 48,
            },
        }}>
            <ThumbnailDateInfo event={event} />
            <div css={{ margin: "8px 2px", flex: "1 0 auto" }}>
                {user.canUseEditor && event.canWrite && (
                    <LinkButton to={editorUrl} css={{ marginBottom: 16 }}>
                        {t("manage.my-videos.open-in-editor")}
                    </LinkButton>
                )}
                <DirectLink event={event} />
                <MetadataSection event={event} />
            </div>
        </section>
        <section css={{ marginBottom: 32 }}>
            <HostRealms event={event} />
        </section>
        <section>
            <TechnicalDetails event={event} />
        </section>
    </>;
};

const DirectLink: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const url = new URL(`/!v/${event.id.slice(2)}`, document.baseURI);

    return (
        <div css={{ marginBottom: 40 }}>
            <div css={{ marginBottom: 4 }}>
                {t("manage.my-videos.share-direct-link") + ":"}
            </div>
            <CopyableInput
                value={url.href}
                css={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
            />
        </div>
    );
};

const ThumbnailDateInfo: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const created = new Date(event.created).toLocaleString(i18n.language);
    const updated = event.syncedData?.updated == null
        ? null
        : new Date(event.syncedData.updated).toLocaleString(i18n.language);

    return (
        <div css={{
            flex: "0 0 auto",
            marginBottom: 16,
            display: "flex",
            gap: 16,
            [`@media(min-width: ${BREAKPOINT}px)`]: {
                flexDirection: "column",
                padding: 16,
                borderLeft: "1px dashed var(--grey80)",
            },
        }}>
            <Link to={`/!v/${event.id.slice(2)}`}>
                <Thumbnail event={event} css={{ width: 16 * 12 }} />
            </Link>
            <div css={{ fontSize: 14, margin: 4 }}>
                {/* TODO: move those translation strings somewhere more appropriate */}
                <DateValue label={t("video.created")} value={created} />
                {updated
                    ? <DateValue label={t("video.updated")} value={updated} />
                    : t("video.not-ready.title")}
            </div>
        </div>
    );
};

type DateValueProps = {
    label: string;
    value: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, value }) => (
    <div css={{ "&:not(:last-child)": { marginBottom: 12 } }}>
        <div css={{ color: "var(--grey40)", lineHeight: 1 }}>{label + ":"}</div>
        <div css={{ marginLeft: 6, marginTop: 4 }}>{value}</div>
    </div>
);

const MetadataSection: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return (
        <Form noValidate>
            <InputContainer>
                <TitleLabel htmlFor="title-field" />
                <Input
                    id="title-field"
                    value={event.title}
                    disabled
                    css={{ width: "100%" }}
                />
            </InputContainer>

            <InputContainer>
                <label htmlFor="description-field">
                    {t("upload.metadata.description")}
                </label>
                <TextArea id="description-field" disabled value={event.description ?? ""} />
            </InputContainer>
        </Form>
    );
};

const HostRealms: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return <>
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>{t("manage.my-videos.referencing-pages")}</h2>
        {event.hostRealms.length === 0
            ? <i>{t("manage.my-videos.no-referencing-pages")}</i>
            : <>
                <p>{t("manage.my-videos.referencing-pages-explanation")}</p>
                <ul>{event.hostRealms.map(realm => <li key={realm.id}>
                    <Link to={realm.path}>{
                        realm.isRoot
                            ? <i>{t("general.homepage")}</i>
                            : realm.name
                    }</Link>
                </li>)}</ul>
            </>}
    </>;
};

const TechnicalDetails: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return <>
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>{t("manage.my-videos.technical-details")}</h2>
        <div>
            <span css={{ color: "var(--grey40)", marginRight: 8 }}>
                {t("manage.my-videos.opencast-id") + ":"}
            </span>
            <code css={{ fontSize: 14 }}>{event.opencastId}</code>
        </div>
        {event.syncedData && <div css={{ marginTop: 8 }}>
            <span css={{ color: "var(--grey40)", marginRight: 8 }}>
                {t("manage.my-videos.available-resolutions") + ":"}
            </span>
            {(event.syncedData?.tracks ?? [])
                .map(track => track.resolution)
                .filter((r): r is number[] => r !== null)
                .sort((a, b) => a[0] - b[0])
                .map(r => r.join("x"))
                .join(", ")
            }
        </div>}
    </>;
};
