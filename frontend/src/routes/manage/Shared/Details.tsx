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
import { CopyableInput, TimeInputWithCheckbox } from "../../../ui/Input";
import { MetadataFields, MetadataForm, SubmitButtonWithStatus } from "../../../ui/metadata";
import { useUser, isRealUser } from "../../../User";
import { OcEntity, Inertable, isSynced, OpencastEntity, secondsToTimeString } from "../../../util";
import { PAGE_WIDTH } from "./Nav";
import { displayCommitError } from "../Realm/util";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../ui/Modal";
import { Link, useRouter } from "../../../router";
import { useNotification } from "../../../ui/NotificationContext";
import { preciseDateTime, preferredLocaleForLang } from "../../../ui/time";


type UrlProps = {
    url: URL;
    withTimestamp?: boolean;
};

type Item = OpencastEntity & {
    id: string;
    title: string;
    description?: string | null;
}

type PageProps<T> = {
    item: T;
    pageTitle: ParseKeys;
    breadcrumb: {
        label: string;
        link: string;
    };
    sections: (item: T) => ReactNode[];
};

export const DetailsPage = <T extends Item>({
    item,
    pageTitle,
    breadcrumb,
    sections,
}: PageProps<T>) => {
    const { t } = useTranslation();
    const breadcrumbs = [
        { label: t("user.manage"), link: ManageRoute.url },
        breadcrumb,
    ];

    const user = useUser();
    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    return <div css={{ maxWidth: 750 }}>
        <Breadcrumbs path={breadcrumbs} tail={item.title} />
        <PageTitle title={t(pageTitle)} />
        {sections(item).map((section, i) => <DetailsSection key={i}>{section}</DetailsSection>)}
    </div>;
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
    const locale = preferredLocaleForLang(i18n.language);
    const { updated, created } = item;

    return (
        <div css={{ marginBottom: 16, fontSize: 14 }}>
            {created && (
                <span css={{ "&:not(:last-child):after": { content: "'•'", margin: "0 12px" } }}>
                    <DateValue
                        label={t("manage.table.sorting.created")}
                        date={preciseDateTime(new Date(created), locale)}
                    />
                </span>
            )}
            {updated && <DateValue
                label={t("manage.table.updated")}
                date={preciseDateTime(new Date(updated), locale)}
            />}
        </div>
    );
};

type DateValueProps = {
    label: string;
    date: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, date }) => <>
    <span css={{ color: COLORS.neutral60, lineHeight: 1 }}>{label + ":"}</span>
    <span css={{ marginLeft: 6, marginTop: 4 }}>{date}</span>
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
            {t("share.share-direct-link") + ":"}
        </div>
        <CopyableInput
            label={t("share.copy-direct-link-to-clipboard")}
            value={linkUrl.href}
            css={{ fontSize: 14 }}
        />
        {withTimestamp && <TimeInputWithCheckbox {...{
            timestamp, setTimestamp, checkboxChecked, setCheckboxChecked,
        }} />}
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
    item: Item;
    commit: (config: UseMutationConfig<TMutation>) => Disposable;
    inFlight?: boolean;
    disabled?: boolean;
}

export const MetadataSection = <TMutation extends MetadataMutationParams>({
    item,
    commit,
    inFlight,
    disabled = false,
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

    const onSubmit = handleSubmit(({ title, description }) => {
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

    return <Inertable isInert={disabled || !isSynced(item)}>
        <FormProvider {...formMethods}>
            <MetadataForm hasError={!!commitError}>
                {/* Title & Description */}
                <MetadataFields />
                {/* Submit */}
                <SubmitButtonWithStatus
                    label={t("manage.metadata-form.save")}
                    onClick={onSubmit}
                    disabled={!!commitError || !isValid || !isDirty || inFlight}
                    success={success && !isDirty}
                    timeout={10000}
                    {...{ inFlight, setSuccess }}
                />
            </MetadataForm>
        </FormProvider>
        {boxError(commitError)}
    </Inertable>;
};


export const ButtonSection: React.FC<PropsWithChildren> = ({ children }) => (
    <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {children}
    </div>
);


type DeleteMutationParams = MutationParameters & { variables: { id: string } }
type DeleteButtonProps<TMutation extends DeleteMutationParams> = PropsWithChildren<{
    item: Item
    kind: OcEntity;
    commit: (config: UseMutationConfig<TMutation>) => Disposable;
    returnPath: string;
}>;

export const DeleteButton = <TMutation extends DeleteMutationParams>({
    item,
    kind,
    commit,
    returnPath,
    children,
}: DeleteButtonProps<TMutation>) => {
    const { t } = useTranslation();
    const { setNotification } = useNotification();
    const modalRef = useRef<ConfirmationModalHandle>(null);
    const router = useRouter();

    const buttonText = t(`manage.${kind}.details.delete`);

    const onSubmit = () => {
        commit({
            variables: { id: item.id },
            updater: store => store.invalidateStore(),
            onCompleted: () => {
                currentRef(modalRef).done();
                setNotification({
                    kind: "info",
                    message: i18n => i18n.t(
                        "manage.table.deletion.in-progress", { itemTitle: item.title },
                    ),
                    scope: returnPath,
                });
                router.goto(returnPath);
            },
            onError: error => {
                const failedAction = t("manage.table.deletion.failed");
                currentRef(modalRef).reportError(displayCommitError(error, failedAction));
            },
        });
    };

    return <Inertable isInert={!isSynced(item)}>
        <Button kind="danger" onClick={() => currentRef(modalRef).open()}>
            <span css={{ whiteSpace: "normal", textWrap: "balance" }}>
                {buttonText}
            </span>
        </Button>
        <ConfirmationModal
            title={t(`manage.${kind}.details.confirm-delete`)}
            buttonContent={buttonText}
            onSubmit={onSubmit}
            ref={modalRef}
        >
            <p><Trans i18nKey="general.action.cannot-be-undone" /></p>
            {children}
        </ConfirmationModal>
    </Inertable>;
};

type HostRealmsProps = {
   hostRealms: readonly {
        readonly id: string;
        readonly isMainRoot: boolean;
        readonly name: string | null | undefined;
        readonly path: string;
    }[];
    itemLink: (path: string) => ReactNode;
    kind: OcEntity;
};

export const HostRealms: React.FC<HostRealmsProps> = ({ hostRealms, itemLink, kind }) => {
    const { t } = useTranslation();

    return <>
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>
            {t("manage.details.referencing-pages")}
        </h2>
        {hostRealms.length === 0
            ? <i>{t(`manage.${kind}.details.no-referencing-pages`)}</i>
            : <>
                <p>{t(`manage.${kind}.details.referencing-pages-explanation`)}</p>
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
