import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Field, PanelCard } from '../../components/WorkspaceUi.tsx';

export interface NewProjectValues { title: string; description: string; areaId: string; facultyId: string }

interface CreateProjectFormProps { busy: boolean; onCreate: (values: NewProjectValues) => Promise<boolean> }

const EMPTY: NewProjectValues = { title: '', description: '', areaId: '', facultyId: '' };

export function CreateProjectForm({ busy, onCreate }: CreateProjectFormProps) {
  const [values, setValues] = useState<NewProjectValues>(EMPTY);
  const set = (key: keyof NewProjectValues) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreate(values)) setValues(EMPTY);
  };

  return (
    <PanelCard title="Nuevo proyecto" action={<Plus aria-hidden="true" className="size-5 text-gold" />}>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field label="Título del nuevo proyecto" value={values.title} maxLength={200} onChange={(event) => set('title')(event.target.value)} required />
        <Field label="Descripción del nuevo proyecto" value={values.description} onChange={(event) => set('description')(event.target.value)} />
        <Field label="UUID del área" hint="Aún no hay catálogo de áreas disponible." value={values.areaId} onChange={(event) => set('areaId')(event.target.value)} required />
        <Field label="UUID de la facultad" hint="Aún no hay catálogo de facultades disponible." value={values.facultyId} onChange={(event) => set('facultyId')(event.target.value)} required />
        <div className="md:col-span-2"><Button type="submit" disabled={busy}>Crear proyecto</Button></div>
      </form>
    </PanelCard>
  );
}
