export interface ModelPricing {
  prompt?: number;
  completion?: number;
  input?: number;
  output?: number;
  request?: number;
  image?: number;
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  display_name?: string;
  name?: string;
  canonical_slug?: string;
  description?: string;
  context_length?: number;
  pricing?: ModelPricing;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
}
