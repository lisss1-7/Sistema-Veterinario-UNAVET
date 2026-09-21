import { useEffect, useState } from 'react';
import { API_URL } from '../config/api';

export type ModulePermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type PermissionRow = {
  codigo?: string;
  puede_ver?: unknown;
  puede_crear?: unknown;
  puede_editar?: unknown;
  puede_eliminar?: unknown;
};

const NO_PERMISSIONS: ModulePermissions = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
};

const toBoolean = (value: unknown) =>
  value === true || value === 1 || value === '1';

export const useModulePermissions = (moduleCode: string) => {
  const [permissions, setPermissions] =
    useState<ModulePermissions>(NO_PERMISSIONS);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const token =
      localStorage.getItem('unavet_token') || localStorage.getItem('token');

    void fetch(`${API_URL}/catalogos/mis-modulos`, {
      headers: { Authorization: `Bearer ${token || ''}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'No fue posible validar los permisos');
        }

        const modulePermission = Array.isArray(data)
          ? (data as PermissionRow[]).find((item) => item.codigo === moduleCode)
          : undefined;

        setPermissions(
          modulePermission
            ? {
                canView: toBoolean(modulePermission.puede_ver),
                canCreate: toBoolean(modulePermission.puede_crear),
                canEdit: toBoolean(modulePermission.puede_editar),
                canDelete: toBoolean(modulePermission.puede_eliminar),
              }
            : NO_PERMISSIONS
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error al validar los permisos del modulo:', error);
        setPermissions(NO_PERMISSIONS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingPermissions(false);
      });

    return () => controller.abort();
  }, [moduleCode]);

  return { permissions, isLoadingPermissions };
};
