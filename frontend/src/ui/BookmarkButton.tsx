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


export type BookmarkButtonProps = {
    id: string;
    isBookmark: boolean;
    small?: boolean,
    className?: string;
};

/** Button to bookmark an event/series/playlist or undo that. */
export const BookmarkButton: React.FC<BookmarkButtonProps> = ({
    id,
    isBookmark,
    small = false,
    className,
}) => {
    const { t } = useTranslation();
    const user = useUser();


    const [add, addInFlight] = useMutation(graphql`
        mutation BookmarkButtonAddMutation($id: ID!) {
            addBookmark(id:$id)
        }
    `);
    const [remove, removeInFlight] = useMutation(graphql`
        mutation BookmarkButtonRemoveMutation($id: ID!) {
            removeBookmark(id:$id)
        }
    `);
    const inFlight = addInFlight || removeInFlight;
    const [error, setError] = useState<string | null>(null);

    const onClick = async () => {
        const commit = isBookmark ? remove : add;
        commit({
            variables: { id },
            onError: e => {
                // eslint-disable-next-line no-console
                console.error("Bookmark commit error: ", e);
                setError(t(`bookmark.failed-to-${isBookmark ? "remove" : "add"}`));
            },
            updater: store => store.get(id)?.setValue(!isBookmark, "isBookmark"),
        });
    };

    if (!isRealUser(user)) {
        return null;
    }

    const actionLabel = isBookmark ? t("bookmark.remove") : t("bookmark.add");
    const label = error ?? actionLabel;

    return (
        <WithTooltip tooltip={label}>
            <Button aria-label={label} {...{ className, onClick }} css={{
                height: small ? 31 : 40,
                ...small && {
                    borderRadius: 4,
                    padding: "0 12px",
                },
                svg: { fontSize: 16 },
            }}>
                {(() => {
                    if (inFlight) {
                        return <Spinner />;
                    }
                    if (error) {
                        return <LuTriangleAlert css={{ color: COLORS.danger1 }} />;
                    }
                    return <LuStar css={{ fill: isBookmark ? "currentColor" : "none" }} />;
                })()}
            </Button>
        </WithTooltip>
    );
};
