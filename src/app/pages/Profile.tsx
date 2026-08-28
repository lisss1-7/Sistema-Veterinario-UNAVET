import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import {
  Edit,
  LogOut,
  Shield,
  User,
  Phone,
  Mail,
  Briefcase,
  CheckCircle,
  X,
  Save,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  isValidName,
  isValidPhone,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';

type ProfileFormData = {
  firstName: string;
  middleName?: string;
  firstSurname: string;
  secondSurname?: string;
  phone: string;
  specialty?: string;
};

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ProfileData = {
  id: number | string;
  firstName: string;
  middleName?: string;
  firstSurname: string;
  secondSurname?: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  specialty?: string;
  status?: string;
  lastAccess?: string;
  creationDate?: string;
};

const API_URL = '/api';

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') ||
    localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};


const normalizeText = (value?: string) =>
  value
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') || '';

const isVeterinarianRole = (role?: string) =>
  normalizeText(role) === 'medico veterinario';

const getErrorMessage = (
  error: unknown,
  fallback: string
) => {
  return error instanceof Error
    ? error.message
    : fallback;
};

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: '',
    middleName: '',
    firstSurname: '',
    secondSurname: '',
    phone: '',
    specialty: '',
  });

  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.firstName || '',
        middleName: profile.middleName || '',
        firstSurname: profile.firstSurname || '',
        secondSurname: profile.secondSurname || '',
        phone: profile.phone || '',
        specialty: profile.specialty || '',
      });
    }
  }, [profile]);

  const loadProfile = async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`${API_URL}/perfil/me`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar perfil');
      }

      setProfile(data);

      const savedUser = localStorage.getItem('unavet_user');

      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);

        localStorage.setItem(
          'unavet_user',
          JSON.stringify({
            ...parsedUser,
            firstName: data.firstName,
            middleName: data.middleName,
            firstSurname: data.firstSurname,
            secondSurname: data.secondSurname,
            name: data.name,
            phone: data.phone,
            specialty: data.specialty,
          })
        );
      }
    } catch (error) {
      console.error('Error al cargar perfil:', error);

      if (user) {
        setProfile({
          id: user.id,
          firstName: user.firstName || '',
          middleName: user.middleName || '',
          firstSurname: user.firstSurname || '',
          secondSurname: user.secondSurname || '',
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone || '',
          specialty:
            (
              user as typeof user & {
                specialty?: string;
              }
            ).specialty || '',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = () => {
    setFormError('');

    setFormData({
      firstName: profile?.firstName || '',
      middleName: profile?.middleName || '',
      firstSurname: profile?.firstSurname || '',
      secondSurname: profile?.secondSurname || '',
      phone: profile?.phone || '',
      specialty: profile?.specialty || '',
    });

    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setFormError('');
  };

  const openPasswordModal = () => {
    setPasswordError('');
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordError('');
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const validateForm = () => {
    setFormError('');

    if (
      !isValidName(formData.firstName) ||
      !isValidName(formData.firstSurname) ||
      (formData.middleName && !isValidName(formData.middleName)) ||
      (formData.secondSurname && !isValidName(formData.secondSurname))
    ) {
      setFormError('El nombre solo puede contener letras y debe tener al menos 2 caracteres.');
      return false;
    }

    if (!isValidPhone(formData.phone)) {
      setFormError('El teléfono debe contener únicamente entre 8 y 15 dígitos.');
      return false;
    }

    if (isVeterinarianRole(profile?.role) && !formData.specialty?.trim()) {
      setFormError('Debe ingresar la especialidad del médico veterinario.');
      return false;
    }

    return true;
  };

  const validatePasswordForm = () => {
    setPasswordError('');

    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      setPasswordError('Debe completar todos los campos de contraseña.');
      return false;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.');
      return false;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('La nueva contraseña y la confirmación no coinciden.');
      return false;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError('La nueva contraseña debe ser diferente a la actual.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/perfil/me`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al actualizar perfil');
      }

      const updatedProfile = data.user as ProfileData;

      setProfile(updatedProfile);

      const savedUser = localStorage.getItem('unavet_user');

      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);

        localStorage.setItem(
          'unavet_user',
          JSON.stringify({
            ...parsedUser,
            firstName: updatedProfile.firstName,
            middleName: updatedProfile.middleName,
            firstSurname: updatedProfile.firstSurname,
            secondSurname: updatedProfile.secondSurname,
            name: updatedProfile.name,
            phone: updatedProfile.phone,
            specialty: updatedProfile.specialty,
          })
        );
      }

      setSuccessMessage('Perfil actualizado correctamente');
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error('Error al actualizar perfil:', error);
      setFormError(
        getErrorMessage(
          error,
          'No se pudo actualizar el perfil.'
        )
      );
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validatePasswordForm()) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/perfil/me/password`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(passwordData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cambiar contraseña');
      }

      setSuccessMessage('Contraseña actualizada correctamente');
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error('Error al cambiar contraseña:', error);
      setPasswordError(
        getErrorMessage(
          error,
          'No se pudo cambiar la contraseña.'
        )
      );
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowEditModal(false);
    setShowPasswordModal(false);
    setFormError('');
    setPasswordError('');
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const displayProfile = profile || {
    id: user?.id || '',
    firstName: user?.firstName || '',
    middleName: user?.middleName || '',
    firstSurname: user?.firstSurname || '',
    secondSurname: user?.secondSurname || '',
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || '',
    phone: user?.phone || '',
    specialty:
      (
        user as typeof user & {
          specialty?: string;
        }
      )?.specialty || '',
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
          Mi Perfil
        </h1>
      </div>

      {isLoading && (
        <div className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-lg mb-6">
          <p className="text-muted-foreground text-sm">
            Cargando información del perfil...
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-card border border-border rounded-2xl p-5 md:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg">
                <User className="w-8 h-8 text-[#F7EFE6] drop-shadow-md" strokeWidth={2.5} />
              </div>

              <div>
                <h2 className="text-foreground text-xl font-medium">
                  {displayProfile.name || 'Usuario'}
                </h2>

                <p className="text-muted-foreground text-sm">
                  {displayProfile.role || 'Rol no especificado'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openEditModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-primary to-primary hover:from-[#7a5f3c] hover:to-primary text-[#F7EFE6] rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Edit className="w-4 h-4 drop-shadow-sm" strokeWidth={2.5} />
              Editar perfil
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProfileItem
              icon={<User className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />}
              label="Nombre"
              value={displayProfile.name || 'No especificado'}
            />

            <ProfileItem
              icon={<Mail className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />}
              label="Correo electrónico"
              value={displayProfile.email || 'No especificado'}
              protectedField
            />

            <ProfileItem
              icon={<Shield className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />}
              label="Rol"
              value={displayProfile.role || 'No especificado'}
              protectedField
            />

            <ProfileItem
              icon={<Phone className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />}
              label="Teléfono"
              value={displayProfile.phone || 'No especificado'}
            />

            {isVeterinarianRole(displayProfile.role) && (
              <ProfileItem
                icon={<Briefcase className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />}
                label="Especialidad"
                value={displayProfile.specialty || 'No especificada'}
              />
            )}
          </div>

          <div className="mt-6 bg-muted border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="bg-gradient-to-br from-muted to-border rounded-lg p-1.5 shadow-sm mt-0.5">
                <Shield className="w-4 h-4 text-primary drop-shadow-sm" strokeWidth={2.5} />
              </div>

              <div>
                <h3 className="text-foreground font-medium text-sm">
                  Información protegida
                </h3>

                <p className="text-muted-foreground text-sm mt-1">
                  El rol, estado, correo de acceso y permisos no se modifican desde
                  este apartado. Esos cambios se administran únicamente desde el
                  módulo de Gestión de Usuarios.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-muted to-border flex items-center justify-center shadow-md">
                <Lock className="w-5 h-5 text-primary drop-shadow-sm" strokeWidth={2.5} />
              </div>

              <h2 className="text-foreground text-lg">
                Seguridad
              </h2>
            </div>

            <p className="text-muted-foreground text-sm mb-4">
              Puedes actualizar tu contraseña de acceso validando primero tu contraseña actual.
            </p>

            <button
              type="button"
              className="w-full px-4 py-2 bg-muted-foreground hover:bg-muted-foreground text-[#F7EFE6] rounded-lg transition-colors"
              onClick={openPasswordModal}
            >
              Cambiar contraseña
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-lg">
            <h2 className="text-foreground text-lg mb-4">
              Sesión
            </h2>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
            >
              <LogOut className="w-4 h-4 drop-shadow-sm" strokeWidth={2.5} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  Editar perfil
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
                  Solo puedes modificar tu información personal.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  ['Primer nombre', 'firstName', true],
                  ['Segundo nombre', 'middleName', false],
                  ['Primer apellido', 'firstSurname', true],
                  ['Segundo apellido', 'secondSurname', false],
                ] as const).map(([label, field, required]) => (
                  <div key={field}>
                    <label className="block text-foreground mb-2 text-sm">
                      {label}{required ? '' : ' (opcional)'}
                    </label>

                    <input
                      type="text"
                      value={formData[field] || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field]: sanitizeName(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                      required={required}
                      minLength={required ? 2 : undefined}
                      maxLength={80}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Teléfono
                </label>

                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phone: sanitizePhone(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{8,15}"
                  minLength={8}
                  maxLength={15}
                />
              </div>

              {isVeterinarianRole(displayProfile.role) && (
                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Especialidad
                  </label>

                  <input
                    type="text"
                    value={formData.specialty || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        specialty: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>
              )}

              <div className="bg-muted border border-border rounded-xl p-3">
                <p className="text-muted-foreground text-xs">
                  No puedes modificar tu rol, estado, correo de acceso ni permisos
                  desde este formulario.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Guardar cambios
                </button>

                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  Cambiar contraseña
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
                  Ingresa tu contraseña actual para confirmar el cambio.
                </p>
              </div>

              <button
                type="button"
                onClick={closePasswordModal}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordError && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <PasswordField
                label="Contraseña actual"
                value={passwordData.currentPassword}
                showPassword={showCurrentPassword}
                onToggleShow={() => setShowCurrentPassword(!showCurrentPassword)}
                onChange={(value) =>
                  setPasswordData({
                    ...passwordData,
                    currentPassword: value,
                  })
                }
              />

              <PasswordField
                label="Nueva contraseña"
                value={passwordData.newPassword}
                showPassword={showNewPassword}
                onToggleShow={() => setShowNewPassword(!showNewPassword)}
                onChange={(value) =>
                  setPasswordData({
                    ...passwordData,
                    newPassword: value,
                  })
                }
              />

              <PasswordField
                label="Confirmar nueva contraseña"
                value={passwordData.confirmPassword}
                showPassword={showConfirmPassword}
                onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
                onChange={(value) =>
                  setPasswordData({
                    ...passwordData,
                    confirmPassword: value,
                  })
                }
              />

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Actualizar contraseña
                </button>

                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[60]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue actualizada exitosamente en la base de datos.
            </p>

            <button
              onClick={closeSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileItem({
  icon,
  label,
  value,
  protectedField = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  protectedField?: boolean;
}) {
  return (
    <div className="bg-muted border border-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {icon}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-sm">
              {label}
            </label>

            {protectedField && (
              <span className="px-2 py-0.5 rounded-full bg-muted text-primary text-[10px]">
                Protegido
              </span>
            )}
          </div>

          <p className="text-foreground font-medium break-words">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  showPassword,
  onToggleShow,
  onChange,
}: {
  label: string;
  value: string;
  showPassword: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2 pr-11 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          required
        />

        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}


