import React, { useState, useRef, useEffect, useCallback, PropsWithChildren, useMemo } from "react";
import ReactDOM from "react-dom";
import { Button, ProtoButton, WithTooltip, Spinner, useColorScheme } from "@opencast/appkit";
import { LuDownload, LuEye, LuEyeOff, LuUpload, LuCircleCheck } from "react-icons/lu";
import yaml from "js-yaml";
import { css } from "@emotion/react";

import i18n from "../i18n";
import blankTranslation from "../i18n/locales/blank.yaml";
import { COLORS } from "../color";
import { TextArea } from "../ui/Input";


export type TranslationRecord = Record<string, string>;
export type TranslationCollection = Record<string, TranslationRecord>;

const LOCAL_STORAGE_EDITS = "i18nEdits";
const LOCAL_STORAGE_BACKUP_EDITS = "i18nEdits_backup";
const VISIBLE_LANGS = "visibleLangs";
const BACKUP_THRESHOLD = 20;
const INITIAL_RENDER_COUNT = 20;

export const loadSavedEdits = (): TranslationCollection => {
    const raw = localStorage.getItem(LOCAL_STORAGE_EDITS);
    return raw ? JSON.parse(raw) : {};
};

const saveAllEdits = (edits: TranslationCollection) => {
    localStorage.setItem(LOCAL_STORAGE_EDITS, JSON.stringify(edits));
};

const performBackupSave = (edits: TranslationCollection) => {
    localStorage.setItem(LOCAL_STORAGE_BACKUP_EDITS, JSON.stringify(edits));
};

const flattenKeys = (obj: TranslationRecord, prefix = ""): string[] =>
    Object.entries(obj).reduce((keys, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return keys.concat(flattenKeys(value, path));
        } else {
            return keys.concat(path);
        }
    }, [] as string[]);

const flattenTranslation = (obj: TranslationRecord, prefix = "", out: TranslationRecord = {}) => {
    Object.entries(obj).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            flattenTranslation(value, path, out);
        } else {
            out[path] = (typeof value === "string" || typeof value === "number")
                ? String(value)
                : "";
        }
    });
    return out;
};

type NestedTranslation = {
    [key: string]: string | NestedTranslation;
};

const hasKey = <T extends object>(obj: T, key: PropertyKey): key is keyof T => key in obj;
const isNestedTranslation = (value: unknown): value is NestedTranslation =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const matchesPattern = (obj: unknown) => {
    if (!isNestedTranslation(obj)) {
        return false;
    }

    const checkStructure = (pattern: unknown, candidate: unknown): boolean => {
        if (!isNestedTranslation(pattern)) {
            return true;
        }
        if (!isNestedTranslation(candidate)) {
            return false;
        }
        return Object.keys(pattern).every(key => {
            if (!hasKey(candidate, key)) {
                return false;
            }
            return checkStructure(pattern[key], candidate[key]);
        });
    };

    return checkStructure(blankTranslation, obj);
};


type TranslationModalProps = {
    open: boolean;
    onClose: () => void;
}

