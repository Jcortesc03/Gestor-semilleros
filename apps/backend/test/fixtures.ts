import type { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/database/prisma.service';
import type { Role } from '../src/generated/prisma/enums';
import { createUser, loginWithPassword, newAgent } from './helpers';

export const PASSWORD = 'Clave-Prueba-123';

const PEOPLE = {
  admin: ['ADMIN'],
  areaManager: ['AREA_MANAGER'],
  dean: ['DEAN'],
  otherDean: ['DEAN'],
  tutor: ['TUTOR'],
  tutor2: ['TUTOR'],
  leader: ['STUDENT'],
  student: ['STUDENT'],
  student2: ['STUDENT'],
  outsider: ['STUDENT'],
} satisfies Record<string, Role[]>;

export type Person = keyof typeof PEOPLE;

/**
 * Mundo de prueba: un usuario por rol, un área (a cargo de `areaManager`) y dos facultades
 * (`dean` dirige la facultad A y `otherDean` la B). Todos los datos son ficticios.
 */
export async function buildWorld(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const ids = {} as Record<Person, string>;
  for (const [name, roles] of Object.entries(PEOPLE) as [Person, Role[]][]) {
    ids[name] = (await createUser(app, { email: `${name.toLowerCase()}@example.test`, password: PASSWORD, roles })).id;
  }
  const area = await prisma.area.create({ data: { name: 'Semillero de investigación' } });
  const facultyA = await prisma.faculty.create({ data: { name: 'Facultad A' } });
  const facultyB = await prisma.faculty.create({ data: { name: 'Facultad B' } });
  await prisma.facultyDean.createMany({
    data: [
      { facultyId: facultyA.id, userId: ids.dean },
      { facultyId: facultyB.id, userId: ids.otherDean },
    ],
  });
  await prisma.areaManager.create({ data: { areaId: area.id, userId: ids.areaManager } });

  const agents = new Map<Person, TestAgent>();
  /** Agente con sesión iniciada (se reutiliza por persona). */
  const as = async (person: Person): Promise<TestAgent> => {
    let agent = agents.get(person);
    if (!agent) {
      agent = newAgent(app);
      await loginWithPassword(agent, `${person.toLowerCase()}@example.test`, PASSWORD);
      agents.set(person, agent);
    }
    return agent;
  };

  return { prisma, ids, area, facultyA, facultyB, as };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

/** Crea (como decano) un proyecto en la facultad A con tutor principal, líder y estudiante. */
export async function buildProject(world: World) {
  const dean = await world.as('dean');
  const project = (
    await dean
      .post('/api/projects')
      .send({ title: 'Proyecto de prueba', areaId: world.area.id, facultyIds: [world.facultyA.id] })
      .expect(201)
  ).body as { id: string };
  const add = (userId: string, projectRole: string, isPrimary = false) =>
    dean.post(`/api/projects/${project.id}/members`).send({ userId, projectRole, isPrimary }).expect(201);
  await add(world.ids.tutor, 'TUTOR', true);
  await add(world.ids.leader, 'STUDENT_LEADER');
  await add(world.ids.student, 'STUDENT');
  await add(world.ids.student2, 'STUDENT');
  return project;
}
