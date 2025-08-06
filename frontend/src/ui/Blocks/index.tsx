import React from "react";
import { graphql, useFragment } from "react-relay/hooks";
import { match } from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import { LuSunrise } from "react-icons/lu";

import { BlocksData$key } from "./__generated__/BlocksData.graphql";
import { BlocksRealmData$key } from "./__generated__/BlocksRealmData.graphql";
import { BlocksBlockData$key } from "./__generated__/BlocksBlockData.graphql";
import { RealmQuery$data } from "../../routes/__generated__/RealmQuery.graphql";
import { TitleBlock } from "./Title";
import { TextBlockByQuery } from "./Text";
import { SeriesBlockFromBlock } from "./Series";
import { VideoBlock } from "./Video";
import { PlayerGroupProvider, usePlayerGroupContext } from "../player/PlayerGroupContext";
import { PlayerShortcuts } from "../player/PlayerShortcuts";
import { PlaylistBlockFromBlock } from "./Playlist";
import { COLORS } from "../../color";


type BlocksProps = {
    realm: BlocksData$key & RealmQuery$data["realm"];
};

export const Blocks: React.FC<BlocksProps> = ({ realm }) => {
    const realmWithBlocks = useFragment(graphql`
        fragment BlocksData on Realm {
            ... BlocksRealmData
            blocks {
                id
                ... BlocksBlockData
            }
        }
    `, realm);

    if (realmWithBlocks.blocks.length === 0 && realm.isMainRoot) {
        return <WelcomeMessage />;
    }

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            rowGap: 32,
        }}>
            <PlayerGroupProvider>
                <PlayerGroupShortcuts />
                {realmWithBlocks.blocks.map(
                    block => <Block key={block.id} realm={realmWithBlocks} block={block} />,
                )}
            </PlayerGroupProvider>
        </div>
    );
};

const PlayerGroupShortcuts: React.FC = () => {
    const { activePlayer } = usePlayerGroupContext();
    return <PlayerShortcuts activePlayer={activePlayer} />;
};


type BlockProps = {
    realm: BlocksRealmData$key;
    block: BlocksBlockData$key;
    edit?: boolean;
};

export const Block: React.FC<BlockProps> = ({ block: blockRef, realm, edit }) => {
    const { path } = useFragment(graphql`
        fragment BlocksRealmData on Realm {
            path
        }
    `, realm);

    const block = useFragment(graphql`
        fragment BlocksBlockData on Block {
            id # TODO just querying for the type and fragments bugs out Relay's type generation
            __typename
            ... on TitleBlock { ... TitleBlockData }
            ... on TextBlock { ... TextBlockData }
            ... on SeriesBlock { ... SeriesBlockData }
            ... on VideoBlock { ... VideoBlockData }
            ... on PlaylistBlock { ... PlaylistBlockData }
        }
    `, blockRef);
    const { __typename } = block;

    const basePath = path.replace(/\/$/u, "") + "/v";
    return <div>
        {match(__typename, {
            "TitleBlock": () => <TitleBlock fragRef={block} />,
            "TextBlock": () => <TextBlockByQuery fragRef={block} />,
            "SeriesBlock": () => <SeriesBlockFromBlock
                fragRef={block}
                realmPath={path}
                editMode={edit}
            />,
            "VideoBlock": () => <VideoBlock fragRef={block} {...{ basePath, edit }} />,
            "PlaylistBlock": () => <PlaylistBlockFromBlock
                fragRef={block}
                realmPath={path}
                editMode={edit}
            />,
        })}
    </div>;
};

const WelcomeMessage: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{
            maxWidth: 500,
            marginTop: 32,
            display: "inline-flex",
            flexDirection: "column",
            borderRadius: 4,
            padding: "8px 16px",
            gap: 16,
            alignItems: "center",
            backgroundColor: COLORS.neutral10,
            border: `2px dashed ${COLORS.happy0}`,
        }}>
            <LuSunrise css={{ marginTop: 8, fontSize: 32, minWidth: 32 }} />
            <div>
                <h2 css={{ textAlign: "center", fontSize: 20, marginBottom: 16 }}>
                    {t("welcome.title")}
                </h2>
                <p>{t("welcome.body")}</p>
            </div>
        </div>
    );
};
