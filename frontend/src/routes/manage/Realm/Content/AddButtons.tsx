import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { RecordProxy, RecordSourceProxy } from "relay-runtime";
import {
    FiPlus,
    FiAlignLeft,
    FiType,
    FiGrid,
    FiFilm,
} from "react-icons/fi";

import { AddButtonsRealmData$key } from "./__generated__/AddButtonsRealmData.graphql";
import { bug } from "../../../../util/err";
import { Button, ButtonGroup } from "./util";


type Props = {
    index: number;
    realm: AddButtonsRealmData$key;
};

export const AddButtons: React.FC<Props> = ({ index, realm }) => {
    const { t } = useTranslation();

    const { id: realmId } = useFragment(graphql`
        fragment AddButtonsRealmData on Realm {
            id
        }
    `, realm);

    const env = useRelayEnvironment();

    const addBlock = (
        type: string,
        prepareBlock?: (store: RecordSourceProxy, block: RecordProxy) => void,
    ) => {
        commitLocalUpdate(env, store => {
            const realm = store.get(realmId) ?? bug("could not find realm");

            const blocks = [
                ...realm.getLinkedRecords("blocks") ?? bug("realm does not have blocks"),
            ];

            const id = "clNEWBLOCK";
            const block = store.create(id, `${type}Block`);
            prepareBlock?.(store, block);
            block.setValue(true, "editMode");
            block.setValue(id, "id");

            blocks.splice(index, 0, block);

            realm.setLinkedRecords(blocks, "blocks");
        });
    };

    return <ButtonGroup css={{ alignSelf: "center" }}>
        <span
            title={t("manage.realm.content.add")}
            css={{
                color: "white",
                backgroundColor: "var(--grey20)",
            }}
        >
            <FiPlus />
        </span>
        <Button title={t("manage.realm.content.add-title")} onClick={() => addBlock("Title")}>
            <FiType />
        </Button>
        <Button title={t("manage.realm.content.add-text")} onClick={() => addBlock("Text")}>
            <FiAlignLeft />
        </Button>
        <Button
            title={t("manage.realm.content.add-series")}
            onClick={() => addBlock("Series", (_store, block) => {
                block.setValue("NEW_TO_OLD", "order");
                block.setValue("GRID", "layout");
                block.setValue(true, "showTitle");
            })}
        >
            <FiGrid />
        </Button>
        <Button
            title={t("manage.realm.content.add-video")}
            onClick={() => addBlock("Video", (_store, block) => {
                block.setValue(true, "showTitle");
            })}
        >
            <FiFilm />
        </Button>
    </ButtonGroup>;
};
