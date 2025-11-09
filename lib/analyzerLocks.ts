// Shared lock for conflict analyzer to prevent concurrent runs
export const analyzerLocks = new Map<string, Promise<any>>();

