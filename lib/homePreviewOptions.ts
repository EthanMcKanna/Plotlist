export type HomePreviewSearchParams = Record<
  string,
  string | string[] | undefined
>;

function getFirstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getHomePreviewReduceMotionFlag(
  params: HomePreviewSearchParams,
) {
  const value = getFirstSearchParamValue(params.reduceMotion)
    ?.trim()
    .toLowerCase();

  return value === "1" || value === "true";
}
