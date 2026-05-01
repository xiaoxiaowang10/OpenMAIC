import type {
  ClassroomManifest,
  ManifestAction,
  ManifestAgent,
} from '@/lib/export/classroom-zip-types';
import type { QualityCourse, QualityCoursesResponse } from '@/lib/quality-courses/types';
import type { Scene, Stage } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { MediaTask } from '@/lib/store/media-generation';

interface LoadedQualityCourse {
  stage: Stage;
  scenes: Scene[];
  mediaTasks: Record<string, MediaTask>;
  agents: Array<ManifestAgent & { id: string }>;
  objectUrls: string[];
}

async function fetchQualityCourse(courseId: string): Promise<QualityCourse> {
  const res = await fetch('/api/quality-courses', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load quality courses');

  const data = (await res.json()) as QualityCoursesResponse;
  const course = data.courses.find((item) => item.id === courseId);
  if (!course) throw new Error(`Quality course not found: ${courseId}`);

  return course;
}

function getElementIdFromZipPath(zipPath: string) {
  const filename = zipPath.split('/').pop() || zipPath;
  return filename.replace(/\.[^.]+$/, '');
}

function getMediaType(elementId: string, mimeType?: string): 'image' | 'video' {
  if (mimeType?.startsWith('video/')) return 'video';
  if (/^gen_vid_/i.test(elementId)) return 'video';
  return 'image';
}

function rewriteActionsForPlayback(
  actions: ManifestAction[] | undefined,
  audioUrls: Record<string, string>,
): Action[] | undefined {
  if (!actions) return undefined;

  return actions.map((action) => {
    if (action.type === 'speech' && 'audioRef' in action) {
      const { audioRef, ...rest } = action;
      const audioUrl = audioRef ? audioUrls[audioRef] : undefined;
      return {
        ...rest,
        ...(audioUrl ? { audioUrl } : {}),
      } as Action;
    }

    return action as Action;
  });
}

export async function loadQualityCourseForPlayback(
  courseId: string,
  stageId: string,
): Promise<LoadedQualityCourse> {
  const course = await fetchQualityCourse(courseId);
  const response = await fetch(course.zipUrl);
  if (!response.ok) throw new Error(`Failed to download ${course.zipUrl}`);

  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await response.blob());
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('manifest.json is missing');

  const manifest = JSON.parse(await manifestFile.async('text')) as Partial<ClassroomManifest>;
  if (!manifest.stage || !Array.isArray(manifest.scenes)) {
    throw new Error('Invalid quality course manifest');
  }

  const objectUrls: string[] = [];
  const audioUrls: Record<string, string> = {};
  const mediaTasks: Record<string, MediaTask> = {};

  for (const [zipPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
    if (entry.missing) continue;

    const zipEntry = zip.file(zipPath);
    if (!zipEntry) continue;

    const blob = await zipEntry.async('blob');
    if (entry.type === 'audio') {
      const audioBlob = blob.type ? blob : new Blob([blob], { type: `audio/${entry.format || 'mpeg'}` });
      const url = URL.createObjectURL(audioBlob);
      objectUrls.push(url);
      audioUrls[zipPath] = url;
      continue;
    }

    if (entry.type === 'generated' || entry.type === 'image') {
      const elementId = getElementIdFromZipPath(zipPath);
      const type = getMediaType(elementId, entry.mimeType);
      const mediaBlob = blob.type ? blob : new Blob([blob], { type: entry.mimeType });
      const objectUrl = URL.createObjectURL(mediaBlob);
      objectUrls.push(objectUrl);

      const posterEntry = zip.file(zipPath.replace(/\.\w+$/, '.poster.jpg'));
      const poster = posterEntry ? URL.createObjectURL(await posterEntry.async('blob')) : undefined;
      if (poster) objectUrls.push(poster);

      mediaTasks[elementId] = {
        elementId,
        type,
        status: 'done',
        prompt: entry.prompt || '',
        params: {},
        objectUrl,
        poster,
        retryCount: 0,
        stageId,
      };
    }
  }

  const now = Date.now();
  const agents = (manifest.agents ?? []).map((agent, index) => ({
    ...agent,
    id: `${stageId}:agent:${index}`,
  }));

  const stage: Stage = {
    id: stageId,
    name: manifest.stage.name || course.name,
    description: manifest.stage.description || course.description,
    languageDirective: manifest.stage.language,
    style: manifest.stage.style,
    createdAt: manifest.stage.createdAt || now,
    updatedAt: manifest.stage.updatedAt || course.updatedAt || now,
    agentIds: agents.map((agent) => agent.id),
    generatedAgentConfigs: agents,
  };

  const scenes: Scene[] = manifest.scenes.map((scene, index) => ({
    id: `${stageId}:scene:${index}`,
    stageId,
    type: scene.type,
    title: scene.title,
    order: scene.order ?? index,
    content: scene.content,
    actions: rewriteActionsForPlayback(scene.actions, audioUrls),
    whiteboards: scene.whiteboards,
    multiAgent: scene.multiAgent?.enabled
      ? {
          enabled: true,
          agentIds: (scene.multiAgent.agentIndices ?? [])
            .map((agentIndex) => agents[agentIndex]?.id)
            .filter(Boolean),
          directorPrompt: scene.multiAgent.directorPrompt,
        }
      : undefined,
    createdAt: now,
    updatedAt: now,
  }));

  return { stage, scenes, mediaTasks, agents, objectUrls };
}
