import React, { RefObject, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { RecordProxy, RecordSourceProxy } from "relay-runtime";
import { LuPlus, LuHash, LuType, LuFilm, LuLayoutGrid, LuListVideo } from "react-icons/lu";
import {
    ProtoButton, bug, useColorScheme, Floating, FloatingContainer,
    FloatingHandle, FloatingTrigger, WithTooltip, useFloatingItemProps,
} from "@opencast/appkit";

import { AddButtonsRealmData$key } from "./__generated__/AddButtonsRealmData.graphql";
import { IconType } from "react-icons";
import { focusStyle } from "../../../../ui";
import { COLORS } from "../../../../color";
import { floatingMenuProps } from "../../../../util";


type Props = {
    index: number;
    realm: AddButtonsRealmData$key;
};

export const AddButtons: React.FC<Props> = ({ index, realm }) => {
    const { t } = useTranslation();
    const floatingRef = useRef<FloatingHandle>(null);

    const BUTTON_SIZE = 36;

    return (
        <FloatingContainer
            ref={floatingRef}
            trigger="click"
            placement="top"
            borderRadius={8}
            ariaRole="menu"
            distance={6}
            css={{ alignSelf: "center" }}
        >
            <FloatingTrigger>
                <div>
                    <WithTooltip
                        tooltip={
                            <div css={{ maxWidth: "35vw" }}>
                                {t("manage.realm.content.add")}
                            </div>
                        }
                        placement="right"
                    >
                        <ProtoButton aria-label={t("manage.realm.content.add")} css={{
                            width: BUTTON_SIZE,
                            height: BUTTON_SIZE,
                            fontSize: 24,
                            borderRadius: 4,
                            backgroundColor: COLORS.primary0,
                            color: COLORS.primary0BwInverted,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            "&:hover, &:focus": {
                                backgroundColor: COLORS.primary1,
                                color: COLORS.primary1BwInverted,
                            },
                            ...focusStyle({ offset: 1 }),
                        }}>
                            <LuPlus />
                        </ProtoButton>
                    </WithTooltip>
                </div>
            </FloatingTrigger>
            <AddButtonsMenu {...{ index, realm, floatingRef }} />
        </FloatingContainer>
    );
};

const AddButtonsMenu: React.FC<Props & {floatingRef: RefObject<FloatingHandle>}> = ({
    index, realm, floatingRef,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const { t } = useTranslation();
    const itemProps = useFloatingItemProps();
    const menuId = useId();

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

    type Block = "title" | "text" | "series" | "video" | "playlist";
    const buttonProps: [IconType, Block, () => void][] = [
        [LuHash, "title", () => addBlock("Title")],
        [LuType, "text", () => addBlock("Text")],
        [LuLayoutGrid, "series", () => addBlock("Series", (_store, block) => {
            block.setValue("NEW_TO_OLD", "order");
            block.setValue("GALLERY", "layout");
            block.setValue(true, "showTitle");
            block.setValue(false, "showMetadata");
        })],
        [LuFilm, "video", () => addBlock("Video", (_store, block) => {
            block.setValue(true, "showTitle");
            block.setValue(true, "showLink");
        })],
        [LuListVideo, "playlist", () => addBlock("Playlist", (_store, block) => {
            block.setValue("ORIGINAL", "order");
            block.setValue("GALLERY", "layout");
            block.setValue(true, "showTitle");
            block.setValue(false, "showMetadata");
        })],
    ];

    return (
        <Floating
            {...floatingMenuProps(isDark)}
            shadowBlur={12}
            shadowColor="rgba(0, 0, 0, 30%)"
            css={{ width: 200 }}
        >
            <div css={{
                fontSize: 14,
                color: COLORS.neutral60,
                padding: "8px 16px",
                cursor: "default",
            }}>{t("manage.realm.content.add-popup-title")}</div>
            <ul css={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                "& > li:not(:last-child)": {
                    borderBottom: `1px solid ${isDark ? COLORS.neutral25 : COLORS.neutral15}`,
                },
            }}>
                {buttonProps.map(([icon, type, onClick], index) => <AddItem
                    key={`${menuId}-${type}`}
                    close={() => floatingRef.current?.close()}
                    Icon={icon}
                    label={t(`manage.realm.content.add-${type}`)}
                    {...itemProps(index)}
                    {...{ onClick }}
                />)}
            </ul>
        </Floating>
    );
};

type AddItemProps = {
    label: string;
    Icon: IconType;
    onClick: () => void;
    close: () => void;
};

const AddItem = React.forwardRef<HTMLButtonElement, AddItemProps>(({
    label, Icon, onClick, close,
}, ref) => (
    <li role="menuitem" css={{
        "&:last-child > button": {
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
        },
    }}>
        <ProtoButton
            {...{ ref }}
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
                "&:hover, &:focus": {
                    backgroundColor: COLORS.neutral10,
                },
                ...focusStyle({ inset: true }),
            }}
        >
            {<Icon css={{ color: COLORS.primary0, fontSize: 18 }}/>}
            {label}
        </ProtoButton>
    </li>
));