export const TranslationModal: React.FC<TranslationModalProps> = ({ open, onClose }) => {
    const isDark = useColorScheme().scheme === "dark";
    const namespace = "translation";

    const collectionRef = useRef<TranslationCollection>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importLangRef = useRef<string | null>(null);
    const backupEditCounterRef = useRef<number>(0);

    const languages = Object.keys(i18n.options.resources || {});
    const allKeys = useMemo(() => flattenKeys(blankTranslation as TranslationRecord), []);
    const editableLangs = languages.filter(lang => !["en", "de"].includes(lang));

    const getValue = (lang: string, key: string) => i18n.getResource(lang, namespace, key) ?? "";

    const [importSuccess, setImportSuccess] = useState<Record<string, boolean>>({});
    const [importing, setImporting] = useState<Record<string, boolean>>({});
    const [displayedKeys, setDisplayedKeys] = useState<string[]>([]);
    const [visibleLangs, setVisibleLangs] = useState<string[]>(() => {
        const storedVisibleLangs = localStorage.getItem(VISIBLE_LANGS);
        return storedVisibleLangs
            ? JSON.parse(storedVisibleLangs)
            : languages.filter(lang => lang !== "de");
    });

    const [editedValues, setEditedValues] = useState<TranslationCollection>(() => {
        const initialValues: TranslationCollection = {};
        languages.forEach(lang => {
            initialValues[lang] = {};
            allKeys.forEach(key => initialValues[lang][key] = getValue(lang, key));
        });

        const savedEdits = loadSavedEdits();
        Object.keys(savedEdits).forEach(lang => {
            if (initialValues[lang]) {
                Object.assign(initialValues[lang], savedEdits[lang]);
            }
        });
        return initialValues;
    });

    const handleChange = useCallback((lang: string, key: string, value: string) => {
        setEditedValues(prev => {
            if (prev[lang]?.[key] === value) {
                return prev;
            }

            const updatedValues = {
                ...prev,
                [lang]: {
                    ...(prev[lang] || {}),
                    [key]: value,
                },
            };
            saveAllEdits(updatedValues);

            backupEditCounterRef.current += 1;
            if (backupEditCounterRef.current >= BACKUP_THRESHOLD) {
                performBackupSave(updatedValues);
                backupEditCounterRef.current = 0;
            }
            return updatedValues;
        });
    }, []);

    const downloadYaml = (lang: string) => {
        const flatTranslations = editedValues[lang] || {};
        const nestedTranslations = JSON.parse(JSON.stringify(blankTranslation));

        (function overlay(obj: TranslationRecord, prefix = "") {
            Object.entries(obj).forEach(([key, value]) => {
                const path = prefix ? `${prefix}.${key}` : key;
                if (value && typeof value === "object") {
                    overlay(value, path);
                } else {
                    obj[key] = flatTranslations[path] ?? "";
                }
            });
        })(nestedTranslations);

        const yamlStr = yaml.dump(nestedTranslations);
        const blob = new Blob([yamlStr], { type: "application/x-yaml" });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = `${lang}.yaml`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    };

    const handleClose = () => {
        editableLangs.forEach(lang => {
            i18n.removeResourceBundle(lang, namespace);
            i18n.addResourceBundle(lang, namespace, editedValues[lang] || {}, false, true);
        });

        i18n.changeLanguage(i18n.language);
        onClose();
    };

    const handleImport = (lang: string) => {
        importLangRef.current = lang;
        fileInputRef.current?.click();
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const lang = importLangRef.current;
        if (!file || !lang) {
            return;
        };

        setImporting(prev => ({ ...prev, [lang]: true }));

        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const imported = yaml.load(ev.target?.result as string);
                if (!matchesPattern(imported)) {
                    alert("YAML structure does not match the required pattern.");
                    setImporting(prev => ({ ...prev, [lang]: false }));
                    return;
                }
                const flat = flattenTranslation(imported as TranslationRecord);
                setEditedValues(prev => {
                    const updated = { ...prev, [lang]: { ...prev[lang], ...flat } };
                    saveAllEdits(updated);
                    i18n.removeResourceBundle(lang, namespace);
                    i18n.addResourceBundle(lang, namespace, updated[lang], false, true);
                    i18n.changeLanguage(i18n.language);

                    setImporting(prev => ({ ...prev, [lang]: false }));
                    setImportSuccess(prev => ({ ...prev, [lang]: true }));

                    return updated;
                });
            } catch (err) {
                alert(`Failed to import YAML: ${err instanceof Error ? err.message : String(err)}`);
                setImporting(prev => ({ ...prev, [lang]: false }));
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    useEffect(() => {
        const successLangs = Object.entries(importSuccess)
            .filter(([_, value]) => value)
            .map(([lang]) => lang);

        if (successLangs.length === 0) {
            return;
        }

        const timers = successLangs.map(lang =>
            setTimeout(() => setImportSuccess(prev => ({ ...prev, [lang]: false })), 2000));

        return () => timers.forEach(timer => clearTimeout(timer));
    }, [importSuccess]);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (/^textarea$/i.test(document.activeElement?.tagName ?? "")) {
                    return;
                }
                handleClose();
            }
        };

        document.addEventListener("keydown", handleShortcut);
        return () => document.removeEventListener("keydown", handleShortcut);
    }, [handleClose]);

    useEffect(() => {
        localStorage.setItem(VISIBLE_LANGS, JSON.stringify(visibleLangs));
    }, [visibleLangs]);

    useEffect(() => {
        const initialTranslations: TranslationCollection = {};
        languages.forEach(lang => {
            initialTranslations[lang] = {};
            allKeys.forEach(key => initialTranslations[lang][key]
                = i18n.getResourceBundle(lang, namespace)?.[key] || "");
        });
        collectionRef.current = initialTranslations;
    }, [languages, allKeys, namespace]);

    useEffect(() => {
        let timerId: NodeJS.Timeout;

        if (open) {
            setDisplayedKeys(allKeys.slice(0, INITIAL_RENDER_COUNT));

            if (allKeys.length > INITIAL_RENDER_COUNT) {
                timerId = setTimeout(() => {
                    setDisplayedKeys(allKeys);
                }, 50);
            }
        } else {
            setDisplayedKeys([]);
        }

        return () => {
            if (timerId) {
                clearTimeout(timerId);
            }
        };
    }, [open, allKeys]);


    const headerStyle = css({
        border: `1px solid ${COLORS.neutral25}`,
        padding: 8,
        backgroundColor: isDark ? COLORS.neutral20 : COLORS.neutral15,
        textAlign: "left",
        position: "sticky",
        top: 0,
    });
    const columnWidth = (lang: string) => visibleLangs.includes(lang)
        ? `calc((100% - 200px - (${languages.length - visibleLangs.length} * 60px))
            / ${visibleLangs.length})`
        : "60px";


    return !open ? null : ReactDOM.createPortal(<ModalWrapper onClose={handleClose}>
        <input
            type="file"
            accept=".yaml, .yml"
            ref={fileInputRef}
            css={{ display: "none" }}
            onChange={onFileChange}
        />
        <table css={{
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
            width: "100%",
        }}>
            <colgroup>
                <col css={{ width: "17%" }} />
                {languages.map(lang => <col key={lang} css={{ width: columnWidth(lang) }} />)}
            </colgroup>
            <thead>
                <tr>
                    <th css={headerStyle}>Key</th>
                    {languages.map(lang => <th key={lang} css={headerStyle}>
                        <TableHeader key={lang} {...{
                            lang,
                            editableLangs,
                            visibleLangs,
                            setVisibleLangs,
                            downloadYaml,
                            handleImport,
                            importing,
                            importSuccess,
                        }} />
                    </th>)}
                </tr>
            </thead>
            <tbody>
                {displayedKeys.map(tKey => <tr key={tKey}>
                    <td css={{
                        border: `1px solid ${COLORS.neutral15}`,
                        padding: 8,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                    }}>
                        {tKey.split(".").map((part, idx, arr) =>
                            <React.Fragment key={idx}>
                                {part}
                                {idx < arr.length - 1 && <>.<wbr /></>}
                            </React.Fragment>)
                        }
                    </td>
                    {languages.map(lang => {
                        const currentValue = editedValues[lang]?.[tKey] ?? "";
                        const originalValue = getValue(lang, tKey);

                        return <MemoizedTranslationCell
                            key={lang}
                            {...{ lang, tKey, currentValue, originalValue, columnWidth }}
                            isEditable={editableLangs.includes(lang)}
                            isVisible={visibleLangs.includes(lang)}
                            onCellChange={handleChange}
                        />;
                    })}
                </tr>)}
            </tbody>
        </table>
    </ModalWrapper>,
    document.body);
};

