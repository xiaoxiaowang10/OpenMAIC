export interface QualityCourse {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  grade?: string;
  sceneCount?: number;
  zipUrl: string;
  size?: number;
  updatedAt?: number;
}

export interface QualityCoursesResponse {
  courses: QualityCourse[];
}
