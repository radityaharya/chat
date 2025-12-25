import { useState } from 'react';
import {
  ModelSelector as Selector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  // Group models by prefix (backend)
  const groupedModels = models.reduce((acc, model) => {
    const parts = model.id.split('/');
    const backend = parts.length > 1 ? parts[0] : 'default';
    if (!acc[backend]) {
      acc[backend] = [];
    }
    acc[backend].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  const selectedModelName = selectedModel || 'Select a model';

  return (
    <Selector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full sm:w-[300px] justify-between bg-terminal-surface border-terminal-border text-terminal-text hover:bg-terminal-border/50 hover:text-terminal-text"
        >
          <span className="truncate">{selectedModelName}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {Object.entries(groupedModels).map(([backend, backendModels]) => (
            <ModelSelectorGroup key={backend} heading={backend}>
              {backendModels.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  value={model.id}
                  onSelect={(currentValue) => {
                    onSelectModel(currentValue);
                    setOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer",
                    selectedModel === model.id && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedModel === model.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {model.id}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </Selector>
  );
}
