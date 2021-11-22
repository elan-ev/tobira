import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiEdit } from "react-icons/fi";

import type {
    EditButtonsRealmData$key,
} from "../../../../../query-types/EditButtonsRealmData.graphql";
import { Button, ButtonGroup } from "../util";
import { RemoveButton } from "./RemoveButton";
import { MoveButtons } from "./MoveButtons";


type Props = {
    realm: EditButtonsRealmData$key;
    index: number;
    onCommit?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error) => void;
};

export const EditButtons: React.FC<Props> = ({
    realm: realmRef,
    index,
    onCommit,
    onCompleted,
    onError,
}) => {
    const { t } = useTranslation();

    const realm = useFragment(graphql`
        fragment EditButtonsRealmData on Realm {
            ... MoveButtonsData
            blocks {
                ... RemoveButtonData
            }
        }
    `, realmRef);
    const { blocks } = realm;

    return <ButtonGroup css={{
        float: "right",
        borderTop: "none",
        borderRight: "none",
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        marginRight: -8,
        marginTop: -8,
    }}>
        <MoveButtons {...{ realm, index, onCommit, onCompleted, onError }} />
        <Button title={t("manage.realm.content.edit")}>
            <FiEdit />
        </Button>
        <RemoveButton block={blocks[index]} />
    </ButtonGroup>;
};
