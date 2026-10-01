import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, PawPrint, ShieldCheck, X } from 'lucide-react';
import unavetLogo from '../assets/unavet-logo.png';
import unavetClinic from '../assets/unavet-clinic-login.png';
import { ThemeToggle } from '../components/ThemeToggle';
import { API_URL } from '../config/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const hasMinimumLength = password.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('El enlace de recuperación está incompleto.');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible cambiar la contraseña.');
      }

      setIsComplete(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cambiar la contraseña.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page relative flex min-h-screen min-h-dvh items-center justify-center overflow-x-hidden px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <PawPrint className="absolute left-[5%] top-[12%] h-12 w-12 -rotate-12 text-primary opacity-20" strokeWidth={1.3} />
        <PawPrint className="absolute right-[8%] top-[28%] h-8 w-8 rotate-12 text-primary opacity-15" strokeWidth={1.3} />
        <PawPrint className="absolute bottom-[12%] left-[14%] h-9 w-9 rotate-[25deg] text-primary opacity-15" strokeWidth={1.3} />
      </div>

      <ThemeToggle className="absolute right-4 top-4 z-20 border-primary/20 bg-muted/85 text-foreground hover:bg-card focus-visible:ring-offset-background" />

      <div className="login-card relative z-10 grid w-full max-w-[45.5rem] overflow-hidden rounded-2xl border border-border shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
        <div
          className="relative hidden min-h-[475px] bg-cover bg-center md:block"
          style={{ backgroundImage: `url(${unavetClinic})` }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#2d1f14]/85 via-[#2d1f14]/10 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 text-[#F7EFE6]">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/15 backdrop-blur-sm">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <p className="text-xl font-semibold">Tu cuenta, protegida</p>
            <p className="mt-2 text-sm text-[#F7EFE6]/85">
              Renueva tu acceso para seguir cuidando a tus pacientes.
            </p>
          </div>
        </div>

        <div className="login-card flex flex-col justify-center p-5 sm:p-6 md:p-[1.65rem]">
          <img src={unavetLogo} alt="Logo UNAVET" className="mb-4 h-auto w-[3.35rem] object-contain" />

          {isComplete ? (
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Check className="h-8 w-8 text-primary" strokeWidth={2.2} />
              </div>
              <h1 className="mb-3 text-2xl font-semibold text-foreground">Contraseña actualizada</h1>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Ya puedes ingresar a UNAVET con tu nueva contraseña.
              </p>
              <Link
                to="/login"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Ir a iniciar sesión
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Lock className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h1 className="mb-1 text-2xl font-semibold text-foreground">Crear nueva contraseña</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Elige una contraseña nueva para proteger tu cuenta de UNAVET.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <PasswordField
                  id="new-password"
                  label="Nueva contraseña"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={setPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirmar contraseña"
                  placeholder="Repite tu nueva contraseña"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />

                <div className="space-y-1 rounded-xl border border-border bg-card/60 px-4 py-2 text-xs">
                  <p className={`flex items-center gap-2 ${hasMinimumLength ? 'text-success' : 'text-muted-foreground'}`}>
                    {hasMinimumLength ? <Check className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-current/50" />}
                    Al menos 8 caracteres
                  </p>
                  <p className={`flex items-center gap-2 ${passwordsMatch ? 'text-success' : confirmPassword ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {passwordsMatch ? <Check className="h-4 w-4 shrink-0" /> : confirmPassword ? <X className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-current/50" />}
                    {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas deben coincidir'}
                  </p>
                </div>

                {error && (
                  <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !token}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <Link
                to="/login"
                className="mt-4 inline-flex items-center gap-2 self-center text-sm font-semibold text-primary underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a iniciar sesión
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
};

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  visible,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-border bg-input-background py-2.5 pl-11 pr-11 text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder={placeholder}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
        >
          {visible ? (
            <EyeOff className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}


