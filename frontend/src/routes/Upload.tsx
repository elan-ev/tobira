import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useRelayEnvironment } from "react-relay";
import { keyframes } from "@emotion/react";
import { useForm } from "react-hook-form";
import { Environment, fetchQuery } from "relay-runtime";
import { FiCheckCircle, FiUpload } from "react-icons/fi";

import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { UploadQuery } from "./__generated__/UploadQuery.graphql";
import { UPLOAD_PATH } from "./paths";
import { makeRoute } from "../rauta";
import { UploadJwtQuery } from "./__generated__/UploadJwtQuery.graphql";
import { assertNever, bug, ErrorDisplay, errorDisplayInfo, unreachable } from "../util/err";
import { currentRef, useNavBlocker, useTitle } from "../util";
import CONFIG from "../config";
import { Button } from "../ui/Button";
import { boxError, ErrorBox } from "../ui/error";
import { Form } from "../ui/Form";
import { Input, TextArea } from "../ui/Input";
import { User, useUser } from "../User";
import { useRefState } from "../util";
import { Card } from "../ui/Card";
import { InputContainer, TitleLabel } from "../ui/metadata";


export const UploadRoute = makeRoute(url => {
    if (url.pathname !== UPLOAD_PATH) {
        return null;
    }

    const queryRef = loadQuery<UploadQuery>(query, {});
    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={() => []}
            render={() => <Upload />}
        />,
        dispose: () => queryRef.dispose(),
    };
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

const Upload: React.FC = () => {
    const { t } = useTranslation();
    const title = t("upload.title");
    useTitle(title);

    return (
        <div css={{
            margin: "0 auto",
            height: "100%",
            display: "flex",
            flexDirection: "column",
        }}>
            <h1>{title}</h1>
            <div css={{ fontSize: 14, marginBottom: 16 }}>{t("upload.public-note")}</div>
            <UploadMain />
        </div>
    );
};

const UploadMain: React.FC = () => {
    // TODO: on first mount, send an `ocRequest` to `info/me.json` and make sure
    // that connection works. That way we can show an error very early, before
    // the user selected a file.

    const { t } = useTranslation();
    const relayEnv = useRelayEnvironment();

    const [files, setFiles] = useState<FileList | null>(null);
    const [uploadState, setUploadState] = useRefState<UploadState | null>(null);
    const [metadata, setMetadata] = useRefState<Metadata | null>(null);

    const progressHistory = useRef<ProgressHistory>([]);

    useNavBlocker(() => !!uploadState.current && uploadState.current.state !== "done");

    // Get user info
    const user = useUser();
    if (user === "none" || user === "unknown") {
        // TODO: if not logged in, suggest doing so
        return <div css={{ textAlign: "center" }}>
            <ErrorBox>{t("upload.not-authorized")}</ErrorBox>
        </div>;
    }

    /** Called when the files are selected. Starts uploading those files. */
    const onFileSelect = async (files: FileList) => {
        setFiles(files);

        const onProgressCallback = (progress: Progress): void => {
            if (uploadState.current === null) {
                return unreachable("no upload state after calling `startUpload`");
            }
            onProgress(progress, progressHistory.current, uploadState.current, setUploadState);
        };
        const onDone = (mediaPackage: string) => {
            if (metadata.current === null) {
                setUploadState({ state: "waiting-for-metadata", mediaPackage });
            } else {
                finishUpload(relayEnv, mediaPackage, metadata.current, user, setUploadState);
            }
        };
        startUpload(relayEnv, files, setUploadState, onProgressCallback, onDone);
    };

    if (files === null) {
        return <FileSelect onSelect={onFileSelect} />;
    } else if (uploadState.current === null) {
        // This never happens as, when files are selected, the upload is
        // instantly started and the state is set to `starting`. Check the only
        // use of `setFiles` above and notice how the upload state is set
        // immediately afterwards.
        return unreachable("upload state is null, but there are files");
    } else if (uploadState.current.state === "done") {
        return <div css={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: "max(16px, 10vh - 50px)",
            gap: 32,
        }}>
            <FiCheckCircle css={{ fontSize: 64, color: "var(--happy-color-lighter)" }} />
            {t("upload.finished")}
        </div>;
    } else {
        const onMetadataSave = (metadata: Metadata): void => {
            if (uploadState.current === null) {
                return bug("uploadState === null on metadata save");
            }

            setMetadata(metadata);
            if (uploadState.current.state === "waiting-for-metadata") {
                // The tracks have already been uploaded, so we can finish the upload now.
                const mediaPackage = uploadState.current.mediaPackage;
                finishUpload(relayEnv, mediaPackage, metadata, user, setUploadState);
            }
        };
        const hasUploadError = uploadState.current.state === "error";

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
                <UploadState state={uploadState.current} />
                <div css={{ overflowY: "auto" }}>
                    {/* TODO: Show something after saving metadata.
                        - Just saying "saved" is kind of misleading because the data is only local.
                        - Maybe just show the form, but disable all inputs?
                        - ...
                    */}
                    {!metadata.current
                        ? <MetaDataEdit onSave={onMetadataSave} disabled={hasUploadError} />
                        : !hasUploadError && (
                            <div css={{ margin: "0 auto", maxWidth: 500 }}>
                                <Card kind="info">{t("upload.still-uploading")}</Card>
                            </div>
                        )
                    }
                </div>
            </div>
        );
    }
};

