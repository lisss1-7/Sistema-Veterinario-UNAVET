import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Eye, EyeOff, Lock, Mail, PawPrint, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import unavetClinic from '../assets/unavet-clinic-login.png';
import { ThemeToggle } from '../components/ThemeToggle';

const loginPawprints = [
  'left-[4%] top-[8%] h-10 w-10 -rotate-12 text-[#8b6f47] opacity-20',
  'left-[16%] top-[22%] h-6 w-6 rotate-12 text-[#b97858] opacity-15',
  'left-[29%] top-[7%] h-14 w-14 rotate-[28deg] text-[#8b6f47] opacity-15',
  'left-[42%] top-[18%] h-8 w-8 -rotate-[25deg] text-[#b97858] opacity-20',
  'left-[56%] top-[5%] h-6 w-6 rotate-[18deg] text-[#8b6f47] opacity-15',
  'right-[5%] top-[12%] h-12 w-12 -rotate-[20deg] text-[#b97858] opacity-20',
  'right-[18%] top-[28%] h-7 w-7 rotate-[35deg] text-[#8b6f47] opacity-15',
  'right-[3%] top-[43%] h-16 w-16 rotate-12 text-[#b97858] opacity-15',
  'left-[7%] top-[45%] h-8 w-8 rotate-[42deg] text-[#b97858] opacity-15',
  'left-[23%] top-[58%] h-12 w-12 -rotate-[30deg] text-[#8b6f47] opacity-15',
  'right-[31%] top-[57%] h-9 w-9 -rotate-12 text-[#b97858] opacity-20',
  'right-[10%] top-[68%] h-6 w-6 rotate-[28deg] text-[#8b6f47] opacity-15',
  'left-[3%] bottom-[12%] h-14 w-14 rotate-[20deg] text-[#8b6f47] opacity-15',
  'left-[18%] bottom-[6%] h-7 w-7 -rotate-[18deg] text-[#b97858] opacity-20',
  'left-[38%] bottom-[14%] h-9 w-9 rotate-[45deg] text-[#8b6f47] opacity-15',
  'right-[42%] bottom-[5%] h-[3.25rem] w-[3.25rem] -rotate-[35deg] text-[#b97858] opacity-15',
  'right-[23%] bottom-[18%] h-8 w-8 rotate-12 text-[#8b6f47] opacity-20',
  'right-[4%] bottom-[8%] h-10 w-10 -rotate-[28deg] text-[#b97858] opacity-15',
  'left-[1%] top-[31%] h-7 w-7 rotate-[20deg] text-[#8b6f47] opacity-20',
  'left-[10%] top-[13%] h-8 w-8 -rotate-[35deg] text-[#b97858] opacity-18',
  'left-[20%] top-[38%] h-5 w-5 rotate-12 text-[#8b6f47] opacity-18',
  'left-[27%] top-[76%] h-7 w-7 -rotate-[18deg] text-[#b97858] opacity-18',
  'left-[34%] top-[91%] h-10 w-10 rotate-[30deg] text-[#8b6f47] opacity-18',
  'left-[48%] top-[10%] h-9 w-9 -rotate-[15deg] text-[#b97858] opacity-18',
  'left-[64%] top-[26%] h-6 w-6 rotate-[40deg] text-[#8b6f47] opacity-20',
  'left-[74%] top-[8%] h-9 w-9 -rotate-[24deg] text-[#b97858] opacity-18',
  'right-[1%] top-[31%] h-8 w-8 rotate-[15deg] text-[#8b6f47] opacity-20',
  'right-[12%] top-[19%] h-5 w-5 -rotate-[35deg] text-[#b97858] opacity-18',
  'right-[8%] top-[56%] h-8 w-8 rotate-[26deg] text-[#8b6f47] opacity-18',
  'right-[21%] top-[78%] h-10 w-10 -rotate-[16deg] text-[#b97858] opacity-18',
  'right-[35%] top-[91%] h-6 w-6 rotate-[38deg] text-[#8b6f47] opacity-20',
  'left-[8%] bottom-[32%] h-6 w-6 -rotate-[22deg] text-[#b97858] opacity-18',
  'left-[14%] bottom-[4%] h-9 w-9 rotate-[16deg] text-[#8b6f47] opacity-18',
  'right-[14%] bottom-[35%] h-7 w-7 -rotate-[28deg] text-[#b97858] opacity-18',
  'right-[7%] bottom-[22%] h-5 w-5 rotate-[35deg] text-[#8b6f47] opacity-20',
  'left-[2%] bottom-[52%] h-10 w-10 rotate-[12deg] text-[#b97858] opacity-18',
  'left-[6%] top-[18%] h-4 w-4 rotate-[16deg] text-[#8b6f47] opacity-20',
  'left-[12%] top-[34%] h-5 w-5 -rotate-[28deg] text-[#b97858] opacity-18',
  'left-[18%] top-[11%] h-4 w-4 rotate-[42deg] text-[#8b6f47] opacity-18',
  'left-[25%] top-[30%] h-5 w-5 -rotate-[12deg] text-[#b97858] opacity-20',
  'left-[31%] top-[48%] h-4 w-4 rotate-[30deg] text-[#8b6f47] opacity-18',
  'left-[36%] top-[86%] h-5 w-5 -rotate-[40deg] text-[#b97858] opacity-20',
  'left-[46%] top-[3%] h-4 w-4 rotate-[18deg] text-[#8b6f47] opacity-18',
  'left-[52%] top-[76%] h-5 w-5 -rotate-[24deg] text-[#b97858] opacity-18',
  'left-[68%] top-[17%] h-4 w-4 rotate-[36deg] text-[#8b6f47] opacity-20',
  'left-[83%] top-[25%] h-5 w-5 -rotate-[18deg] text-[#b97858] opacity-18',
  'right-[2%] top-[22%] h-4 w-4 rotate-[25deg] text-[#8b6f47] opacity-18',
  'right-[9%] top-[36%] h-5 w-5 -rotate-[35deg] text-[#b97858] opacity-20',
  'right-[15%] top-[9%] h-4 w-4 rotate-[12deg] text-[#8b6f47] opacity-18',
  'right-[25%] top-[49%] h-5 w-5 -rotate-[26deg] text-[#b97858] opacity-18',
  'right-[35%] top-[70%] h-4 w-4 rotate-[38deg] text-[#8b6f47] opacity-20',
  'right-[46%] top-[83%] h-5 w-5 -rotate-[15deg] text-[#b97858] opacity-18',
  'left-[5%] bottom-[25%] h-4 w-4 rotate-[28deg] text-[#8b6f47] opacity-18',
  'left-[24%] bottom-[24%] h-5 w-5 -rotate-[34deg] text-[#b97858] opacity-20',
  'right-[5%] bottom-[42%] h-4 w-4 rotate-[16deg] text-[#8b6f47] opacity-18',
  'right-[18%] bottom-[8%] h-5 w-5 -rotate-[30deg] text-[#b97858] opacity-18',  'right-[25%] top-[49%] h-5 w-5 -rotate-[26deg] text-[#b97858] opacity-18',
  'right-[35%] top-[70%] h-4 w-4 rotate-[38deg] text-[#8b6f47] opacity-20',
  'right-[46%] top-[83%] h-5 w-5 -rotate-[15deg] text-[#b97858] opacity-18',
  'left-[5%] bottom-[25%] h-4 w-4 rotate-[28deg] text-[#8b6f47] opacity-18',
  'left-[24%] bottom-[24%] h-5 w-5 -rotate-[34deg] text-[#b97858] opacity-20',
  'right-[5%] bottom-[42%] h-4 w-4 rotate-[16deg] text-[#8b6f47] opacity-18',
  'right-[18%] bottom-[8%] h-5 w-5 -rotate-[30deg] text-[#b97858] opacity-18',  'right-[25%] top-[49%] h-5 w-5 -rotate-[26deg] text-[#b97858] opacity-18',
  'right-[35%] top-[70%] h-4 w-4 rotate-[38deg] text-[#8b6f47] opacity-20',
  'right-[46%] top-[83%] h-5 w-5 -rotate-[15deg] text-[#b97858] opacity-18',
  'left-[5%] bottom-[25%] h-4 w-4 rotate-[28deg] text-[#8b6f47] opacity-18',
  'left-[24%] bottom-[24%] h-5 w-5 -rotate-[34deg] text-[#b97858] opacity-20',
  'right-[5%] bottom-[42%] h-4 w-4 rotate-[16deg] text-[#8b6f47] opacity-18',
  'right-[18%] bottom-[8%] h-5 w-5 -rotate-[30deg] text-[#b97858] opacity-18',
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [showRecoverySuccess, setShowRecoverySuccess] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const rememberedEmail = localStorage.getItem('unavet_remembered_email');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRecoveryEmail(rememberedEmail);
      setRememberUser(true);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const success = await login(email, password);
    if (!success) {
      setError('Credenciales incorrectas o usuario inactivo.');
      return;
    }

    if (rememberUser) {
      localStorage.setItem('unavet_remembered_email', email);
    } else {
      localStorage.removeItem('unavet_remembered_email');
    }
    navigate('/');
  };

  const handleRecoverySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recoveryEmail) return;

    setRecoveryError('');
    setIsRecoverySubmitting(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: recoveryEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible enviar el correo.');
      }
      setShowRecoverySuccess(true);
    } catch (requestError) {
      setRecoveryError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible enviar el correo.'
      );
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const closeRecoveryModal = () => {
    setShowForgotModal(false);
    setShowRecoverySuccess(false);
    setRecoveryError('');
    setIsRecoverySubmitting(false);
    setRecoveryEmail(email || '');
  };

  return (
    <div className="login-page relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ filter: 'brightness(0.72)' }}
        aria-hidden="true"
      >
        {loginPawprints.map((className, index) => (
          <PawPrint
            key={`login-pawprint-${index}`}
            className={`absolute ${className}`}
            strokeWidth={1.35}
          />
        ))}
      </div>

      <ThemeToggle className="absolute right-4 top-4 z-20 border-primary/20 bg-muted/85 text-foreground hover:bg-card focus-visible:ring-offset-background" />

      <div className="login-card relative z-10 grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <section
          className="relative min-h-56 bg-cover bg-center md:min-h-[600px]"
          style={{ backgroundImage: `url(${unavetClinic})` }}
          aria-label="Clínica veterinaria UNAVET"
        />

        <div className="login-card flex flex-col justify-center p-6 sm:p-8 md:p-10">
          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-semibold text-foreground">
              Iniciar sesión
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingresa con las credenciales asignadas a tu usuario.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block font-medium text-foreground">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setRecoveryEmail(event.target.value);
                  }}
                  className="w-full rounded-lg border border-border bg-input-background py-3 pl-11 pr-4 text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="usuario@unavet.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block font-medium text-foreground">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-border bg-input-background py-3 pl-11 pr-12 text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={rememberUser}
                  onChange={(event) => setRememberUser(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Recordar usuario
              </label>
              <button
                type="button"
                onClick={() => {
                  setRecoveryEmail(email);
                  setShowForgotModal(true);
                }}
                className="text-left text-sm font-semibold text-primary underline-offset-4 hover:text-foreground hover:underline sm:text-right"
              >
                ¿Se te olvidó la contraseña?
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              Iniciar sesión
            </button>
          </form>
        </div>
      </div>

      {showForgotModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <button
              type="button"
              onClick={closeRecoveryModal}
              className="absolute right-4 top-4 rounded-lg bg-muted p-2 text-foreground transition-colors hover:bg-border"
              aria-label="Cerrar recuperación de contraseña"
            >
              <X className="h-4 w-4" />
            </button>

            {!showRecoverySuccess ? (
              <>
                <div className="mb-5 pr-10">
                  <h2 className="mb-2 text-xl font-medium text-foreground">
                    Recuperar contraseña
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Ingresa tu correo electrónico para recibir las instrucciones de recuperación.
                  </p>
                </div>

                <form onSubmit={handleRecoverySubmit} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-foreground">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                        className="w-full rounded-lg border border-border bg-input-background py-3 pl-11 pr-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="usuario@unavet.com"
                        required
                      />
                    </div>
                  </div>

                  {recoveryError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {recoveryError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isRecoverySubmitting}
                    className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRecoverySubmitting ? 'Enviando...' : 'Enviar instrucciones'}
                  </button>
                </form>
              </>
            ) : (
              <div className="pt-4 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                    <Check className="h-9 w-9 text-primary" />
                  </div>
                </div>
                <h2 className="mb-2 text-xl font-medium text-foreground">
                  Solicitud enviada
                </h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Si el correo está registrado, recibirás las instrucciones para restablecer la contraseña.
                </p>
                <button
                  type="button"
                  onClick={closeRecoveryModal}
                  className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Aceptar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
