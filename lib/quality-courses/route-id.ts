export const QUALITY_COURSE_ROUTE_PREFIX = 'quality-course:';

export function getQualityCourseRouteId(courseId: string) {
  return `${QUALITY_COURSE_ROUTE_PREFIX}${encodeURIComponent(courseId)}`;
}

export function parseQualityCourseRouteId(routeId: string) {
  const normalized = decodeRouteSegment(routeId);
  if (!normalized.startsWith(QUALITY_COURSE_ROUTE_PREFIX)) return null;

  const rawId = normalized.slice(QUALITY_COURSE_ROUTE_PREFIX.length);
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}

export function isQualityCourseRouteId(routeId: string) {
  return decodeRouteSegment(routeId).startsWith(QUALITY_COURSE_ROUTE_PREFIX);
}

function decodeRouteSegment(routeId: string) {
  try {
    return decodeURIComponent(routeId);
  } catch {
    return routeId;
  }
}
