import type { ManifestAgent } from '@/lib/export/classroom-zip-types';
import type { QualityCourse, QualityCoursesResponse } from '@/lib/quality-courses/types';
import type {
  StaticQualityCourseManifest,
  StaticQualityCourseScene,
} from '@/lib/quality-courses/static-course-types';
import type { Scene, Stage } from '@/lib/types/stage';
import type { MediaTask } from '@/lib/store/media-generation';

interface LoadedQualityCourse {
  stage: Stage;
  scenes: Scene[];
  mediaTasks: Record<string, MediaTask>;
  agents: Array<ManifestAgent & { id: string }>;
  objectUrls: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return (await res.json()) as T;
}

async function fetchQualityCourse(courseId: string): Promise<QualityCourse> {
  const data = await fetchJson<QualityCoursesResponse>('/api/quality-courses');
  const course = data.courses.find((item) => item.id === courseId);
  if (!course) throw new Error(`Quality course not found: ${courseId}`);
  if (!course.courseUrl) throw new Error(`Quality course is missing courseUrl: ${courseId}`);

  return course;
}

export async function loadQualityCourseForPlayback(
  courseId: string,
  stageId: string,
): Promise<LoadedQualityCourse> {
  const course = await fetchQualityCourse(courseId);
  const manifest = await fetchJson<StaticQualityCourseManifest>(course.courseUrl!);

  const now = Date.now();
  const agents = (manifest.agents ?? []).map((agent, index) => ({
    ...agent,
    id: `${stageId}:agent:${index}`,
  }));

  const stage: Stage = {
    id: stageId,
    name: manifest.stage.name || manifest.name || course.name,
    description: manifest.stage.description || manifest.description || course.description,
    languageDirective: manifest.stage.language,
    style: manifest.stage.style,
    createdAt: manifest.stage.createdAt || now,
    updatedAt: manifest.stage.updatedAt || course.updatedAt || now,
    agentIds: agents.map((agent) => agent.id),
    generatedAgentConfigs: agents,
  };

  const scenePayloads = await Promise.all(
    manifest.scenes.map((sceneRef) => fetchJson<StaticQualityCourseScene>(sceneRef.url)),
  );

  const scenes: Scene[] = scenePayloads.map(({ scene }, index) => ({
    id: `${stageId}:scene:${index}`,
    stageId,
    type: scene.type,
    title: scene.title,
    order: scene.order ?? index,
    content: scene.content,
    actions: scene.actions,
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

  return { stage, scenes, mediaTasks: {}, agents, objectUrls: [] };
}
