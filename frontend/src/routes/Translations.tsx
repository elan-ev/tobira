import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { Button, ProtoButton, WithTooltip, Spinner } from "@opencast/appkit";
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
const VISIBLE_LANGS = "visibleLangs";

export const loadSavedEdits = (): TranslationCollection => {
    const raw = localStorage.getItem(LOCAL_STORAGE_EDITS);
    return raw ? JSON.parse(raw) : {};
};

const saveAllEdits = (edits: TranslationCollection) => {
    localStorage.setItem(LOCAL_STORAGE_EDITS, JSON.stringify(edits));
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
    const collectionRef = useRef<TranslationCollection>({});
    const languages = useMemo(
        () => Object.keys(i18n.options.resources || {}),
        [],
    );

    const [visibleLangs, setVisibleLangs] = useState<string[]>(() => {
        const storedVisibleLangs = localStorage.getItem(VISIBLE_LANGS);
        return storedVisibleLangs
            ? JSON.parse(storedVisibleLangs)
            : languages.filter(lang => lang !== "de");
    });

    const editableLangs = languages.filter(lang => !["en", "de"].includes(lang));
    const namespace = "translation";

    const getValue = (lang: string, key: string) => i18n.getResource(lang, namespace, key) ?? "";

    const allKeys = useMemo(() => {
        const keySet = new Set<string>();
        languages.forEach(lang => {
            const bundle = i18n.getResourceBundle(lang, namespace) || {};
            flattenKeys(bundle).forEach(key => keySet.add(key));
        });
        return Array.from(keySet).sort();
    }, [languages, namespace]);

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
            const updatedValues = {
                ...prev,
                [lang]: {
                    ...prev[lang],
                    [key]: value,
                },
            };
            saveAllEdits(updatedValues);
            return updatedValues;
        });
    }, []);

    const downloadYaml = useCallback((lang: string) => {
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
    }, [editedValues]);

    const handleClose = useCallback(() => {
        editableLangs.forEach(lang => {
            i18n.removeResourceBundle(lang, namespace);
            i18n.addResourceBundle(lang, namespace, editedValues[lang], false, true);
        });

        i18n.changeLanguage(i18n.language);
        onClose();
    }, [languages, namespace, editedValues, i18n, onClose]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importLangRef = useRef<string | null>(null);

    const [importSuccess, setImportSuccess] = useState<Record<string, boolean>>({});
    const [importing, setImporting] = useState<Record<string, boolean>>({});

    const handleImport = useCallback((lang: string) => {
        importLangRef.current = lang;
        fileInputRef.current?.click();
    }, []);

    const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    }, [namespace]);

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

    const headerStyle = css({
        border: `1px solid ${COLORS.neutral25}`,
        padding: 8,
        background: COLORS.neutral15,
        textAlign: "left",
        position: "sticky",
        top: 0,
    });

    const buttonStyle = css({
        marginTop: 4,
        ":hover>svg": { strokeWidth: 3 },
    });

    const columnWidth = (lang: string) => visibleLangs.includes(lang)
        ? `calc((100% - 200px - (${languages.length - visibleLangs.length} * 60px))
            / ${visibleLangs.length})`
        : "60px";

    return !open ? null : ReactDOM.createPortal(
        <div onClick={handleClose} css={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
        }}>
            <div onClick={e => e.stopPropagation()} css={{
                width: "90%",
                maxWidth: "1200px",
                height: "90%",
                background: COLORS.neutral05,
                borderRadius: 8,
                overflow: "auto",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 20%)",
            }}>
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
                        {languages.map(lang => (
                            <col key={lang} css={{ width: columnWidth(lang) }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th css={headerStyle}> Key </th>
                            {languages.map(lang => (
                                <th key={lang} css={headerStyle}>
                                    <div css={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}>
                                        <span>{lang}</span>
                                        {editableLangs.includes(lang) && visibleLangs.includes(lang)
                                            && <span css={{ display: "flex", gap: 8 }}>
                                                <WithTooltip tooltip="Export translations as YAML">
                                                    <Button onClick={() => downloadYaml(lang)}>
                                                        <LuDownload />
                                                    </Button>
                                                </WithTooltip>
                                                <WithTooltip
                                                    tooltip="Import translations from YAML"
                                                >
                                                    <Button
                                                        onClick={() => handleImport(lang)}
                                                        disabled={importing[lang]
                                                            || importSuccess[lang]}
                                                        css={{
                                                            position: "relative",
                                                            minWidth: "34px",
                                                        }}
                                                    >
                                                        <LuUpload css={{
                                                            opacity: (importing[lang]
                                                                || importSuccess[lang]
                                                            ) ? 0 : 1,
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
                                        }
                                        <WithTooltip
                                            tooltip={visibleLangs.includes(lang) ? "Hide" : "Show"}
                                            placement="bottom-end"
                                        >
                                            {visibleLangs.includes(lang) ? (
                                                <ProtoButton css={buttonStyle} onClick={() =>
                                                    setVisibleLangs(v => v.filter(l => l !== lang))
                                                }>
                                                    <LuEyeOff />
                                                </ProtoButton>
                                            ) : (
                                                <ProtoButton css={buttonStyle} onClick={() =>
                                                    setVisibleLangs(v => [...v, lang])
                                                }>
                                                    <LuEye />
                                                </ProtoButton>)}
                                        </WithTooltip>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {allKeys.map(key => (
                            <tr key={key}>
                                <td css={{
                                    border: `1px solid ${COLORS.neutral15}`,
                                    padding: 8,
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                }}>
                                    {key.split(".").map((part, idx, arr) =>
                                        <React.Fragment key={idx}>
                                            {part}
                                            {idx < arr.length - 1 && <>
                                                .<wbr />
                                            </>}
                                        </React.Fragment>)
                                    }
                                </td>
                                {languages.map(lang => (
                                    <td key={lang} css={{
                                        border: `1px solid ${COLORS.neutral15}`,
                                        padding: 8,
                                        width: columnWidth(lang),
                                        overflow: "hidden",
                                        wordBreak: "break-word",
                                    }}>
                                        {!visibleLangs.includes(lang) ? (
                                            <span> ... </span>
                                        ) : !editableLangs.includes(lang) ? (
                                            <p css={{ margin: 0 }}>
                                                {getValue(lang, key) || <em> — </em>}
                                            </p>
                                        ) : (
                                            <TextArea
                                                defaultValue={editedValues[lang]?.[key] || ""}
                                                onBlur={e =>
                                                    handleChange(lang, key, e.target.value)
                                                }
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") {
                                                        (e.target as HTMLInputElement).blur();
                                                    }
                                                }}
                                                css={{
                                                    height: "100%",
                                                    minHeight: "unset",
                                                    padding: 4,
                                                    border: `1px solid ${COLORS.neutral15}`,
                                                    ...editedValues[lang]?.[key] === "" && {
                                                        backgroundColor: "#ffecec",
                                                    },
                                                }}
                                            />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>,
        document.body,
    );
};
