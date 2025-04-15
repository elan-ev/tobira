import { ParseKeys } from "i18next";
import { ReactNode, PropsWithChildren, useState, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FormProvider, useForm } from "react-hook-form";
import { UseMutationConfig } from "react-relay";
import { MutationParameters, Disposable } from "relay-runtime";
import { boxError, Button, currentRef } from "@opencast/appkit";

import { ManageRoute } from "..";
import { COLORS } from "../../../color";
import { PageTitle } from "../../../layout/header/ui";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { NotAuthorized } from "../../../ui/error";
import { CopyableInput, InputWithCheckbox, TimeInput } from "../../../ui/Input";
import { MetadataFields, MetadataForm, SubmitButtonWithStatus } from "../../../ui/metadata";
import { useUser, isRealUser } from "../../../User";
import { secondsToTimeString } from "../../../util";
import { PAGE_WIDTH } from "./Nav";
import { displayCommitError } from "../Realm/util";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../ui/Modal";
import { Link, useRouter } from "../../../router";
import { useNotification } from "../../../ui/NotificationContext";


type UrlProps = {
    url: URL;
    withTimestamp?: boolean;
};

type PageProps<T> = {
    item: T;
    pageTitle: ParseKeys;
    breadcrumb: {
        label: string;
        link: string;
    };
    sections: (item: T) => ReactNode[];
};

export const DetailsPage = <T extends { title: string }>({
    item,
    pageTitle,
    breadcrumb,
    sections,
}: PageProps<T>) => {
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

type UpdatedCreatedInfoProps = {
    item: {
        created?: string | null;
        updated?: string | null;
    };
};

/** Shows the `created` and `updated` timestamps. */
export const UpdatedCreatedInfo: React.FC<UpdatedCreatedInfoProps> = ({ item }) => {
    const { t, i18n } = useTranslation();
    const created = item.created && new Date(item.created).toLocaleString(i18n.language);

    const updated = item.updated == null
        ? null
        : new Date(item.updated).toLocaleString(i18n.language);

    return (
        <div css={{ marginBottom: 16, fontSize: 14 }}>
            {created && (
                <span css={{ "&:not(:last-child):after": { content: "'•'", margin: "0 12px" } }}>
                    <DateValue label={t("manage.shared.created")} value={created} />
                </span>
            )}
            {updated && <DateValue label={t("manage.shared.updated")} value={updated} />}
        </div>
    );
};

type DateValueProps = {
    label: string;
    value: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, value }) => <>
    <span css={{ color: COLORS.neutral60, lineHeight: 1 }}>{label + ":"}</span>
    <span css={{ marginLeft: 6, marginTop: 4 }}>{value}</span>
</>;


export const DirectLink: React.FC<UrlProps> = ({ url, withTimestamp }) => {
    const { t } = useTranslation();
    const [timestamp, setTimestamp] = useState(0);
    const [checkboxChecked, setCheckboxChecked] = useState(false);

    const linkUrl = url;
    if (withTimestamp && timestamp && checkboxChecked) {
        linkUrl.searchParams.set("t", secondsToTimeString(timestamp));
    }

    return <div css={{ marginBottom: 40, maxWidth: 750 }}>
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
    </div>;
};


type MetadataInput = {
    title: string;
    description?: string | null;
};

type MetadataMutationParams = MutationParameters & {
    variables: {
        id: string;
        metadata: MetadataInput;
    };
}

type MetadataSectionProps<TMutation extends MetadataMutationParams> = {
    item: MetadataInput & {
        id: string;
    };
    commit?: (config: UseMutationConfig<TMutation>) => Disposable;
    inFlight?: boolean;
}

