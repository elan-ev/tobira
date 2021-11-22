import React from "react";
import { useTranslation } from "react-i18next";
import { useFragment, graphql } from "react-relay";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";

import type { MoveButtonsData$key } from "../../../../../query-types/MoveButtonsData.graphql";
import { Button } from "../util";


type Props = {
    realm: MoveButtonsData$key;
    index: number;
};

export const MoveButtons: React.FC<Props> = ({ realm, index }) => {
    const { t } = useTranslation();

    const { blocks } = useFragment(graphql`
        fragment MoveButtonsData on Realm {
            # We need this list only for the length,
            # but we have to query *something* from it.
            blocks { id }
        }
    `, realm);

    return <>
        <Button title={t("manage.realm.content.move-down")} disabled={index === blocks.length - 1}>
            <FiArrowDown />
        </Button>
        <Button title={t("manage.realm.content.move-up")} disabled={index === 0}>
            <FiArrowUp />
        </Button>
    </>;
};
