import { Component, useCallback, useEffect, useState } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { FluentProvider, webLightTheme, webDarkTheme, makeStyles, tokens, Text, Spinner } from '@fluentui/react-components';
import { AppProvider, useAppContext } from '@/context/AppContext';
import { TranslatorToolbar } from '@/components/TranslatorToolbar';
import { TranslationGrid } from '@/components/TranslationGrid';
import type { GridRow, CellChange } from '@/types/grid';
import type { HandlerContext } from '@/handlers/IHandler';
import { getHandler } from '@/handlers/handlerFactory';

// Error boundary to prevent full-page crashes
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#d32f2f' }}>
          <h3>Something went wrong</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  centerMessage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
});

function AppContent() {
  const styles = useStyles();
  const ctx = useAppContext();
  const [rows, setRows] = useState<GridRow[]>([]);
  const [changes, setChanges] = useState<Map<string, CellChange>>(new Map());
  const [isBusy, setIsBusy] = useState(false);

  const buildHandlerContext = useCallback((): HandlerContext => ({
    selectedType: ctx.selectedType,
    entityLogicalName: ctx.selectedEntity,
    selectedComponent: ctx.selectedComponent,
    installedLanguages: ctx.installedLanguages.map(l => l.localeid),
    baseLanguage: ctx.baseLanguage,
    userLanguage: ctx.userLanguage,
    solutionName: ctx.selectedSolution || undefined,
  }), [
    ctx.baseLanguage,
    ctx.installedLanguages,
    ctx.selectedComponent,
    ctx.selectedEntity,
    ctx.selectedSolution,
    ctx.selectedType,
    ctx.userLanguage,
  ]);

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (changes.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [changes.size]);

  const handleLoad = useCallback(async () => {
    const handler = getHandler(ctx.selectedType);
    if (!handler) {
      await window.toolboxAPI.utils.showNotification({
        title: 'Not Implemented',
        body: `Type ${ctx.selectedType} is not implemented yet.`,
        type: 'warning',
        duration: 3000,
      });
      return;
    }

    setIsBusy(true);
    setRows([]);
    setChanges(new Map());

    try {
      const result = await handler.load(buildHandlerContext());
      setRows(result.rows);

      await window.toolboxAPI.utils.showNotification({
        title: 'Load complete',
        body: `Loaded ${result.rows.length} row(s).`,
        type: 'success',
        duration: 2500,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Load failed:', error);
      await window.toolboxAPI.utils.showNotification({
        title: 'Load failed',
        body: message,
        type: 'error',
        duration: 5000,
      });
    } finally {
      setIsBusy(false);
    }
  }, [buildHandlerContext, ctx.selectedType]);

  const handleSave = useCallback(async () => {
    const handler = getHandler(ctx.selectedType);
    if (!handler) {
      await window.toolboxAPI.utils.showNotification({
        title: 'Not Implemented',
        body: `Type ${ctx.selectedType} is not implemented yet.`,
        type: 'warning',
        duration: 3000,
      });
      return;
    }

    if (changes.size === 0) {
      return;
    }

    setIsBusy(true);

    try {
      const changeList = Array.from(changes.values());
      await handler.save(rows, changeList, buildHandlerContext());

      const reloaded = await handler.load(buildHandlerContext());
      setRows(reloaded.rows);
      setChanges(new Map());

      await window.toolboxAPI.utils.showNotification({
        title: 'Save complete',
        body: `Saved ${changeList.length} change(s) and published.`,
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Save failed:', error);
      await window.toolboxAPI.utils.showNotification({
        title: 'Save failed',
        body: message,
        type: 'error',
        duration: 5000,
      });
    } finally {
      setIsBusy(false);
    }
  }, [buildHandlerContext, changes, ctx.selectedType, rows]);

  const handleAutoTranslate = useCallback(() => {
    // TODO: Step 18
  }, []);

  const handleFindReplace = useCallback(() => {
    // TODO: Step 18
  }, []);

  const handleCellChange = useCallback((change: CellChange) => {
    setChanges(prev => {
      const next = new Map(prev);
      const key = `${change.rowId}|${change.lcid}`;
      if (change.newValue === change.oldValue) {
        next.delete(key);
      } else {
        next.set(key, change);
      }
      return next;
    });
  }, []);

  // Initialization state
  if (ctx.initError) {
    return (
      <div className={styles.centerMessage}>
        <Text size={400} weight="semibold">Initialization Error</Text>
        <Text>{ctx.initError}</Text>
      </div>
    );
  }

  if (!ctx.isInitialized) {
    return (
      <div className={styles.centerMessage}>
        <Spinner size="large" />
        <Text>Connecting to Dataverse...</Text>
      </div>
    );
  }

  return (
    <div className={styles.content}>
      <TranslatorToolbar
        onLoad={handleLoad}
        onSave={handleSave}
        onAutoTranslate={handleAutoTranslate}
        onFindReplace={handleFindReplace}
        hasData={rows.length > 0}
        hasChanges={changes.size > 0}
        isBusy={isBusy || ctx.isLoading}
      />
      {rows.length > 0 ? (
        <TranslationGrid
          rows={rows}
          installedLanguages={ctx.installedLanguages}
          baseLanguage={ctx.baseLanguage}
          userLanguage={ctx.userLanguage}
          onCellChange={handleCellChange}
          loading={isBusy}
        />
      ) : (
        <div className={styles.centerMessage}>
          <Text size={400}>Select an entity and type, then click Load</Text>
        </div>
      )}
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const styles = useStyles();

  useEffect(() => {
    const getTheme = async () => {
      try {
        const currentTheme = await window.toolboxAPI.utils.getCurrentTheme();
        setTheme(currentTheme === 'dark' ? 'dark' : 'light');
      } catch {
        // Default to light
      }
    };
    getTheme();
  }, []);

  return (
    <FluentProvider theme={theme === 'dark' ? webDarkTheme : webLightTheme} className={styles.root}>
      <ErrorBoundary>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </ErrorBoundary>
    </FluentProvider>
  );
}

export default App;
