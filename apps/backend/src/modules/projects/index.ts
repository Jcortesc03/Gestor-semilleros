// API pública del módulo de proyectos.
export { ProjectsModule } from './projects.module';
export { ProjectAccessService, FORBIDDEN_MESSAGE } from './services/project-access.service';
export { can, isTutor, isLeader, type ProjectAccess } from './models/project-access';
