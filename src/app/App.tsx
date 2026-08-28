import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { router } from './routes';
import {
  getManualThemeOverride,
  getNextThemeChange,
  getScheduledTheme,
} from './utils/themeSchedule';

function AppContent() {
  const { resolvedTheme, setTheme } = useTheme();
  const setThemeRef = useRef(setTheme);

  useEffect(() => {
    setThemeRef.current = setTheme;
  }, [setTheme]);

  useEffect(() => {
    let timerId: number;

    const syncThemeWithTime = () => {
      const now = new Date();
      const manualOverride = getManualThemeOverride(now.getTime());
      const theme = manualOverride?.theme ?? getScheduledTheme(now);
      const nextChange = getNextThemeChange(now);

      setThemeRef.current(theme);

      timerId = window.setTimeout(
        syncThemeWithTime,
        Math.max(nextChange.getTime() - now.getTime(), 1000)
      );
    };

    syncThemeWithTime();

    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        position="top-center"
        richColors
        closeButton
        duration={4500}
        toastOptions={{
          style: {
            borderRadius: '14px',
            padding: '16px',
            fontSize: '14px',
          },
        }}
      />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="unavet_theme"
    >
      <AppContent />
    </ThemeProvider>
  );
}