type ProgressHistory = {
    timestamp: number;
    progress: Progress;
}[];

/**
 * Called regularly with the current progress and calculates the time estimate.
 * This is done with a simple sliding average over the last few data points,
 * that is assumed to be the speed for the rest of the upload.
 */
const onProgress = (
    progress: Progress,
    history: ProgressHistory,
    uploadState: UploadState,
    setUploadState: (state: UploadState) => void,
) => {
    const now = Date.now();

    // Add progress data point to history.
    history.push({ timestamp: now, progress });

    // The size of the sliding window in milliseconds.
    const WINDOW_SIZE_MS = 5000;
    // The size of the sliding window in number of data points.
    const WINDOW_SIZE_DATA_POINTS = 6;
    // The number of datapoints below which we won't show a time estimate.
    const MINIMUM_DATA_POINT_COUNT = 4;

    // Find the first element within the window. We use the larger window of the
    // two windows created by the two constraints (time and number of
    // datapoints).
    const windowStart = Math.min(
        history.findIndex(p => (now - p.timestamp) < WINDOW_SIZE_MS),
        Math.max(0, history.length - WINDOW_SIZE_DATA_POINTS),
    );

    // Remove all elements outside the window.
    history.splice(0, windowStart);

    let secondsLeft = null;
    if (history.length >= MINIMUM_DATA_POINT_COUNT) {
        // Calculate the remaining time based on the average speed within the window.
        const windowLength = now - history[0].timestamp;
        const progressInWindow = progress - history[0].progress;
        const progressPerSecond = (progressInWindow / windowLength) * 1000;
        const progressLeft = 1 - progress;
        secondsLeft = Math.max(0, Math.round(progressLeft / progressPerSecond));
    }

    // Update state if anything changed. We actually check for equality here to
    // avoid useless redraws.
    const someChange = uploadState.state !== "uploading-tracks"
        || uploadState.secondsLeft !== secondsLeft
        || uploadState.progress !== progress;
    if (someChange) {
        setUploadState({ state: "uploading-tracks", progress, secondsLeft });
    }
};

