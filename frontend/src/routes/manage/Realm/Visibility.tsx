import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useState } from "react";
import { Button, Spinner, boxError } from "@opencast/appkit";

import type {
    VisibilityRealmData$data,
    VisibilityRealmData$key,
} from "./__generated__/VisibilityRealmData.graphql";
import { displayCommitError } from "./util";


const fragment = graphql`
    fragment VisibilityRealmData on Realm {
        id
        visible
        showInMenu
        isMainRoot
    }
`;

// We request the exact same data as in the query so that relay can update all
// internal data and everything is up to date.
const setVisibilityMutation = graphql`
    mutation VisibilitySetRealmVisibilityMutation(
        $id: ID!, $visible: Boolean, $showInMenu: Boolean
    ) {
        setRealmVisibility(id: $id, visible: $visible, showInMenu: $showInMenu) {
            ... VisibilityRealmData
        }
    }
`;

type Props = {
    fragRef: VisibilityRealmData$key;
};

/** The actual implementation with a given realm path */
export const Visibility: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();
    const realm = useFragment(fragment, fragRef);

    return <>
        <h2>{t("manage.realm.visibility.heading")}</h2>
        {realm.isMainRoot
            ? <p>{t("manage.realm.visibility.root-note")}</p>
            : <VisibilityForm realm={realm} />}
    </>;
};

type VisibilityFormProps = {
    realm: VisibilityRealmData$data;
};

const VisibilityForm: React.FC<VisibilityFormProps> = ({ realm }) => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(realm.visible);
    const [showInMenu, setShowInMenu] = useState(realm.showInMenu);

    // Check if anything has changed
    const anyChange = visible !== realm.visible || showInMenu !== realm.showInMenu;

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(setVisibilityMutation);
    const save = async () => {
        commit({
            variables: {
                id: realm.id,
                visible,
                showInMenu,
            },
            onError: e => {
                setCommitError(displayCommitError(e, t("manage.realm.visibility.failed")));
            },
        });
    };


    type ToggleOptionProps = {
        label: string;
        description: string;
        checked: boolean;
        onChange: (checked: boolean) => void;
    };

    const ToggleOption: React.FC<ToggleOptionProps> = ({
        label, description, checked, onChange,
    }) => (
        <div css={{ margin: 6 }}>
            <label css={{ display: "flex" }}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                    css={{
                        alignSelf: "center",
                        marginRight: 14,
                        height: 16,
                        width: 16,
                        flexShrink: 0,
                    }}
                />
                {label}
            </label>
            <p css={{ fontWeight: "normal", fontSize: 14, margin: "4px 0 0 30px" }}>
                {description}
            </p>
        </div>
    );

    return <div>
        <ToggleOption
            label={t("manage.realm.visibility.visible")}
            description={t("manage.realm.visibility.visible-description")}
            checked={visible}
            onChange={setVisible}
        />
        <ToggleOption
            label={t("manage.realm.visibility.show-in-menu")}
            description={t("manage.realm.visibility.show-in-menu-description")}
            checked={showInMenu}
            onChange={setShowInMenu}
        />

        <div css={{ display: "flex", alignItems: "center" }}>
            <Button onClick={save} disabled={!anyChange}>{t("general.action.save")}</Button>
            {isInFlight && <Spinner size={20} css={{ marginLeft: 16 }} />}
        </div>
        {boxError(commitError)}
    </div>;
};