type TableHeaderProps = {
    lang: string;
    editableLangs: string[];
    visibleLangs: string[];
    setVisibleLangs: React.Dispatch<React.SetStateAction<string[]>>;
    downloadYaml: (lang: string) => void;
    handleImport: (lang: string) => void;
    importing: Record<string, boolean>;
    importSuccess: Record<string, boolean>;
};

const TableHeader: React.FC<TableHeaderProps> = ({
    lang,
    editableLangs,
    setVisibleLangs,
    visibleLangs,
    downloadYaml,
    handleImport,
    importing,
    importSuccess,
}) => {
    const isDark = useColorScheme().scheme === "dark";

    const ioButtonStyle = css({ ...isDark && { backgroundColor: COLORS.neutral30 } });
    const iconButtonStyle = css({ marginTop: 4, ":hover>svg": { strokeWidth: 3 } });


    return (
        <div css={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 15,
        }}>
            <span>{lang}</span>
            {editableLangs.includes(lang) && visibleLangs.includes(lang) && (
                <span css={{ display: "flex", gap: 8 }}>
                    <WithTooltip tooltip="Export translations as YAML">
                        <Button css={ioButtonStyle} onClick={() => downloadYaml(lang)}>
                            <LuDownload />
                        </Button>
                    </WithTooltip>
                    <WithTooltip tooltip="Import translations from YAML">
                        <Button
                            onClick={() => handleImport(lang)}
                            disabled={importing[lang] || importSuccess[lang]}
                            css={{ ...ioButtonStyle, position: "relative", minWidth: "34px" }}
                        >
                            <LuUpload css={{
                                opacity: (importing[lang] || importSuccess[lang]) ? 0 : 1,
                                transition: "opacity 150ms ease",
                            }} />
                            <Spinner size={16} css={{
                                position: "absolute",
                                marginLeft: 2,
                                opacity: importing[lang] ? 1 : 0,
                                transition: "opacity ease-out 250ms",
                            }} />
                            <LuCircleCheck size={16} css={{
                                color: COLORS.happy0,
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                                opacity: importSuccess[lang] ? 1 : 0,
                                transition: "opacity ease-in 300ms",
                            }} />
                        </Button>
                    </WithTooltip>
                </span>
            )}
            <WithTooltip
                tooltip={visibleLangs.includes(lang) ? "Hide" : "Show"}
                placement="bottom-end"
            >
                {visibleLangs.includes(lang)
                    ? <ProtoButton css={iconButtonStyle} onClick={() =>
                        setVisibleLangs(v => v.filter(l => l !== lang))
                    }><LuEyeOff /></ProtoButton>
                    : <ProtoButton css={iconButtonStyle} onClick={() =>
                        setVisibleLangs(v => [...v, lang])
                    }><LuEye /></ProtoButton>
                }
            </WithTooltip>
        </div>
    );
};


