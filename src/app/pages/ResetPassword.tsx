import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, Eye, EyeOff, Lock } from 'lucide-react';
import unavetLogo from '../assets/unavet-logo.png';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

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
      const response = await fetch('/api/auth/reset-password', {
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
    <div className="relative min-h-screen bg-secondary flex items-center justify-center p-4 overflow-hidden">
      <div className="relative z-10 w-full max-w-md bg-card/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-8 border border-border">
        <div className="flex justify-center mb-5">
          <img
            src={unavetLogo}
            alt="Logo UNAVET"
            className="w-28 h-auto object-contain"
          />
        </div>

        {isComplete ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-9 w-9 text-primary" />
              </div>
            </div>
            <h1 className="text-foreground text-2xl font-medium mb-2">
              Contraseña actualizada
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              Ya puedes ingresar a UNAVET con tu nueva contraseña.
            </p>
            <Link
              to="/login"
              className="block w-full bg-primary hover:bg-primary text-[#F7EFE6] py-3 rounded-lg font-medium transition-colors"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-foreground text-2xl font-medium mb-2">
              Crear nueva contraseña
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              Escribe una contraseña segura de al menos 8 caracteres.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordField
                label="Nueva contraseña"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />
              <PasswordField
                label="Confirmar nueva contraseña"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !token}
                className="w-full bg-primary hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-[#F7EFE6] py-3 rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </form>

            <Link
              to="/login"
              className="block mt-5 text-center text-base font-bold text-primary hover:text-foreground hover:underline transition-colors"
            >
              Volver a iniciar sesión
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
};

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full pl-11 pr-12 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          required
          minLength={8}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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


