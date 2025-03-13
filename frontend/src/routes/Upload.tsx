import React, { MutableRefObject, ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchQuery, graphql, useFragment } from "react-relay";
import { keyframes } from "@emotion/react";
import { Controller, useController, useForm } from "react-hook-form";
import { LuCheckCircle, LuUpload, LuInfo } from "react-icons/lu";
import { Spinner, WithTooltip, assertNever, bug, unreachable } from "@opencast/appkit";

import { RootLoader } from "../layout/Root";
import { environment, loadQuery } from "../relay";
import { UploadQuery } from "./__generated__/UploadQuery.graphql";
import { makeRoute } from "../rauta";
import { ErrorDisplay, errorDisplayInfo } from "../util/err";
import { mapAcl, useNavBlocker } from "./util";
import CONFIG from "../config";
import { Button, boxError, ErrorBox, Card } from "@opencast/appkit";
import { LinkButton } from "../ui/LinkButton";
import { Form } from "../ui/Form";
import { Input, TextArea } from "../ui/Input";
import { isRealUser, User, useUser } from "../User";
import { currentRef, useRefState } from "../util";
import { FieldIsRequiredNote, InputContainer, TitleLabel } from "../ui/metadata";
import { PageTitle } from "../layout/header/ui";
import { useRouter } from "../router";
import { getJwt } from "../relay/auth";
import { VideoListSelector } from "../ui/SearchableSelect";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { ManageNav, ManageRoute } from "./manage";
import { COLORS } from "../color";
import { COMMON_ROLES } from "../util/roles";
import { Acl, AclSelector, knownRolesFragment } from "../ui/Access";
import {
    AccessKnownRolesData$data,
    AccessKnownRolesData$key,
} from "../ui/__generated__/AccessKnownRolesData.graphql";
import { READ_WRITE_ACTIONS } from "../util/permissionLevels";
import {
    UploadSeriesAclQuery,
    UploadSeriesAclQuery$data,
} from "./__generated__/UploadSeriesAclQuery.graphql";


