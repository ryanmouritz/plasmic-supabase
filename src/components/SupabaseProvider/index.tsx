//@ts-nocheck
import React, { useState, useEffect, forwardRef, useCallback, useImperativeHandle } from "react";
import { useMutablePlasmicQueryData } from "@plasmicapp/query";
import { DataProvider } from "@plasmicapp/host";
import { v4 as uuid } from "uuid";
import { useDeepCompareMemo } from "use-deep-compare";

//Import custom createClient that creates the Supabase client based on component render within Plasmic vs Browser
import createClient from "../../utils/supabase/component";

import buildSupabaseQueryWithDynamicFilters, { type Filter } from "../../utils/buildSupabaseQueryWithDynamicFilters";


//Declare types
type Row = {
    id: string
    [key: string]: any;
  };

type RowWithoutId = {
    [key: string]: any;
}
  
type Rows = {
    count: number
    data: Row[] | null
};

type SupabaseProviderError = {
    errorId: string;
    summary: string;
    errorObject: any;
    actionAttempted: string;
    recordId: string | null;
    rowForSupabase: Row | RowWithoutId | null;
    optimisticRow: Row | RowWithoutId | null;
}

interface Actions {
    //TODO: with optionality turned off (ie. no .select() after the .insert or .update), would add and edit return null or the standard api response code like 200 etc? A: Rows can be null and also it could be an empty Array of Rows. 
    addRow(rowForSupabase: any, optimisticRow: any, shouldReturnRow: boolean, disableRefetchAfterMutation: boolean): Promise<Rows | SupabaseProviderError>; //negative bool arg naming because plasmic doesn't allow default values for action args
    editRow(rowForSupabase: any, optimisticRow: any): Promise<Row | SupabaseProviderError>;
    deleteRow(id: any): Promise<Row | SupabaseProviderError>;
}

export interface SupabaseProviderProps {
    children: React.ReactNode;
    tableName: string;
    columns: string;
    filters: Filter[];
    limit?: number;
    offset?: number;
    returnCount?: "none" | "exact" | "planned" | "estimated";
    onError?: ( supabaseProviderError: SupabaseProviderError ) => void;
    simulateRandomMutationErrors: boolean;
    queryName: string;
    className?: string;
}