const UploadErrorBox: React.FC<{ error: unknown }> = ({ error }) => {
    // Log error once.
    // eslint-disable-next-line no-console
    useEffect(() => console.error("Error uploading: ", error), [error]);

    const { t, i18n } = useTranslation();
    let info;
    if (error instanceof OcNetworkError) {
        info = {
            causes: [t("upload.errors.opencast-unreachable")],
            // Opencast could be down, but it's confusing setting this to true
            probablyOurFault: false,
            potentiallyInternetProblem: true,
        };
    } else if (error instanceof OcServerError) {
        info = {
            causes: [t("upload.errors.opencast-server-error")],
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    } else if (error instanceof JwtInvalid) {
        // TODO: make it so that this error should not occur. And once that is
        // done, change `probablyOurFault` to `true`.
        info = {
            causes: [t("upload.errors.jwt-expired")],
            probablyOurFault: false, // Well...
            potentiallyInternetProblem: false,
        };
    } else {
        info = errorDisplayInfo(error, i18n);
    }


    return (
        <div css={{ margin: "0 auto" }}>
            <Card kind="error">
                <ErrorDisplay info={info} failedAction={t("upload.errors.failed-to-upload")} />
            </Card>
        </div>
    );
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
                    onClick={() => currentRef(fileInput).click()}
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

/** Number between 0 and 1 */
type Progress = number;

/** State of a started upload */
type UploadState =
    // Starting the upload: creating a new media package.
    { state: "starting" }
    // Uploading the actual tracks, usually takes by far the longest.
    | { state: "uploading-tracks"; progress: Progress; secondsLeft: number | null }
    // Tracks have been uploaded, but the user still has to save the metadata to finish the upload.
    | { state: "waiting-for-metadata"; mediaPackage: string }
    // After the tracks have been uploaded, just adding metadata, ACL and then ingesting.
    | { state: "finishing" }
    // The upload is completely done
    | { state: "done" }
    // An error occured during the upload
    | { state: "error"; error: unknown };

/** State of an upload that is not yet finished */
type NonFinishedUploadState = Exclude<UploadState, { state: "done" }>;

/** Shows the current state of the upload */
const UploadState: React.FC<{ state: NonFinishedUploadState }> = ({ state }) => {
    const { t, i18n } = useTranslation();

    if (state.state === "starting") {
        return <BarWithText state="progressing">
            <span>{t("upload.starting")}</span>
        </BarWithText>;
    } else if (state.state === "uploading-tracks") {
        const progress = Math.min(1, state.progress);
        const roundedPercent = (progress * 100).toLocaleString(i18n.language, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        });

        // Nicely format the remaining time.
        const secondsLeft = state.secondsLeft;
        let prettyTime;
        if (secondsLeft === null) {
            prettyTime = null;
        } else if (secondsLeft < 4) {
            prettyTime = t("upload.time-estimate.a-few-seconds");
        } else if (secondsLeft < 45) {
            prettyTime = `${secondsLeft} ${t("upload.time-estimate.seconds")}`;
        } else if (secondsLeft < 90) {
            prettyTime = t("upload.time-estimate.a-minute");
        } else if (secondsLeft < 45 * 60) {
            prettyTime = `${Math.round(secondsLeft / 60)} ${t("upload.time-estimate.minutes")}`;
        } else if (secondsLeft < 90 * 60) {
            prettyTime = t("upload.time-estimate.an-hour");
        } else if (secondsLeft < 24 * 60 * 60) {
            const hours = Math.round(secondsLeft / (60 * 60));
            prettyTime = `${hours} ${t("upload.time-estimate.hours")}`;
        } else {
            prettyTime = null;
        }

        return <BarWithText state={progress}>
            <span>{roundedPercent}%</span>
            <span>
                {prettyTime && t("upload.time-estimate.time-left", { time: prettyTime })}
            </span>
        </BarWithText>;
    } else if (state.state === "waiting-for-metadata") {
        return <BarWithText state="waiting">
            <span>{t("upload.waiting-for-metadata")}</span>
        </BarWithText>;
    } else if (state.state === "finishing") {
        return <BarWithText state="progressing">
            <span>{t("upload.finishing")}</span>
        </BarWithText>;
    } else if (state.state === "error") {
        return <UploadErrorBox error={state.error} />;
    } else {
        return assertNever(state);
    }
};

/** Helper component for `UploadState` */
const BarWithText: React.FC<ProgressBarProps> = ({ state, children }) => <>
    <div>
        <div css={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0 4px",
            marginBottom: 8,
            "& > *:only-child": { margin: "0 auto" },
        }}>{children}</div>
        <ProgressBar state={state} />
    </div>
</>;

type ProgressBarProps = {
    /** Either a known progress, or an unknown progress or waiting for something */
    state: Progress | "progressing" | "waiting";
};

/** A progress bar that can show different states */
const ProgressBar: React.FC<ProgressBarProps> = ({ state }) => {
    // Helper function to create a moving stripe background.
    const animatedStripes = (
        angle: number,
        color0: string,
        color1: string,
        duration: number,
    ) => {
        const size = 30;
        const amountColor0 = 0.4;

        // The input size is the horizontal period basically. But the CSS
        // gradient expect the period in direction of the pattern, so we have
        // to do a little math.
        const realSize = size * Math.sin(Math.abs(angle) / 180 * Math.PI);

        return {
            background: "repeating-linear-gradient("
                + `${angle}deg,`
                + `var(${color0}),`
                + `var(${color0}) ${realSize * amountColor0}px,`
                + `var(${color1}) ${realSize * amountColor0}px,`
                + `var(${color1}) ${realSize}px)`,
            backgroundSize: `calc(100% + ${size}px) 100%`,
            animation: `${duration}s linear infinite none ${keyframes({
                "0%": { backgroundPositionX: -30 },
                "100%": { backgroundPositionX: 0 },
            })}`,
        };
    };

    const shared = {
        width: "100%",
        height: 12,
        borderRadius: 6,
        overflow: "hidden",
    };

    if (state === "progressing") {
        return <div css={{
            ...shared,
            ...animatedStripes(-45, "--happy-color", "--happy-color-lighter", 1.5),
        }} />;
    } else if (state === "waiting") {
        return <div css={{
            ...shared,
            ...animatedStripes(45, "--accent-color-darker", "--accent-color", 4),
        }} />;
    } else {
        return (
            <div css={{
                ...shared,
                backgroundColor: "var(--grey92)",
            }}>
                <div css={{
                    height: "100%",
                    transition: "width 200ms",
                    width: `${state * 100}%`,
                    backgroundColor: "var(--happy-color-lighter)",
                }} />
            </div>
        );
    }
};


