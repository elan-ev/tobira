import React from "react";
import { useTranslation } from "react-i18next";
import {
    FiPlus,
    FiType,
    FiGrid,
    FiFilm,
} from "react-icons/fi";

import { Button, ButtonGroup } from "./util";


type Props = {
    index: number;
};

export const AddButtons: React.FC<Props> = ({ index: _index }) => {
    const { t } = useTranslation();

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
        <Button title={t("manage.realm.content.add-text")}>
            <FiType />
        </Button>
        <Button title={t("manage.realm.content.add-series")}>
            <FiGrid />
        </Button>
        <Button title={t("manage.realm.content.add-video")}>
            <FiFilm />
        </Button>
    </ButtonGroup>;
};
