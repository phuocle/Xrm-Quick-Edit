import { useMemo } from 'react';
import * as Toolbar from '@radix-ui/react-toolbar';
import * as Select from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import { useAppContext } from '@/context/AppContext';
import type { MetadataComponent, TranslationType } from '@/types/grid';
import './TranslatorToolbar.css';

const NO_SOLUTION_FILTER = '__none__';
const DASHBOARD_ENTITY = 'none';

const typeOptions: { value: TranslationType; label: string }[] = [
  { value: 'attributes', label: 'Attributes' },
  { value: 'options', label: 'Option Sets' },
  { value: 'globalOptionSets', label: 'Global Option Sets' },
  { value: 'forms', label: 'Forms' },
  { value: 'dashboards', label: 'Dashboards' },
  { value: 'formMeta', label: 'Form Names' },
  { value: 'entityMeta', label: 'Entity Names' },
  { value: 'views', label: 'Views' },
  { value: 'charts', label: 'Charts' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'bpf', label: 'Business Process Flows' },
  { value: 'sitemap', label: 'Site Map' },
  { value: 'content', label: 'Content Snippets' },
  { value: 'webresources', label: 'Web Resources' },
  { value: 'allInOne', label: 'All In One' },
];

const componentOptions: { value: MetadataComponent; label: string }[] = [
  { value: 'DisplayName', label: 'Display Name' },
  { value: 'Description', label: 'Description' },
];

interface ToolbarProps {
  onLoad: () => void;
  onSave: () => void;
  onAutoTranslate: () => void;
  onFindReplace: () => void;
  hasData: boolean;
  hasChanges: boolean;
  isBusy: boolean;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value?: string;
  placeholder: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  widthClassName?: string;
}

function SelectField({
  value,
  placeholder,
  options,
  onValueChange,
  disabled,
  widthClassName,
}: SelectFieldProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        className={`xqt-select-trigger ${widthClassName ?? ''}`}
        aria-label={placeholder}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="xqt-select-icon">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content className="xqt-select-content" position="popper" sideOffset={6}>
          <Select.ScrollUpButton className="xqt-select-scroll-button">
            <ChevronUpIcon />
          </Select.ScrollUpButton>

          <Select.Viewport className="xqt-select-viewport">
            {options.map(option => (
              <Select.Item key={option.value} value={option.value} className="xqt-select-item">
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="xqt-select-item-indicator">
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>

          <Select.ScrollDownButton className="xqt-select-scroll-button">
            <ChevronDownIcon />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export const TranslatorToolbar: React.FC<ToolbarProps> = ({
  onLoad,
  onSave,
  onAutoTranslate,
  onFindReplace,
  hasData,
  hasChanges,
  isBusy,
}) => {
  const {
    solutions,
    entities,
    selectedSolution,
    selectedEntity,
    selectedType,
    selectedComponent,
    setSelectedSolution,
    setSelectedEntity,
    setSelectedType,
    setSelectedComponent,
    isInitialized,
  } = useAppContext();

  const solutionOptions = useMemo<SelectOption[]>(
    () => [
      { value: NO_SOLUTION_FILTER, label: '(No Solution Filter)' },
      ...solutions.map(s => ({ value: s.uniquename, label: s.friendlyname })),
    ],
    [solutions]
  );

  const entityOptions = useMemo<SelectOption[]>(() => {
    const options = entities.map(e => ({
      value: e.logicalName,
      label: `${e.displayName} (${e.logicalName})`,
    }));

    if (selectedType === 'formMeta') {
      return [{ value: DASHBOARD_ENTITY, label: '(Dashboards - no entity)' }, ...options];
    }

    return options;
  }, [entities, selectedType]);

  const requiresEntity = selectedType !== 'globalOptionSets';
  const canLoad = isInitialized && (!requiresEntity || !!selectedEntity) && !isBusy;
  const canSave = hasData && hasChanges && !isBusy;
  const controlsDisabled = !isInitialized || isBusy;

  const handleTypeChange = (value: string) => {
    const nextType = value as TranslationType;
    setSelectedType(nextType);

    if (selectedEntity === DASHBOARD_ENTITY && nextType !== 'formMeta') {
      setSelectedEntity('');
    }
  };

  return (
    <Toolbar.Root className="xqt-toolbar" aria-label="Translation toolbar">
      <div className="xqt-toolbar-group">
        <SelectField
          value={selectedSolution || NO_SOLUTION_FILTER}
          placeholder="Solution"
          options={solutionOptions}
          onValueChange={(value) => setSelectedSolution(value === NO_SOLUTION_FILTER ? '' : value)}
          disabled={controlsDisabled}
          widthClassName="xqt-select-solution"
        />

        <SelectField
          value={selectedEntity || undefined}
          placeholder="Entity"
          options={entityOptions}
          onValueChange={setSelectedEntity}
          disabled={controlsDisabled}
          widthClassName="xqt-select-entity"
        />

        <SelectField
          value={selectedType}
          placeholder="Type"
          options={typeOptions}
          onValueChange={handleTypeChange}
          disabled={controlsDisabled}
          widthClassName="xqt-select-type"
        />

        <SelectField
          value={selectedComponent}
          placeholder="Component"
          options={componentOptions}
          onValueChange={(value) => setSelectedComponent(value as MetadataComponent)}
          disabled={controlsDisabled}
          widthClassName="xqt-select-component"
        />
      </div>

      <div className="xqt-toolbar-separator" />

      <div className="xqt-toolbar-group">
        <Toolbar.Button className="xqt-toolbar-button xqt-toolbar-primary" onClick={onLoad} disabled={!canLoad}>
          {isBusy ? 'Loading...' : 'Load'}
        </Toolbar.Button>

        <Toolbar.Button className={`xqt-toolbar-button ${hasChanges ? 'xqt-toolbar-save-alert' : ''}`} onClick={onSave} disabled={!canSave}>
          Save
        </Toolbar.Button>
      </div>

      <div className="xqt-toolbar-separator" />

      <div className="xqt-toolbar-group">
        <Toolbar.Button className="xqt-toolbar-button xqt-toolbar-muted-action" onClick={onAutoTranslate} disabled={!hasData || isBusy}>
          Auto Translate
        </Toolbar.Button>

        <Toolbar.Button className="xqt-toolbar-button xqt-toolbar-muted-action" onClick={onFindReplace} disabled={!hasData || isBusy}>
          Find & Replace
        </Toolbar.Button>
      </div>
    </Toolbar.Root>
  );
};