type MetaDataEditProps = {
    onSave: (metadata: Metadata) => void;
    disabled: boolean;
};

/** Form that lets the user set metadata about the video */
const MetaDataEdit: React.FC<MetaDataEditProps> = ({ onSave, disabled }) => {
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
                <TitleLabel htmlFor="title-field" />
                <Input
                    id="title-field"
                    required
                    error={!!errors.title}
                    css={{ width: 400, maxWidth: "100%" }}
                    autoFocus
                    {...register("title", {
                        required: t("upload.errors.field-required") as string,
                    })}
                />
                {boxError(errors.title?.message)}
            </InputContainer>

            {/* Description */}
            <InputContainer>
                <label htmlFor="description-field">{t("upload.metadata.description")}</label>
                <TextArea id="description-field" {...register("description")} />
            </InputContainer>

            {/* Submit button */}
            <Button kind="happy" disabled={disabled}>{t("upload.metadata.save")}</Button>
        </Form>
    );
};


// ==============================================================================================
// ===== Helper functions to send JWT-authenticated requests to OC
// ==============================================================================================

/** Returns the full Opencast URL for the given path */
const ocUrl = (path: string): string => `${CONFIG.ocUrl}${path}`;

/** Opencast returned a non-OK status code */
export class OcServerError extends Error {
    public status: number;
    public statusText: string;

    public constructor(status: number, statusText: string) {
        super();
        this.name = "Opencast server error";
        this.status = status;
        this.statusText = statusText;
        this.message = `OC returned non-2xx status ${status} ${statusText}`;
    }
}

/** Opencast could not be reached */
export class OcNetworkError extends Error {
    public inner?: Error;

    public constructor(inner?: Error) {
        super();
        this.name = "Opencast Network Error";
        this.inner = inner;
        this.message = `network error while contacting Opencast API: ${inner}`;
    }
}

/** The JWT sent to Opencast was rejected. Likely because it expired */
export class JwtInvalid extends Error {
    public constructor() {
        super();
        this.name = "Opencast JWT Auth Error";
        this.message = "JWT was rejected by Opencast";
    }
}

/** Performs a request against Opencast, authenticated via JWT */
const ocRequest = async (
    relayEnv: Environment,
    path: string,
    options: RequestInit = {},
): Promise<string> => {
    const jwt = await getJwt(relayEnv);

    const url = ocUrl(path);
    const response = await fetch(url, {
        redirect: "manual",
        ...options,
        headers: {
            ...options.headers,
            "Authorization": `Bearer ${jwt}`,
        },
    }).catch(e => { throw new OcNetworkError(e); });

    // There should be no reason for a redirect except non-authenticated. The
    // underlying problem can hopefully be resolved soon, so that we can remove
    // this code.
    if (response.type === "opaqueredirect") {
        throw new JwtInvalid();
    }

    if (!response.ok) {
        throw new OcServerError(response.status, response.statusText);
    }


    return response.text()
        .catch(e => { throw new OcNetworkError(e); });
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

const startUpload = async (
    relayEnv: Environment,
    files: FileList,
    setUploadState: (state: UploadState) => void,
    onProgress: (progress: Progress) => void,
    onDone: (mediaPackage: string) => void,
) => {
    try {
        setUploadState({ state: "starting" });

        // Log Opencast user information. This is also a good test whether the
        // communication with OC works at all, without potentially creating an
        // empty new media package.
        const userInfo = JSON.parse(await ocRequest(relayEnv, "/info/me.json"));
        delete userInfo.org;
        // eslint-disable-next-line no-console
        console.debug("JWT user: ", userInfo);

        // Create a new media package to start the upload
        let mediaPackage = await ocRequest(relayEnv, "/ingest/createMediaPackage");

        const tracks = Array.from(files)
            .map(file => ({ file, flavor: "presentation/source" as const }));
        mediaPackage = await uploadTracks(relayEnv, mediaPackage, tracks, onProgress);
        onDone(mediaPackage);
    } catch (error) {
        setUploadState({ state: "error", error });
    }
};


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
                if (xhr.responseURL !== url) {
                    reject(new JwtInvalid());
                } else if (xhr.status !== 200) {
                    reject(new OcServerError(xhr.status, xhr.statusText));
                } else {
                    resolve(xhr.responseText);
                }
            };
            xhr.onerror = () => reject(new OcNetworkError()),
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


