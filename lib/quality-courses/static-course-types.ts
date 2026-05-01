import type { ManifestAgent } from '@/lib/export/classroom-zip-types';
import type { Action } from '@/lib/types/action';
import type { SceneContent, SceneType } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';

export interface StaticQualityCoursesIndex {
  version: 1;
  generatedAt: string;
  courses: StaticQualityCourseSummary[];
}

export interface StaticQualityCourseSummary {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  grade?: string;
  sceneCount: number;
  baseUrl: string;
  courseUrl: string;
  size?: number;
  updatedAt?: number;
}

export interface StaticQualityCourseManifest {
  version: 1;
  id: string;
  name: string;
  description?: string;
  subject?: string;
  grade?: string;
  sceneCount: number;
  stage: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  agents: Array<ManifestAgent & { id: string }>;
  scenes: StaticQualityCourseSceneRef[];
}

export interface StaticQualityCourseSceneRef {
  index: number;
  title: string;
  type: SceneType;
  order: number;
  url: string;
}

export interface StaticQualityCourseScene {
  scene: {
    type: SceneType;
    title: string;
    order: number;
    content: SceneContent;
    actions?: Action[];
    whiteboards?: Slide[];
    multiAgent?: {
      enabled: boolean;
      agentIndices: number[];
      directorPrompt?: string;
    };
  };
}
