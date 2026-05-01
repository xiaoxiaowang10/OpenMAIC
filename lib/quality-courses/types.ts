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
}

export interface QualityCoursesResponse {
  courses: QualityCourse[];
}
