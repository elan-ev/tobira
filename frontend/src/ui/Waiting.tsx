import { useTranslation } from "react-i18next";
import { LuTruck } from "react-icons/lu";
import { keyframes } from "@emotion/react";
import { Card } from "@opencast/appkit";

import { OcEntity } from "../util";


export const WaitingPage: React.FC<{ type: Exclude<OcEntity, "playlist"> }> = ({ type }) => {
    const { t } = useTranslation();

    return (
        <div css={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
            <div><MovingTruck /></div>
            <Card kind="info">{t(`${type}.not-ready.title`)}</Card>
            <div css={{ maxWidth: 700 }}>{t(`${type}.not-ready.text`)}</div>
        </div>
    );
};

export const MovingTruck: React.FC = () => (
    <LuTruck css={{
        fontSize: 40,
        animation: `500ms steps(2, end) infinite none ${keyframes({
            "0%": { transform: "translateY(5px)" },
            "100%": { transform: "none" },
        })}`,
    }}/>
);
