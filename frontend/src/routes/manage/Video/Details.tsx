import { useTranslation } from "react-i18next";
import { FiExternalLink } from "react-icons/fi";

import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Form } from "../../../ui/Form";
import { CopyableInput, Input, TextArea } from "../../../ui/Input";
import { InputContainer, TitleLabel } from "../../../ui/metadata";
import { useUser } from "../../../User";
import { Button } from "../../../ui/Button";
import CONFIG from "../../../config";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { AuthorizedEvent, makeManageVideoRoute, PAGE_WIDTH } from "./Shared";
import { authenticateLink } from "../../../relay/auth";


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    event => <Page event={event} />,
);

type Props = {
    event: AuthorizedEvent;
};

const Page: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    const breadcrumbs = [
        { label: t("manage.management"), link: "/~manage" },
        { label: t("manage.my-videos.title"), link: "/~manage/videos" },
    ];

    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }

    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <PageTitle title={t("manage.my-videos.details.title")} />
        <section css={{
            width: PAGE_WIDTH,
            maxWidth: "100%",
            marginBottom: 32,
        }}>
            <UpdatedCreatedInfo event={event} />
            <div css={{ margin: "8px 2px", flex: "1 0 auto" }}>
                {user.canUseEditor && event.canWrite && (
                    <Button
                        onClick={() => linkToEditor(event.opencastId)}
                        css={{ marginBottom: 16 }}
                    >
                        {t("manage.my-videos.details.open-in-editor")} <FiExternalLink size={16} />
                    </Button>
                )}
                <DirectLink event={event} />
                <MetadataSection event={event} />
            </div>
        </section>
        <section css={{ marginBottom: 32 }}>
            <HostRealms event={event} />
        </section>
    </>;
};

const linkToEditor = async (id: string) => {
    const editorUrl = new URL(CONFIG.opencast.editorUrl);
    editorUrl.searchParams.append("mediaPackageId", id);
    const authenticatedUrl = await authenticateLink(editorUrl);
    window.open(authenticatedUrl, "_blank");
};

const DirectLink: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const url = new URL(`/!v/${event.id.slice(2)}`, document.baseURI);

    return (
        <div css={{ marginBottom: 40 }}>
            <div css={{ marginBottom: 4 }}>
                {t("manage.my-videos.details.share-direct-link") + ":"}
            </div>
            <CopyableInput
                value={url.href}
                css={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
            />
        </div>
    );
};

/** Shows the `created` and `updated` timestamps. */
const UpdatedCreatedInfo: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const created = new Date(event.created).toLocaleString(i18n.language);
    const updated = event.syncedData?.updated == null
        ? null
        : new Date(event.syncedData.updated).toLocaleString(i18n.language);

    return (
        <div css={{ marginBottom: 16, fontSize: 14 }}>
            <DateValue label={t("video.created")} value={created} />
            {updated && <DateValue label={t("video.updated")} value={updated} />}
        </div>
    );
};

type DateValueProps = {
    label: string;
    value: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, value }) => (
    <span css={{ "&:not(:last-child):after": { content: "'•'", margin: "0 12px" } }}>
        <span css={{ color: "var(--grey40)", lineHeight: 1 }}>{label + ":"}</span>
        <span css={{ marginLeft: 6, marginTop: 4 }}>{value}</span>
    </span>
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
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>
            {t("manage.my-videos.details.referencing-pages")}
        </h2>
        {event.hostRealms.length === 0
            ? <i>{t("manage.my-videos.details.no-referencing-pages")}</i>
            : <>
                <p>{t("manage.my-videos.details.referencing-pages-explanation")}</p>
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
