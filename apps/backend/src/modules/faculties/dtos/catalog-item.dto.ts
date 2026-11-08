/** Área institucional para elegir al crear o editar proyectos. Sin encargados ni proyectos. */
export interface AreaDto {
  id: string;
  name: string;
  description: string | null;
}

/** Facultad para elegir al crear o editar proyectos. Sin decanos ni proyectos. */
export interface FacultyDto {
  id: string;
  name: string;
}

/** Encargado de un área (GET /api/areas/:id/managers). */
export interface AreaManagerDto {
  userId: string;
  fullName: string;
  email: string;
  assignedAt: Date;
}

/** Decanato de una facultad, vigente (`endsAt` nulo) o histórico. */
export interface FacultyDeanDto {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  startsAt: Date;
  endsAt: Date | null;
}
