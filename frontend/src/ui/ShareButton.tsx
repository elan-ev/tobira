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
import { Interpolation, Theme } from "@emotion/react";


export type ShareButtonProps = {
    tabs: Record<string, {
        label: string;
        Icon: React.ComponentType;
        render: () => React.ReactNode;
    }>;
    onOpen?: () => void;
    height: number;
    className?: string;
    hideLabel?: boolean;
};

export const ShareButton: React.FC<ShareButtonProps> = ({
    tabs, onOpen, height, className, hideLabel = false,
}) => {
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
        border: `1px solid ${COLORS.neutral40}`,
        borderTop: "none",
        ":is(:first-child)": {
            borderLeft: "none",
            borderTopLeftRadius: 4,
        },
        ":is(:last-child)": {
            borderRight: "none",
            borderTopRightRadius: 4,
        },
        "&[disabled]": {
            cursor: "default",
            backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral05,
            borderColor: "transparent",
            svg: { color: COLORS.primary0 },
        },
        ":not([disabled])": {
            "&:hover": { backgroundColor: COLORS.neutral15 },
        },
        ...focusStyle({ inset: true }),

        // Get rid of double border between to non-active tabs by always
        // hiding the left border of the right tab.
        ":not([disabled]) + :not([disabled])": {
            borderLeftColor: "transparent",
        },
        // Add radius to tab left of active tab.
        ":not([disabled]):has(+ button[disabled])": {
            borderBottomRightRadius: 4,
        },
        // Add radius to tab right of active tab.
        "&[disabled] + :not([disabled])": {
            borderBottomLeftRadius: 4,
        },

        "& > svg": {
            width: 32,
            height: 32,
            color: COLORS.primary1,
            padding: "8px 4px 4px",
        },
    } as const satisfies Interpolation<Theme>;

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
                <Button {...{ className }} onClick={() => {
                    setActiveTab(state => state === null ? Object.keys(tabs)[0] : null);
                    if (activeTab == null) {
                        onOpen?.();
                    }
                }}>
                    <LuShare2 size={16} />
                    {!hideLabel && t("general.action.share")}
                </Button>
            </FloatingTrigger>

            {/* Share Menu */}
            <Floating
                padding={0}
                backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                css={{
                    height,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {header}
                <div css={{
                    padding: 16,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    fontSize: 14,
                    width: 400,
                    maxWidth: "100%",
                }}>{activeTab && tabs[activeTab].render()}</div>
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
            {t("share.show-qr-code")}
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