/** Ingest the given metadata and finishes the ingest process */
const finishUpload = async (
    relayEnv: Environment,
    mediaPackage: string,
    metadata: Metadata,
    user: User,
    setUploadState: (state: UploadState) => void,
) => {
    try {
        setUploadState({ state: "finishing" });

        // Add metadata in DC-Catalog
        {
            const dcc = constructDcc(metadata, user);
            const body = new FormData();
            body.append("mediaPackage", mediaPackage);
            body.append("dublinCore", dcc);
            body.append("flavor", "dublincore/episode");

            mediaPackage = await ocRequest(
                relayEnv,
                "/ingest/addDCCatalog",
                { method: "post", body },
            );
        }

        // Add ACL
        {
            // Retrieve primary user role for user.
            // TODO: we could save this information from a previous request to info/me.
            const userInfo = JSON.parse(await ocRequest(relayEnv, "/info/me.json"));
            const userRole = userInfo.userRole;
            if (typeof userRole !== "string" || !userRole) {
                throw `Field \`userRole\` from 'info/me.json' is not valid: ${userRole}`;
            }

            const acl = constructAcl(["ROLE_ANONYMOUS"], [userRole]);
            const body = new FormData();
            body.append("flavor", "security/xacml+episode");
            body.append("mediaPackage", mediaPackage);
            body.append("BODY", new Blob([acl]), "acl.xml");

            mediaPackage = await ocRequest(
                relayEnv,
                "/ingest/addAttachment",
                { method: "post", body },
            );
        }

        // Finish ingest
        {
            const body = new FormData();
            body.append("mediaPackage", mediaPackage);
            await ocRequest(relayEnv, "/ingest/ingest", { method: "post", body: body });
        }

        setUploadState({ state: "done" });
    } catch (error) {
        setUploadState({ state: "error", error });
    }
};

/**
 * Encodes a value for inclusion in XML sent to Opencast.
 *
 * For one, we need to escape some characters for XML inclusion. But Opencast
 * also tries to URI-decode the value, meaning that `%` in the original value
 * will be interpreted as encoded characters, which usually fails. So if the
 * original value contains `%`, we URI-encode it.
 */
const encodeValue = (value: string): string => {
    const escapedXml = new XMLSerializer().serializeToString(new Text(value));
    return escapedXml.includes("%") ? encodeURIComponent(escapedXml) : escapedXml;
};

/** Creates a Dublin Core Catalog in XML format that describes the given metadata. */
const constructDcc = (metadata: Metadata, user: User): string => {
    const tag = (tag: string, value: string): string =>
        value ? `<${tag}>${encodeValue(value)}</${tag}>` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
        <dublincore xmlns="http://www.opencastproject.org/xsd/1.0/dublincore/"
                    xmlns:dcterms="http://purl.org/dc/terms/"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <dcterms:created xsi:type="dcterms:W3CDTF">
                ${new Date().toISOString()}
            </dcterms:created>
            ${tag("dcterms:title", metadata.title)}
            ${tag("dcterms:description", metadata.description)}
            ${tag("dcterms:creator", user.displayName)}
            ${tag("dcterms:spatial", "Tobira Upload")}
        </dublincore>
    `;
};

/** Constructs an ACL XML description from the given roles that are allowd to read/write */
const constructAcl = (readRoles: string[], writeRoles: string[]): string => {
    // TODO: maybe we should escape the role somehow?
    const makeRule = (action: string, role: string): string => `
        <Rule RuleId="${action}_permit_for_${role}" Effect="Permit">
          <Target>
            <Actions>
              <Action>
                <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
                  <AttributeValue
                    DataType="http://www.w3.org/2001/XMLSchema#string">${action}</AttributeValue>
                </ActionMatch>
              </Action>
            </Actions>
          </Target>
          <Condition>
            <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
              <AttributeValue
                DataType="http://www.w3.org/2001/XMLSchema#string">${role}</AttributeValue>
            </Apply>
          </Condition>
        </Rule>
    `;


    const readRules = readRoles.map(role => makeRule("read", role));
    const writeRules = writeRoles.map(role => makeRule("write", role));

    return `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Policy PolicyId="mediapackage-1"
          RuleCombiningAlgId=
            "urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides"
          Version="2.0"
          xmlns="urn:oasis:names:tc:xacml:2.0:policy:schema:os">
            ${readRules.join("\n")}
            ${writeRules.join("\n")}
        </Policy>
    `.trim();
};
