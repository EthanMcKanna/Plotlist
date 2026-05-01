export type Id<_TableName extends string = string> = string & {
  readonly __tableName?: _TableName;
};

export type Doc<_TableName extends string = string> = any;

export type FunctionKind = "query" | "mutation" | "action";

export type PlotlistFunctionReference<
  Kind extends FunctionKind = FunctionKind,
  Args = any,
  Result = any,
> = {
  readonly __kind: Kind;
  readonly __name: string;
  readonly __args?: Args;
  readonly __result?: Result;
};

export type PaginatedResult<T = any> = {
  page?: T[];
  results?: T[];
  continueCursor: string | null;
  isDone: boolean;
};
