import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { LuSquarePen } from "react-icons/lu";
import { WithTooltip } from "@opencast/appkit";

import type {
    EditButtonsRealmData$key,
} from "./__generated__/EditButtonsRealmData.graphql";
import { Button, ButtonGroup as BaseButtonGroup } from "../util";
import { RemoveButton } from "./RemoveButton";
import { MoveButtons } from "./MoveButtons";


type Props = {
    realm: EditButtonsRealmData$key;
    index: number;
    onCommit?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error, action: "manage.realm.content.moving-failed") => void;
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

    return <ButtonGroup>
        <MoveButtons {...{ realm, index, onCommit, onCompleted }} onError={onMoveError} />
        <WithTooltip tooltip={t("manage.realm.content.edit")}>
            <Button aria-label={t("manage.realm.content.edit")} onClick={onEdit}>
                <LuSquarePen />
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
        marginTop: -12,
        marginRight: -12,
    }} {...props} />
);

// For use in block mutations that might have an effect on the realm name.
// Only used to be included in queries in order to update the store
const _frag = graphql`
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
