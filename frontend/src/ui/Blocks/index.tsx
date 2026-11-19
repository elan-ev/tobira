import React from "react";
import { graphql, useFragment } from "react-relay/hooks";
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
import { PlaylistBlockFromBlock } from "./Playlist";
import { COLORS } from "../../color";


export const TEXT_MAX_WIDTH = 800;

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
            {realmWithBlocks.blocks.map(
                block => <Block key={block.id} realm={realmWithBlocks} block={block} />,
            )}
        </div>
    );
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
            ... TitleBlockData @alias
            ... TextBlockData @alias
            ... SeriesBlockData @alias
            ... VideoBlockData @alias
            ... PlaylistBlockData @alias
        }
    `, blockRef);

    const basePath = path.replace(/\/$/u, "") + "/v";
    return <div>
        {block.TitleBlockData && <TitleBlock fragRef={block.TitleBlockData} />}
        {block.TextBlockData && <TextBlockByQuery fragRef={block.TextBlockData} />}
        {block.SeriesBlockData && <SeriesBlockFromBlock
            fragRef={block.SeriesBlockData}
            realmPath={path}
            editMode={edit}
        />}
        {block.VideoBlockData && <VideoBlock
            fragRef={block.VideoBlockData}
            realmPath={path}
            {...{ basePath, edit }}
        />}
        {block.PlaylistBlockData && <PlaylistBlockFromBlock
            fragRef={block.PlaylistBlockData}
            realmPath={path}
            editMode={edit}
        />}
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
