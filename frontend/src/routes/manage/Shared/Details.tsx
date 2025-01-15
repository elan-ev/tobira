import { ParseKeys } from "i18next";
import { ReactNode, PropsWithChildren, useState, useId } from "react";
import { useTranslation } from "react-i18next";

import { ManageRoute } from "..";
import { COLORS } from "../../../color";
import { PageTitle } from "../../../layout/header/ui";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { NotAuthorized } from "../../../ui/error";
import { CopyableInput, InputWithCheckbox, TimeInput, Input, TextArea } from "../../../ui/Input";
import { InputContainer, TitleLabel } from "../../../ui/metadata";
import { useUser, isRealUser } from "../../../User";
import { secondsToTimeString } from "../../../util";
import { PAGE_WIDTH } from "./Nav";
import { Form } from "../../../ui/Form";
import { Item } from "./Table";


type UrlProps = {
    url: URL;
    withTimestamp?: boolean;
};

type PageProps = {
    item: Item;
    pageTitle: ParseKeys;
    breadcrumb: {
        label: string;
        link: string;
    };
    sections: (item: Item) => ReactNode[];
};

export const DetailsPage: React.FC<PageProps> = ({ item, pageTitle, breadcrumb, sections }) => {
    const { t } = useTranslation();
    const breadcrumbs = [
        { label: t("user.manage-content"), link: ManageRoute.url },
        breadcrumb,
    ];

    const user = useUser();
    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    return <>
        <Breadcrumbs path={breadcrumbs} tail={item.title} />
        <PageTitle title={t(pageTitle)} />
        {sections(item).map((section, i) => (
            <DetailsSection key={i}>{section}</DetailsSection>
        ))}
    </>;
};

const DetailsSection: React.FC<PropsWithChildren> = ({ children }) => (
    <section css={{
        width: PAGE_WIDTH,
        maxWidth: "100%",
    }}>
        <div css={{ margin: "8px 2px", flex: "1 0 auto" }}>
            {children}
        </div>
    </section>
);

/** Shows the `created` and `updated` timestamps. */
export const UpdatedCreatedInfo: React.FC<{ item: Item }> = ({ item }) => {
    const { t, i18n } = useTranslation();
    const created = item.created && new Date(item.created).toLocaleString(i18n.language);

    const updated = item.updated == null
        ? null
        : new Date(item.updated).toLocaleString(i18n.language);

    return (
        <div css={{ marginBottom: 16, fontSize: 14 }}>
            {created && <DateValue label={t("manage.shared.created")} value={created} />}
            {updated && <DateValue label={t("manage.shared.updated")} value={updated} />}
        </div>
    );
};

type DateValueProps = {
    label: string;
    value: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, value }) => (
    <span css={{ "&:not(:last-child):after": { content: "'•'", margin: "0 12px" } }}>
        <span css={{ color: COLORS.neutral60, lineHeight: 1 }}>{label + ":"}</span>
        <span css={{ marginLeft: 6, marginTop: 4 }}>{value}</span>
    </span>
);

export const DirectLink: React.FC<UrlProps> = ({ url, withTimestamp }) => {
    const { t } = useTranslation();
    const [timestamp, setTimestamp] = useState(0);
    const [checkboxChecked, setCheckboxChecked] = useState(false);

    const linkUrl = (withTimestamp && timestamp && checkboxChecked)
        ? new URL(url + `?t=${secondsToTimeString(timestamp)}`)
        : url;

    return (
        <div css={{ marginBottom: 40 }}>
            <div css={{ marginBottom: 4 }}>
                {t("manage.shared.details.share-direct-link") + ":"}
            </div>
            <CopyableInput
                label={t("manage.shared.details.copy-direct-link-to-clipboard")}
                value={linkUrl.href}
                css={{ width: "100%", fontSize: 14, marginBottom: 6 }}
            />
            {withTimestamp && <InputWithCheckbox
                {...{ checkboxChecked, setCheckboxChecked }}
                label={t("manage.my-videos.details.set-time")}
                input={<TimeInput {...{ timestamp, setTimestamp }} disabled={!checkboxChecked} />}
            />}
        </div>
    );
};

export const MetadataSection: React.FC<{ item: Item }> = ({ item }) => {
    const { t } = useTranslation();
    const titleFieldId = useId();
    const descriptionFieldId = useId();

    return (
        <Form noValidate>
            <InputContainer>
                <TitleLabel htmlFor={titleFieldId} />
                <Input
                    id={titleFieldId}
                    value={item.title}
                    disabled
                    css={{ width: "100%" }}
                />
            </InputContainer>

            <InputContainer>
                <label htmlFor={descriptionFieldId}>
                    {t("upload.metadata.description")}
                </label>
                <TextArea id={descriptionFieldId} disabled value={item.description ?? ""} />
            </InputContainer>
        </Form>
    );
};