type TranslationCellProps = {
    lang: string;
    tKey: string;
    currentValue: string;
    originalValue: string;
    isEditable: boolean;
    isVisible: boolean;
    onCellChange: (lang: string, tKey: string, value: string) => void;
    columnWidth: (lang: string) => string;
}

const TranslationCell: React.FC<TranslationCellProps> = ({
    lang,
    tKey,
    currentValue,
    originalValue,
    isEditable,
    isVisible,
    onCellChange,
    columnWidth,
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const [value, setValue] = useState(currentValue);

    useEffect(() => {
        setValue(currentValue);
    }, [currentValue]);

    let inner;
    if (!isVisible) {
        inner = <span> ... </span>;
    } else if (!isEditable) {
        inner = <p css={{ margin: 0 }}>{originalValue || <em> — </em>}</p>;
    } else {
        inner = <TextArea
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={() => {
                if (value !== currentValue) {
                    requestAnimationFrame(() => onCellChange(lang, tKey, value));
                }
            }}
            onKeyDown={e => {
                if ((e.key === "Enter" || e.key === "Tab" || e.key === "Escape") && !e.shiftKey) {
                    if (value !== currentValue) {
                        requestAnimationFrame(() => onCellChange(lang, tKey, value));
                    }
                    if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLTextAreaElement).blur();
                    }
                }
            }}
            css={{
                height: "100%",
                minHeight: "unset",
                padding: 4,
                border: `1px solid ${COLORS.neutral15}`,
                ...(value === "" && {
                    backgroundColor: isDark
                        ? "#643636"
                        : "#ffecec",
                }),
            }}
        />;
    }

    return <td css={{
        border: `1px solid ${COLORS.neutral15}`,
        padding: 8,
        width: columnWidth(lang),
        overflow: "hidden",
        wordBreak: "break-word",
    }}>
        {inner}
    </td>;
};

const MemoizedTranslationCell = React.memo(TranslationCell);


type ModalWrapperProps = PropsWithChildren<{ onClose: () => void }>;

const ModalWrapper: React.FC<ModalWrapperProps> = ({ children, onClose }) => {
    const isDark = useColorScheme().scheme === "dark";

    return <div onClick={onClose} css={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontSize: 14,
    }}>
        <div onClick={e => e.stopPropagation()} css={{
            width: "90%",
            maxWidth: "1200px",
            height: "90%",
            backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral05,
            borderRadius: 8,
            overflow: "auto",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 20%)",
        }}>
            {children}
        </div>
    </div>;
};
