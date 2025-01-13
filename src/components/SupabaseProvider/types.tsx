import type { PostgrestResponseSuccess } from "@supabase/postgrest-js";

// Type for a single Supabase row - an object with key-value pairs
export type Row = {
  [key: string]: any;
};

// Type for a single Optimistic Supabase row - an object with key-value pairs plus optimisticId and isOptimistic
export type OptimisticRow = Row & {
  optimisticId: string;
  isOptimistic: boolean;
}

// Type for multiple Supabase rows - an array of objects with key-value pairs
export type Rows = Row[];

export type MutationTypes = "insert" | "update" | "delete" | "rpc" | "flexibleMutation";

// Custom error object for SupabaseProvider
export type SupabaseProviderError = {
  errorId: string;
  summary: string;
  errorMessage: string;
  actionAttempted: "select" | MutationTypes;
  rowForSupabase: Row | null;
};

// Type for the response from a fetch of data from Supabase
// Uses { data, count } from supabase.select() response
export type SupabaseProviderFetchResult = {
  data: PostgrestResponseSuccess<Rows>["data"] | null;
  count: PostgrestResponseSuccess<Rows>["count"] | null;
};

// Type for the response from a mutate function
// Uses { data, count } from supabase.insert/update/delete/rpc/select() response
// And we include an error object (or null)
export type SupabaseProviderMutateResult = {
  data: PostgrestResponseSuccess<Rows>["data"] | null;
  //optimisticData may be a single row (eg from addRow or editRow) or the entire optimisticData (eg from runRpc or fleixbleMutaiton)
  optimisticData: OptimisticRow | Rows | null;
  count: PostgrestResponseSuccess<Rows>["count"] | null;
  action: "insert" | "update" | "delete" | "rpc" | "flexibleMutation";
  summary: string;
  status: "success" | "error" | "pending";
  error: SupabaseProviderError | null;
};

// Types of Optimistic operations supported by the SupabaseProvider
export type OptimisticOperation = "insert" | "update" | "delete" | "replaceData" | null;
export type ElementActionName = "Add Row" | "Edit Row" | "Delete Row" | "Run RPC" | "Flexible Mutation";
export type ReturnCountOptions = "none" | "exact" | "planned" | "estimated";