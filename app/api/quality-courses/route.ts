import { NextRequest, NextResponse } from 'next/server';
import type { QualityCoursesResponse } from '@/lib/quality-courses/types';
import type { StaticQualityCoursesIndex } from '@/lib/quality-courses/static-course-types';

export const dynamic = 'force-dynamic';

const QUALITY_COURSES_INDEX_PATH = '/quality-courses/generated/index.json';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(new URL(QUALITY_COURSES_INDEX_PATH, request.url), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ courses: [] } satisfies QualityCoursesResponse);
    }

    const index = (await response.json()) as StaticQualityCoursesIndex;

    const body: QualityCoursesResponse = {
      courses: Array.isArray(index.courses) ? index.courses : [],
    };
    return NextResponse.json(body);
  } catch {
    const body: QualityCoursesResponse = { courses: [] };
    return NextResponse.json(body);
  }
}
