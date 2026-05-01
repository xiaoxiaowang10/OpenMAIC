import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import {
  CLASSROOM_ZIP_EXTENSION,
  type ClassroomManifest,
} from '@/lib/export/classroom-zip-types';
import type { QualityCourse, QualityCoursesResponse } from '@/lib/quality-courses/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUALITY_COURSES_DIR = path.join(process.cwd(), 'public', 'quality-courses');

function removeCourseExtension(filename: string) {
  return filename.replace(new RegExp(`${CLASSROOM_ZIP_EXTENSION.replace(/\./g, '\\.')}$`, 'i'), '');
}

function inferSubject(text: string): string | undefined {
  if (/数学|导数/.test(text)) return '数学';
  if (/物理/.test(text)) return '物理';
  if (/化学/.test(text)) return '化学';
  if (/语文/.test(text)) return '语文';
  if (/英语/.test(text)) return '英语';
  return undefined;
}

function inferGrade(text: string): string | undefined {
  if (/高中|高一|高二|高三/.test(text)) return '高中';
  return undefined;
}

export async function GET() {
  const files = await readdir(QUALITY_COURSES_DIR).catch(() => []);
  const courses: QualityCourse[] = [];

  for (const filename of files) {
    if (!filename.toLowerCase().endsWith(CLASSROOM_ZIP_EXTENSION)) continue;

    try {
      const absPath = path.join(QUALITY_COURSES_DIR, filename);
      const [buffer, fileStat] = await Promise.all([readFile(absPath), stat(absPath)]);
      const zip = await JSZip.loadAsync(buffer);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) continue;

      const manifest = JSON.parse(await manifestFile.async('text')) as Partial<ClassroomManifest>;
      if (!manifest.stage || !Array.isArray(manifest.scenes)) continue;

      const id = removeCourseExtension(filename);
      const name = manifest.stage.name || id;
      const searchableText = `${name} ${filename}`;

      courses.push({
        id,
        name,
        description: manifest.stage.description || undefined,
        subject: inferSubject(searchableText),
        grade: inferGrade(searchableText),
        sceneCount: manifest.scenes.length,
        zipUrl: `/quality-courses/${encodeURIComponent(filename)}`,
        size: fileStat.size,
        updatedAt: fileStat.mtimeMs,
      });
    } catch {
      continue;
    }
  }

  courses.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const body: QualityCoursesResponse = { courses };
  return NextResponse.json(body);
}
