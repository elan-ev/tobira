import { ParseKeys } from "i18next";
import { ReactNode, PropsWithChildren, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormProvider } from "react-hook-form";
import { UseMutationConfig } from "react-relay";
import { MutationParameters } from "relay-runtime";
import { boxError } from "@opencast/appkit";

import { ManageRoute } from "..";
import { COLORS } from "../../../color";
import { PageTitle } from "../../../layout/header/ui";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { NotAuthorized } from "../../../ui/error";
import { CopyableInput, InputWithCheckbox, TimeInput } from "../../../ui/Input";
import {
    MetadataFields,
    MetadataForm,
    SubmitButtonWithStatus,
    useMetadataForm,
} from "../../../ui/metadata";
import { useUser, isRealUser } from "../../../User";
import { secondsToTimeString } from "../../../util";
import { PAGE_WIDTH } from "./Nav";
import { displayCommitError } from "../Realm/util";


type NarrowedAssetType = {
    id: string;
    title: string;
    created?: string | null;
    updated?: string | null;
    description? : string | null;
    urlProps: {
        url: URL;
        withTimestamp?: boolean;
    };
}

export type SharedDetailsProps = {
    asset: NarrowedAssetType;
}
type PageProps = SharedDetailsProps & {
    pageTitle: ParseKeys;
    breadcrumb: {
        label: string;
        link: string;
    };
    sections: (item: NarrowedAssetType) => ReactNode[];
};
export const DetailsPage: React.FC<PageProps> = ({ asset, pageTitle, breadcrumb, sections }) => {
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
        <Breadcrumbs path={breadcrumbs} tail={asset.title} />
        <PageTitle title={t(pageTitle)} />
        {sections(asset).map((section, i) => (
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
export const UpdatedCreatedInfo: React.FC<SharedDetailsProps> = ({ asset }) => {
    const { t, i18n } = useTranslation();
    const created = asset.created && new Date(asset.created).toLocaleString(i18n.language);

    const updated = asset.updated == null
        ? null
        : new Date(asset.updated).toLocaleString(i18n.language);

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

export const DirectLink: React.FC<SharedDetailsProps> = ({ asset }) => {
    const { t } = useTranslation();
    const [timestamp, setTimestamp] = useState(0);
    const [checkboxChecked, setCheckboxChecked] = useState(false);

    const url = (asset.urlProps.withTimestamp && timestamp && checkboxChecked)
        ? new URL(asset.urlProps.url + `?t=${secondsToTimeString(timestamp)}`)
        : asset.urlProps.url;

    return <div css={{ marginBottom: 40, maxWidth: 750 }}>
        <div css={{ marginBottom: 4 }}>
            {t("manage.shared.details.share-direct-link") + ":"}
        </div>
        <CopyableInput
            label={t("manage.shared.details.copy-direct-link-to-clipboard")}
            value={url.href}
            css={{ width: "100%", fontSize: 14, marginBottom: 6 }}
        />
        {asset.urlProps.withTimestamp && <InputWithCheckbox
            {...{ checkboxChecked, setCheckboxChecked }}
            label={t("manage.my-videos.details.set-time")}
            input={<TimeInput {...{ timestamp, setTimestamp }} disabled={!checkboxChecked} />}
        />}
    </div>;
};


type MetadataInput = {
    title: string;
    description: string;
};

type DetailsMetadataSectionProps<TMutation extends MutationParameters> = SharedDetailsProps & {
    commit?: (config: UseMutationConfig<TMutation>) => Disposable;
    inFlight?: boolean;
}

export const DetailsMetadataSection = <TMutation extends MutationParameters>({
    asset,
    commit,
    inFlight,
}: DetailsMetadataSectionProps<TMutation>) => {
    const { t } = useTranslation();
    const {
        formMethods,
        success,
        setSuccess,
        commitError,
        setCommitError,
    } = useMetadataForm<MetadataInput>({
        title: asset.title,
        description: asset.description ?? "",
    });

    const { handleSubmit, reset, formState: { isValid, isDirty } } = formMethods;

    const onSubmit = commit && handleSubmit(({ title, description }) => {
        commit({
            variables: { id: asset.id, title, description },
            onCompleted: () => {
                setSuccess(true);
                reset({ title, description });
            },
            onError: error => setCommitError(displayCommitError(error)),
        });
    });

    return <>
        <FormProvider {...formMethods}>
            <MetadataForm hasError={!!commitError}>
                {/* Title & Description */}
                <MetadataFields disabled={!commit} />
                {/* Submit */}
                {onSubmit && <SubmitButtonWithStatus
                    label={t("metadata-form.save")}
                    onClick={onSubmit}
                    disabled={!!commitError || !isValid || !isDirty || inFlight}
                    inFlight={inFlight}
                    success={success && !isDirty}
                />}
            </MetadataForm>
        </FormProvider>
        {boxError(commitError)}
    </>;
};
