/**
 * Claude Code / Vertex AI Configuration
 * Maps environment variables for Claude Code integration with Google Vertex AI
 * See: https://code.claude.com/docs/en/google-vertex-ai
 */

// Map from existing GOOGLE_VERTEX_* vars to Claude Code vars
export const CLAUDE_VERTEX_CONFIG = {
  // Enable Vertex AI integration
  useVertex: process.env.CLAUDE_CODE_USE_VERTEX === '1' || !!process.env.GOOGLE_VERTEX_PROJECT,
  
  // Project ID - map from GOOGLE_VERTEX_PROJECT or use ANTHROPIC_VERTEX_PROJECT_ID
  projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID || process.env.GOOGLE_VERTEX_PROJECT || 'niyam-vertex-private',
  
  // Region - map from GOOGLE_VERTEX_LOCATION or use CLOUD_ML_REGION
  // Use 'global' for global endpoint, or specific region like 'us-east5'
  region: process.env.CLOUD_ML_REGION || process.env.GOOGLE_VERTEX_LOCATION || 'global',
  
  // Model configuration
  model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5@20251001',
  smallFastModel: process.env.ANTHROPIC_SMALL_FAST_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5@20251001',
  
  // Google Cloud credentials (for Vertex AI authentication)
  // Uses GOOGLE_APPLICATION_CREDENTIALS or default application credentials
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

// Validate configuration
export function validateClaudeConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!CLAUDE_VERTEX_CONFIG.projectId) {
    errors.push('ANTHROPIC_VERTEX_PROJECT_ID or GOOGLE_VERTEX_PROJECT must be set');
  }
  
  if (!CLAUDE_VERTEX_CONFIG.region) {
    errors.push('CLOUD_ML_REGION or GOOGLE_VERTEX_LOCATION must be set');
  }
  
  if (!CLAUDE_VERTEX_CONFIG.model) {
    errors.push('ANTHROPIC_MODEL must be set');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Set environment variables for Claude Code SDK
// These are read by the Claude Code SDK when CLAUDE_CODE_USE_VERTEX=1
export function setupClaudeEnvVars() {
  if (CLAUDE_VERTEX_CONFIG.useVertex) {
    // Set env vars that Claude Code SDK expects
    process.env.CLAUDE_CODE_USE_VERTEX = '1';
    process.env.ANTHROPIC_VERTEX_PROJECT_ID = CLAUDE_VERTEX_CONFIG.projectId;
    process.env.CLOUD_ML_REGION = CLAUDE_VERTEX_CONFIG.region;
    process.env.ANTHROPIC_MODEL = CLAUDE_VERTEX_CONFIG.model;
    process.env.ANTHROPIC_SMALL_FAST_MODEL = CLAUDE_VERTEX_CONFIG.smallFastModel;
    
    // Override GCP project if needed
    if (!process.env.GCLOUD_PROJECT && !process.env.GOOGLE_CLOUD_PROJECT) {
      process.env.GCLOUD_PROJECT = CLAUDE_VERTEX_CONFIG.projectId;
    }
  }
}

// Initialize on module load
setupClaudeEnvVars();

