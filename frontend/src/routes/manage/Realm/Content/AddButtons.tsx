import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { RecordProxy, RecordSourceProxy } from "relay-runtime";
import { FiPlus, FiType, FiGrid, FiFilm, FiHash } from "react-icons/fi";

import { AddButtonsRealmData$key } from "./__generated__/AddButtonsRealmData.graphql";
import { bug } from "../../../../util/err";
import { IconType } from "react-icons";
import { useOnOutsideClick } from "../../../../util";


type Props = {
    index: number;
    realm: AddButtonsRealmData$key;
};

export const AddButtons: React.FC<Props> = ({ index, realm }) => {
    const { t } = useTranslation();

    const outerRef = useRef(null);
    const [opened, setOpened] = useState(false);
    useOnOutsideClick(outerRef, () => setOpened(false));

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

    const BUTTON_SIZE = 36;

    return (
        <div ref={outerRef} css={{
            position: "relative",
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            alignSelf: "center",
        }}>
            <div
                title={t("manage.realm.content.add")}
                onClick={() => setOpened(opened => !opened)}
                css={{
                    cursor: "pointer",
                    width: "100%",
                    height: "100%",
                    fontSize: 24,
                    borderRadius: 4,
                    backgroundColor: "var(--accent-color)",
                    color: "var(--accent-color-bw-contrast)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&:hover, &:focus": {
                        backgroundColor: "var(--accent-color-darker)",
                    },
                }}
            >
                <FiPlus />
            </div>
            {opened && <div css={{
                position: "absolute",
                bottom: BUTTON_SIZE + 12,
                left: "50%",
                transform: "translate(-50%)",
                backgroundColor: "white",
                boxShadow: "1px 1px 12px rgba(0, 0, 0, 30%)",
                width: 200,
                borderRadius: 8,
                overflow: "hidden",
                zIndex: 100,
            }}>
                <div css={{
                    fontSize: 14,
                    color: "var(--grey40)",
                    padding: "8px 16px",
                    cursor: "default",
                }}>{t("manage.realm.content.add-popup-title")}</div>
                <ul css={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    "& > li": {
                        "&:not(:last-child)": {
                            borderBottom: "1px solid var(--grey92)",
                        },
                    },
                }}>
                    <AddItem
                        close={() => setOpened(false)}
                        Icon={FiHash}
                        label={t("manage.realm.content.add-title")}
                        onClick={() => addBlock("Title")}
                    />
                    <AddItem
                        close={() => setOpened(false)}
                        Icon={FiType}
                        label={t("manage.realm.content.add-text")}
                        onClick={() => addBlock("Text")}
                    />
                    <AddItem
                        close={() => setOpened(false)}
                        Icon={FiGrid}
                        label={t("manage.realm.content.add-series")}
                        onClick={() => addBlock("Series", (_store, block) => {
                            block.setValue("NEW_TO_OLD", "order");
                            block.setValue(true, "showTitle");
                            block.setValue(false, "showMetadata");
                        })}
                    />
                    <AddItem
                        close={() => setOpened(false)}
                        Icon={FiFilm}
                        label={t("manage.realm.content.add-video")}
                        onClick={() => addBlock("Video", (_store, block) => {
                            block.setValue(true, "showTitle");
                        })}
                    />
                </ul>
            </div>}
        </div>
    );
};

type AddItemProps = {
    label: string;
    Icon: IconType;
    onClick: () => void;
    close: () => void;
};

const AddItem: React.FC<AddItemProps> = ({ label, Icon, onClick, close }) => (
    <li>
        <button
            onClick={() => {
                onClick();
                close();
            }}
            css={{
                width: "100%",
                height: "100%",
                padding: "6px 16px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                backgroundColor: "transparent",
                cursor: "pointer",
                border: "none",
                "&:hover, &:focus": {
                    backgroundColor: "var(--grey97)",
                },
            }}
        >
            {<Icon css={{ color: "var(--accent-color)", fontSize: 18 }}/>}
            {label}
        </button>
    </li>
);
