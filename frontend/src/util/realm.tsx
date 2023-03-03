import { TFunction } from "i18next";
import { Props as BreadcrumbsProps } from "../ui/Breadcrumbs";


export const realmBreadcrumbs = (
    t: TFunction,
    realms: readonly ({ name: string | null; path: string })[],
): BreadcrumbsProps["path"] => (
    realms.map(({ name, path }) => ({
        label: name ?? t("realm.missing-name"),
        render: name == null ? label => <i>{label}</i> : undefined,
        link: path,
    }))
);
