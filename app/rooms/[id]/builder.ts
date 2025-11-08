'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { callGeminiBuilder } from '@/lib/gemini';
import type { FilePatch } from '@/lib/types';

const builderLocks = new Map<string, Promise<any>>();

export async function runBuilder(roomId: string, specId: string) {
  if (builderLocks.has(specId)) {
    return builderLocks.get(specId);
  }

  const promise = (async () => {
    try {
      // Get design spec
      const { data: specData, error: specError } = await supabaseAdmin
        .from('design_specs')
        .select('spec_json, spec_hash')
        .eq('id', specId)
        .single();

      if (specError || !specData) throw specError || new Error('Spec not found');

      // Check if patch already exists
      const { data: existingPatch } = await supabaseAdmin
        .from('patches')
        .select('id')
        .eq('base_spec_hash', specData.spec_hash)
        .single();

      if (existingPatch) {
        return existingPatch.id;
      }

      // Get current HTML for context
      const { data: currentFile } = await supabaseAdmin
        .from('files')
        .select('content')
        .eq('room_id', roomId)
        .eq('path', 'index.html')
        .single();

      // Call Gemini builder with current state
      const patch = await callGeminiBuilder(
        specData.spec_json,
        currentFile?.content
      );

      // Post-process: Ensure all components are present
      const processedPatch = ensureAllComponentsPresent(patch, specData.spec_json);

      // Store patch
      const { data: newPatch, error } = await supabaseAdmin
        .from('patches')
        .insert({
          room_id: roomId,
          patch_json: processedPatch,
          base_spec_hash: specData.spec_hash,
        })
        .select()
        .single();

      if (error) throw error;

      // Apply patch to files table
      await applyPatchToFiles(roomId, processedPatch);

      return newPatch.id;
    } finally {
      builderLocks.delete(specId);
    }
  })();

  builderLocks.set(specId, promise);
  return promise;
}

async function applyPatchToFiles(roomId: string, patch: FilePatch) {
  for (const op of patch.ops) {
    if (op.op === 'setFile') {
      await supabaseAdmin
        .from('files')
        .upsert({
          room_id: roomId,
          path: op.path,
          content: op.content,
          updated_at: new Date().toISOString(),
        });
    } else if (op.op === 'deleteFile') {
      await supabaseAdmin
        .from('files')
        .delete()
        .eq('room_id', roomId)
        .eq('path', op.path);
    }
    // mkdir is handled implicitly by file paths
  }
}

function ensureAllComponentsPresent(patch: FilePatch, spec: any): FilePatch {
  // Validation: Check if generated HTML includes all components
  const indexOp = patch.ops.find(
    (op) => op.op === 'setFile' && op.path === 'index.html'
  );

  if (!indexOp || !spec.components || spec.components.length === 0) {
    return patch;
  }

  const html = indexOp.content;
  const missingComponents: string[] = [];

  // Check for each component in the spec
  spec.components.forEach((component: any) => {
    const componentType = component.type.toLowerCase();
    const componentPath = component.path.toLowerCase();
    
    // Look for evidence of the component in HTML (class names, ids, comments, etc.)
    const hasComponent = 
      html.toLowerCase().includes(componentType) ||
      html.toLowerCase().includes(componentPath.split('/').pop() || '');
    
    if (!hasComponent) {
      missingComponents.push(component.type);
    }
  });

  if (missingComponents.length > 0) {
    console.warn(
      `[Builder] Generated HTML is missing components: ${missingComponents.join(', ')}. ` +
      `This may indicate Gemini didn't follow instructions properly.`
    );
    // For now, just log. In production, you might want to regenerate or inject fallback HTML
  }

  return patch;
}