const PATH = "/~manage/upload" as const;
export const UploadRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<UploadQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => <Upload knownRolesRef={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query UploadQuery {
        ... UserData
        ... AccessKnownRolesData
    }
`;

export type AclArray = NonNullable<UploadSeriesAclQuery$data["series"]>["acl"];
type Metadata = {
    title: string;
    description: string;
    series?: {
        id: string;
        acl: AclArray;
    };
    acl: Acl;
};

type Props = {
    knownRolesRef: AccessKnownRolesData$key;
};

const Upload: React.FC<Props> = ({ knownRolesRef }) => {
    const { t } = useTranslation();
    const knownRoles = useFragment(knownRolesFragment, knownRolesRef);

    return (
        <div css={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
        }}>
            <Breadcrumbs
                path={[{ label: t("user.manage-content"), link: ManageRoute.url }]}
                tail={t("upload.title")}
            />
            <PageTitle title={t("upload.title")} />
            <UploadMain {...{ knownRoles }} />
        </div>
    );
};


type CancelButtonProps = {
    abortController: MutableRefObject<AbortController>;
};

const CancelButton: React.FC<CancelButtonProps> = ({ abortController }) => {
    const { t } = useTranslation();

    return (
        <div css={{
            margin: "8px",
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
        }}>
            <Button
                kind="danger"
                onClick={() => abortController.current.abort()}
            >{t("upload.cancel")}</Button>
        </div>
    );
};

type UploadMainProps = {
    knownRoles: AccessKnownRolesData$data;
};

const UploadMain: React.FC<UploadMainProps> = ({ knownRoles }) => {
    // TODO: on first mount, send an `ocRequest` to `info/me.json` and make sure
    // that connection works. That way we can show an error very early, before
    // the user selected a file.

    const { t } = useTranslation();
    const router = useRouter();

    const [files, setFiles] = useState<FileList | null>(null);
    const [uploadState, setUploadState] = useRefState<UploadState | null>(null);
    const [metadata, setMetadata] = useRefState<Metadata | null>(null);

    const progressHistory = useRef<ProgressHistory>([]);
    const abortController = useRef(new AbortController());

    router.listenAtNav(() => {
        const state = uploadState.current?.state;
        if (state && !["done", "cancelled", "error"].includes(state)) {
            abortController.current.abort();
        }
    });

    useNavBlocker(() => !!uploadState.current
        && !["done", "cancelled"].includes(uploadState.current.state));

    // Get user info
    const user = useUser();
    if (!isRealUser(user) || !user.canUpload) {
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
            onProgress(
                progress,
                progressHistory.current,
                uploadState.current,
                setUploadState,
                abortController,
            );
        };
        const onDone = (mediaPackage: string) => {
            if (metadata.current === null) {
                setUploadState({ state: "waiting-for-metadata", mediaPackage, abortController });
            } else {
                finishUpload(mediaPackage, metadata.current, user, setUploadState);
            }
        };
        startUpload(files, setUploadState, onProgressCallback, onDone, abortController);
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
            <LuCheckCircle css={{ fontSize: 64, color: COLORS.happy0 }} />
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
                finishUpload(mediaPackage, metadata, user, setUploadState);
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
                maxWidth: 900,
            }}>
                <UploadState state={uploadState.current} />
                <div>
                    {/* TODO: Show something after saving metadata.
                        - Just saying "saved" is kind of misleading because the data is only local.
                        - Maybe just show the form, but disable all inputs?
                        - ...
                    */}
                    {uploadState.current.state !== "cancelled" && (
                        !metadata.current
                            ? <MetaDataEdit
                                onSave={onMetadataSave}
                                disabled={hasUploadError}
                                knownRoles={knownRoles}
                            />
                            : !hasUploadError && (
                                <div css={{ margin: "0 auto", maxWidth: 500 }}>
                                    <Card kind="info">{t("upload.still-uploading")}</Card>
                                </div>
                            )
                    )}
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
    abortController: MutableRefObject<AbortController>,
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
        setUploadState({ state: "uploading-tracks", progress, secondsLeft, abortController });
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
            causes: new Set([t("upload.errors.opencast-unreachable")]),
            // Opencast could be down, but it's confusing setting this to true
            probablyOurFault: false,
            potentiallyInternetProblem: true,
        };
    } else if (error instanceof OcServerError) {
        info = {
            causes: new Set([t("upload.errors.opencast-server-error")]),
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    } else if (error instanceof JwtInvalid) {
        info = {
            causes: new Set([t("upload.errors.jwt-invalid")]),
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    } else {
        info = errorDisplayInfo(error, i18n);
    }


    return (
        <div css={{ maxWidth: 750 }}>
            <Card kind="error">
                <ErrorDisplay info={info} failedAction={t("upload.errors.failed-to-upload")} />
            </Card>
        </div>
    );
};



// ==============================================================================================
// ===== Sub-components
// ==============================================================================================

const isValidForUpload = (file: File): boolean =>
    file.type.startsWith("video/") || file.type.startsWith("audio/");

type FileSelectProps = {
    onSelect: (files: FileList) => void;
};

/** First state of the uploader: asking the user to select video files */
const FileSelect: React.FC<FileSelectProps> = ({ onSelect }) => {
    const { t } = useTranslation();
    const fileInput = useRef<HTMLInputElement>(null);

    const [error, setError] = useState<string | null>(null);
    const [dragCounter, setDragCounter] = useState(0);
    const isDragging = dragCounter > 0;

    const onSelectRaw = (files: FileList) => {
        if (files.length === 0) {
            setError(t("upload.not-a-file"));
        } else if (files.length > 1) {
            setError(t("upload.too-many-files"));
        } else if (!Array.from(files).every(isValidForUpload)) {
            setError(t("upload.not-video-or-audio"));
        } else {
            onSelect(files);
        }
    };

    return (
        <div
            onDragEnter={e => {
                setDragCounter(old => old + 1);
                e.preventDefault();
            }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={() => setDragCounter(old => old - 1)}
            onDrop={e => {
                onSelectRaw(e.dataTransfer.files);
                setDragCounter(0);
                e.preventDefault();
            }}
            css={{
                width: "100%",
                height: "100%",
                border: "2.5px dashed",
                borderRadius: 10,
                display: "flex",
                padding: 8,
                flexDirection: "column",
                gap: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDragging ? COLORS.neutral10 : "none",
                borderColor: isDragging ? COLORS.primary0 : COLORS.neutral25,
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
                color: COLORS.neutral60,
            }}>
                {/* This depends on the SVG elements used in the icon. Technically, the icon pack
                    does not guarantee that and could change it at any time. But we decided it's
                    fine in this case. It is unlikely to change and if it breaks, nothing bad could
                    happen. Only the animation is broken. */}
                <LuUpload css={{
                    position: "absolute",
                    top: isDragging ? 8 : 0,
                    transition: "top var(--transition-length)",
                    "& > path": { display: "none" },
                }} />
                <LuUpload css={{ "& > polyline, & > line": { display: "none" } }} />
            </div>

            {t("upload.drop-to-upload")}

            {/* "Select files" button */}
            <div css={{ marginTop: 16 }}>
                <Button
                    kind="call-to-action"
                    onClick={() => currentRef(fileInput).click()}
                >{t("upload.select-files")}</Button>
                <input
                    ref={fileInput}
                    onChange={e => {
                        if (e.target.files) {
                            onSelectRaw(e.target.files);
                        }
                    }}
                    type="file"
                    accept="video/*, audio/*"
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
    | { state: "uploading-tracks"; progress: Progress; secondsLeft: number | null;
        abortController: MutableRefObject<AbortController>; }
    // Tracks have been uploaded, but the user still has to save the metadata to finish the upload.
    | { state: "waiting-for-metadata"; mediaPackage: string;
        abortController: MutableRefObject<AbortController>; }
    // After the tracks have been uploaded, just adding metadata, ACL and then ingesting.
    | { state: "finishing" }
    // The upload is completely done
    | { state: "done" }
    // The upload was cancelled
    | { state: "cancelled" }
    // An error occurred during the upload
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
        const abortController = state.abortController;
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

        return <>
            <BarWithText state={progress}>
                <span>{roundedPercent}%</span>
                <span>
                    {prettyTime && t("upload.time-estimate.time-left", { time: prettyTime })}
                </span>
            </BarWithText>
            <CancelButton abortController={abortController} />
        </>;
    } else if (state.state === "waiting-for-metadata") {
        const abortController = state.abortController;
        return <>
            <BarWithText state="waiting">
                <span>{t("upload.waiting-for-metadata")}</span>
            </BarWithText>
            <CancelButton abortController={abortController} />
        </>;
    } else if (state.state === "finishing") {
        return <BarWithText state="progressing">
            <span>{t("upload.finishing")}</span>
        </BarWithText>;
    } else if (state.state === "cancelled") {
        return <div css={{
            marginTop: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            "& > :first-child": { marginBottom: "2rem" },
        }}>
            <span>{t("upload.upload-cancelled")}</span>
            <div>
                <LinkButton kind="call-to-action" to={UploadRoute.url}>
                    {t("upload.reselect")}
                </LinkButton>
            </div>
        </div>;
    } else if (state.state === "error") {
        return <UploadErrorBox error={state.error} />;
    } else {
        return assertNever(state);
    }
};

type BarWithTextProps = {
    state: ProgressBarProps["state"];
    children: ReactNode;
};

/** Helper component for `UploadState` */
const BarWithText: React.FC<BarWithTextProps> = ({ state, children }) => <>
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
                + `${color0},`
                + `${color0} ${realSize * amountColor0}px,`
                + `${color1} ${realSize * amountColor0}px,`
                + `${color1} ${realSize}px)`,
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
            ...animatedStripes(-45, COLORS.happy2, COLORS.happy0, 1.5),
        }} />;
    } else if (state === "waiting") {
        return <div css={{
            ...shared,
            ...animatedStripes(45, COLORS.neutral60, COLORS.neutral40, 4),
        }} />;
    } else {
        return (
            <div css={{
                ...shared,
                backgroundColor: COLORS.neutral15,
            }}>
                <div css={{
                    height: "100%",
                    transition: "width 200ms",
                    width: `${state * 100}%`,
                    backgroundColor: COLORS.happy0,
                }} />
            </div>
        );
    }
};


const SeriesAclQuery = graphql`
    query UploadSeriesAclQuery($seriesId: String!) {
        series: seriesByOpencastId(id: $seriesId) {
            acl { role actions info { label implies large } }
        }
    }
