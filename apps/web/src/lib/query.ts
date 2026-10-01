"use client";

// TanStack Query v5 bindings for api(). Failed queries/mutations show a toast with the server's Thai message
// unless `meta: { toast: false }` is passed (screens that handle a specific code themselves).

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createElement, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { type ApiClientError, type ApiInput, api, type EndpointKey, errorMessage } from "./api.ts";

type Meta = { toast?: boolean } | undefined;

function toastError(err: unknown, meta: Meta): void {
  if (meta?.toast === false) return;
  toast.error(errorMessage(err));
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (err, query) => toastError(err, query.meta as Meta) }),
    mutationCache: new MutationCache({ onError: (err, _vars, _ctx, mutation) => toastError(err, mutation.meta as Meta) }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

export function ApiQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return createElement(QueryClientProvider, { client }, children);
}

/** Query key `[key, params, query]` — invalidating `[key]` refreshes every variant of that endpoint. */
export function apiQueryKey(key: EndpointKey, input: Pick<ApiInput, "params" | "query"> = {}) {
  return [key, input.params ?? {}, input.query ?? {}] as const;
}

export function useApiQuery<TResponse = unknown>(
  key: EndpointKey,
  input: Omit<ApiInput<TResponse>, "body" | "signal"> = {},
  options: Omit<UseQueryOptions<TResponse, ApiClientError>, "queryKey" | "queryFn"> = {},
) {
  return useQuery<TResponse, ApiClientError>({
    ...options,
    queryKey: apiQueryKey(key, input),
    queryFn: ({ signal }) => api(key, { ...input, signal }),
  });
}

export type ApiMutationVars = Pick<ApiInput, "params" | "query" | "body">;

/** Invalidates `[k]` for every endpoint key in `invalidate` after a successful call. */
export function useApiMutation<TResponse = unknown>(
  key: EndpointKey,
  options: Omit<UseMutationOptions<TResponse, ApiClientError, ApiMutationVars>, "mutationFn"> & {
    response?: ApiInput<TResponse>["response"];
    invalidate?: EndpointKey[];
  } = {},
) {
  const client = useQueryClient();
  const { response, invalidate = [], onSuccess, ...rest } = options;
  return useMutation<TResponse, ApiClientError, ApiMutationVars>({
    ...rest,
    mutationFn: (vars) => api(key, { ...vars, response }),
    onSuccess: async (...args) => {
      await invalidateEndpoints(client, invalidate);
      await onSuccess?.(...args);
    },
  });
}

export async function invalidateEndpoints(client: QueryClient, keys: EndpointKey[]): Promise<void> {
  await Promise.all(keys.map((k) => client.invalidateQueries({ queryKey: [k] })));
}
