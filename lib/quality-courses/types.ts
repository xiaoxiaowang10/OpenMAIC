export interface QualityCourse {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  grade?: string;
  sceneCount?: number;
  zipUrl?: string;
  baseUrl?: string;
  courseUrl?: string;
  size?: number;
  updatedAt?: number;
  /** URL to the first scene JSON, used for thumbnail preview */
  firstSceneUrl?: string;
}

export interface QualityCoursesResponse {
  courses: QualityCourse[];
}
