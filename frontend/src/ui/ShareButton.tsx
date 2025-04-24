import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuQrCode, LuShare2 } from "react-icons/lu";
import { QRCodeCanvas } from "qrcode.react";
import {
    useColorScheme, Floating, FloatingContainer, FloatingTrigger, Button, ProtoButton,
} from "@opencast/appkit";

import { currentRef } from "../util";
import { focusStyle } from "../ui";
import { COLORS } from "../color";
import { Modal, ModalHandle } from "../ui/Modal";


export type ShareButtonProps = {
    tabs: Record<string, {
        label: string;
        Icon: React.ComponentType;
        Component: React.ComponentType;
    }>;
    onOpen: () => void;
};

export const ShareButton: React.FC<ShareButtonProps> = ({ tabs, onOpen }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef(null);

    const tabStyle = {
        display: "flex",
        flexDirection: "column",
        flex: `1 calc(100% / ${Object.keys(tabs).length})`,
        backgroundColor: COLORS.neutral20,
        paddingBottom: 4,
        cursor: "pointer",
        alignItems: "center",
        borderRight: `1px solid ${COLORS.neutral40}`,
        borderTop: "none",
        borderBottom: `1px solid ${COLORS.neutral40}`,
        ":is(:first-child)": { borderTopLeftRadius: 4 },
        ":is(:last-child)": {
            borderRight: "none",
            borderTopRightRadius: 4,
        },
        "& > svg": {
            width: 32,
            height: 32,
            color: COLORS.primary1,
            padding: "8px 4px 4px",
        },
        "&[disabled]": {
            cursor: "default",
            backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral05,
            borderBottom: "none",
            svg: { color: COLORS.primary0 },
        },
        ":not([disabled])": {
            "&:hover": { backgroundColor: COLORS.neutral15 },
        },
        ...focusStyle({ inset: true }),

        // By using the `has()` selector, these styles only get applied
        // to non-firefox browsers. Once firefox supports that selector,
        // this border radius stuff should get refactored.
        ":has(svg)": {
            "&[disabled]": {
                borderRight: "none",
                "+ button": {
                    borderLeft: `1px solid ${COLORS.neutral40}`,
                    borderBottomLeftRadius: 4,
                },
            },
            ":not([disabled]):has(+ button[disabled])": {
                borderBottomRightRadius: 4,
                borderLeft: "none",
            },
        },
    } as const;

    const header = <div css={{ display: "flex" }}>
        {Object.entries(tabs).map(([id, { label, Icon }]) => (
            <ProtoButton
                disabled={id === activeTab}
                key={id}
                onClick={() => setActiveTab(id)}
                css={tabStyle}
            >
                <Icon />
                {label}
            </ProtoButton>
        ))}
    </div>;

    const TabComponent = activeTab && tabs[activeTab].Component;

    return (
        <FloatingContainer
            ref={ref}
            placement="top"
            arrowSize={12}
            ariaRole="dialog"
            open={activeTab !== null}
            onClose={() => setActiveTab(null)}
            viewPortMargin={12}
        >
            {/* Share Button */}
            <FloatingTrigger>
                <Button onClick={() => {
                    setActiveTab(state => state === null ? Object.keys(tabs)[0] : null);
                    if (activeTab == null) {
                        onOpen();
                    }
                }}>
                    <LuShare2 size={16} />
                    {t("general.action.share")}
                </Button>
            </FloatingTrigger>

            {/* Share Menu */}
            <Floating
                padding={0}
                backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                css={{
                    height: 240,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {header}
                <div css={{
                    margin: 16,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    fontSize: 14,
                    width: 400,
                }}>{TabComponent && <TabComponent />}</div>
            </Floating>
        </FloatingContainer>
    );
};

type QrCodeButtonProps = {
    target: string;
    label: string;
};

export const QrCodeButton: React.FC<QrCodeButtonProps> = ({ target, label }) => {
    const { t } = useTranslation();
    const qrModalRef = useRef<ModalHandle>(null);

    return <>
        <Button
            onClick={() => currentRef(qrModalRef).open()}
            css={{ width: "max-content" }}
        >
            <LuQrCode />
            {t("video.share.show-qr-code")}
        </Button>
        <Modal
            ref={qrModalRef}
            title={label}
            css={{ minWidth: "max-content" }}
            closeOnOutsideClick
        >
            <div css={{ display: "flex", justifyContent: "center" }}>
                <QRCodeCanvas
                    value={target}
                    size={250}
                    css={{
                        margin: 16,
                        outline: "8px solid #FFFFFF",
                    }}
                />
            </div>
        </Modal>
    </>;
};
