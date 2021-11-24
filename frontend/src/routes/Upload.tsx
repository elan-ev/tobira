import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery, useRelayEnvironment } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../layout/Root";
import { loadQuery } from "../relay";
import { UploadQuery } from "../query-types/UploadQuery.graphql";
import { UPLOAD_PATH } from "./paths";
import { makeRoute } from "../rauta";
import { Environment, fetchQuery } from "relay-runtime";
import { UploadJwtQuery } from "../query-types/UploadJwtQuery.graphql";
import { bug } from "../util/err";
import CONFIG from "../config";
import { FiUpload } from "react-icons/fi";
import { Button } from "../ui/Button";
import { boxError } from "../ui/error";


export const UploadRoute = makeRoute<PreloadedQuery<UploadQuery>>({
    path: UPLOAD_PATH,
    queryParams: [],
    prepare: () => loadQuery(query, {}),
    render: queryRef => <Upload queryRef={queryRef} />,
    dispose: prepared => prepared.dispose(),
});

const query = graphql`
    query UploadQuery {
        ... UserData
    }
`;

type Props = {
    queryRef: PreloadedQuery<UploadQuery>;
};

const Upload: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();
    const result = usePreloadedQuery(query, queryRef);
    const relayEnv = useRelayEnvironment();

    const start = async () => {
        // TODO: error handling
        const res = await ocRequest(relayEnv, "/info/me.json");
        console.log(await res.json());
    };

    return (
        <Root nav={[]} userQuery={result}>
            <div css={{
                margin: "0 auto",
                height: "100%",
                display: "flex",
                flexDirection: "column",
            }}>
                <h1>{t("upload.title")}</h1>
                <FileSelect onSelect={files => {
                    console.log(files);
                }} />
            </div>
        </Root>
    );
};

type FileSelectProps = {
    onSelect: (files: FileList) => void;
};

/** First state of the uploader: asking the user to select video files */
const FileSelect: React.FC<FileSelectProps> = ({ onSelect }) => {
    const { t } = useTranslation();
    const fileInput = useRef<HTMLInputElement>(null);

    const [error, setError] = useState(null);
    const [dragCounter, setDragCounter] = useState(0);
    const isDragging = dragCounter > 0;

    return (
        <div
            onDragEnter={e => {
                setDragCounter(old => old + 1);
                e.preventDefault();
            }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={() => setDragCounter(old => old - 1)}
            onDrop={e => {
                const files = e.dataTransfer.files;
                if (files.length === 0) {
                    setError(t("upload.not-a-file"));
                } else if (files.length > 1) {
                    setError(t("upload.too-many-files"));
                } else {
                    onSelect(e.dataTransfer.files);
                }
                setDragCounter(0);
                e.preventDefault();
            }}
            css={{
                width: "100%",
                height: "100%",
                border: "3px dashed",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDragging ? "var(--grey97)" : "none",
                borderColor: isDragging ? "var(--accent-color)" : "var(--grey80)",
                "--transition-length": "80ms",
                transition: "background-color var(--transition-length), "
                    + "border-color var(--transition-length)",
            }}
        >
            {/* Big icon */}
            <div css={{
                position: "relative",
                lineHeight: 1,
                fontSize: 64,
                color: "var(--grey40)",
            }}>
                {/* This depends on the SVG elements used in the icon. Technically, the icon pack
                    does not guarantee that and could change it at any time. But we decided it's
                    fine in this case. It is unlikely to change and if it breaks, nothing bad could
                    happen. Only the animation is broken. */}
                <FiUpload css={{
                    position: "absolute",
                    top: isDragging ? 8 : 0,
                    transition: "top var(--transition-length)",
                    "& > path": { display: "none" },
                }} />
                <FiUpload css={{ "& > polyline, & > line": { display: "none" } }} />
            </div>

            {t("upload.drop-to-upload")}

            {/* "Select files" button */}
            <div css={{ marginTop: 16 }}>
                <Button
                    kind="happy"
                    onClick={() => fileInput.current?.click()}
                >{t("upload.select-files")}</Button>
                <input
                    ref={fileInput}
                    onChange={e => {
                        if (e.target.files) {
                            onSelect(e.target.files);
                        }
                    }}
                    type="file"
                    aria-hidden="true"
                    css={{ display: "none" }}
                />
            </div>

            {boxError(error)}
        </div>
    );
};


/** Performs a request against Opencast, authenticated via JWT */
const ocRequest = async (
    relayEnv: Environment,
    path: string,
    options: RequestInit = {},
): Promise<Response> => {
    const jwt = await getJwt(relayEnv);

    const url = `${CONFIG.ocUrl}${path}`;
    return await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            "Authorization": `Bearer ${jwt}`,
        },
    });
};

/** Fetches a new JWT for uploading to Opencast */
const getJwt = (relayEnv: Environment): Promise<string> => new Promise((resolve, reject) => {
    const query = graphql`
        query UploadJwtQuery {
            uploadJwt
        }
    `;

    let out: string | null = null;

    // Use "network-only" as we always want a fresh JWTs. `fetchQuery` should already
    // never write any values into the cache, but better make sure.
    fetchQuery<UploadJwtQuery>(relayEnv, query, {}, { fetchPolicy: "network-only" }).subscribe({
        complete: () => {
            if (out === null) {
                bug("'complete' callback before receiving any data");
            } else {
                resolve(out);
            }
        },
        error: (error: unknown) => reject(error),
        next: data => {
            if (out !== null) {
                bug("unexpected second data when retrieving JWT");
            } else {
                out = data.uploadJwt;
            }
        },
    });
});
