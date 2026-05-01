import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'public', 'quality-courses', 'source');
const GENERATED_DIR = path.join(ROOT, 'public', 'quality-courses', 'generated');
const COURSES_DIR = path.join(GENERATED_DIR, 'courses');
const ZIP_EXTENSION = '.maic.zip';

function toPublicUrl(...segments) {
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function stripZipExtension(filename) {
  return filename.replace(/\.maic\.zip$/i, '');
}

function hashText(text, length = 12) {
  return createHash('sha1').update(text).digest('hex').slice(0, length);
}

function courseSlug(courseId) {
  return `course-${hashText(courseId)}`;
}

function inferSubject(text) {
  if (/数学|导数/.test(text)) return '数学';
  if (/物理/.test(text)) return '物理';
  if (/化学/.test(text)) return '化学';
  if (/语文/.test(text)) return '语文';
  if (/英语/.test(text)) return '英语';
  return undefined;
}

function inferGrade(text) {
  if (/高中|高一|高二|高三/.test(text)) return '高中';
  return undefined;
}

function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

function basenameFromZipPath(zipPath) {
  return sanitizeFilename(zipPath.split('/').pop() || hashText(zipPath));
}

function uniqueFilename(zipPath, usedNames) {
  const original = basenameFromZipPath(zipPath);
  const parsed = path.parse(original);
  let candidate = original;
  let i = 1;

  while (usedNames.has(candidate)) {
    candidate = `${parsed.name}-${i}${parsed.ext}`;
    i += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function elementIdFromZipPath(zipPath) {
  return path.parse(zipPath.split('/').pop() || zipPath).name;
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeZipEntry(zipEntry, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, await zipEntry.async('nodebuffer'));
}

function rewriteActions(actions, audioUrlByZipPath) {
  if (!Array.isArray(actions)) return undefined;

  return actions.map((action) => {
    if (action.type !== 'speech' || !('audioRef' in action)) {
      return action;
    }

    const { audioRef, ...rest } = action;
    const audioUrl = audioRef ? audioUrlByZipPath.get(audioRef) : undefined;
    return audioUrl ? { ...rest, audioUrl } : rest;
  });
}

function rewriteMediaRefs(value, mediaUrlByElementId, posterUrlByElementId) {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (const item of value) rewriteMediaRefs(item, mediaUrlByElementId, posterUrlByElementId);
    return value;
  }

  const record = value;
  const originalSrc = typeof record.src === 'string' ? record.src : undefined;
  if (originalSrc && mediaUrlByElementId.has(originalSrc)) {
    record.src = mediaUrlByElementId.get(originalSrc);
    const posterUrl = posterUrlByElementId.get(originalSrc);
    if (posterUrl) record.poster = posterUrl;
  }

  for (const child of Object.values(record)) {
    rewriteMediaRefs(child, mediaUrlByElementId, posterUrlByElementId);
  }

  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function buildCourse(zipFilename) {
  const zipPath = path.join(SOURCE_DIR, zipFilename);
  const [buffer, fileStat] = await Promise.all([readFile(zipPath), stat(zipPath)]);
  const zip = await JSZip.loadAsync(buffer);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('manifest.json is missing');

  const manifest = JSON.parse(await manifestFile.async('text'));
  if (!manifest.stage || !Array.isArray(manifest.scenes)) {
    throw new Error('Invalid manifest: missing stage or scenes');
  }

  const id = stripZipExtension(zipFilename);
  const slug = courseSlug(id);
  const courseDir = path.join(COURSES_DIR, slug);
  const baseUrl = toPublicUrl('quality-courses', 'generated', 'courses', slug);
  const audioUrlByZipPath = new Map();
  const mediaUrlByElementId = new Map();
  const posterUrlByElementId = new Map();
  const audioNames = new Set();
  const mediaNames = new Set();

  for (const [entryPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
    if (entry?.missing) continue;

    const zipEntry = zip.file(entryPath);
    if (!zipEntry) {
      console.warn(`[quality-courses] Missing ZIP entry: ${entryPath}`);
      continue;
    }

    if (entry.type === 'audio') {
      const filename = uniqueFilename(entryPath, audioNames);
      await writeZipEntry(zipEntry, path.join(courseDir, 'audio', filename));
      audioUrlByZipPath.set(entryPath, `${baseUrl}/audio/${encodeURIComponent(filename)}`);
      continue;
    }

    if (entry.type === 'generated' || entry.type === 'image') {
      const filename = uniqueFilename(entryPath, mediaNames);
      const elementId = elementIdFromZipPath(entryPath);
      await writeZipEntry(zipEntry, path.join(courseDir, 'media', filename));
      mediaUrlByElementId.set(elementId, `${baseUrl}/media/${encodeURIComponent(filename)}`);

      const posterPath = entryPath.replace(/\.\w+$/, '.poster.jpg');
      const posterEntry = zip.file(posterPath);
      if (posterEntry) {
        const posterFilename = uniqueFilename(posterPath, mediaNames);
        await writeZipEntry(posterEntry, path.join(courseDir, 'media', posterFilename));
        posterUrlByElementId.set(
          elementId,
          `${baseUrl}/media/${encodeURIComponent(posterFilename)}`,
        );
      }
    }
  }

  const name = manifest.stage.name || id;
  const searchableText = `${name} ${zipFilename}`;
  const subject = inferSubject(searchableText);
  const grade = inferGrade(searchableText);
  const agents = (manifest.agents ?? []).map((agent, index) => ({
    ...agent,
    id: `${id}:agent:${index}`,
  }));

  const sceneRefs = [];
  for (const [index, sourceScene] of manifest.scenes.entries()) {
    const sceneIndex = String(index).padStart(3, '0');
    const content = rewriteMediaRefs(
      cloneJson(sourceScene.content),
      mediaUrlByElementId,
      posterUrlByElementId,
    );
    const scene = {
      type: sourceScene.type,
      title: sourceScene.title,
      order: sourceScene.order ?? index,
      content,
      actions: rewriteActions(sourceScene.actions, audioUrlByZipPath),
      whiteboards: sourceScene.whiteboards,
      multiAgent: sourceScene.multiAgent?.enabled
        ? {
            enabled: true,
            agentIndices: sourceScene.multiAgent.agentIndices ?? [],
            directorPrompt: sourceScene.multiAgent.directorPrompt,
          }
        : undefined,
    };

    const sceneFilename = `${sceneIndex}.json`;
    await writeJson(path.join(courseDir, 'scenes', sceneFilename), { scene });
    sceneRefs.push({
      index,
      title: scene.title,
      type: scene.type,
      order: scene.order,
      url: `${baseUrl}/scenes/${sceneFilename}`,
    });
  }

  const courseManifest = {
    version: 1,
    id,
    name,
    description: manifest.stage.description || undefined,
    subject,
    grade,
    sceneCount: manifest.scenes.length,
    stage: {
      name,
      description: manifest.stage.description || undefined,
      language: manifest.stage.language || undefined,
      style: manifest.stage.style || undefined,
      createdAt: manifest.stage.createdAt,
      updatedAt: manifest.stage.updatedAt,
    },
    agents,
    scenes: sceneRefs,
  };

  await writeJson(path.join(courseDir, 'course.json'), courseManifest);

  return {
    id,
    name,
    description: courseManifest.description,
    subject,
    grade,
    sceneCount: courseManifest.sceneCount,
    baseUrl,
    courseUrl: `${baseUrl}/course.json`,
    size: fileStat.size,
    updatedAt: fileStat.mtimeMs,
  };
}

async function main() {
  await rm(GENERATED_DIR, { recursive: true, force: true });
  await mkdir(COURSES_DIR, { recursive: true });

  const sourceFiles = await readdir(SOURCE_DIR).catch(() => []);
  const zipFiles = sourceFiles
    .filter((filename) => filename.toLowerCase().endsWith(ZIP_EXTENSION))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const courses = [];
  for (const zipFilename of zipFiles) {
    try {
      courses.push(await buildCourse(zipFilename));
      console.log(`[quality-courses] Built ${zipFilename}`);
    } catch (error) {
      console.warn(
        `[quality-courses] Skipped ${zipFilename}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  courses.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  await writeJson(path.join(GENERATED_DIR, 'index.json'), {
    version: 1,
    generatedAt: new Date().toISOString(),
    courses,
  });

  console.log(`[quality-courses] Wrote ${courses.length} course(s)`);
}

main().catch((error) => {
  console.error('[quality-courses] Build failed:', error);
  process.exit(1);
});