`;

type MetaDataEditProps = {
    onSave: (metadata: Metadata) => void;
    disabled: boolean;
    knownRoles: AccessKnownRolesData$data;
};

/** Form that lets the user set metadata about the video */
const MetaDataEdit: React.FC<MetaDataEditProps> = ({ onSave, disabled, knownRoles }) => {
    const { t } = useTranslation();
    const user = useUser();
    if (!isRealUser(user)) {
        return unreachable();
    }

    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const seriesFieldId = useId();
    const [lockedAcl, setLockedAcl] = useState<Acl | null>(null);
    const [aclError, setAclError] = useState<ReactNode>(null);
    const [aclLoading, setAclLoading] = useState(false);
    const aclEditingLocked = !!lockedAcl || aclLoading || !!aclError;

    const fetchSeriesAcl = async (seriesId: string): Promise<Acl | null> => {
        const data = await fetchQuery<UploadSeriesAclQuery>(
            environment,
            SeriesAclQuery,
            { seriesId }
        ).toPromise();

        if (!data?.series?.acl) {
            return null;
        }

        return mapAcl(data.series.acl);
    };

    const onSeriesChange = async (data: { opencastId?: string }) => {
        setAclError(null);

        if (!data?.opencastId) {
            setLockedAcl(null);
            seriesField.onChange(undefined);
            return;
        }

        seriesField.onChange({ id: data.opencastId });

        if (CONFIG.lockAclToSeries) {
            setAclLoading(true);
            try {
                const seriesAcl = await fetchSeriesAcl(data.opencastId);
                setLockedAcl(seriesAcl);
                seriesField.onChange({
                    id: data.opencastId,
                    acl: seriesAcl,
                });
            } catch (e) {
                setAclError(
                    <ErrorDisplay
                        error={e}
                        failedAction={t("upload.errors.failed-fetching-series-acl")}
                    />
                );
            } finally {
                setAclLoading(false);
            }
        }
    };

    const defaultAcl: Acl = new Map([
        [user.userRole, {
            actions: new Set(["read", "write"]),
            info: {
                label: { "default": user.displayName },
                implies: null,
                large: false,
            },
        }],
        [COMMON_ROLES.ANONYMOUS, {
            actions: new Set(["read"]),
            info: null,
        }],
    ]);

    const { register, handleSubmit, control, formState: { isValid, errors } } = useForm<Metadata>({
        mode: "onChange",
        defaultValues: { acl: defaultAcl },
    });

    const { field: seriesField } = useController({
        name: "series",
        control,
        rules: {
            required: CONFIG.upload.requireSeries ? t("upload.errors.field-required") : false,
        },
    });

    const onSubmit = handleSubmit(data => onSave(data));

    // We only allow submitting the form on clicking the button below so that
    // pressing 'enter' inside inputs doesn't lead to submit the form too
    // early.
    return (
        <Form
            noValidate
            onSubmit={e => e.preventDefault()}
            css={{
                margin: "32px 2px",
                "label": {
                    color: "var(--color-neutral90)",
                },
            }}
        >
            {/* Title */}
            <InputContainer>
                <TitleLabel htmlFor={titleFieldId} />
                <Input
                    id={titleFieldId}
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

            <div css={{ maxWidth: 750 }}>
                {/* Description */}
                <InputContainer>
                    <label htmlFor={descriptionFieldId}>{t("upload.metadata.description")}</label>
                    <TextArea id={descriptionFieldId} {...register("description")} />
                </InputContainer>

                {/* Series */}
                <InputContainer>
                    <label htmlFor={seriesFieldId}>
                        {t("series.series")}
                        {CONFIG.upload.requireSeries && <FieldIsRequiredNote />}
                        <WithTooltip
                            tooltip={t("upload.metadata.note-writable-series")}
                            tooltipCss={{ width: 400 }}
                            css={{
                                display: "inline-block",
                                verticalAlign: "middle",
                                fontWeight: "normal",
                                marginLeft: 8,
                            }}
                        >
                            <span><LuInfo tabIndex={0} /></span>
                        </WithTooltip>
                    </label>
                    <VideoListSelector
                        type="series"
                        inputId={seriesFieldId}
                        writableOnly
                        menuPlacement="top"
                        onChange={data => onSeriesChange({ opencastId: data?.opencastId })}
                        onBlur={seriesField.onBlur}
                        required={CONFIG.upload.requireSeries}
                    />
                    {boxError(errors.series?.message)}
                </InputContainer>
            </div>

            {/* ACL */}
            <InputContainer>
                <h2 css={{
                    marginTop: 32,
                    marginBottom: 12,
                    fontSize: 22,
                }}>{t("manage.my-videos.acl.title")}</h2>
                {boxError(aclError)}
                {aclLoading && <Spinner size={20} />}
                {lockedAcl && (
                    <Card kind="info" iconPos="left" css={{
                        maxWidth: 700,
                        fontSize: 14,
                        marginBottom: 10,
                    }}>
                        {t("manage.access.locked-to-series")}
                    </Card>
                )}
                <div {...aclEditingLocked && { inert: "true" }} css={{
                    ...aclEditingLocked && { opacity: .7 },
                }}>
                    <Controller
                        name="acl"
                        control={control}
                        render={({ field }) => <AclSelector
                            userIsRequired
                            onChange={field.onChange}
                            acl={lockedAcl ?? field.value}
                            knownRoles={knownRoles}
                            permissionLevels={READ_WRITE_ACTIONS}
                        />}
                    />
                </div>
            </InputContainer>

            {/* Submit button */}
            <Button
                kind="call-to-action"
                disabled={!isValid || disabled}
                css={{ marginTop: 32, marginBottom: 160 }}
                onClick={onSubmit}>
                {t("upload.metadata.save")}
            </Button>
        </Form>
    );
};


// ==============================================================================================
// ===== Helper functions to send JWT-authenticated requests to OC
// ==============================================================================================

/** Returns the full Opencast URL for the given path */
const ocUrl = (path: string): string => `${CONFIG.opencast.uploadNode}${path}`;

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

/** The JWT sent to Opencast was rejected. */
export class JwtInvalid extends Error {
    public constructor() {
        super();
        this.name = "Opencast JWT Auth Error";
        this.message = "JWT was rejected by Opencast";
    }
}

/** Performs a request against Opencast, authenticated via JWT */
const ocRequest = async (
    path: string,
    options: RequestInit = {},
): Promise<string> => {
    const jwt = await getJwt("UPLOAD");

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


// ==============================================================================================
// ===== Functions to perform actions against the ingest API
// ==============================================================================================

const startUpload = async (
    files: FileList,
    setUploadState: (state: UploadState) => void,
    onProgress: (progress: Progress) => void,
    onDone: (mediaPackage: string) => void,
    abortController: MutableRefObject<AbortController>,
) => {
    try {
        setUploadState({ state: "starting" });

        // Log Opencast user information. This is also a good test whether the
        // communication with OC works at all, without potentially creating an
        // empty new media package.
        const userInfo = JSON.parse(await ocRequest("/info/me.json"));
        delete userInfo.org;
        // eslint-disable-next-line no-console
        console.debug("JWT user: ", userInfo);

        // Create a new media package to start the upload
        let mediaPackage = await ocRequest("/ingest/createMediaPackage");

        const tracks = Array.from(files)
            .map(file => ({ file, flavor: "presentation/source" as const }));
        mediaPackage = await uploadTracks(
            mediaPackage,
            tracks,
            onProgress,
            abortController,
            setUploadState,
        );
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
    mediaPackage: string,
    tracks: Track[],
    onProgress: (progress: number) => void,
    abortController: MutableRefObject<AbortController>,
    setUploadState: (state: UploadState) => void,
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
        const jwt = await getJwt("UPLOAD");
        mediaPackage = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            abortController.current.signal.addEventListener("abort", () => {
                xhr.abort();
                abortController.current = new AbortController();
                cancelUpload(mediaPackage, setUploadState);
            });

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
            xhr.onerror = () => reject(new OcNetworkError());
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


const cancelUpload = async (
    mediaPackage: string,
    setUploadState: (state: UploadState) => void,
) => {
    try {
        setUploadState({ state: "cancelled" });

        const body = new FormData();
        body.append("mediaPackage", mediaPackage);
        await ocRequest("/ingest/discardMediaPackage", { method: "post", body: body });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error cancelling: ", error);
    }
};

/** Ingest the given metadata and finishes the ingest process */
const finishUpload = async (
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
            const body = new URLSearchParams();
            body.append("mediaPackage", mediaPackage);
            body.append("dublinCore", dcc);
            body.append("flavor", "dublincore/episode");

            mediaPackage = await ocRequest(
                "/ingest/addDCCatalog",
                { method: "post", body },
            );
        }

        // Add ACL
        if (!CONFIG.lockAclToSeries || !metadata.series) {
            const acl = constructAcl(metadata.acl);
            const body = new FormData();
            body.append("flavor", "security/xacml+episode");
            body.append("mediaPackage", mediaPackage);
            body.append("BODY", new Blob([acl]), "acl.xml");

            mediaPackage = await ocRequest(
                "/ingest/addAttachment",
                { method: "post", body },
            );
        }

        // Finish ingest
        {
            const body = new FormData();
            body.append("mediaPackage", mediaPackage);
            if (CONFIG.upload.workflow) {
                body.append("workflowDefinitionId", CONFIG.upload.workflow);
            }
            await ocRequest("/ingest/ingest", { method: "post", body: body });
        }

        setUploadState({ state: "done" });
    } catch (error) {
        setUploadState({ state: "error", error });
    }
};

/**
 * Encodes a value for inclusion in XML sent to Opencast.
 */
const encodeValue = (value: string): string =>
    new XMLSerializer().serializeToString(new Text(value));

/** Creates a Dublin Core Catalog in XML format that describes the given metadata. */
const constructDcc = (metadata: Metadata, user: User): string => {
    const tag = (tag: string, value?: string): string =>
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
            ${tag("dcterms:isPartOf", metadata.series?.id)}
            ${tag("dcterms:creator", user.displayName)}
            ${tag("dcterms:spatial", "Tobira Upload")}
        </dublincore>
    `;
};

/** Constructs an ACL XML description from the given roles that are allowd to read/write */
const constructAcl = (acl: Acl): string => {
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

    const rules = [...acl.entries()]
        .flatMap(([role, info]) => [...info.actions].map(action => makeRule(action, role)));

    return `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Policy PolicyId="mediapackage-1"
          RuleCombiningAlgId=
            "urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides"
          Version="2.0"
          xmlns="urn:oasis:names:tc:xacml:2.0:policy:schema:os">
            ${rules.join("\n")}
        </Policy>
    `.trim();
};