//The component
export const SupabaseProvider = forwardRef<Actions, SupabaseProviderProps>(
    function SupabaseProvider(props, ref) {
        const {
            children,
            tableName,
            columns,
            filters,
            limit,
            offset,
            returnCount,
            onError,
            simulateRandomMutationErrors,
            queryName,
            className,
        } = props;

        const [isMutating, setIsMutating] = useState<boolean>(false);
        const [fetchError, setFetchError] = useState<SupabaseProviderError | null>(null);
        const memoizedFilters = useDeepCompareMemo(() => filters, [filters]);

        //Function to fetch records from Supabase
        const fetchData = async () => {

            setIsMutating(false);
            setFetchError(null);
            
            try {
                //Create new supabase client
                const supabase = createClient();

                //Build the query with dynamic filters that were passed as props to the component
                const supabaseQuery = buildSupabaseQueryWithDynamicFilters({
                    supabase,
                    tableName,
                    operation: 'select',
                    columns,
                    dataForSupabase: null,
                    filters: memoizedFilters,
                    limit,
                    offset,
                    returnCount,
                });

                //Initiate the query and await the response
                const { data, error, count } = await supabaseQuery;

                if (error) {
                    throw error;
                }

                return { data, count }

            } catch(err) {
                //build the error object
                console.error(err)
                const supabaseProviderError = {
                    errorId: uuid(),
                    summary: 'Error fetching records',
                    errorObject: err,
                    actionAttempted: 'read',
                    rowForSupabase: null,
                    optimisticRow: null,
                    recordId: null,
                };

                setFetchError(supabaseProviderError);
                if (onError && typeof onError === 'function') {
                    onError(supabaseProviderError);
                }
                throw(err);
            }
        }

        //Use the useMutablePlasmicQueryData hook to fetch the data
        //Works very similar to useSWR
        //Note that we pass filters, limit and offset along with queryName to ensure we create a new cache when they change
        //Avoiding issues like flash of old content while data is fetching with new filters or data is paginated
        //And the useMutablePlasmicQueryData not being recalled so an old version of fetchData with wrong filters is used
        const {
            data,
            //The error object from useSWR/useMutablePlasmicQueryData contains errors from mutation and fetch
            //We don't use it because we customise behaviour below, to give separate fetch & mutation behavior
            //error,
            mutate,
            isLoading,
        } = useMutablePlasmicQueryData([queryName, JSON.stringify(filters), limit, offset, returnCount], fetchData, {
            shouldRetryOnError: false
        });

        //When fetchData function is rebuilt, re-fetch the data
        useEffect(() => {
            mutate();
        }, [tableName, columns, memoizedFilters, limit, offset, returnCount]);

        //Function that just returns the data unchanged
        //To pass in as an optimistic update function when no optimistic update is desired
        //Effectively disabling optimistic updates for the operation
        function returnUnchangedData(data: Rows) {
            return data;
        }

        //TODO - Add optimistic update functions
        //Function to add a row to existing data optimistically
        const addRowOptimistically = useCallback(
            (currentRows: Rows, optimisticRow: RowWithoutId | Row ) => {
                console.log(currentRows)
                console.log(optimisticRow)
                console.log(Array.isArray(optimisticRow))
                const optimisticRows = [...(currentRows.data || []), optimisticRow];
                let optimisticCount
                    if (currentRows.count === null) {
                        optimisticCount = null
                    }
                    else if (Array.isArray(optimisticRow)) {
                        optimisticCount = currentRows.count + optimisticRow.length
                    }
                    else {
                        optimisticCount = currentRows.count + 1
                    }
                console.log(optimisticRows)
                const optimisticReturn = {count: optimisticCount, data: optimisticRows}
                console.log(optimisticReturn)
                return optimisticReturn;
            },
            []
        );

        //Function to actually add row to Supabase via an API call
        const addRow = useCallback(
            async (rowForSupabase: Row, shouldReturnRow: boolean) : Promise<Rows> => {
      
              if(simulateRandomMutationErrors && Math.random() > 0.5) {
                //1 second delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                throw new Error('Simulated error adding record');
              }
      
              //Add the record to Supabase
              const supabase = createClient();

              let query = supabase
                .from(tableName)
                .insert(rowForSupabase)
              
              if (shouldReturnRow) { query = query.select() }
            
              const { data, error } = await query;

              if (error) {
                throw error;
              }                                     
              
              return shouldReturnRow ?  data : [] //if not specified to return the added row, return an empty array to indicate success
            },
            [tableName, simulateRandomMutationErrors]
        );

        //Helper function to choose the correct optimistic data function to run
        function chooseOptimisticFunc(
            optimisticOperation: string | null | undefined,
            elementActionName: string
        ) {
            if (optimisticOperation === "addRow") {
            return addRowOptimistically;
            //} else if (optimisticOperation === "editRow") {
            //return editRowOptimistically;
            //} else if (optimisticOperation === "deleteRow") {
            //return deleteRowOptimistically;
            } else {
            //None of the above, but something was specified
            if (optimisticOperation) {
                throw new Error(`
                    Invalid optimistic operation specified in "${elementActionName}" element action.
                    You specified  "${optimisticOperation}" but the allowed values are "addRow", "editRow", "deleteRow" or left blank for no optimistic operation.
                `);
            }
  
            //Nothing specified, function that does not change data (ie no optimistic operation)
            return returnUnchangedData;
            }
        }

        //Define element actions to run from Plasmic Studio
        useImperativeHandle(ref, () => ({
            //Element action to add a record with optional optimistic update & auto-refetch when done
            addRow: async (rowForSupabase, optimisticRow, shouldReturnRow = false, disableRefetchAfterMutation = false) => { // default values for backward compatibility
                setIsMutating(true);
    
                //Choose the optimistic function based on whether the user has specified optimisticRow
                //No optimisticRow means the returnUnchangedData func will be used, disabling optimistic update
                let optimisticOperation = optimisticRow ? "addRow" : null;
                const optimisticFunc = chooseOptimisticFunc(
                    optimisticOperation,
                    "Add Row"
                );
        
                optimisticRow = { ...optimisticRow, optimisticId: uuid(), isOptimistic: true };
        
                //Run the mutation
                try {
                    const result = await mutate(addRow(rowForSupabase, shouldReturnRow), {
                    optimisticData: (currentRows: Rows) => optimisticFunc(currentRows, optimisticRow),
                    populateCache: false,
                    revalidate: !disableRefetchAfterMutation,
                    rollbackOnError: true
                    });
                    return result;
        
                } catch(err) {
                    console.error(err)
                    const supabaseProviderError = {
                    errorId: uuid(),
                    summary: 'Error adding row',
                    errorObject: err,
                    actionAttempted: 'insert',
                    rowForSupabase: rowForSupabase || null,
                    optimisticRow: optimisticRow || null,
                    recordId: null
                    };
                    if (onError && typeof onError === 'function') {
                        onError(supabaseProviderError);
                    }
                    return { error: supabaseProviderError };
                }
            },
        }));
    

        return (
            <div className={className}>
                <DataProvider
                name={queryName}
                data={{ data: data?.data, count: data?.count, isLoading, isMutating, fetchError }}
                >
                {children}
                </DataProvider>
            </div>
        );
    }
);