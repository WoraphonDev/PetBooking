"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Skeleton } from "../../ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table.tsx";
import { type EmptyAction, EmptyState } from "./empty-state.tsx";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** 06 กติการ่วม: loading → skeleton; error → API message + retry; empty → message + main action */
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { message?: string; action?: EmptyAction };
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  /** filter controls rendered next to the search box */
  filters?: ReactNode;
  /** cursor pagination: `nextCursor` from `Paged<T>` */
  pagination?: { nextCursor: string | null; hasPrevious: boolean; onNext: (cursor: string) => void; onPrevious: () => void };
  skeletonRows?: number;
};

export function DataTable<T>(props: DataTableProps<T>) {
  const t = useTranslations("common");
  const { columns, rows, rowKey, onRowClick, isLoading, error, onRetry, empty, search, filters, pagination, skeletonRows = 5 } = props;
  const nextCursor = pagination?.nextCursor ?? null;

  return (
    <div data-slot="data-table" className="flex flex-col gap-3">
      {search || filters ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label={t("search")}
                placeholder={search.placeholder ?? t("search")}
                className="h-11 pl-9"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
              />
            </div>
          ) : null}
          {filters}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button type="button" variant="outline" className="h-11" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || !rows ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
                <TableRow key={i} aria-busy="true">
                  {columns.map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState message={empty?.message} action={empty?.action} />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {pagination && !error && (pagination.hasPrevious || nextCursor !== null) ? (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={!pagination.hasPrevious} onClick={pagination.onPrevious}>
            <ChevronLeft />
            {t("back")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={nextCursor === null}
            onClick={nextCursor === null ? undefined : () => pagination.onNext(nextCursor)}
          >
            {t("next")}
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
