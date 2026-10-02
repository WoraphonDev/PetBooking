"use client";

import type { OrgListItem } from "@app/contracts/dto/org-list-item";
import { AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { errorMessage } from "@/lib/api";
import { useApiQuery } from "@/lib/query";
import { DataTable, type DataTableColumn, StatusBadge } from "../shared/table";
import { CreateOrgForm } from "./create-org-form";

export function OrganizationsScreen() {
  const t = useTranslations("AD-02");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const orgs = useApiQuery<AdminOrgsResponse>("admin.orgs", { response: AdminOrgsResponse }, { meta: { toast: false } });
  const columns: DataTableColumn<OrgListItem>[] = [
    { id: "name", header: t("shop"), cell: (row) => row.name },
    { id: "slug", header: t("slug"), cell: (row) => <span className="font-mono">{row.slug}</span> },
    { id: "status", header: t("status"), cell: (row) => <StatusBadge enumName="org_status" value={row.status} /> },
    { id: "ownerEmail", header: t("owner"), cell: (row) => row.ownerEmail ?? t("unavailable") },
    {
      id: "lineStatus",
      header: t("line"),
      cell: (row) => (row.lineStatus === null ? t("unavailable") : <StatusBadge enumName="line_channel_status" value={row.lineStatus} />),
    },
    {
      id: "lastActivityAt",
      header: t("lastActivityAt"),
      cell: (row) =>
        row.lastActivityAt === null ? (
          t("unavailable")
        ) : (
          <time dateTime={row.lastActivityAt}>{format.relativeTime(new Date(row.lastActivityAt), now)}</time>
        ),
    },
  ];
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <DataTable
        columns={columns}
        rows={orgs.data}
        rowKey={(row) => row.id}
        isLoading={orgs.isPending}
        error={orgs.error ? errorMessage(orgs.error) : null}
        onRetry={() => void orgs.refetch()}
        empty={{ action: { label: t("create"), href: "#ad02-create" } }}
      />
      <CreateOrgForm />
    </main>
  );
}
