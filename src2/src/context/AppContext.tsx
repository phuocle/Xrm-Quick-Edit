import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { LanguageLocale, Solution } from '@/types/dataverse';
import type { MetadataComponent, TranslationType } from '@/types/grid';
import { dataverseService, type EntityOption } from '@/services/dataverseService';

export interface AppContextType {
  // Connection (from PPTB)
  userId: string;
  userLanguage: number;
  baseLanguage: number;
  installedLanguages: LanguageLocale[];

  // Selections
  selectedSolution: string;
  selectedEntity: string;
  selectedType: TranslationType;
  selectedComponent: MetadataComponent;

  // Setters
  setSelectedSolution: (s: string) => void;
  setSelectedEntity: (e: string) => void;
  setSelectedType: (t: TranslationType) => void;
  setSelectedComponent: (c: MetadataComponent) => void;

  // Data lists
  solutions: Solution[];
  entities: EntityOption[];

  // Status
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Initialization
  isInitialized: boolean;
  initError: string | null;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Connection
  const [userId, setUserId] = useState('');
  const [userLanguage, setUserLanguage] = useState(0);
  const [baseLanguage, setBaseLanguage] = useState(0);
  const [installedLanguages, setInstalledLanguages] = useState<LanguageLocale[]>([]);

  // Selections
  const [selectedSolution, setSelectedSolution] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedType, setSelectedType] = useState<TranslationType>('attributes');
  const [selectedComponent, setSelectedComponent] = useState<MetadataComponent>('DisplayName');

  // Data lists
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);

  // Status
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize: load org info, languages, solutions, entities
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Get connection + userId via WhoAmI
        const connection = await window.toolboxAPI.connections.getActiveConnection();
        if (!connection) {
          throw new Error('No active Dataverse connection. Please connect in PPTB first.');
        }

        const whoAmI = await window.dataverseAPI.execute({
          operationName: 'WhoAmI',
          operationType: 'function',
        });
        if (cancelled) return;

        const currentUserId = whoAmI.UserId as string;
        setUserId(currentUserId);

        // 2-4: Load org info in parallel
        const [baseLang, userSettings, languages] = await Promise.all([
          dataverseService.getBaseLanguage(),
          dataverseService.getUserSettings(currentUserId),
          dataverseService.getInstalledLanguages(),
        ]);
        if (cancelled) return;

        setBaseLanguage(baseLang);
        setUserLanguage(userSettings.uilanguageid);
        setInstalledLanguages(languages);

        // 5-6: Load solutions and entities in parallel
        const [sols, ents] = await Promise.all([
          dataverseService.getSolutions(),
          dataverseService.getEntities(),
        ]);
        if (cancelled) return;

        setSolutions(sols);
        setEntities(ents);
        setIsInitialized(true);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setInitError(msg);
          console.error('AppContext init failed:', err);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Reload entities when solution changes
  const handleSolutionChange = useCallback((solutionName: string) => {
    setSelectedSolution(solutionName);
    setSelectedEntity('');
    setSelectedComponent('DisplayName');

    // Fire-and-forget async load — errors are caught and logged
    setIsLoading(true);
    dataverseService.getEntities(solutionName || undefined)
      .then(ents => setEntities(ents))
      .catch(err => console.error('Failed to load entities for solution:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const value: AppContextType = {
    userId,
    userLanguage,
    baseLanguage,
    installedLanguages,
    selectedSolution,
    selectedEntity,
    selectedType,
    selectedComponent,
    setSelectedSolution: handleSolutionChange,
    setSelectedEntity,
    setSelectedType,
    setSelectedComponent,
    solutions,
    entities,
    isLoading,
    setIsLoading,
    isInitialized,
    initError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
