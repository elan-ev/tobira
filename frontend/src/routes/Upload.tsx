import React, { useRef, useState } from "react";
import { TFunction, useTranslation } from "react-i18next";
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
import { boxError, ErrorBox } from "../ui/error";
import { Form } from "../ui/Form";
import { Input, TextArea } from "../ui/Input";
import { useForm } from "react-hook-form";


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


type Metadata = {
    title: string;
    description: string;
};

type Props = {
    queryRef: PreloadedQuery<UploadQuery>;
};

const Upload: React.FC<Props> = ({ queryRef }) => {
    const [files, setFiles] = useState<FileList | null>(null);
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mediaPackage, setMediaPackage] = useState<string | null>(null);
    const [ingestError, setIngestError] = useState<string | null>(null);

    const { t } = useTranslation();
    const result = usePreloadedQuery(query, queryRef);
    const relayEnv = useRelayEnvironment();

    /** Called when the files are selected. Starts uploading those files. */
    const onFileSelect = async (files: FileList) => {
        setFiles(files);
        try {
            let mediaPackage = await ocRequest(relayEnv, "/ingest/createMediaPackage")
                .then(response => response.text());
            const tracks = Array.from(files)
                .map(file => ({ file, flavor: "presentation/source" as const }));
            mediaPackage = await uploadTracks(relayEnv, mediaPackage, tracks, progress => {
                setUploadProgress(progress);
            });
            setMediaPackage(mediaPackage);
        } catch (e) {
            setIngestError(ingestErrorToMessage(t, e));
        }
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
                {(() => {
                    if (files === null) {
                        return <FileSelect onSelect={onFileSelect} />;
                    }

                    return (
                        <div css={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "stretch",
                            gap: 32,
                            width: "100%",
                            maxWidth: 800,
                            margin: "0 auto",
                        }}>
                            {ingestError == null
                                ? <UploadProgress progress={uploadProgress} />
                                : <ErrorBox>{ingestError}</ErrorBox>
                            }
                            <div css={{ overflowY: "auto" }}>
                                {!metadata
                                    ? <MetaDataEdit onSave={metadata => setMetadata(metadata)} />
                                    : <p>{t("upload.still-uploading")}</p>}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </Root>
    );
};

const ingestErrorToMessage = (t: TFunction, error: unknown): string => {
    console.log("ingest error: ", error);

    // TODO: make this better, obviously
    return t("upload.error.unknown");
};


// ==============================================================================================
// ===== Sub-components
// ==============================================================================================

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


type UploadProgressProps = {
    progress: number;
};

const UploadProgress: React.FC<UploadProgressProps> = ({ progress }) => {
    const { i18n } = useTranslation();

    progress = Math.min(1, progress);
    const roundedPercent = (progress * 100).toLocaleString(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });

    return (
        <div>
            <div css={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>{roundedPercent}%</span>
                <span>TODO</span>
            </div>
            <div css={{
                width: "100%",
                height: 12,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: "var(--grey92)",
            }}>
                <div css={{
                    height: "100%",
                    transition: "width 200ms",
                    width: `${progress * 100}%`,
                    backgroundColor: "var(--happy-color)",
                }} />
            </div>
        </div>
    );
};

type MetaDataEditProps = {
    onSave: (metadata: Metadata) => void;
};

/** Form that lets the user set metadata about the video */
const MetaDataEdit: React.FC<MetaDataEditProps> = ({ onSave }) => {
    const { t } = useTranslation();

    const { register, handleSubmit, formState: { errors } } = useForm<Metadata>({
        mode: "onChange",
    });

    const onSubmit = handleSubmit(data => onSave(data));

    // TODO: it might be too easy to accidentally submit the form with enter
    return (
        <Form noValidate onSubmit={onSubmit} css={{ margin: "32px 2px" }}>
            {/* Title */}
            <InputContainer>
                <label htmlFor="title-field">
                    {t("upload.metadata.title")}
                    <span css={{ fontWeight: "normal" }}>
                        {" ("}
                        <em>{t("upload.metadata.required")}</em>
                        {")"}
                    </span>
                </label>
                <Input
                    id="title-field"
                    required
                    error={!!errors.title}
                    css={{ width: 400, maxWidth: "100%" }}
                    {...register("title", { required: t("upload.error.field-required") as string })}
                />
                {boxError(errors.title?.message)}
            </InputContainer>

            {/* Description */}
            <InputContainer>
                <label htmlFor="description-field">{t("upload.metadata.description")}</label>
                <TextArea id="description-field" {...register("description")} />
            </InputContainer>

            {/* Submit button */}
            <Button kind="happy">{t("upload.metadata.save")}</Button>
        </Form>
    );
};

/** Separates different inputs in the metadata form */
const InputContainer: React.FC = ({ children }) => (
    <div css={{ margin: "16px 0 " }}>{children}</div>
);


// ==============================================================================================
// ===== Helper functions to send JWT-authenticated requests to OC
// ==============================================================================================

/** Returns the full Opencast URL for the given path */
const ocUrl = (path: string): string => `${CONFIG.ocUrl}${path}`;

/** Performs a request against Opencast, authenticated via JWT */
const ocRequest = async (
    relayEnv: Environment,
    path: string,
    options: RequestInit = {},
): Promise<Response> => {
    const jwt = await getJwt(relayEnv);

    const url = ocUrl(path);
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            "Authorization": `Bearer ${jwt}`,
        },
    });

    if (!response.ok) {
        throw new Error(`OC returned non-2xx status ${response.status} ${response.statusText}`);
    }

    return response;
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


// ==============================================================================================
// ===== Functions to perform actions against the ingest API
// ==============================================================================================

type Track = {
    flavor: "presentation/source" | "presenter/source";
    file: File;
};

/**
 * Uploads the given tracks via the ingest API. Calls `onProgress` regularly
 * with a number between 0 and 1, indicating how much of the data was already
 * uploaded. Returns the resulting media package returned by the last request.
 */
const uploadTracks = async (
    relayEnv: Environment,
    mediaPackage: string,
    tracks: Track[],
    onProgress: (progress: number) => void,
): Promise<string> => {
    const totalBytes = tracks.map(t => t.file.size).reduce((a, b) => a + b, 0);
    let sizeFinishedTracks = 0;

    for (const { flavor, file } of tracks) {
        // Assemble multipart body
        const body = new FormData();
        body.append("mediaPackage", mediaPackage);
        body.append("flavor", flavor);
        body.append("tags", "");
        body.append("BODY", file, file.name);

        const url = ocUrl("/ingest/addTrack");
        const jwt = await getJwt(relayEnv);
        mediaPackage = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url);
            xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);

            xhr.onload = () => {
                if (xhr.status !== 200) {
                    // TODO
                    reject(new Error("invalid Opencast status code returned"));
                } else {
                    resolve(xhr.responseText);
                }
            };
            // TODO: distinguish between different errors
            xhr.onerror = () => reject(xhr.status),
            xhr.upload.onprogress = e => {
                const uploadedBytes = e.loaded + sizeFinishedTracks;
                onProgress(uploadedBytes / totalBytes);
            };

            try {
                xhr.send(body);
            } catch (e) {
                reject(e);
            }
        });

        sizeFinishedTracks += file.size;
    }

    return mediaPackage;
};
