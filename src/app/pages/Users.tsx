import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  UserCheck,
  UserX,
  UsersRound,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { SystemUser } from '../utils/types';
import {
  drawUnavetPdfHeader,
  getUnavetLogoBase64,
} from '../utils/pdfBranding';
import {
  isValidEmail,
  isValidName,
  isValidPhone,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';

type UserFormData = {
  id?: string;
  firstName?: string;
  middleName?: string;
  firstSurname?: string;
  secondSurname?: string;
  email?: string;
  role?: string;
  phone?: string;
  status?: string;
  creationDate?: string;
  password?: string;
  confirmPassword?: string;
};

type DeleteTarget = {
  id: string;
  name: string;
  email: string;
};

type CatalogItem = {
  rol_id?: number;
  nombre: string;
  descripcion?: string;
  activo?: number;
};

type SortField = 'name' | 'role' | 'status' | 'creationDate';
type SortDirection = 'asc' | 'desc';
type UserReportType = 'active' | 'inactive';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const textCollator = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

const normalizeText = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const userIsActive = (user: SystemUser, enabledStatus: string) => {
  if (enabledStatus) return user.status === enabledStatus;

  return ['activo', 'activa', 'habilitado', 'habilitada'].includes(
    normalizeText(user.status)
  );
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

export default function Users() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [enabledStatus, setEnabledStatus] = useState('');
  const [disabledStatus, setDisabledStatus] = useState('');
  const [loadingRoles, setLoadingRoles] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] =
    useState<SortDirection>('asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] =
    useState<SystemUser | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] =
    useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<DeleteTarget | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusModalError, setStatusModalError] = useState(false);

  const [editingUser, setEditingUser] =
    useState<SystemUser | null>(null);
  const [formData, setFormData] = useState<UserFormData>({});

  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/usuarios`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar usuarios');
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      setUsers([]);
    }
  };

  const loadRoles = async () => {
    try {
      setLoadingRoles(true);

      const [rolesResponse, statusesResponse] = await Promise.all([
        fetch(`${API_URL}/catalogos/roles`, {
          method: 'GET',
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/catalogos/estados-usuario`, {
          method: 'GET',
          headers: getAuthHeaders(),
        }),
      ]);
      const rolesData = await rolesResponse.json();
      const statusesData = await statusesResponse.json();
      if (!rolesResponse.ok) throw new Error(rolesData.message);
      if (!statusesResponse.ok) throw new Error(statusesData.message);

      const roles = Array.isArray(rolesData)
        ? rolesData
            .map((item: CatalogItem) => item.nombre)
            .filter(
              (nombre): nombre is string =>
                typeof nombre === 'string' &&
                nombre.trim().length > 0
            )
        : [];

      setRoleOptions(roles);
      setStatusOptions(
        Array.isArray(statusesData)
          ? statusesData.map((item: CatalogItem) => item.nombre)
          : []
      );
      const enabled = statusesData.find(
        (item: any) => Boolean(item.permite_acceso)
      );
      const disabled = statusesData.find(
        (item: any) => !Boolean(item.permite_acceso)
      );
      setEnabledStatus(enabled?.nombre || '');
      setDisabledStatus(disabled?.nombre || '');
    } catch (error) {
      console.error('Error al cargar roles:', error);
      setRoleOptions([]);
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    void fetch(`${API_URL}/catalogos/mis-modulos`, {
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        const allowed =
          Array.isArray(data) &&
          data.some((module) => module.codigo === 'users');
        setCanAccess(allowed);
        if (allowed) {
          await Promise.all([loadUsers(), loadRoles()]);
        }
      })
      .catch(() => setCanAccess(false));
  }, []);

  const activeUsers = useMemo(
    () => users.filter((userItem) => userIsActive(userItem, enabledStatus)),
    [enabledStatus, users]
  );

  const inactiveUsers = useMemo(
    () => users.filter((userItem) => !userIsActive(userItem, enabledStatus)),
    [enabledStatus, users]
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return users
      .filter((userItem) => {
        const matchesSearch =
          !normalizedSearch ||
          normalizeText(userItem.name).includes(normalizedSearch) ||
          normalizeText(userItem.email).includes(normalizedSearch);
        const matchesRole = !filterRole || userItem.role === filterRole;
        const matchesStatus =
          !filterStatus || userItem.status === filterStatus;

        return matchesSearch && matchesRole && matchesStatus;
      })
      .sort((firstUser, secondUser) => {
        const comparison = textCollator.compare(
          firstUser[sortField] || '',
          secondUser[sortField] || ''
        );

        if (comparison !== 0) {
          return sortDirection === 'asc' ? comparison : -comparison;
        }

        return textCollator.compare(firstUser.name, secondUser.name);
      });
  }, [filterRole, filterStatus, searchTerm, sortDirection, sortField, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(pageStart, pageStart + pageSize);
  const visibleFrom = filteredUsers.length === 0 ? 0 : pageStart + 1;
  const visibleTo = Math.min(pageStart + pageSize, filteredUsers.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterRole, filterStatus, pageSize, searchTerm, sortDirection, sortField]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const validateForm = () => {
    setFormError('');

    if (
      !formData.firstName ||
      !formData.firstSurname ||
      !formData.email ||
      !formData.role ||
      !formData.phone
    ) {
      setFormError('Debe completar todos los campos obligatorios.');
      return false;
    }

    if (!editingUser && !formData.password) {
      setFormError(
        'Debe asignar una contraseña inicial al usuario.'
      );
      return false;
    }

    if (
      !isValidName(formData.firstName) ||
      !isValidName(formData.firstSurname) ||
      (formData.middleName && !isValidName(formData.middleName)) ||
      (formData.secondSurname && !isValidName(formData.secondSurname))
    ) {
      setFormError('El nombre solo puede contener letras y debe tener al menos 2 caracteres.');
      return false;
    }

    if (!isValidEmail(formData.email)) {
      setFormError('Ingrese un correo electrónico válido.');
      return false;
    }

    if (!isValidPhone(formData.phone)) {
      setFormError('El teléfono debe contener únicamente entre 8 y 15 dígitos.');
      return false;
    }

    if (formData.password || formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        setFormError(
          'La contraseña y la confirmación no coinciden.'
        );
        return false;
      }

      if ((formData.password || '').length < 8) {
        setFormError(
          'La contraseña debe tener al menos 8 caracteres.'
        );
        return false;
      }
    }

    const emailExists = users.some(
      (u) =>
        u.email?.toLowerCase() ===
          formData.email?.toLowerCase() &&
        u.id !== editingUser?.id
    );

    if (emailExists) {
      setFormError(
        'Ya existe un usuario registrado con ese correo.'
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        firstName: formData.firstName,
        middleName: formData.middleName || '',
        firstSurname: formData.firstSurname,
        secondSurname: formData.secondSurname || '',
        email: formData.email,
        role: formData.role,
        phone: formData.phone,
        status: formData.status || enabledStatus,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      const url = editingUser
        ? `${API_URL}/usuarios/${editingUser.id}`
        : `${API_URL}/usuarios`;

      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al guardar usuario');
      }

      await loadUsers();

      setSuccessMessage(
        editingUser
          ? 'Usuario actualizado correctamente'
          : 'Usuario creado correctamente'
      );

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar usuario:', error);

      setFormError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el usuario.'
      );
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const changedUser = users.find((item) => item.id === id);
      const newStatus =
        changedUser?.status === enabledStatus
          ? disabledStatus
          : enabledStatus;

      const response = await fetch(
        `${API_URL}/usuarios/${id}/estado`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cambiar estado');
      }

      await loadUsers();

      setStatusMessage(
        `El usuario ${changedUser?.name || ''} ahora está en estado ${newStatus}.`
      );

      setStatusModalError(false);
      setShowStatusModal(true);
    } catch (error) {
      console.error('Error al cambiar estado:', error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar el estado del usuario.'
      );
      setStatusModalError(true);
      setShowStatusModal(true);
    }
  };

  const openDeleteModal = (userItem: SystemUser) => {
    setDeleteTarget({
      id: userItem.id,
      name: userItem.name,
      email: userItem.email,
    });
    setDeleteConfirmation('');

    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (
      !deleteTarget ||
      deleteConfirmation.trim().toLowerCase() !== 'eliminar'
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/usuarios/${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al eliminar usuario');
      }

      await loadUsers();

      setShowDeleteModal(false);
      setDeleteTarget(null);
      setShowDeleteSuccessModal(true);
    } catch (error) {
      console.error('Error al eliminar usuario:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar el usuario.'
      );
    }
  };

  const openModal = (userItem?: SystemUser) => {
    setFormError('');
    setShowPassword(false);
    setShowConfirmPassword(false);

    if (userItem) {
      setEditingUser(userItem);

      setFormData({
        id: userItem.id,
        firstName: userItem.firstName,
        middleName: userItem.middleName || '',
        firstSurname: userItem.firstSurname,
        secondSurname: userItem.secondSurname || '',
        email: userItem.email,
        role: userItem.role || '',
        phone: userItem.phone || '',
        status: userItem.status,
        creationDate: userItem.creationDate,
        password: '',
        confirmPassword: '',
      });
    } else {
      setEditingUser(null);
      setFormData({
        role: '',
        status: enabledStatus,
        password: '',
        confirmPassword: '',
      });
    }

    setShowModal(true);
  };

  const getFormSignature = () => {
    const signature = {
      firstName: formData.firstName || '',
      middleName: formData.middleName || '',
      firstSurname: formData.firstSurname || '',
      secondSurname: formData.secondSurname || '',
      email: formData.email || '',
      role: formData.role || '',
      phone: formData.phone || '',
      status: formData.status || '',
      password: formData.password || '',
      confirmPassword: formData.confirmPassword || '',
    };

    return JSON.stringify(signature);
  };

  const isFormDirty = () => {
    if (!showModal) {
      return false;
    }

    const originalUser = editingUser
      ? {
          firstName: editingUser.firstName || '',
          middleName: editingUser.middleName || '',
          firstSurname: editingUser.firstSurname || '',
          secondSurname: editingUser.secondSurname || '',
          email: editingUser.email || '',
          role: editingUser.role || '',
          phone: editingUser.phone || '',
          status: editingUser.status || '',
          password: '',
          confirmPassword: '',
        }
      : {
          firstName: '',
          middleName: '',
          firstSurname: '',
          secondSurname: '',
          email: '',
          role: '',
          phone: '',
          status: enabledStatus,
          password: '',
          confirmPassword: '',
        };

    return JSON.stringify(originalUser) !== getFormSignature();
  };

  const handleCloseAttempt = () => {
    if (isFormDirty()) {
      setShowCloseConfirmation(true);
      return;
    }

    cancelForm();
  };

  const cancelForm = () => {
    setShowCloseConfirmation(false);
    setShowModal(false);
    setEditingUser(null);
    setFormData({});
    setFormError('');
  };

  const closeSuccessModal = () => {
    setShowCloseConfirmation(false);
    setShowSuccessModal(false);
    setShowModal(false);
    setEditingUser(null);
    setFormData({});
    setFormError('');
  };

  const generateUsersPdf = async (reportType: UserReportType) => {
    const reportUsers = [
      ...(reportType === 'active' ? activeUsers : inactiveUsers),
    ].sort((firstUser, secondUser) =>
      textCollator.compare(firstUser.name, secondUser.name)
    );

    if (reportUsers.length === 0) {
      alert(
        reportType === 'active'
          ? 'No hay usuarios activos para incluir en el reporte.'
          : 'No hay usuarios de baja para incluir en el reporte.'
      );
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const logoBase64 = await getUnavetLogoBase64();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 12;
      const reportTitle =
        reportType === 'active'
          ? 'Reporte de usuarios activos'
          : 'Reporte de usuarios de baja';
      const reportStatus =
        reportType === 'active'
          ? enabledStatus || 'Activo'
          : disabledStatus || 'De baja';
      const columns = [
        { label: 'Nombre completo', width: 52 },
        { label: 'Correo', width: 62 },
        { label: 'Rol', width: 42 },
        { label: 'Teléfono', width: 32 },
        { label: 'Estado', width: 28 },
        { label: 'Creación', width: 30 },
      ];

      const drawTableHeader = (startY: number) => {
        let x = marginX;
        doc.setFillColor('#5C4331');
        doc.rect(
          marginX,
          startY,
          columns.reduce((total, column) => total + column.width, 0),
          9,
          'F'
        );
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor('#FFFFFF');
        columns.forEach((column) => {
          doc.text(column.label, x + 2, startY + 5.8);
          x += column.width;
        });
        doc.setTextColor('#2F2A25');
        return startY + 9;
      };

      const drawReportHeader = (continuation = false) => {
        drawUnavetPdfHeader(doc, logoBase64, 'Gestión y control de usuarios');
        doc.setTextColor('#2F2A25');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(
          continuation ? `${reportTitle} (continuación)` : reportTitle,
          marginX,
          42
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(
          `Estado: ${reportStatus}  |  Total: ${reportUsers.length}  |  Emitido: ${new Date().toLocaleString('es-GT')}`,
          marginX,
          49
        );
        return drawTableHeader(54);
      };

      let y = drawReportHeader();

      reportUsers.forEach((userItem, index) => {
        const values = [
          userItem.name || 'Sin nombre',
          userItem.email || 'Sin correo',
          userItem.role || 'Sin rol',
          userItem.phone || 'No registrado',
          userItem.status || reportStatus,
          userItem.creationDate || 'No registrada',
        ];
        const lines = values.map((value, columnIndex) =>
          doc.splitTextToSize(
            String(value),
            columns[columnIndex].width - 4
          ) as string[]
        );
        const rowHeight = Math.max(
          9,
          ...lines.map((valueLines) => valueLines.length * 3.6 + 3)
        );

        if (y + rowHeight > pageHeight - 18) {
          doc.addPage();
          y = drawReportHeader(true);
        }

        if (index % 2 === 0) {
          doc.setFillColor('#F5F0EB');
          doc.rect(
            marginX,
            y,
            columns.reduce((total, column) => total + column.width, 0),
            rowHeight,
            'F'
          );
        }

        let x = marginX;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor('#2F2A25');
        lines.forEach((valueLines, columnIndex) => {
          doc.text(valueLines, x + 2, y + 5);
          x += columns[columnIndex].width;
        });
        y += rowHeight;
      });

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor('#B99572');
        doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
        doc.setFontSize(8);
        doc.setTextColor('#6B625B');
        doc.text('Sistema Veterinario UNAVET', marginX, pageHeight - 7);
        doc.text(`Página ${page} de ${pageCount}`, pageWidth - marginX, pageHeight - 7, {
          align: 'right',
        });
      }

      doc.save(
        reportType === 'active'
          ? 'reporte-usuarios-activos-unavet.pdf'
          : 'reporte-usuarios-de-baja-unavet.pdf'
      );
    } catch (error) {
      console.error('Error al generar reporte de usuarios:', error);
      alert('No se pudo generar el reporte de usuarios.');
    }
  };

  if (canAccess === null) {
    return (
      <div className="p-4 md:p-8 text-muted-foreground">
        Validando permisos...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-4 md:p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
          No tiene permisos para acceder a esta sección
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            Gestión de Usuarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Administra el acceso, consulta fichas y genera reportes por estado.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generateUsersPdf('active')}
            disabled={activeUsers.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            PDF activos
          </button>

          <button
            type="button"
            onClick={() => void generateUsersPdf('inactive')}
            disabled={inactiveUsers.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            PDF de baja
          </button>

          <button
            type="button"
            onClick={() => openModal()}
            disabled={loadingRoles || roleOptions.length === 0}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-[#F7EFE6] rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {loadingRoles ? 'Cargando roles...' : 'Nuevo usuario'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          label="Usuarios registrados"
          value={users.length}
          icon={<UsersRound className="w-6 h-6" />}
          tone="primary"
        />
        <SummaryCard
          label="Usuarios activos"
          value={activeUsers.length}
          icon={<UserCheck className="w-6 h-6" />}
          tone="success"
        />
        <SummaryCard
          label="Usuarios de baja"
          value={inactiveUsers.length}
          icon={<UserX className="w-6 h-6" />}
          tone="danger"
        />
      </div>

      <div className="bg-card rounded-xl p-4 md:p-6 shadow-lg mb-6 border border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4">
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="block text-foreground mb-2 text-sm">
              Buscar
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Buscar por nombre o correo"
                className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Filtrar por rol
            </label>

            <select
              value={filterRole}
              onChange={(event) =>
                setFilterRole(event.target.value)
              }
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="">Todos</option>

              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Filtrar por estado
            </label>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="">Todos</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Ordenar por
            </label>

            <select
              value={sortField}
              onChange={(event) => setSortField(event.target.value as SortField)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="name">Nombre</option>
              <option value="role">Rol</option>
              <option value="status">Estado</option>
              <option value="creationDate">Fecha de creación</option>
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Dirección
            </label>

            <select
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(event.target.value as SortDirection)
              }
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Por página
            </label>

            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="lg:hidden space-y-4">
        {paginatedUsers.map((userItem) => (
          <article
            key={userItem.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/10"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {userItem.role}
                </p>
                <h3 className="text-foreground text-lg font-semibold">
                  {userItem.name}
                </h3>
                <p className="text-sm text-muted-foreground break-all">{userItem.email}</p>
              </div>

              <button
                type="button"
                onClick={() => toggleStatus(userItem.id)}
                className={`px-3 py-2 rounded-full text-xs ${
                  userItem.status === enabledStatus
                    ? 'border border-primary/25 bg-primary/10 text-primary'
                    : 'border border-border bg-muted text-muted-foreground'
                }`}
              >
                {userItem.status}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <p className="text-muted-foreground">Teléfono</p>
                <p className="text-foreground font-medium">{userItem.phone}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Creado</p>
                <p className="text-foreground font-medium">{userItem.creationDate}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedUser(userItem)}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-xl transition-colors"
                title="Ver ficha del usuario"
              >
                <Eye className="w-4 h-4" />
                Ver
              </button>

              <button
                type="button"
                onClick={() => openModal(userItem)}
                className="px-3 py-2 bg-secondary hover:bg-border text-primary rounded-xl transition-colors"
                title="Editar usuario"
              >
                Editar
              </button>

              <button
                type="button"
                onClick={() => openDeleteModal(userItem)}
                className="rounded-xl bg-destructive/10 px-3 py-2 text-destructive transition-colors hover:bg-destructive/20"
                title="Eliminar usuario"
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}

        {filteredUsers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            No hay usuarios registrados.
          </div>
        )}
      </div>

      <div className="hidden lg:block bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-primary text-[#F7EFE6]">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Correo</th>
                <th className="px-6 py-3 text-left">Rol</th>
                <th className="px-6 py-3 text-left">Teléfono</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-left">
                  Fecha de creación
                </th>
                <th className="px-6 py-3 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {paginatedUsers.map((userItem) => (
                <tr
                  key={userItem.id}
                  className="hover:bg-muted"
                >
                  <td className="px-6 py-4 text-foreground">
                    {userItem.name}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {userItem.email}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {userItem.role}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {userItem.phone}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() => toggleStatus(userItem.id)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        userItem.status === enabledStatus
                          ? 'border border-primary/25 bg-primary/10 text-primary'
                          : 'border border-border bg-muted text-muted-foreground'
                      }`}
                    >
                      {userItem.status}
                    </button>
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {userItem.creationDate}
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(userItem)}
                        className="p-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                        title="Ver ficha del usuario"
                        aria-label={`Ver ficha de ${userItem.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openModal(userItem)}
                        className="p-2 bg-secondary hover:bg-border text-primary rounded-lg transition-colors"
                        title="Editar usuario"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openDeleteModal(userItem)
                        }
                        className="rounded-lg bg-destructive/10 p-2 text-destructive transition-colors hover:bg-destructive/20"
                        title="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length > 0 && (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-sm text-muted-foreground text-center sm:text-left">
            Mostrando {visibleFrom}–{visibleTo} de {filteredUsers.length}{' '}
            usuario{filteredUsers.length === 1 ? '' : 's'}
          </p>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            <span className="min-w-24 text-center text-sm font-medium text-foreground">
              Página {currentPage} de {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedUser && (
        <ModalOverlay zIndex="z-[60]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 md:p-6 relative">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              aria-label="Cerrar ficha del usuario"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pr-10 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary text-[#F7EFE6] flex items-center justify-center text-2xl font-bold shadow-md">
                {(selectedUser.firstName || selectedUser.name || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="min-w-0">
                <h2 className="text-foreground text-xl md:text-2xl font-semibold break-words">
                  {selectedUser.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedUser.lastAccess
                    ? `Último acceso: ${new Date(selectedUser.lastAccess).toLocaleString('es-GT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}`
                    : 'Último acceso: Nunca'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailItem label="Primer nombre" value={selectedUser.firstName} />
              <DetailItem
                label="Segundo nombre"
                value={selectedUser.middleName || 'No registrado'}
              />
              <DetailItem
                label="Primer apellido"
                value={selectedUser.firstSurname}
              />
              <DetailItem
                label="Segundo apellido"
                value={selectedUser.secondSurname || 'No registrado'}
              />
              <DetailItem label="Correo electrónico" value={selectedUser.email} />
              <DetailItem label="Teléfono" value={selectedUser.phone || 'No registrado'} />
              <DetailItem label="Rol" value={selectedUser.role || 'No registrado'} />
              <DetailItem
                label="Último acceso"
                value={
                  selectedUser.lastAccess
                    ? new Date(selectedUser.lastAccess).toLocaleString('es-GT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : 'Nunca'
                }
              />
              <DetailItem label="Estado" value={selectedUser.status} />
              <DetailItem
                label="Fecha de creación"
                value={selectedUser.creationDate || 'No registrada'}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-5 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  const userToEdit = selectedUser;
                  setSelectedUser(null);
                  openModal(userToEdit);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
                Editar usuario
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  {editingUser
                    ? 'Editar usuario'
                    : 'Nuevo usuario'}
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
                  {editingUser
                    ? 'Actualiza los datos del usuario. La contraseña solo cambiará si escribes una nueva.'
                    : 'Registra un nuevo usuario y asígnale una contraseña inicial.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseAttempt}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                aria-label="Cerrar formulario"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  ['Primer nombre', 'firstName', true],
                  ['Segundo nombre', 'middleName', false],
                  ['Primer apellido', 'firstSurname', true],
                  ['Segundo apellido', 'secondSurname', false],
                ] as const).map(([label, field, required]) => (
                  <FormInput
                    key={field}
                    label={`${label}${required ? '' : ' (opcional)'}`}
                    value={formData[field] || ''}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        [field]: sanitizeName(value),
                      })
                    }
                    required={required}
                    minLength={required ? 2 : undefined}
                    maxLength={80}
                  />
                ))}

                <FormInput
                  label="Correo"
                  type="email"
                  value={formData.email || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      email: value,
                    })
                  }
                  required
                  maxLength={254}
                />

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Rol
                  </label>

                  <select
                    value={formData.role || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        role: event.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">
                      {loadingRoles
                        ? 'Cargando roles...'
                        : 'Seleccionar rol'}
                    </option>

                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <FormInput
                  label="Teléfono"
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      phone: sanitizePhone(value),
                    })
                  }
                  required
                  inputMode="numeric"
                  pattern="[0-9]{8,15}"
                  minLength={8}
                  maxLength={15}
                />

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Estado
                  </label>

                  <select
                    value={formData.status || enabledStatus}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        status:
                          event.target
                            .value as SystemUser['status'],
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <h3 className="text-foreground font-medium mb-1">
                  Acceso del usuario
                </h3>

                <p className="text-muted-foreground text-xs mb-4">
                  {editingUser
                    ? 'Deja los campos vacíos si no deseas cambiar la contraseña.'
                    : 'La contraseña inicial será utilizada por el usuario para ingresar al sistema.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PasswordInput
                    label={
                      editingUser
                        ? 'Nueva contraseña'
                        : 'Contraseña inicial'
                    }
                    value={formData.password || ''}
                    visible={showPassword}
                    onToggle={() =>
                      setShowPassword(!showPassword)
                    }
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        password: value,
                      })
                    }
                    required={!editingUser}
                  />

                  <PasswordInput
                    label="Confirmar contraseña"
                    value={formData.confirmPassword || ''}
                    visible={showConfirmPassword}
                    onToggle={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        confirmPassword: value,
                      })
                    }
                    required={!editingUser}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingUser ? 'Actualizar' : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={handleCloseAttempt}
                  className="w-full sm:w-auto px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCloseConfirmation && (
        <ModalOverlay zIndex="z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-warning/10 p-3 text-warning">
                <AlertTriangle className="h-7 w-7" />
              </div>
            </div>

            <h3 className="text-foreground text-xl font-semibold mb-2">
              ¿Está seguro de cerrar el formulario?
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              Los datos ingresados se perderán si sales sin guardar.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
              <button
                type="button"
                onClick={() => setShowCloseConfirmation(false)}
                className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-border"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirmation(false);
                  cancelForm();
                }}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-[#F7EFE6] transition-colors hover:bg-primary/90"
              >
                Salir
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showSuccessModal && (
        <ModalOverlay zIndex="z-[60]">
          <ModalCard>
            <SuccessIcon />

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue guardada exitosamente en el módulo
              de usuarios.
            </p>

            <ModalButton onClick={closeSuccessModal}>
              Aceptar
            </ModalButton>
          </ModalCard>
        </ModalOverlay>
      )}

      {showDeleteModal && deleteTarget && (
        <ModalOverlay zIndex="z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteTarget(null);
                setDeleteConfirmation('');
              }}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>

            <h3 className="text-foreground text-xl text-center mb-2">
              ¿Estás seguro de eliminar este usuario?
            </h3>

            <p className="text-muted-foreground text-sm text-center mb-6">
              Se eliminará el usuario{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.name}
              </span>{' '}
              con correo{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.email}
              </span>
              . Esta acción no se puede deshacer.
            </p>

            <label
              htmlFor="delete-user-confirmation"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Escribe <span className="font-bold">ELIMINAR</span> para
              confirmar
            </label>
            <input
              id="delete-user-confirmation"
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="ELIMINAR"
              autoComplete="off"
              spellCheck={false}
              className="mb-6 w-full rounded-lg border border-border bg-input-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteConfirmation.trim().toLowerCase() !== 'eliminar'}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Sí, eliminar
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setDeleteConfirmation('');
                }}
                className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showDeleteSuccessModal && (
        <ModalOverlay zIndex="z-[80]">
          <ModalCard>
            <SuccessIcon />

            <h3 className="text-foreground text-xl mb-2">
              Usuario eliminado correctamente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              El usuario fue eliminado exitosamente del módulo de
              usuarios.
            </p>

            <ModalButton
              onClick={() => setShowDeleteSuccessModal(false)}
            >
              Aceptar
            </ModalButton>
          </ModalCard>
        </ModalOverlay>
      )}

      {showStatusModal && (
        <ModalOverlay zIndex="z-[90]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                  statusModalError ? 'bg-destructive/10' : 'bg-primary/10'
                }`}
              >
                {statusModalError ? (
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                ) : (
                  <UserCheck className="h-10 w-10 text-primary" />
                )}
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {statusModalError
                ? 'No se pudo actualizar el estado'
                : 'Estado actualizado'}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              {statusMessage}
            </p>

            <ModalButton
              onClick={() => {
                setShowStatusModal(false);
                setStatusMessage('');
                setStatusModalError(false);
              }}
            >
              Aceptar
            </ModalButton>
          </ModalCard>
        </ModalOverlay>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: 'primary' | 'success' | 'danger';
}) {
  const styles = {
    primary: 'bg-secondary text-primary',
    success: 'border border-primary/25 bg-primary/10 text-primary',
    danger: 'border border-destructive/25 bg-destructive/10 text-destructive',
  };

  return (
    <article className="bg-card border border-border rounded-2xl p-4 shadow-md flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${styles[tone]}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-foreground text-2xl font-bold">{value}</p>
      </div>
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-3 min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground break-words">
        {value || 'No registrado'}
      </p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  minLength,
  maxLength,
  pattern,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
      />
    </div>
  );
}

function PasswordInput({
  label,
  value,
  visible,
  onToggle,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="w-full px-4 py-2 pr-10 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          required={required}
          minLength={required || value ? 8 : undefined}
          maxLength={128}
        />

        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function ModalOverlay({
  children,
  zIndex,
}: {
  children: ReactNode;
  zIndex: string;
}) {
  return (
    <div
      className={`modal-backdrop fixed inset-0 flex items-center justify-center p-4 ${zIndex}`}
    >
      {children}
    </div>
  );
}

function ModalCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
      {children}
    </div>
  );
}

function ModalButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}

function SuccessIcon() {
  return (
    <div className="flex justify-center mb-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle className="h-10 w-10 text-primary" />
      </div>
    </div>
  );
}

