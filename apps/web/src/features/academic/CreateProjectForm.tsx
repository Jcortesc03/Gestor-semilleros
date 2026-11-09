import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Field, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { ApiRequest } from '../../types/api.ts';
import type { CurrentUser } from '../../types/auth.ts';
import { AreaSelect, FacultyMultiSelect, areaScopeFor, facultyScopeFor } from '../directory/index.ts';

export interface NewProjectValues { title: string; description: string; areaId: string; facultyIds: string[] }

interface CreateProjectFormProps { request: ApiRequest; user: CurrentUser; busy: boolean; onCreate: (values: NewProjectValues) => Promise<boolean> }

const EMPTY: NewProjectValues = { title: '', description: '', areaId: '', facultyIds: [] };

export function CreateProjectForm({ request, user, busy, onCreate }: CreateProjectFormProps) {
  const [values, setValues] = useState<NewProjectValues>(EMPTY);
  const set = <K extends keyof NewProjectValues>(key: K) => (value: NewProjectValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreate(values)) setValues(EMPTY);
  };

  return (
    <PanelCard
      title="Nuevo proyecto"
      action={<Plus aria-hidden="true" className="size-5 text-gold" />}
      help={{
        title: 'Nuevo proyecto',
        description: 'Formulario para crear un proyecto: escribes su título y descripción y eliges su área y facultades; al enviarlo queda creado y visible para sus participantes.',
        roles: {
          ADMIN: 'Como administrador, puedes crear proyectos en cualquier área y facultad.',
          AREA_MANAGER: 'Como encargado de área, puedes crear proyectos dentro de tus áreas asignadas.',
          DEAN: 'Como decano, puedes crear proyectos dentro de tus facultades.',
          TUTOR: 'Como tutor no puedes crear proyectos; solo trabajar en los que ya existes como tutor.',
          STUDENT: 'Como estudiante no puedes crear proyectos; solo participar en los existentes.',
        },
      }}
    >
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field label="Título del nuevo proyecto" value={values.title} maxLength={200} onChange={(event) => set('title')(event.target.value)} required />
        <Field label="Descripción del nuevo proyecto" value={values.description} onChange={(event) => set('description')(event.target.value)} />
        <AreaSelect request={request} label="Área del nuevo proyecto" value={values.areaId} onChange={set('areaId')} required scope={areaScopeFor(user.roles)} />
        <FacultyMultiSelect request={request} label="Facultades del nuevo proyecto" value={values.facultyIds} onChange={set('facultyIds')} scope={facultyScopeFor(user.roles)} />
        <div className="md:col-span-2"><Button type="submit" disabled={busy || !values.areaId || values.facultyIds.length === 0}>Crear proyecto</Button></div>
      </form>
    </PanelCard>
  );
}