export const MetadataSection = <TMutation extends MetadataMutationParams>({
    item,
    commit,
    inFlight,
}: MetadataSectionProps<TMutation>) => {
    const { t } = useTranslation();
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [success, setSuccess] = useState(false);

    const formMethods = useForm<MetadataInput>({
        defaultValues: {
            title: item.title,
            description: item.description ?? "",
        },
    });

    const { handleSubmit, reset, formState: { isValid, isDirty } } = formMethods;

    const onSubmit = commit && handleSubmit(({ title, description }) => {
        commit({
            variables: {
                id: item.id,
                metadata: { title, description },
            },
            onCompleted: () => {
                setSuccess(true);
                reset({ title, description });
            },
            onError: error => setCommitError(displayCommitError(error)),
            updater: store => store.invalidateStore(),
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
                    {...{ inFlight, success, setSuccess }}
                />}
            </MetadataForm>
        </FormProvider>
        {boxError(commitError)}
    </>;
};


export const ButtonSection: React.FC<PropsWithChildren> = ({ children }) => (
    <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {children}
    </div>
);


type DeleteMutationParams = MutationParameters & { variables: { id: string } }
type DeleteButtonProps<TMutation extends DeleteMutationParams> = PropsWithChildren<{
    itemId: string;
    itemTitle: string;
    itemType: "video" | "series";
    commit: (config: UseMutationConfig<TMutation>) => Disposable;
    returnPath: string;
}>;

export const DeleteButton = <TMutation extends DeleteMutationParams>({
    itemId,
    itemTitle,
    itemType,
    commit,
    returnPath,
    children,
}: DeleteButtonProps<TMutation>) => {
    const { t } = useTranslation();
    const { setNotification } = useNotification();
    const modalRef = useRef<ConfirmationModalHandle>(null);
    const router = useRouter();

    const item = t(`manage.shared.item.${itemType}`);

    const onSubmit = () => {
        commit({
            variables: { id: itemId },
            updater: store => store.invalidateStore(),
            onCompleted: () => {
                currentRef(modalRef).done();
                setNotification({
                    kind: "info",
                    message: i18n => i18n.t("manage.shared.delete.in-progress", { itemTitle }),
                    scope: returnPath,
                });
                router.goto(returnPath);
            },
            onError: error => {
                const failedAction = t("manage.shared.delete.failed", { item: itemType });
                currentRef(modalRef).reportError(displayCommitError(error, failedAction));
            },
        });
    };

    return <>
        <Button kind="danger" onClick={() => currentRef(modalRef).open()}>
            <span css={{ whiteSpace: "normal", textWrap: "balance" }}>
                {t("manage.shared.delete.title", { item })}
            </span>
        </Button>
        <ConfirmationModal
            title={t("manage.shared.delete.confirm", { item })}
            buttonContent={t("manage.shared.delete.title", { item })}
            onSubmit={onSubmit}
            ref={modalRef}
        >
            <p><Trans i18nKey="manage.shared.delete.cannot-be-undone" /></p>
            {children}
        </ConfirmationModal>
    </>;
};

type HostRealmsProps = {
   hostRealms: readonly {
        readonly id: string;
        readonly isMainRoot: boolean;
        readonly name: string | null | undefined;
        readonly path: string;
    }[];
    itemLink: (path: string) => ReactNode;
    kind: "videos" | "series";
};

export const HostRealms: React.FC<HostRealmsProps> = ({ hostRealms, itemLink, kind }) => {
    const { t } = useTranslation();

    return <>
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>
            {t("manage.shared.details.referencing-pages")}
        </h2>
        {hostRealms.length === 0
            ? <i>{t(`manage.my-${kind}.details.no-referencing-pages`)}</i>
            : <>
                <p>{t(`manage.my-${kind}.details.referencing-pages-explanation`)}</p>
                <ul>{hostRealms.map(realm => (
                    <li key={realm.id}>
                        {realm.isMainRoot ? <i>{t("general.homepage")}</i> : realm.name}
                        &nbsp;
                        (<Link to={realm.path}>{t("general.page")}</Link>,
                        &nbsp;
                        {itemLink(realm.path)})
                    </li>
                ))}</ul>
            </>
        }
    </>;
};
