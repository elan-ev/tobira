import { useRef, useState, RefObject, SetStateAction, PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFragment } from "react-relay";
import { Card, ConfirmationModalHandle, boxError } from "@opencast/appkit";

import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { Acl, AclSelector, AclEditButtons, knownRolesFragment } from "../../../ui/Access";
import { READ_WRITE_ACTIONS } from "../../../util/permissionLevels";
import { AclArray } from "../../Upload";
import { mapAcl } from "../../util";
import { ManageRoute } from "..";
import CONFIG from "../../../config";
import { PageTitle } from "../../../layout/header/ui";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { NotAuthorized } from "../../../ui/error";
import { useUser, isRealUser } from "../../../User";


type AclPageProps = PropsWithChildren<{
    note?: ReactNode;
    breadcrumbTails: {
        label: string;
        link: string;
    }[];
}>

export const AclPage: React.FC<AclPageProps> = ({ children, note, breadcrumbTails }) => {
    const { t } = useTranslation();
    const user = useUser();

    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    const breadcrumbs = [
        { label: t("user.manage-content"), link: ManageRoute.url },
        ...breadcrumbTails,
    ];

    return <>
        <Breadcrumbs path={breadcrumbs} tail={t("manage.shared.acl.title")} />
        <PageTitle title={t("manage.shared.acl.title")} />
        {note}
        <br />
        {CONFIG.allowAclEdit
            ? children
            : <Card kind="info">{t("manage.access.editing-disabled")}</Card>
        }
    </>;
};

export type SubmitAclProps = {
    selections: Acl;
    saveModalRef: RefObject<ConfirmationModalHandle>;
    setCommitError: (value: SetStateAction<JSX.Element | null>) => void;
}

type AccessEditorProps = {
  rawAcl: AclArray;
  onSubmit: ({ selections, saveModalRef, setCommitError }: SubmitAclProps) => Promise<void>;
  inFlight: boolean;
  data: AccessKnownRolesData$key;
  editingBlocked?: boolean;
};

export const AccessEditor: React.FC<AccessEditorProps> = ({
    rawAcl,
    onSubmit,
    inFlight,
    data,
    editingBlocked = false,
}) => {
    const knownRoles = useFragment(knownRolesFragment, data);
    const saveModalRef = useRef<ConfirmationModalHandle>(null);
    const acl = mapAcl(rawAcl);
    const [selections, setSelections] = useState<Acl>(acl);
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);

    return <div css={{ maxWidth: 1040 }}>
        <div css={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div {...(editingBlocked && { inert: "true" })} css={{
                ...editingBlocked && { opacity: 0.7 },
            }}>
                <AclSelector
                    acl={selections}
                    onChange={setSelections}
                    knownRoles={knownRoles}
                    permissionLevels={READ_WRITE_ACTIONS}
                />
                <AclEditButtons
                    selections={selections}
                    setSelections={setSelections}
                    initialAcl={acl}
                    inFlight={inFlight}
                    saveModalRef={saveModalRef}
                    onSubmit={() => onSubmit({ selections, saveModalRef, setCommitError })}
                    kind="write"
                />
            </div>
            {boxError(commitError)}
        </div>
    </div>;
};
