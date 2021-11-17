import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiArrowDown, FiArrowUp, FiEdit } from "react-icons/fi";

import type {
    EditButtonsRealmData$key,
} from "../../../../../query-types/EditButtonsRealmData.graphql";
import { Button, ButtonGroup } from "../util";
import { RemoveButton } from "./RemoveButton";


type Props = {
    realm: EditButtonsRealmData$key;
    index: number;
};

export const EditButtons: React.FC<Props> = ({ realm, index }) => {
    const { t } = useTranslation();

    const { blocks } = useFragment(graphql`
        fragment EditButtonsRealmData on Realm {
            blocks {
                ... RemoveButtonData
            }
        }
    `, realm);

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
        <Button title={t("manage.realm.content.move-down")} disabled={index === blocks.length - 1}>
            <FiArrowDown />
        </Button>
        <Button title={t("manage.realm.content.move-up")} disabled={index === 0}>
            <FiArrowUp />
        </Button>
        <Button title={t("manage.realm.content.edit")}>
            <FiEdit />
        </Button>
        <RemoveButton block={blocks[index]} />
    </ButtonGroup>;
};
