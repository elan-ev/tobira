import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuStar, LuTriangleAlert } from "react-icons/lu";
import {
    Button,
    Spinner,
    WithTooltip,
} from "@opencast/appkit";

import { isRealUser, useUser } from "../User";
import { graphql, useMutation } from "react-relay";
import { COLORS } from "../color";


export type FavButtonProps = {
    id: string;
    isFav: boolean;
    className?: string;
};

/** Button to make a series/playlist a favorite or undo that. */
export const FavButton: React.FC<FavButtonProps> = ({ id, isFav, className }) => {
    const { t } = useTranslation();
    const user = useUser();


    const [add, addInFlight] = useMutation(graphql`
        mutation FavButtonAddMutation($id: ID!) {
            addFavorite(id:$id)
        }
    `);
    const [remove, removeInFlight] = useMutation(graphql`
        mutation FavButtonRemoveMutation($id: ID!) {
            removeFavorite(id:$id)
        }
    `);
    const inFlight = addInFlight || removeInFlight;
    const [error, setError] = useState<string | null>(null);

    const onClick = async () => {
        const commit = isFav ? remove : add;
        commit({
            variables: { id },
            onError: e => {
                // eslint-disable-next-line no-console
                console.error("Fav commit error: ", e);
                setError(t(`fav.failed-to-${isFav ? "remove" : "add"}`));
            },
            updater: store => store.get(id)?.setValue(!isFav, "isFav"),
        });
    };

    if (!isRealUser(user)) {
        return null;
    }

    const actionLabel = isFav ? t("fav.remove") : t("fav.add");
    const label = error ?? actionLabel;

    return (
        <WithTooltip tooltip={label}>
            <Button aria-label={label} {...{ className, onClick }} css={{
                height: 31,
                borderRadius: 4,
                padding: 12,
                svg: { fontSize: 16 },
            }}>
                {(() => {
                    if (inFlight) {
                        return <Spinner />;
                    }
                    if (error) {
                        return <LuTriangleAlert css={{ color: COLORS.danger1 }} />;
                    }
                    return <LuStar css={{ fill: isFav ? "currentColor" : "none" }} />;
                })()}
            </Button>
        </WithTooltip>
    );
};
