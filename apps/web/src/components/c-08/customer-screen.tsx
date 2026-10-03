"use client";
import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import { CustomersListResponse, customersSort } from "@app/contracts/endpoints/customers.list";
import { toLocalDate } from "@app/domain/time/local-time";
import { Cat, Dog, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatTHB, formatThaiDate } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { DataTable, type DataTableColumn, useCursorPagination } from "../shared/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export function debounceCustomerSearch(value: string, onSearch: (value: string) => void) {
  const timer = setTimeout(() => {
    const query = value.trim();
    onSearch(query.length >= 2 ? query : "");
  }, 300);
  return () => clearTimeout(timer);
}
export function CustomerScreen() {
  const t = useTranslations("C-08");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"last_visit_desc" | "name_asc" | "created_desc">("last_visit_desc");
  const pagination = useCursorPagination();
  const reset = pagination.reset;
  useEffect(
    () =>
      debounceCustomerSearch(input, (value) => {
        setSearch(value);
        reset();
      }),
    [input, reset],
  );
  const query = useApiQuery("customers.list", {
    query: { q: search || undefined, sort, cursor: pagination.cursor },
    response: CustomersListResponse,
  });
  const columns: DataTableColumn<CustomerListItem>[] = [
    {
      id: "name",
      header: t("name"),
      cell: (row) => (
        <Link href={`/console/customers/${row.id}`} className="inline-flex min-h-11 items-center">
          {row.firstName}
          {row.nickname ? ` (${row.nickname})` : ""}
        </Link>
      ),
    },
    { id: "phone", header: t("phone"), cell: (row) => (row.phone ? formatPhone({ e164: row.phone }) : "—") },
    {
      id: "pets",
      header: t("pets"),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.pets.map((pet) => {
            const Icon = pet.species === "dog" ? Dog : Cat;
            return (
              <Badge key={pet.id} variant="secondary">
                <Icon aria-label={enumLabel("species", pet.species)} />
                {pet.name}
              </Badge>
            );
          })}
        </div>
      ),
    },
    {
      id: "lastVisit",
      header: t("lastVisit"),
      cell: (row) => (row.lastVisitAt ? formatThaiDate({ date: toLocalDate({ instant: row.lastVisitAt, timezone }) }) : "—"),
    },
    { id: "visits", header: t("visits"), cell: (row) => row.visitCount },
    { id: "level", header: t("level"), cell: (row) => <Badge variant="outline">{row.reliabilityLevel}</Badge> },
    {
      id: "credit",
      header: t("credit"),
      cell: (row) => (row.creditBalanceSatang === 0 ? null : formatTHB({ satang: row.creditBalanceSatang })),
    },
    {
      id: "line",
      header: t("line"),
      cell: (row) =>
        row.lineLinked ? (
          <span role="img" aria-label={t("line")} className="inline-flex items-center gap-1 text-green-700">
            <MessageCircle className="size-4" aria-hidden />
            {t("line")}
          </span>
        ) : null,
    },
  ];
  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button asChild className="h-11">
          <Link href="/console/customers/new">{t("add")}</Link>
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/console/customers/${row.id}`)}
        isLoading={query.isPending}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        search={{ value: input, onChange: setInput, placeholder: t("search") }}
        filters={
          <div className="flex items-center gap-2">
            <label htmlFor="customer-sort">{t("sort")}</label>
            <select
              id="customer-sort"
              className="h-11 rounded-lg border px-3"
              value={sort}
              onChange={(event) => {
                const value = customersSort.safeParse(event.target.value);
                if (value.success) {
                  setSort(value.data);
                  reset();
                }
              }}
            >
              <option value="last_visit_desc">{t("latest")}</option>
              <option value="name_asc">{t("byName")}</option>
              <option value="created_desc">{t("newest")}</option>
            </select>
          </div>
        }
        pagination={{
          nextCursor: query.data?.nextCursor ?? null,
          hasPrevious: pagination.hasPrevious,
          onNext: pagination.next,
          onPrevious: pagination.previous,
        }}
        empty={{ action: { label: t("add"), href: "/console/customers/new" } }}
      />
    </section>
  );
}
