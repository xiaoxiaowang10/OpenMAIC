import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import type { QualityCoursesResponse } from '@/lib/quality-courses/types';
import type { StaticQualityCoursesIndex } from '@/lib/quality-courses/static-course-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUALITY_COURSES_INDEX = path.join(
  process.cwd(),
  'public',
  'quality-courses',
  'generated',
  'index.json',
);

export async function GET() {
  try {
    const index = JSON.parse(
      await readFile(QUALITY_COURSES_INDEX, 'utf8'),
    ) as StaticQualityCoursesIndex;

    const body: QualityCoursesResponse = {
      courses: Array.isArray(index.courses) ? index.courses : [],
    };
    return NextResponse.json(body);
  } catch {
    const body: QualityCoursesResponse = { courses: [] };
    return NextResponse.json(body);
  }
}
