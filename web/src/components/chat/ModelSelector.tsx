import { useState, useMemo } from 'react';
import {
  ModelSelector as Selector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger,
  ModelSelectorLogo,
} from '@/components/ai-elements/model-selector';
import { Check, ChevronDown, ArrowUpDown, Info, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { cn, formatModelName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { Model } from '@/types/model';


interface ModelSelectorProps {
  models: Model[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
  className?: string;
}

type SortOption = 'default' | 'name' | 'price-asc' | 'price-desc' | 'context-asc' | 'context-desc';

function formatPrice(price: number | undefined): string {
  if (!price) return '';
  const perMillion = price * 1_000_000;
  return `$${perMillion.toFixed(2)}/M`;
}

function formatContextLength(length: number | undefined): string {
  if (!length) return '';
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M`;
  if (length >= 1_000) return `${(length / 1_000).toFixed(0)}K`;
  return `${length}`;
}

function getModelPrice(model: Model): number {
  if (!model.pricing) return 0;
  return model.pricing.prompt || model.pricing.input || 0;
}

function getModelProvider(modelId: string): string {
  const parts = modelId.split('/');
  if (parts.length > 1) return parts[0];
  if (modelId.startsWith('gpt')) return 'openai';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gemini')) return 'google';
  return 'openai';
}

export function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  disabled,
  className,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // Sort models
  const sortedModels = useMemo(() => {
    const sorted = [...models];

    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => {
          const nameA = a.display_name || a.name || a.id;
          const nameB = b.display_name || b.name || b.id;
          return nameA.localeCompare(nameB);
        });
        break;
      case 'price-asc':
        sorted.sort((a, b) => getModelPrice(a) - getModelPrice(b));
        break;
      case 'price-desc':
        sorted.sort((a, b) => getModelPrice(b) - getModelPrice(a));
        break;
      case 'context-asc':
        sorted.sort((a, b) => (a.context_length || 0) - (b.context_length || 0));
        break;
      case 'context-desc':
        sorted.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
        break;
      default:
        // Keep original order
        break;
    }

    return sorted;
  }, [models, sortBy]);

  // Group models by prefix (backend)
  const groupedModels = sortedModels.reduce((acc, model) => {
    const parts = model.id.split('/');
    const backend = parts.length > 1 ? parts[0] : 'default';
    if (!acc[backend]) {
      acc[backend] = [];
    }
    acc[backend].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  const selectedModelData = models.find(m => m.id === selectedModel);
  const selectedModelName = selectedModelData
    ? formatModelName(selectedModelData.id, selectedModelData.owned_by)
    : 'Select a model';

  return (
    <Selector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild className={cn('sm:w-[300px]', className)}>
        <Button
          variant="link"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="justify-start border-terminal-border text-terminal-text rounded-none active:outline-none"
        >
          {/* provider logo */}
          <ModelSelectorLogo provider={getModelProvider(selectedModel || '')} />
          <span className="truncate">{selectedModelName}</span>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="max-w-3xl rounded-none border-terminal-border p-0">
        <div className="flex items-stretch border-b border-terminal-border">
          <div className="flex-1 px-3 py-2">
            <ModelSelectorInput placeholder="Search models..." className="h-full rounded-none border-0 font-mono bg-transparent shadow-none focus-visible:ring-0" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-auto w-12 rounded-none border-l border-terminal-border hover:bg-terminal-bg/50"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none border-terminal-border font-mono">
              <DropdownMenuItem onClick={() => setSortBy('default')} className="rounded-none">
                Default Order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')} className="rounded-none">
                Name (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('price-asc')} className="rounded-none">
                Price (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('price-desc')} className="rounded-none">
                Price (High to Low)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('context-asc')} className="rounded-none">
                Context (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('context-desc')} className="rounded-none">
                Context (High to Low)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ModelSelectorList className="max-h-[400px] p-2">
          <ModelSelectorEmpty className="font-mono text-terminal-muted">No models found.</ModelSelectorEmpty>
          {Object.entries(groupedModels).map(([backend, backendModels]) => (
            <ModelSelectorGroup key={backend} heading={backend} className="font-mono">
              {backendModels.map((model) => {
                const promptPrice = model.pricing?.prompt || model.pricing?.input;
                const completionPrice = model.pricing?.completion || model.pricing?.output;
                const contextLength = model.context_length || model.top_provider?.context_length;
                const provider = getModelProvider(model.id);

                return (
                  <ModelSelectorItem
                    key={model.id}
                    value={model.id}
                    onSelect={(currentValue) => {
                      onSelectModel(currentValue);
                      setOpen(false);
                    }}
                    className={cn(
                      "cursor-pointer py-2 px-3 rounded-none hover:bg-terminal-bg/50 aria-selected:bg-terminal-bg/50",
                      selectedModel === model.id && "bg-terminal-bg/70"
                    )}
                  >
                    <div className="flex items-start flex-col sm:flex-row w-full gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ModelSelectorLogo provider={provider} className="shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm font-mono flex items-center gap-2">
                            <span className="truncate">{formatModelName(model.id, model.owned_by)}</span>
                            {selectedModel === model.id && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-terminal-green" />
                            )}
                          </div>
                          {model.description && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help hover:text-terminal-text transition-colors shrink-0">
                                      <Info className="h-2 w-2 text-terminal-muted" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="max-w-[420px] p-3 border-terminal-border rounded-none bg-terminal-bg text-terminal-text font-mono text-xs"
                                  >
                                    <div className="space-y-3">
                                      {/* Description Section */}
                                      <div className="space-y-1">
                                        <h4 className="font-bold text-terminal-accent">Description</h4>
                                        <p className="text-terminal-text/90 leading-relaxed">
                                          {model.description}
                                        </p>
                                      </div>

                                      {/* Details Section */}
                                      <div className="space-y-1.5 border-t border-terminal-border pt-2">
                                        <div className="flex justify-between items-start gap-2">
                                          <span className="text-terminal-muted">Provider</span>
                                          <span className="text-right font-medium">{model.owned_by || provider}</span>
                                        </div>

                                        {model.architecture && (
                                          <>
                                            {model.architecture.modality && (
                                              <div className="flex justify-between items-start gap-2">
                                                <span className="text-terminal-muted">Modality</span>
                                                <span className="text-right">{model.architecture.modality}</span>
                                              </div>
                                            )}
                                            {/* Show Input/Output modalities if they exist and are different from just "text" which is implied */}
                                            {model.architecture.input_modalities && model.architecture.input_modalities.length > 0 && (
                                              <div className="flex justify-between items-start gap-2">
                                                <span className="text-terminal-muted">Input</span>
                                                <span className="text-right capitalize">{model.architecture.input_modalities.join(', ')}</span>
                                              </div>
                                            )}
                                            {model.architecture.output_modalities && model.architecture.output_modalities.length > 0 && (
                                              <div className="flex justify-between items-start gap-2">
                                                <span className="text-terminal-muted">Output</span>
                                                <span className="text-right capitalize">{model.architecture.output_modalities.join(', ')}</span>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        <a
                                          href={`https://openrouter.ai/${model.id.replace('openrouter/', '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex justify-between items-center pt-2 mt-2 border-t border-terminal-border hover:text-terminal-accent transition-colors group"
                                        >
                                          <span className="text-terminal-muted group-hover:text-terminal-accent">OpenRouter</span>
                                          <ExternalLink className="w-3 h-3 text-terminal-muted group-hover:text-terminal-accent" />
                                        </a>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <div className="text-xs text-terminal-muted line-clamp-1">
                                {model.description}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-start shrink-0">
                        {/* Image Capability Indicator */}
                        {(model.architecture?.modality?.includes('image') || model.architecture?.input_modalities?.includes('image')) && (
                          // <span className="inline-flex items-center gap-1 px-0.5 py-0.5 text-[10px] font-mono bg-terminal-surface border border-terminal-border text-terminal-text" title="Supports image input">
                          <ImageIcon className="w-2 h-2" />
                          // </span>
                        )}
                        {contextLength && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-terminal-surface border border-terminal-border text-terminal-text">
                            {formatContextLength(contextLength)} ctx
                          </span>
                        )}
                        {promptPrice !== undefined && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-terminal-surface border border-terminal-border text-terminal-green">
                            {formatPrice(promptPrice)} in
                          </span>
                        )}
                        {completionPrice !== undefined && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-terminal-surface border border-terminal-border text-terminal-yellow">
                            {formatPrice(completionPrice)} out
                          </span>
                        )}
                      </div>
                    </div>
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent >
    </Selector >
  );
}
