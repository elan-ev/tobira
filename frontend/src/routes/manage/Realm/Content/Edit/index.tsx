import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiEdit } from "react-icons/fi";

import type {
    EditButtonsRealmData$key,
} from "./__generated__/EditButtonsRealmData.graphql";
import { Button, ButtonGroup as BaseButtonGroup } from "../util";
import { RemoveButton } from "./RemoveButton";
import { MoveButtons } from "./MoveButtons";
import { WithTooltip } from "../../../../../ui/Floating";


type Props = {
    realm: EditButtonsRealmData$key;
    index: number;
    onCommit?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error, action: string) => void;
    onEdit?: () => void;
};

export const EditButtons: React.FC<Props> = ({
    realm: realmRef,
    index,
    onCommit,
    onCompleted,
    onError,
    onEdit,
}) => {
    const { t } = useTranslation();

    const realm = useFragment(graphql`
        fragment EditButtonsRealmData on Realm {
            ... MoveButtonsData
            blocks {
                ... RemoveButtonData
            }
            nameSource {
                ... on RealmNameFromBlock {
                    block { id }
                }
            }
        }
    `, realmRef);
    const { blocks } = realm;

    const onMoveError = (error: Error) => {
        onError?.(error, "manage.realm.content.moving-failed");
    };

    return <ButtonGroup css={{ marginTop: -8 }}>
        <MoveButtons {...{ realm, index, onCommit, onCompleted }} onError={onMoveError} />
        <WithTooltip tooltip={t("manage.realm.content.edit")}>
            <Button onClick={onEdit}>
                <FiEdit />
            </Button>
        </WithTooltip>
        <RemoveButton
            block={blocks[index]}
            onConfirm={onCompleted}
            nameSourceBlock={realm.nameSource?.block?.id}
        />
    </ButtonGroup>;
};

type ButtonGroupProps = React.ComponentProps<typeof BaseButtonGroup>;

export const ButtonGroup: React.FC<ButtonGroupProps> = props => (
    <BaseButtonGroup css={{
        float: "right",
        borderTop: "none",
        borderRight: "none",
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        marginRight: -8,
    }} {...props} />
);

// For use in block mutations that might have an effect on the realm name.
// Only used to be included in queries in order to update the store
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
graphql`
    fragment EditBlockUpdateRealmNameData on Block {
        realm {
            name,
            nameSource {
                ... on RealmNameFromBlock {
                    block { id }
                }
            }
        }
    }
`;
