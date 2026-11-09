import { useState, type FormEvent } from 'react';
import type { ApiRequest } from '../types/api';
import { BrandMark } from '../components/BrandMark';
import { Button, ErrorNotice, Field } from '../components/WorkspaceUi';
import { requestRecovery, resetRecoveredPassword, verifyRecovery } from '../services/password-recovery';
import { validatePasswordChange } from '../services/password';

interface Props { request: ApiRequest; onBack: () => void }
type Step = 'email' | 'code' | 'password' | 'done';

export function PasswordRecoveryPage({ request, onBack }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [validation, setValidation] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(undefined);
    setValidation([]);
    if (step === 'password') {
      const errors = Object.values(validatePasswordChange({ email, currentPassword: '', newPassword, confirmation }, false));
      if (errors.length) { setValidation(errors); return; }
    }
    setPending(true);
    try {
      if (step === 'email') {
        await requestRecovery(request, email);
        setEmail(email.trim().toLowerCase());
        setStep('code');
      } else if (step === 'code') {
        setResetToken(await verifyRecovery(request, email, code));
        setCode('');
        setStep('password');
      } else if (step === 'password') {
        await resetRecoveredPassword(request, resetToken, newPassword, confirmation);
        setResetToken(''); setNewPassword(''); setConfirmation('');
        setStep('done');
      }
    } catch (cause) { setError(cause); }
    finally { setPending(false); }
  }

  function restart() {
    setCode(''); setResetToken(''); setNewPassword(''); setConfirmation('');
    setValidation([]); setError(undefined); setStep('email');
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-10 text-navy sm:px-8">
      <section aria-labelledby="recovery-title" className="w-full max-w-md rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-10">
        <BrandMark />
        <h1 id="recovery-title" className="mb-4 mt-8 text-2xl font-extrabold tracking-tight">
          {step === 'done' ? 'Contraseña actualizada' : 'Recuperar contraseña'}
        </h1>
        {step === 'done' ? (
          <p role="status" className="mb-6 text-navy/75">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {step === 'email' && <>
              <p className="text-sm text-navy/75">Ingresa el correo de tu cuenta para recibir un código de recuperación.</p>
              <Field label="Correo electrónico" type="email" autoComplete="email" required maxLength={254}
                value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} />
            </>}
            {step === 'code' && <>
              <p role="status" className="text-sm text-navy/75">Si el correo corresponde a una cuenta activa con contraseña, recibirás un código. Revisa también Spam.</p>
              <Field label="Código de verificación" type="text" inputMode="numeric" autoComplete="one-time-code"
                required pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} disabled={pending}
                hint="6 dígitos. Vence en 10 minutos y admite 5 intentos."
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
              <Button type="button" variant="secondary" disabled={pending} onClick={restart}>Solicitar otro código</Button>
            </>}
            {step === 'password' && <>
              <Field label="Nueva contraseña" type="password" autoComplete="new-password" required maxLength={256}
                hint="Entre 10 y 256 caracteres, con una letra y un número; distinta de tu correo y de la anterior."
                value={newPassword} disabled={pending} onChange={(event) => setNewPassword(event.target.value)} />
              <Field label="Confirmar nueva contraseña" type="password" autoComplete="new-password" required maxLength={256}
                value={confirmation} disabled={pending} onChange={(event) => setConfirmation(event.target.value)} />
              <Button type="button" variant="secondary" disabled={pending} onClick={restart}>Solicitar otro código</Button>
            </>}
            {validation.length > 0 && <div role="alert" className="text-sm text-alert">{validation.map((item) => <p key={item}>{item}</p>)}</div>}
            {error !== undefined && <ErrorNotice error={error} />}
            <Button type="submit" disabled={pending}>{pending ? 'Procesando…' : step === 'email' ? 'Enviar código' : step === 'code' ? 'Verificar código' : 'Guardar nueva contraseña'}</Button>
          </form>
        )}
        <div className="mt-6"><Button type="button" variant="secondary" disabled={pending} onClick={onBack}>Volver a iniciar sesión</Button></div>
      </section>
    </main>
  );
}
